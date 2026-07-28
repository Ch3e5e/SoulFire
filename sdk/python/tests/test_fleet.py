import asyncio
from collections.abc import AsyncIterator, Iterator
from typing import Any, cast

import pytest
from google.protobuf.struct_pb2 import Value

from soulfire.bot_pb2 import (
    BOT_CONNECTION_PHASE_DISCONNECTED,
    BOT_CONNECTION_PHASE_SPAWNED,
    BOT_DESIRED_STATE_RUNNING,
    BOT_DESIRED_STATE_STOPPED,
    BOT_RUNTIME_STATE_RUNNING,
    BOT_RUNTIME_STATE_STOPPED,
    BotListEntry,
    BotLiveState,
    BotStatus,
)
from soulfire.client import AsyncSoulFireInstance, SoulFireInstance
from soulfire.common_pb2 import MinecraftAccountProto, SettingsNamespace
from soulfire.fleet import (
    AsyncSoulFireFleet,
    FleetMetadataSelector,
    FleetRadius,
    FleetSelector,
    FleetTaskStartOptions,
    SoulFireFleet,
)
from soulfire.instance_pb2 import InstanceConfig, InstanceInfo
from soulfire.task_pb2 import (
    BOT_TASK_STATUS_COMPLETED,
    AutoRespawnTask,
    AutoRespawnTaskResult,
    BotTask,
    BotTaskEvent,
)


class FakeAsyncTask:
    def __init__(self, bot_id: str) -> None:
        self.bot_id = bot_id

    def events(self, **_options: Any) -> AsyncIterator[BotTaskEvent]:
        async def stream():
            yield BotTaskEvent(
                sequence=1,
                task=BotTask(
                    task_id=f"task-{self.bot_id}",
                    bot_id=self.bot_id,
                    status=BOT_TASK_STATUS_COMPLETED,
                ),
            )

        return stream()

    async def result(self, **_options: Any) -> AutoRespawnTaskResult:
        return AutoRespawnTaskResult(respawns=1)

    async def cancel(self, _reason: str = "", **_options: Any) -> BotTask:
        return BotTask(
            task_id=f"task-{self.bot_id}",
            bot_id=self.bot_id,
            status=BOT_TASK_STATUS_COMPLETED,
        )


class FakeSyncTask:
    def __init__(self, bot_id: str) -> None:
        self.bot_id = bot_id

    def events(self, **_options: Any) -> Iterator[BotTaskEvent]:
        return iter(
            [
                BotTaskEvent(
                    sequence=1,
                    task=BotTask(
                        task_id=f"task-{self.bot_id}",
                        bot_id=self.bot_id,
                        status=BOT_TASK_STATUS_COMPLETED,
                    ),
                )
            ]
        )

    def result(self, **_options: Any) -> AutoRespawnTaskResult:
        return AutoRespawnTaskResult(respawns=1)

    def cancel(self, _reason: str = "", **_options: Any) -> BotTask:
        return BotTask(
            task_id=f"task-{self.bot_id}",
            bot_id=self.bot_id,
            status=BOT_TASK_STATUS_COMPLETED,
        )


class FakeAsyncTasks:
    active = 0
    maximum_active = 0

    def __init__(self, bot_id: str) -> None:
        self.bot_id = bot_id

    async def start(self, _task_input: Any, _result_type: Any, **_options: Any):
        type(self).active += 1
        type(self).maximum_active = max(type(self).maximum_active, type(self).active)
        await asyncio.sleep(0.005)
        type(self).active -= 1
        return FakeAsyncTask(self.bot_id)


class FakeSyncTasks:
    def __init__(self, bot_id: str) -> None:
        self.bot_id = bot_id

    def start(self, _task_input: Any, _result_type: Any, **_options: Any):
        return FakeSyncTask(self.bot_id)


class FakeBot:
    def __init__(self, bot_id: str, *, asynchronous: bool) -> None:
        self.tasks = FakeAsyncTasks(bot_id) if asynchronous else FakeSyncTasks(bot_id)


class FakeAsyncInstance:
    started: list[str]

    def __init__(self) -> None:
        self.started = []

    async def bots(self, **_options: Any) -> list[BotListEntry]:
        return _bot_entries()

    async def info(self, **_options: Any) -> InstanceInfo:
        return _instance_info()

    def bot(self, bot_id: str) -> FakeBot:
        return FakeBot(bot_id, asynchronous=True)

    async def start(self, *, bot_ids: list[str], **_options: Any) -> list[BotStatus]:
        self.started = bot_ids
        return [
            BotStatus(
                profile_id=bot_id,
                desired_state=BOT_DESIRED_STATE_RUNNING,
                runtime_state=BOT_RUNTIME_STATE_RUNNING,
            )
            for bot_id in bot_ids
        ]


class FakeSyncInstance:
    started: list[str]

    def __init__(self) -> None:
        self.started = []

    def bots(self, **_options: Any) -> list[BotListEntry]:
        return _bot_entries()

    def info(self, **_options: Any) -> InstanceInfo:
        return _instance_info()

    def bot(self, bot_id: str) -> FakeBot:
        return FakeBot(bot_id, asynchronous=False)

    def start(self, *, bot_ids: list[str], **_options: Any) -> list[BotStatus]:
        self.started = bot_ids
        return [
            BotStatus(
                profile_id=bot_id,
                desired_state=BOT_DESIRED_STATE_RUNNING,
                runtime_state=BOT_RUNTIME_STATE_RUNNING,
            )
            for bot_id in bot_ids
        ]


def _selector() -> FleetSelector:
    return FleetSelector(
        online=True,
        dimensions=("minecraft:overworld",),
        minimum_health=10,
        near=FleetRadius(
            x=0,
            y=64,
            z=0,
            radius=32,
            dimension="minecraft:overworld",
        ),
        metadata=(
            FleetMetadataSelector(
                namespace="fleet",
                key="role",
                equals="builder",
            ),
        ),
        order_by="health",
    )


@pytest.mark.asyncio
async def test_async_fleet_selects_distributes_and_runs_typed_tasks() -> None:
    instance = FakeAsyncInstance()
    fleet = AsyncSoulFireFleet(
        cast(AsyncSoulFireInstance, instance),
        None,
    )

    selected = await fleet.select(_selector())
    assignments = await fleet.distribute(["one", "two", "three"], _selector())
    await fleet.start(_selector())
    group = await fleet.start_tasks(
        FleetSelector(bot_ids=("healthy", "nearby")),
        lambda _bot, index, _total: AutoRespawnTask(maximum_respawns=index + 1),
        AutoRespawnTaskResult,
        options=FleetTaskStartOptions(concurrency=1),
    )
    events = [event async for event in group.events()]
    report = await group.results()

    assert [bot.id for bot in selected] == ["healthy", "nearby"]
    assert [(entry.bot.id, entry.items) for entry in assignments] == [
        ("healthy", ("one", "three")),
        ("nearby", ("two",)),
    ]
    assert instance.started == ["healthy", "nearby"]
    assert FakeAsyncTasks.maximum_active == 1
    assert [event.bot.id for event in events] == ["healthy", "nearby"]
    assert not report.rejected
    assert [outcome.value.respawns for outcome in report.fulfilled] == [1, 1]


def test_sync_fleet_matches_async_selection_and_task_reports() -> None:
    instance = FakeSyncInstance()
    fleet = SoulFireFleet(cast(SoulFireInstance, instance), None)

    selected = fleet.select(_selector())
    group = fleet.start_tasks(
        FleetSelector(bot_ids=("healthy", "nearby")),
        AutoRespawnTask(maximum_respawns=1),
        AutoRespawnTaskResult,
        options=FleetTaskStartOptions(concurrency=2),
    )
    events = list(group.events())
    report = group.results()

    assert [bot.id for bot in selected] == ["healthy", "nearby"]
    assert sorted(event.bot.id for event in events) == ["healthy", "nearby"]
    assert [outcome.value.respawns for outcome in report.fulfilled] == [1, 1]


def _bot_entries() -> list[BotListEntry]:
    return [
        _online_bot("healthy", 20, 4, 4),
        _online_bot("nearby", 14, 8, 8),
        _online_bot("far", 18, 96, 96),
        BotListEntry(
            profile_id="offline",
            is_online=False,
            connection_phase=BOT_CONNECTION_PHASE_DISCONNECTED,
            account_name="offline",
            status=BotStatus(
                profile_id="offline",
                desired_state=BOT_DESIRED_STATE_STOPPED,
                runtime_state=BOT_RUNTIME_STATE_STOPPED,
            ),
        ),
    ]


def _online_bot(
    profile_id: str,
    health: float,
    x: float,
    z: float,
) -> BotListEntry:
    return BotListEntry(
        profile_id=profile_id,
        is_online=True,
        connection_phase=BOT_CONNECTION_PHASE_SPAWNED,
        account_name=profile_id,
        status=BotStatus(
            profile_id=profile_id,
            desired_state=BOT_DESIRED_STATE_STOPPED,
            runtime_state=BOT_RUNTIME_STATE_RUNNING,
        ),
        live_state=BotLiveState(
            x=x,
            y=64,
            z=z,
            health=health,
            max_health=20,
            food_level=20,
            dimension="minecraft:overworld",
        ),
    )


def _instance_info() -> InstanceInfo:
    return InstanceInfo(
        config=InstanceConfig(
            accounts=[
                MinecraftAccountProto(
                    profile_id=profile_id,
                    last_known_name=profile_id,
                    type=MinecraftAccountProto.OFFLINE,
                    persistent_metadata=[
                        SettingsNamespace(
                            namespace="fleet",
                            entries=[
                                SettingsNamespace.SettingsEntry(
                                    key="role",
                                    value=Value(
                                        string_value=("scout" if profile_id == "far" else "builder")
                                    ),
                                )
                            ],
                        )
                    ],
                )
                for profile_id in ("healthy", "nearby", "far", "offline")
            ]
        )
    )
