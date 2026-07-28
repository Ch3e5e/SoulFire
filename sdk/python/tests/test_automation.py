from typing import Any, cast

import pytest

from soulfire.automation import (
    AsyncSoulFireAutomation,
    AutomationBotSettingsPatch,
    SoulFireAutomation,
)
from soulfire.automation_connect import (
    AutomationServiceClient,
    AutomationServiceClientSync,
)
from soulfire.automation_pb2 import (
    AUTOMATION_EVENT_KIND_SNAPSHOT,
    AutomationActionResponse,
    AutomationBotActionResult,
    AutomationEvent,
    AutomationTeamState,
    GetAutomationTeamStateResponse,
    StartAutomationAcquireRequest,
    UpdateAutomationBotSettingsRequest,
    UpdateAutomationBotSettingsResponse,
    WatchAutomationEventsRequest,
)


class FakeAsyncAutomationClient:
    watch_request: WatchAutomationEventsRequest | None = None
    acquire_request: StartAutomationAcquireRequest | None = None
    settings_request: UpdateAutomationBotSettingsRequest | None = None

    async def get_automation_team_state(
        self,
        request: Any,
        **_options: Any,
    ) -> GetAutomationTeamStateResponse:
        return GetAutomationTeamStateResponse(
            state=AutomationTeamState(
                instance_id=request.instance_id,
                friendly_name="Fleet",
                active_bots=1,
            )
        )

    def watch_automation_events(
        self,
        request: WatchAutomationEventsRequest,
        **_options: Any,
    ):
        self.watch_request = request

        async def events():
            yield AutomationEvent(
                sequence=1,
                kind=AUTOMATION_EVENT_KIND_SNAPSHOT,
            )

        return events()

    async def start_automation_acquire(
        self,
        request: StartAutomationAcquireRequest,
        **_options: Any,
    ) -> AutomationActionResponse:
        self.acquire_request = request
        return AutomationActionResponse(
            results=[
                AutomationBotActionResult(
                    bot_id=bot_id,
                    success=True,
                    message="started",
                )
                for bot_id in request.bot_ids
            ]
        )

    async def update_automation_bot_settings(
        self,
        request: UpdateAutomationBotSettingsRequest,
        **_options: Any,
    ) -> UpdateAutomationBotSettingsResponse:
        self.settings_request = request
        return UpdateAutomationBotSettingsResponse()


class FakeSyncAutomationClient:
    watch_request: WatchAutomationEventsRequest | None = None

    def watch_automation_events(
        self,
        request: WatchAutomationEventsRequest,
        **_options: Any,
    ):
        self.watch_request = request
        return iter(
            [
                AutomationEvent(
                    sequence=1,
                    kind=AUTOMATION_EVENT_KIND_SNAPSHOT,
                )
            ]
        )

    def start_automation_acquire(
        self,
        request: StartAutomationAcquireRequest,
        **_options: Any,
    ) -> AutomationActionResponse:
        return AutomationActionResponse(
            results=[
                AutomationBotActionResult(
                    bot_id=bot_id,
                    success=True,
                    message=request.target,
                )
                for bot_id in request.bot_ids
            ]
        )


@pytest.mark.asyncio
async def test_async_automation_scopes_events_actions_and_presence_patches() -> None:
    client = FakeAsyncAutomationClient()
    automation = AsyncSoulFireAutomation(
        "instance-id",
        cast(AutomationServiceClient, client),
    )

    team = await automation.team_state()
    events = [
        event
        async for event in automation.events(
            bot_ids=["bot-id", "bot-id"],
            poll_interval_ms=250,
        )
    ]
    results = await automation.acquire(
        "minecraft:oak_log",
        8,
        ["bot-id"],
    )
    await automation.update_bot_settings(
        AutomationBotSettingsPatch(
            enabled=False,
            memory_scan_radius=24,
        ),
        ["bot-id"],
    )

    assert team.instance_id == "instance-id"
    assert events[0].kind == AUTOMATION_EVENT_KIND_SNAPSHOT
    assert results[0].bot_id == "bot-id"
    assert client.watch_request is not None
    assert list(client.watch_request.bot_ids) == ["bot-id"]
    assert client.watch_request.include_coordination is True
    assert client.watch_request.include_progress is True
    assert client.acquire_request is not None
    assert client.acquire_request.target == "minecraft:oak_log"
    assert client.settings_request is not None
    assert client.settings_request.HasField("enabled")
    assert client.settings_request.enabled is False
    assert client.settings_request.HasField("memory_scan_radius")
    assert not client.settings_request.HasField("allow_death_recovery")


def test_sync_automation_preserves_stream_defaults_and_selections() -> None:
    client = FakeSyncAutomationClient()
    automation = SoulFireAutomation(
        "instance-id",
        cast(AutomationServiceClientSync, client),
    )

    events = list(automation.events(bot_ids=["bot-id"]))
    results = automation.acquire("minecraft:cobblestone", 16, ["bot-id"])

    assert events[0].sequence == 1
    assert results[0].message == "minecraft:cobblestone"
    assert client.watch_request is not None
    assert client.watch_request.instance_id == "instance-id"
    assert client.watch_request.include_coordination is True
    assert client.watch_request.include_progress is True
