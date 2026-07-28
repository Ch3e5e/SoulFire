from __future__ import annotations

import asyncio
import contextlib
import queue
import threading
from collections.abc import AsyncIterator, Callable, Iterator, Mapping
from dataclasses import dataclass, replace
from types import MappingProxyType
from typing import Protocol

from .bot_live_pb2 import (
    BOSS_BAR_EVENT_REMOVE,
    ENTITY_EVENT_DESPAWN,
    PLAYER_LIST_EVENT_REMOVE,
    RESOURCE_PACK_EVENT_CLEARED,
    RESOURCE_PACK_EVENT_OFFERED,
    RESOURCE_PACK_EVENT_REMOVED,
    SCOREBOARD_EVENT_DISPLAY_OBJECTIVE,
    SCOREBOARD_EVENT_OBJECTIVE_ADD,
    SCOREBOARD_EVENT_OBJECTIVE_REMOVE,
    SCOREBOARD_EVENT_OBJECTIVE_UPDATE,
    SCOREBOARD_EVENT_SCORE_RESET,
    SCOREBOARD_EVENT_SCORE_SET,
    SCOREBOARD_EVENT_TEAM_ADD,
    SCOREBOARD_EVENT_TEAM_PLAYERS_ADD,
    SCOREBOARD_EVENT_TEAM_PLAYERS_REMOVE,
    SCOREBOARD_EVENT_TEAM_REMOVE,
    SCOREBOARD_EVENT_TEAM_UPDATE,
    WEATHER_EVENT_RAIN_LEVEL_CHANGED,
    WEATHER_EVENT_STARTED_RAINING,
    WEATHER_EVENT_STOPPED_RAINING,
    WEATHER_EVENT_THUNDER_LEVEL_CHANGED,
    BlockState,
    BotBossBarEvent,
    BotEnvironmentEvent,
    BotEvent,
    BotEventFilter,
    BotGameEvent,
    BotPlayerListEvent,
    BotResourcePackEvent,
    BotScoreboardEvent,
    BotStateDelta,
    ClockSnapshot,
    NearbyEntity,
    PlayerListEntrySnapshot,
    WatchBotEventsRequest,
)
from .bot_pb2 import BotInventoryStateResponse, BotLiveState, BotStatus
from .common_pb2 import BlockPosition
from .domain_pb2 import BlockSnapshot, EntitySnapshot, TextComponent

_DEFAULT_RECONNECT_DELAY = 0.25
_MAX_RECONNECT_DELAY = 5.0
_SUBSCRIBER_BUFFER_SIZE = 1_024
_CLOSED = object()


@dataclass(frozen=True, slots=True)
class BotSessionState:
    block_snapshots: Mapping[str, BlockSnapshot]
    blocks: Mapping[str, BlockState]
    boss_bars: Mapping[str, BotBossBarState]
    entities: Mapping[int, NearbyEntity]
    entity_snapshots: Mapping[int, EntitySnapshot]
    environment: BotEnvironmentState
    player_list: Mapping[str, PlayerListEntrySnapshot]
    resource_packs: Mapping[str, BotResourcePackEvent]
    scoreboard: BotScoreboardState
    sequence: int = 0
    snapshot_revision: int = 0
    epoch: str | None = None
    inventory: BotInventoryStateResponse | None = None
    player: BotLiveState | None = None
    status: BotStatus | None = None


@dataclass(frozen=True, slots=True)
class BotEnvironmentState:
    clocks: Mapping[str, ClockSnapshot]
    game_time: int | None = None
    last_game_event: BotGameEvent | None = None
    rain_level: float | None = None
    raining: bool | None = None
    thunder_level: float | None = None


@dataclass(frozen=True, slots=True)
class BotBossBarState:
    boss_bar_id: str
    color: str | None = None
    create_world_fog: bool | None = None
    darken_screen: bool | None = None
    name: TextComponent | None = None
    overlay: str | None = None
    play_music: bool | None = None
    progress: float | None = None


@dataclass(frozen=True, slots=True)
class BotScoreboardObjective:
    name: str
    display_name: TextComponent | None = None
    render_type: str | None = None


@dataclass(frozen=True, slots=True)
class BotScoreboardScore:
    objective_name: str
    owner: str
    score: int
    display_name: TextComponent | None = None


@dataclass(frozen=True, slots=True)
class BotScoreboardTeam:
    name: str
    players: frozenset[str]
    allow_friendly_fire: bool | None = None
    collision_rule: str | None = None
    color: str | None = None
    display_name: TextComponent | None = None
    name_tag_visibility: str | None = None
    prefix: TextComponent | None = None
    see_friendly_invisibles: bool | None = None
    suffix: TextComponent | None = None


@dataclass(frozen=True, slots=True)
class BotScoreboardState:
    display_slots: Mapping[str, str]
    objectives: Mapping[str, BotScoreboardObjective]
    scores: Mapping[str, BotScoreboardScore]
    teams: Mapping[str, BotScoreboardTeam]


@dataclass(frozen=True, slots=True)
class BotSessionOptions:
    filter: BotEventFilter | None = None
    heartbeat_interval_seconds: int = 15


class AsyncBotEventStreamFactory(Protocol):
    def __call__(self, request: WatchBotEventsRequest) -> AsyncIterator[BotEvent]: ...


class BotEventStreamFactory(Protocol):
    def __call__(self, request: WatchBotEventsRequest) -> Iterator[BotEvent]: ...


class AsyncBotSession:
    __slots__ = (
        "_closed",
        "_events",
        "_options",
        "_ready",
        "_run_task",
        "_state",
        "_stream",
    )

    def __init__(
        self,
        stream: AsyncBotEventStreamFactory,
        options: BotSessionOptions,
    ) -> None:
        self._stream = stream
        self._options = options
        self._state = empty_bot_session_state()
        self._events: set[asyncio.Queue[BotEvent | object]] = set()
        self._closed = False
        self._ready = asyncio.get_running_loop().create_future()
        self._run_task = asyncio.create_task(self._consume())

    @classmethod
    async def open(
        cls,
        stream: AsyncBotEventStreamFactory,
        options: BotSessionOptions | None = None,
    ) -> AsyncBotSession:
        session = cls(stream, options or BotSessionOptions())
        await session._ready
        return session

    @property
    def state(self) -> BotSessionState:
        return self._state

    async def events(self) -> AsyncIterator[BotEvent]:
        events: asyncio.Queue[BotEvent | object] = asyncio.Queue(maxsize=_SUBSCRIBER_BUFFER_SIZE)
        self._events.add(events)
        try:
            while True:
                event = await events.get()
                if event is _CLOSED:
                    return
                assert isinstance(event, BotEvent)
                yield event
        finally:
            self._events.discard(events)

    async def wait_for(
        self,
        predicate: Callable[[BotEvent, BotSessionState], bool],
        *,
        timeout: float | None = None,
    ) -> BotEvent:
        async def wait() -> BotEvent:
            async for event in self.events():
                if predicate(event, self._state):
                    return event
            raise RuntimeError("Bot session closed before the expected event")

        return await asyncio.wait_for(wait(), timeout)

    async def once(self, event_name: str, *, timeout: float | None = None) -> BotEvent:
        return await self.wait_for(
            lambda event, _: event.WhichOneof("event") == event_name,
            timeout=timeout,
        )

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._run_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._run_task
        for events in self._events:
            _put_async(events, _CLOSED)
        self._events.clear()

    async def __aenter__(self) -> AsyncBotSession:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def _consume(self) -> None:
        reconnect_delay = _DEFAULT_RECONNECT_DELAY
        while not self._closed:
            try:
                request = _watch_request(self._state, self._options)
                async for event in self._stream(request):
                    self._state = reduce_bot_session_state(self._state, event)
                    if not self._ready.done():
                        self._ready.set_result(None)
                    for events in self._events:
                        _put_async(events, event)
                    reconnect_delay = _DEFAULT_RECONNECT_DELAY
                if not self._closed:
                    await asyncio.sleep(reconnect_delay)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                if not self._ready.done():
                    self._ready.set_exception(error)
                    return
                await asyncio.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, _MAX_RECONNECT_DELAY)


class BotSession:
    __slots__ = (
        "_closed",
        "_events",
        "_options",
        "_ready",
        "_state",
        "_stream",
        "_thread",
    )

    def __init__(
        self,
        stream: BotEventStreamFactory,
        options: BotSessionOptions | None = None,
    ) -> None:
        self._stream = stream
        self._options = options or BotSessionOptions()
        self._state = empty_bot_session_state()
        self._events: set[queue.Queue[BotEvent | object]] = set()
        self._closed = threading.Event()
        self._ready: queue.Queue[BaseException | None] = queue.Queue(maxsize=1)
        self._thread = threading.Thread(
            target=self._consume,
            name="soulfire-bot-session",
            daemon=True,
        )
        self._thread.start()
        ready = self._ready.get()
        if ready is not None:
            raise ready

    @property
    def state(self) -> BotSessionState:
        return self._state

    def events(self) -> Iterator[BotEvent]:
        events: queue.Queue[BotEvent | object] = queue.Queue(maxsize=_SUBSCRIBER_BUFFER_SIZE)
        self._events.add(events)
        try:
            while True:
                event = events.get()
                if event is _CLOSED:
                    return
                assert isinstance(event, BotEvent)
                yield event
        finally:
            self._events.discard(events)

    def wait_for(
        self,
        predicate: Callable[[BotEvent, BotSessionState], bool],
        *,
        timeout: float | None = None,
    ) -> BotEvent:
        result: queue.Queue[BotEvent | BaseException] = queue.Queue(maxsize=1)

        def wait() -> None:
            try:
                for event in self.events():
                    if predicate(event, self._state):
                        result.put(event)
                        return
                result.put(RuntimeError("Bot session closed before the expected event"))
            except BaseException as error:
                result.put(error)

        threading.Thread(target=wait, name="soulfire-session-wait", daemon=True).start()
        try:
            value = result.get(timeout=timeout)
        except queue.Empty as error:
            raise TimeoutError("Timed out waiting for a bot event") from error
        if isinstance(value, BaseException):
            raise value
        return value

    def once(self, event_name: str, *, timeout: float | None = None) -> BotEvent:
        return self.wait_for(
            lambda event, _: event.WhichOneof("event") == event_name,
            timeout=timeout,
        )

    def close(self) -> None:
        if self._closed.is_set():
            return
        self._closed.set()
        for events in self._events:
            _put_sync(events, _CLOSED)
        self._events.clear()

    def __enter__(self) -> BotSession:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _consume(self) -> None:
        reconnect_delay = _DEFAULT_RECONNECT_DELAY
        ready = False
        while not self._closed.is_set():
            try:
                request = _watch_request(self._state, self._options)
                for event in self._stream(request):
                    if self._closed.is_set():
                        return
                    self._state = reduce_bot_session_state(self._state, event)
                    if not ready:
                        ready = True
                        self._ready.put(None)
                    for events in self._events:
                        _put_sync(events, event)
                    reconnect_delay = _DEFAULT_RECONNECT_DELAY
                if self._closed.wait(reconnect_delay):
                    return
            except BaseException as error:
                if not ready:
                    self._ready.put(error)
                    return
                if self._closed.wait(reconnect_delay):
                    return
                reconnect_delay = min(reconnect_delay * 2, _MAX_RECONNECT_DELAY)


def reduce_bot_session_state(state: BotSessionState, event: BotEvent) -> BotSessionState:
    has_envelope = event.HasField("envelope")
    discontinuity = (
        has_envelope
        and state.epoch is not None
        and (
            event.envelope.stream_epoch != state.epoch
            or event.envelope.sequence != state.sequence + 1
        )
    )
    event_name = event.WhichOneof("event")
    if discontinuity or event_name == "resync_required":
        state = replace(empty_bot_session_state(), status=state.status)

    blocks = dict(state.blocks)
    block_snapshots = dict(state.block_snapshots)
    boss_bars = dict(state.boss_bars)
    entities = dict(state.entities)
    entity_snapshots = dict(state.entity_snapshots)
    environment = state.environment
    player_list = dict(state.player_list)
    resource_packs = dict(state.resource_packs)
    scoreboard = state.scoreboard
    player = state.player
    inventory = state.inventory
    status = state.status

    if event_name == "snapshot":
        player = event.snapshot
    elif event_name == "state_delta" and player is not None:
        player = _merge_player_state(player, event.state_delta)
    elif event_name == "status":
        status = event.status
    elif event_name == "inventory":
        inventory = event.inventory.state
    elif event_name == "entity_event" and event.entity_event.HasField("entity"):
        entity = event.entity_event.entity
        if event.entity_event.kind == ENTITY_EVENT_DESPAWN:
            entities.pop(entity.entity_id, None)
            entity_snapshots.pop(entity.entity_id, None)
        else:
            entities[entity.entity_id] = entity
            if event.entity_event.HasField("snapshot"):
                entity_snapshots[entity.entity_id] = event.entity_event.snapshot
    elif event_name == "block_update" and event.block_update.HasField("position"):
        update = event.block_update
        key = _block_key(update.position)
        blocks[key] = BlockState(
            position=update.position,
            block_id=update.new_block_id,
            properties=update.block.properties if update.HasField("block") else {},
        )
        if update.HasField("block"):
            block_snapshots[key] = update.block
    elif event_name == "environment":
        environment = _reduce_environment_state(environment, event.environment)
    elif event_name == "player_list":
        _reduce_player_list_state(player_list, event.player_list)
    elif event_name == "boss_bar":
        _reduce_boss_bar_state(boss_bars, event.boss_bar)
    elif event_name == "scoreboard":
        scoreboard = _reduce_scoreboard_state(scoreboard, event.scoreboard)
    elif event_name == "resource_pack":
        _reduce_resource_pack_state(resource_packs, event.resource_pack)

    return BotSessionState(
        block_snapshots=MappingProxyType(block_snapshots),
        blocks=MappingProxyType(blocks),
        boss_bars=MappingProxyType(boss_bars),
        entities=MappingProxyType(entities),
        entity_snapshots=MappingProxyType(entity_snapshots),
        environment=environment,
        player_list=MappingProxyType(player_list),
        resource_packs=MappingProxyType(resource_packs),
        scoreboard=scoreboard,
        sequence=event.envelope.sequence if has_envelope else state.sequence,
        snapshot_revision=(
            event.envelope.snapshot_revision if has_envelope else state.snapshot_revision
        ),
        epoch=event.envelope.stream_epoch if has_envelope else state.epoch,
        inventory=inventory,
        player=player,
        status=status,
    )


def _reduce_resource_pack_state(
    resource_packs: dict[str, BotResourcePackEvent],
    event: BotResourcePackEvent,
) -> None:
    if event.kind == RESOURCE_PACK_EVENT_OFFERED:
        resource_packs[event.pack_id] = event
    elif event.kind == RESOURCE_PACK_EVENT_REMOVED:
        resource_packs.pop(event.pack_id, None)
    elif event.kind == RESOURCE_PACK_EVENT_CLEARED:
        resource_packs.clear()


def _reduce_environment_state(
    state: BotEnvironmentState,
    event: BotEnvironmentEvent,
) -> BotEnvironmentState:
    change = event.WhichOneof("change")
    if change == "time":
        clocks = dict(state.clocks)
        clocks.update((clock.clock_id, clock) for clock in event.time.clocks)
        return replace(
            state,
            clocks=MappingProxyType(clocks),
            game_time=event.time.game_time,
        )
    if change == "game_event":
        return replace(state, last_game_event=event.game_event)
    if change != "weather":
        return state
    if event.weather.kind == WEATHER_EVENT_STARTED_RAINING:
        return replace(state, raining=True)
    if event.weather.kind == WEATHER_EVENT_STOPPED_RAINING:
        return replace(state, raining=False)
    if event.weather.kind == WEATHER_EVENT_RAIN_LEVEL_CHANGED and event.weather.HasField("level"):
        return replace(state, rain_level=event.weather.level)
    if event.weather.kind == WEATHER_EVENT_THUNDER_LEVEL_CHANGED and event.weather.HasField(
        "level"
    ):
        return replace(state, thunder_level=event.weather.level)
    return state


def _reduce_player_list_state(
    state: dict[str, PlayerListEntrySnapshot],
    event: BotPlayerListEvent,
) -> None:
    if event.kind == PLAYER_LIST_EVENT_REMOVE:
        for profile_id in event.removed_profile_ids:
            state.pop(profile_id, None)
        return
    for entry in event.entries:
        previous = state.get(entry.profile_id)
        changed = set(entry.changed_fields)
        if previous is None or "add_player" in changed:
            state[entry.profile_id] = entry
            continue
        merged = PlayerListEntrySnapshot()
        merged.CopyFrom(previous)
        del merged.changed_fields[:]
        merged.changed_fields.extend(entry.changed_fields)
        if "update_display_name" in changed:
            if entry.HasField("display_name"):
                merged.display_name.CopyFrom(entry.display_name)
            else:
                merged.ClearField("display_name")
        if "update_game_mode" in changed:
            merged.game_mode = entry.game_mode
        if "update_hat" in changed:
            merged.show_hat = entry.show_hat
        if "update_latency" in changed:
            merged.latency_ms = entry.latency_ms
        if "update_list_order" in changed:
            merged.list_order = entry.list_order
        if "update_listed" in changed:
            merged.listed = entry.listed
        state[entry.profile_id] = merged


def _reduce_boss_bar_state(
    state: dict[str, BotBossBarState],
    event: BotBossBarEvent,
) -> None:
    if event.kind == BOSS_BAR_EVENT_REMOVE:
        state.pop(event.boss_bar_id, None)
        return
    previous = state.get(event.boss_bar_id)
    state[event.boss_bar_id] = BotBossBarState(
        boss_bar_id=event.boss_bar_id,
        color=event.color if event.HasField("color") else previous.color if previous else None,
        create_world_fog=(
            event.create_world_fog
            if event.HasField("create_world_fog")
            else previous.create_world_fog
            if previous
            else None
        ),
        darken_screen=(
            event.darken_screen
            if event.HasField("darken_screen")
            else previous.darken_screen
            if previous
            else None
        ),
        name=event.name if event.HasField("name") else previous.name if previous else None,
        overlay=(
            event.overlay if event.HasField("overlay") else previous.overlay if previous else None
        ),
        play_music=(
            event.play_music
            if event.HasField("play_music")
            else previous.play_music
            if previous
            else None
        ),
        progress=(
            event.progress
            if event.HasField("progress")
            else previous.progress
            if previous
            else None
        ),
    )


def _reduce_scoreboard_state(
    state: BotScoreboardState,
    event: BotScoreboardEvent,
) -> BotScoreboardState:
    display_slots = dict(state.display_slots)
    objectives = dict(state.objectives)
    scores = dict(state.scores)
    teams = dict(state.teams)
    objective_name = event.objective_name if event.HasField("objective_name") else None

    if event.kind in {SCOREBOARD_EVENT_OBJECTIVE_ADD, SCOREBOARD_EVENT_OBJECTIVE_UPDATE}:
        if objective_name is not None:
            previous = objectives.get(objective_name)
            objectives[objective_name] = BotScoreboardObjective(
                name=objective_name,
                display_name=(
                    event.display_name
                    if event.HasField("display_name")
                    else previous.display_name
                    if previous
                    else None
                ),
                render_type=(
                    event.render_type
                    if event.HasField("render_type")
                    else previous.render_type
                    if previous
                    else None
                ),
            )
    elif event.kind == SCOREBOARD_EVENT_OBJECTIVE_REMOVE and objective_name is not None:
        objectives.pop(objective_name, None)
        display_slots = {
            slot: displayed
            for slot, displayed in display_slots.items()
            if displayed != objective_name
        }
        scores = {
            key: score for key, score in scores.items() if score.objective_name != objective_name
        }
    elif event.kind == SCOREBOARD_EVENT_DISPLAY_OBJECTIVE and event.HasField("display_slot"):
        if not objective_name:
            display_slots.pop(event.display_slot, None)
        else:
            display_slots[event.display_slot] = objective_name
    elif (
        event.kind == SCOREBOARD_EVENT_SCORE_SET
        and objective_name is not None
        and event.HasField("owner")
        and event.HasField("score")
    ):
        scores[_scoreboard_score_key(objective_name, event.owner)] = BotScoreboardScore(
            objective_name=objective_name,
            owner=event.owner,
            score=event.score,
            display_name=event.display_name if event.HasField("display_name") else None,
        )
    elif event.kind == SCOREBOARD_EVENT_SCORE_RESET and event.HasField("owner"):
        if objective_name is not None:
            scores.pop(_scoreboard_score_key(objective_name, event.owner), None)
        else:
            scores = {key: score for key, score in scores.items() if score.owner != event.owner}
    elif event.kind == SCOREBOARD_EVENT_TEAM_REMOVE and event.HasField("team_name"):
        teams.pop(event.team_name, None)
    elif event.kind in {
        SCOREBOARD_EVENT_TEAM_ADD,
        SCOREBOARD_EVENT_TEAM_UPDATE,
        SCOREBOARD_EVENT_TEAM_PLAYERS_ADD,
        SCOREBOARD_EVENT_TEAM_PLAYERS_REMOVE,
    }:
        _reduce_scoreboard_team(teams, event)

    return BotScoreboardState(
        display_slots=MappingProxyType(display_slots),
        objectives=MappingProxyType(objectives),
        scores=MappingProxyType(scores),
        teams=MappingProxyType(teams),
    )


def _reduce_scoreboard_team(
    teams: dict[str, BotScoreboardTeam],
    event: BotScoreboardEvent,
) -> None:
    if not event.HasField("team_name"):
        return
    previous = teams.get(event.team_name)
    players = set(previous.players if previous else ())
    if event.kind in {SCOREBOARD_EVENT_TEAM_ADD, SCOREBOARD_EVENT_TEAM_UPDATE}:
        players = set(event.players)
    elif event.kind == SCOREBOARD_EVENT_TEAM_PLAYERS_ADD:
        players.update(event.players)
    else:
        players.difference_update(event.players)
    teams[event.team_name] = BotScoreboardTeam(
        name=event.team_name,
        players=frozenset(players),
        allow_friendly_fire=(
            event.allow_friendly_fire
            if event.HasField("allow_friendly_fire")
            else previous.allow_friendly_fire
            if previous
            else None
        ),
        collision_rule=(
            event.collision_rule
            if event.HasField("collision_rule")
            else previous.collision_rule
            if previous
            else None
        ),
        color=event.color if event.HasField("color") else previous.color if previous else None,
        display_name=(
            event.display_name
            if event.HasField("display_name")
            else previous.display_name
            if previous
            else None
        ),
        name_tag_visibility=(
            event.name_tag_visibility
            if event.HasField("name_tag_visibility")
            else previous.name_tag_visibility
            if previous
            else None
        ),
        prefix=event.prefix if event.HasField("prefix") else previous.prefix if previous else None,
        see_friendly_invisibles=(
            event.see_friendly_invisibles
            if event.HasField("see_friendly_invisibles")
            else previous.see_friendly_invisibles
            if previous
            else None
        ),
        suffix=event.suffix if event.HasField("suffix") else previous.suffix if previous else None,
    )


def _scoreboard_score_key(objective_name: str, owner: str) -> str:
    return f"{objective_name}\0{owner}"


def empty_bot_session_state() -> BotSessionState:
    return BotSessionState(
        block_snapshots=MappingProxyType({}),
        blocks=MappingProxyType({}),
        boss_bars=MappingProxyType({}),
        entities=MappingProxyType({}),
        entity_snapshots=MappingProxyType({}),
        environment=BotEnvironmentState(clocks=MappingProxyType({})),
        player_list=MappingProxyType({}),
        resource_packs=MappingProxyType({}),
        scoreboard=BotScoreboardState(
            display_slots=MappingProxyType({}),
            objectives=MappingProxyType({}),
            scores=MappingProxyType({}),
            teams=MappingProxyType({}),
        ),
    )


def _watch_request(
    state: BotSessionState,
    options: BotSessionOptions,
) -> WatchBotEventsRequest:
    return WatchBotEventsRequest(
        filter=options.filter or _default_filter(),
        after_sequence=state.sequence if state.epoch is not None else 0,
        **({} if state.epoch is None else {"stream_epoch": state.epoch}),
        heartbeat_interval_seconds=options.heartbeat_interval_seconds,
    )


def _default_filter() -> BotEventFilter:
    return BotEventFilter(
        include_block_updates=True,
        include_boss_bars=True,
        include_state_deltas=True,
        include_chat=True,
        include_lifecycle=True,
        include_entity_events=True,
        include_environment=True,
        include_inventory=True,
        include_damage=True,
        include_player_list=True,
        include_resource_packs=True,
        include_scoreboard=True,
        include_titles=True,
    )


def _merge_player_state(player: BotLiveState, delta: BotStateDelta) -> BotLiveState:
    merged = BotLiveState()
    merged.CopyFrom(player)
    for field in (
        "x",
        "y",
        "z",
        "x_rot",
        "y_rot",
        "health",
        "max_health",
        "food_level",
        "saturation_level",
        "selected_hotbar_slot",
        "dimension",
        "experience_level",
        "experience_progress",
        "game_mode",
    ):
        if delta.HasField(field):
            setattr(merged, field, getattr(delta, field))
    return merged


def _block_key(position: BlockPosition) -> str:
    return f"{position.dimension}:{position.x}:{position.y}:{position.z}"


def _put_async(events: asyncio.Queue[BotEvent | object], event: BotEvent | object) -> None:
    if events.full():
        with contextlib.suppress(asyncio.QueueEmpty):
            events.get_nowait()
    events.put_nowait(event)


def _put_sync(events: queue.Queue[BotEvent | object], event: BotEvent | object) -> None:
    if events.full():
        with contextlib.suppress(queue.Empty):
            events.get_nowait()
    events.put_nowait(event)
