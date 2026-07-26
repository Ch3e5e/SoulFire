from __future__ import annotations

from collections.abc import AsyncIterator, Iterable, Iterator

from .bot_connect import BotServiceClient, BotServiceClientSync
from .bot_live_connect import BotLiveServiceClient, BotLiveServiceClientSync
from .bot_live_pb2 import (
    AttackEntityRequest,
    BlockPosition,
    BotEvent,
    BotEventFilter,
    DigBlockRequest,
    FindBlocksRequest,
    FindBlocksResponse,
    GetBlockRequest,
    GetBlockResponse,
    GoToRequest,
    Hand,
    InteractEntityRequest,
    ListNearbyEntitiesRequest,
    ListNearbyEntitiesResponse,
    PathfindGoal,
    PathfindOptions,
    PathfindProgress,
    PlaceBlockRequest,
    StopPathfindingRequest,
    SwingArmRequest,
    UseItemRequest,
)
from .bot_pb2 import (
    BOT_DESIRED_STATE_RUNNING,
    BOT_DESIRED_STATE_STOPPED,
    BotInfoRequest,
    BotStatus,
    RestartBotsRequest,
    SetBotsDesiredStateRequest,
)


def default_event_filter() -> BotEventFilter:
    return BotEventFilter(
        include_state_deltas=True,
        include_chat=True,
        include_lifecycle=True,
    )


class SoulFireBot:
    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        bot_client: BotServiceClient,
        live_client: BotLiveServiceClient,
    ) -> None:
        self.instance_id = instance_id
        self.id = bot_id
        self._bot_client = bot_client
        self._live_client = live_client

    async def start(self, *, timeout_ms: int | None = None) -> BotStatus:
        response = await self._bot_client.set_bots_desired_state(
            SetBotsDesiredStateRequest(
                instance_id=self.instance_id,
                bot_ids=[self.id],
                desired_state=BOT_DESIRED_STATE_RUNNING,
            ),
            timeout_ms=timeout_ms,
        )
        return _required_status(response.bots, self.id)

    async def stop(self, *, timeout_ms: int | None = None) -> BotStatus:
        response = await self._bot_client.set_bots_desired_state(
            SetBotsDesiredStateRequest(
                instance_id=self.instance_id,
                bot_ids=[self.id],
                desired_state=BOT_DESIRED_STATE_STOPPED,
            ),
            timeout_ms=timeout_ms,
        )
        return _required_status(response.bots, self.id)

    async def restart(self, *, timeout_ms: int | None = None) -> BotStatus:
        response = await self._bot_client.restart_bots(
            RestartBotsRequest(instance_id=self.instance_id, bot_ids=[self.id]),
            timeout_ms=timeout_ms,
        )
        return _required_status(response.bots, self.id)

    async def status(self, *, timeout_ms: int | None = None) -> BotStatus:
        response = await self._bot_client.get_bot_info(
            BotInfoRequest(instance_id=self.instance_id, bot_id=self.id),
            timeout_ms=timeout_ms,
        )
        return response.status

    def events(
        self,
        event_filter: BotEventFilter | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[BotEvent]:
        from .bot_live_pb2 import WatchBotEventsRequest

        return self._live_client.watch_bot_events(
            WatchBotEventsRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                filter=event_filter or default_event_filter(),
            ),
            timeout_ms=timeout_ms,
        )

    async def send_chat(
        self,
        message: str,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        from .bot_live_pb2 import SendChatRequest

        await self._live_client.send_chat(
            SendChatRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                message=message,
            ),
            timeout_ms=timeout_ms,
        )

    async def get_block(
        self,
        position: BlockPosition,
        *,
        timeout_ms: int | None = None,
    ) -> GetBlockResponse:
        return await self._live_client.get_block(
            GetBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                position=position,
            ),
            timeout_ms=timeout_ms,
        )

    async def find_blocks(
        self,
        block_ids: Iterable[str],
        *,
        max_distance: int,
        max_count: int,
        timeout_ms: int | None = None,
    ) -> FindBlocksResponse:
        return await self._live_client.find_blocks(
            FindBlocksRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                block_ids=block_ids,
                max_distance=max_distance,
                max_count=max_count,
            ),
            timeout_ms=timeout_ms,
        )

    async def list_nearby_entities(
        self,
        radius: float,
        *,
        entity_types: Iterable[str] = (),
        include_players: bool = True,
        timeout_ms: int | None = None,
    ) -> ListNearbyEntitiesResponse:
        return await self._live_client.list_nearby_entities(
            ListNearbyEntitiesRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                radius=radius,
                entity_types=entity_types,
                include_players=include_players,
            ),
            timeout_ms=timeout_ms,
        )

    async def dig_block(
        self,
        position: BlockPosition,
        *,
        cancel: bool = False,
        timeout_ms: int | None = None,
    ) -> None:
        await self._live_client.dig_block(
            DigBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                position=position,
                cancel=cancel,
            ),
            timeout_ms=timeout_ms,
        )

    async def place_block(
        self,
        against: BlockPosition,
        face: int,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        await self._live_client.place_block(
            PlaceBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                against=against,
                face=face,
                hand=hand,
            ),
            timeout_ms=timeout_ms,
        )

    async def use_item(
        self,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        await self._live_client.use_item(
            UseItemRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                hand=hand,
            ),
            timeout_ms=timeout_ms,
        )

    async def attack_entity(
        self,
        entity_id: int,
        *,
        sprinting: bool = False,
        timeout_ms: int | None = None,
    ) -> None:
        await self._live_client.attack_entity(
            AttackEntityRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                entity_id=entity_id,
                sprinting=sprinting,
            ),
            timeout_ms=timeout_ms,
        )

    async def interact_entity(
        self,
        entity_id: int,
        *,
        hand: int = Hand.HAND_MAIN,
        sneaking: bool = False,
        timeout_ms: int | None = None,
    ) -> None:
        await self._live_client.interact_entity(
            InteractEntityRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                entity_id=entity_id,
                hand=hand,
                sneaking=sneaking,
            ),
            timeout_ms=timeout_ms,
        )

    async def swing_arm(
        self,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        await self._live_client.swing_arm(
            SwingArmRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                hand=hand,
            ),
            timeout_ms=timeout_ms,
        )

    def go_to(
        self,
        goal: PathfindGoal,
        options: PathfindOptions | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[PathfindProgress]:
        return self._live_client.go_to(
            GoToRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                goal=goal,
                options=options,
            ),
            timeout_ms=timeout_ms,
        )

    async def stop_pathfinding(self, *, timeout_ms: int | None = None) -> None:
        await self._live_client.stop_pathfinding(
            StopPathfindingRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
            ),
            timeout_ms=timeout_ms,
        )


class SoulFireBotSync:
    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        bot_client: BotServiceClientSync,
        live_client: BotLiveServiceClientSync,
    ) -> None:
        self.instance_id = instance_id
        self.id = bot_id
        self._bot_client = bot_client
        self._live_client = live_client

    def start(self, *, timeout_ms: int | None = None) -> BotStatus:
        response = self._bot_client.set_bots_desired_state(
            SetBotsDesiredStateRequest(
                instance_id=self.instance_id,
                bot_ids=[self.id],
                desired_state=BOT_DESIRED_STATE_RUNNING,
            ),
            timeout_ms=timeout_ms,
        )
        return _required_status(response.bots, self.id)

    def stop(self, *, timeout_ms: int | None = None) -> BotStatus:
        response = self._bot_client.set_bots_desired_state(
            SetBotsDesiredStateRequest(
                instance_id=self.instance_id,
                bot_ids=[self.id],
                desired_state=BOT_DESIRED_STATE_STOPPED,
            ),
            timeout_ms=timeout_ms,
        )
        return _required_status(response.bots, self.id)

    def restart(self, *, timeout_ms: int | None = None) -> BotStatus:
        response = self._bot_client.restart_bots(
            RestartBotsRequest(instance_id=self.instance_id, bot_ids=[self.id]),
            timeout_ms=timeout_ms,
        )
        return _required_status(response.bots, self.id)

    def status(self, *, timeout_ms: int | None = None) -> BotStatus:
        response = self._bot_client.get_bot_info(
            BotInfoRequest(instance_id=self.instance_id, bot_id=self.id),
            timeout_ms=timeout_ms,
        )
        return response.status

    def events(
        self,
        event_filter: BotEventFilter | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> Iterator[BotEvent]:
        from .bot_live_pb2 import WatchBotEventsRequest

        return self._live_client.watch_bot_events(
            WatchBotEventsRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                filter=event_filter or default_event_filter(),
            ),
            timeout_ms=timeout_ms,
        )

    def send_chat(
        self,
        message: str,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        from .bot_live_pb2 import SendChatRequest

        self._live_client.send_chat(
            SendChatRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                message=message,
            ),
            timeout_ms=timeout_ms,
        )

    def get_block(
        self,
        position: BlockPosition,
        *,
        timeout_ms: int | None = None,
    ) -> GetBlockResponse:
        return self._live_client.get_block(
            GetBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                position=position,
            ),
            timeout_ms=timeout_ms,
        )

    def find_blocks(
        self,
        block_ids: Iterable[str],
        *,
        max_distance: int,
        max_count: int,
        timeout_ms: int | None = None,
    ) -> FindBlocksResponse:
        return self._live_client.find_blocks(
            FindBlocksRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                block_ids=block_ids,
                max_distance=max_distance,
                max_count=max_count,
            ),
            timeout_ms=timeout_ms,
        )

    def list_nearby_entities(
        self,
        radius: float,
        *,
        entity_types: Iterable[str] = (),
        include_players: bool = True,
        timeout_ms: int | None = None,
    ) -> ListNearbyEntitiesResponse:
        return self._live_client.list_nearby_entities(
            ListNearbyEntitiesRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                radius=radius,
                entity_types=entity_types,
                include_players=include_players,
            ),
            timeout_ms=timeout_ms,
        )

    def dig_block(
        self,
        position: BlockPosition,
        *,
        cancel: bool = False,
        timeout_ms: int | None = None,
    ) -> None:
        self._live_client.dig_block(
            DigBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                position=position,
                cancel=cancel,
            ),
            timeout_ms=timeout_ms,
        )

    def place_block(
        self,
        against: BlockPosition,
        face: int,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        self._live_client.place_block(
            PlaceBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                against=against,
                face=face,
                hand=hand,
            ),
            timeout_ms=timeout_ms,
        )

    def use_item(
        self,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        self._live_client.use_item(
            UseItemRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                hand=hand,
            ),
            timeout_ms=timeout_ms,
        )

    def attack_entity(
        self,
        entity_id: int,
        *,
        sprinting: bool = False,
        timeout_ms: int | None = None,
    ) -> None:
        self._live_client.attack_entity(
            AttackEntityRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                entity_id=entity_id,
                sprinting=sprinting,
            ),
            timeout_ms=timeout_ms,
        )

    def interact_entity(
        self,
        entity_id: int,
        *,
        hand: int = Hand.HAND_MAIN,
        sneaking: bool = False,
        timeout_ms: int | None = None,
    ) -> None:
        self._live_client.interact_entity(
            InteractEntityRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                entity_id=entity_id,
                hand=hand,
                sneaking=sneaking,
            ),
            timeout_ms=timeout_ms,
        )

    def swing_arm(
        self,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        self._live_client.swing_arm(
            SwingArmRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                hand=hand,
            ),
            timeout_ms=timeout_ms,
        )

    def go_to(
        self,
        goal: PathfindGoal,
        options: PathfindOptions | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> Iterator[PathfindProgress]:
        return self._live_client.go_to(
            GoToRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                goal=goal,
                options=options,
            ),
            timeout_ms=timeout_ms,
        )

    def stop_pathfinding(self, *, timeout_ms: int | None = None) -> None:
        self._live_client.stop_pathfinding(
            StopPathfindingRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
            ),
            timeout_ms=timeout_ms,
        )


def _required_status(statuses: Iterable[BotStatus], bot_id: str) -> BotStatus:
    for status in statuses:
        if status.profile_id == bot_id:
            return status
    raise RuntimeError(f"SoulFire did not return status for bot {bot_id}")
