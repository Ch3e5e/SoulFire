from __future__ import annotations

from collections.abc import AsyncIterator, Iterable, Iterator

from .bot_connect import BotServiceClient, BotServiceClientSync
from .bot_live_connect import BotLiveServiceClient, BotLiveServiceClientSync
from .bot_live_pb2 import (
    BOT_ACTION_STATUS_COMPLETED,
    AcquireBotControlRequest,
    AttackEntityRequest,
    BlockPosition,
    BotActionResult,
    BotControlLease,
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
    ReleaseBotControlRequest,
    ReleaseItemRequest,
    RenewBotControlRequest,
    RespawnRequest,
    StopPathfindingRequest,
    SwingArmRequest,
    UseItemRequest,
)
from .bot_pb2 import (
    BOT_DESIRED_STATE_RUNNING,
    BOT_DESIRED_STATE_STOPPED,
    DROP_ALL,
    DROP_ONE,
    LEFT_CLICK,
    SHIFT_LEFT_CLICK,
    BotCloseContainerRequest,
    BotInfoRequest,
    BotInfoResponse,
    BotInventoryClickRequest,
    BotInventoryStateRequest,
    BotInventoryStateResponse,
    BotOpenInventoryRequest,
    BotResetMovementRequest,
    BotSetHotbarSlotRequest,
    BotSetMovementStateRequest,
    BotSetRotationRequest,
    BotStatus,
    RestartBotsRequest,
    SetBotsDesiredStateRequest,
)


def default_event_filter() -> BotEventFilter:
    return BotEventFilter(
        include_state_deltas=True,
        include_chat=True,
        include_lifecycle=True,
        include_inventory=True,
        include_damage=True,
    )


class SoulFireActionError(RuntimeError):
    def __init__(self, result: BotActionResult) -> None:
        self.result = result
        super().__init__(result.error or f"Bot action {result.action_id} did not complete")


def _require_action(result: BotActionResult) -> BotActionResult:
    if result.status != BOT_ACTION_STATUS_COMPLETED:
        raise SoulFireActionError(result)
    return result


def _require_success(success: bool, error: str, fallback: str) -> None:
    if not success:
        raise RuntimeError(error or fallback)


def _action_headers(
    headers: dict[str, str] | None,
    token: str | None,
) -> dict[str, str] | None:
    if token is None:
        return headers
    result = dict(headers or {})
    result["X-SoulFire-Control-Token"] = token
    return result


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
        self._control_token: str | None = None

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
        return (await self.info(timeout_ms=timeout_ms)).status

    async def info(self, *, timeout_ms: int | None = None) -> BotInfoResponse:
        return await self._bot_client.get_bot_info(
            BotInfoRequest(instance_id=self.instance_id, bot_id=self.id),
            timeout_ms=timeout_ms,
        )

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
    ) -> BotActionResult:
        from .bot_live_pb2 import SendChatRequest

        response = await self._live_client.send_chat(
            SendChatRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                message=message,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

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
    ) -> BotActionResult:
        response = await self._live_client.dig_block(
            DigBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                position=position,
                cancel=cancel,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def place_block(
        self,
        against: BlockPosition,
        face: int,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.place_block(
            PlaceBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                against=against,
                face=face,
                hand=hand,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def use_item(
        self,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.use_item(
            UseItemRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                hand=hand,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def release_item(
        self,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.release_item(
            ReleaseItemRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def attack_entity(
        self,
        entity_id: int,
        *,
        sprinting: bool = False,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.attack_entity(
            AttackEntityRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                entity_id=entity_id,
                sprinting=sprinting,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def interact_entity(
        self,
        entity_id: int,
        *,
        hand: int = Hand.HAND_MAIN,
        sneaking: bool = False,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.interact_entity(
            InteractEntityRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                entity_id=entity_id,
                hand=hand,
                sneaking=sneaking,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def swing_arm(
        self,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.swing_arm(
            SwingArmRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                hand=hand,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def respawn(self, *, timeout_ms: int | None = None) -> BotActionResult:
        response = await self._live_client.respawn(
            RespawnRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

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
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )

    async def stop_pathfinding(self, *, timeout_ms: int | None = None) -> None:
        await self._live_client.stop_pathfinding(
            StopPathfindingRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )

    async def inventory(self, *, timeout_ms: int | None = None) -> BotInventoryStateResponse:
        return await self._bot_client.get_inventory_state(
            BotInventoryStateRequest(instance_id=self.instance_id, bot_id=self.id),
            timeout_ms=timeout_ms,
        )

    async def click_inventory(
        self,
        slot: int,
        click_type: int = LEFT_CLICK,
        *,
        hotbar_slot: int = 0,
        timeout_ms: int | None = None,
    ) -> None:
        response = await self._bot_client.click_inventory_slot(
            BotInventoryClickRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                slot=slot,
                click_type=click_type,
                hotbar_slot=hotbar_slot,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Inventory click failed")

    async def transfer_inventory_slot(
        self,
        slot: int,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        await self.click_inventory(slot, SHIFT_LEFT_CLICK, timeout_ms=timeout_ms)

    async def drop_inventory_slot(
        self,
        slot: int,
        *,
        all: bool = True,
        timeout_ms: int | None = None,
    ) -> None:
        await self.click_inventory(
            slot,
            DROP_ALL if all else DROP_ONE,
            timeout_ms=timeout_ms,
        )

    async def move_inventory_stack(
        self,
        from_slot: int,
        to_slot: int,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        await self.click_inventory(from_slot, timeout_ms=timeout_ms)
        await self.click_inventory(to_slot, timeout_ms=timeout_ms)
        state = await self.inventory(timeout_ms=timeout_ms)
        if state.HasField("carried_item") and state.carried_item.count > 0:
            await self.click_inventory(from_slot, timeout_ms=timeout_ms)

    async def select_hotbar(self, slot: int, *, timeout_ms: int | None = None) -> None:
        response = await self._bot_client.set_hotbar_slot(
            BotSetHotbarSlotRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                slot=slot,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Selecting a hotbar slot failed")

    async def set_movement(
        self,
        *,
        forward: bool | None = None,
        backward: bool | None = None,
        left: bool | None = None,
        right: bool | None = None,
        jump: bool | None = None,
        sneak: bool | None = None,
        sprint: bool | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        values = {
            key: value
            for key, value in {
                "forward": forward,
                "backward": backward,
                "left": left,
                "right": right,
                "jump": jump,
                "sneak": sneak,
                "sprint": sprint,
            }.items()
            if value is not None
        }
        response = await self._bot_client.set_movement_state(
            BotSetMovementStateRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                **values,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Updating movement failed")

    async def reset_movement(self, *, timeout_ms: int | None = None) -> None:
        response = await self._bot_client.reset_movement(
            BotResetMovementRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Resetting movement failed")

    async def look(
        self,
        yaw: float,
        pitch: float,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        response = await self._bot_client.set_rotation(
            BotSetRotationRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                yaw=yaw,
                pitch=pitch,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Updating rotation failed")

    async def open_inventory(self, *, timeout_ms: int | None = None) -> None:
        response = await self._bot_client.open_inventory(
            BotOpenInventoryRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Opening inventory failed")

    async def close_container(self, *, timeout_ms: int | None = None) -> None:
        response = await self._bot_client.close_container(
            BotCloseContainerRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Closing container failed")

    async def acquire_control(
        self,
        *,
        ttl_seconds: int = 30,
        timeout_ms: int | None = None,
    ) -> SoulFireBotControlLease:
        if self._control_token is not None:
            raise RuntimeError(f"Bot {self.id} control is already leased by this client")
        response = await self._live_client.acquire_bot_control(
            AcquireBotControlRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                ttl_seconds=ttl_seconds,
            ),
            timeout_ms=timeout_ms,
        )
        if not response.HasField("lease"):
            raise RuntimeError("SoulFire did not return the acquired control lease")
        self._control_token = response.lease.token
        return SoulFireBotControlLease(self, response.lease)

    async def _renew_control(
        self,
        lease: BotControlLease,
        ttl_seconds: int,
        timeout_ms: int | None,
    ) -> BotControlLease:
        response = await self._live_client.renew_bot_control(
            RenewBotControlRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                token=lease.token,
                ttl_seconds=ttl_seconds,
            ),
            timeout_ms=timeout_ms,
        )
        if not response.HasField("lease"):
            raise RuntimeError("SoulFire did not return the renewed control lease")
        self._control_token = response.lease.token
        return response.lease

    async def _release_control(
        self,
        lease: BotControlLease,
        timeout_ms: int | None,
    ) -> None:
        await self._live_client.release_bot_control(
            ReleaseBotControlRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                token=lease.token,
            ),
            timeout_ms=timeout_ms,
        )
        if self._control_token == lease.token:
            self._control_token = None


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
        self._control_token: str | None = None

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
        return self.info(timeout_ms=timeout_ms).status

    def info(self, *, timeout_ms: int | None = None) -> BotInfoResponse:
        return self._bot_client.get_bot_info(
            BotInfoRequest(instance_id=self.instance_id, bot_id=self.id),
            timeout_ms=timeout_ms,
        )

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
    ) -> BotActionResult:
        from .bot_live_pb2 import SendChatRequest

        response = self._live_client.send_chat(
            SendChatRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                message=message,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

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
    ) -> BotActionResult:
        response = self._live_client.dig_block(
            DigBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                position=position,
                cancel=cancel,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def place_block(
        self,
        against: BlockPosition,
        face: int,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.place_block(
            PlaceBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                against=against,
                face=face,
                hand=hand,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def use_item(
        self,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.use_item(
            UseItemRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                hand=hand,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def release_item(
        self,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.release_item(
            ReleaseItemRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def attack_entity(
        self,
        entity_id: int,
        *,
        sprinting: bool = False,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.attack_entity(
            AttackEntityRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                entity_id=entity_id,
                sprinting=sprinting,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def interact_entity(
        self,
        entity_id: int,
        *,
        hand: int = Hand.HAND_MAIN,
        sneaking: bool = False,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.interact_entity(
            InteractEntityRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                entity_id=entity_id,
                hand=hand,
                sneaking=sneaking,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def swing_arm(
        self,
        hand: int = Hand.HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.swing_arm(
            SwingArmRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                hand=hand,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def respawn(self, *, timeout_ms: int | None = None) -> BotActionResult:
        response = self._live_client.respawn(
            RespawnRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

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
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )

    def stop_pathfinding(self, *, timeout_ms: int | None = None) -> None:
        self._live_client.stop_pathfinding(
            StopPathfindingRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )

    def inventory(self, *, timeout_ms: int | None = None) -> BotInventoryStateResponse:
        return self._bot_client.get_inventory_state(
            BotInventoryStateRequest(instance_id=self.instance_id, bot_id=self.id),
            timeout_ms=timeout_ms,
        )

    def click_inventory(
        self,
        slot: int,
        click_type: int = LEFT_CLICK,
        *,
        hotbar_slot: int = 0,
        timeout_ms: int | None = None,
    ) -> None:
        response = self._bot_client.click_inventory_slot(
            BotInventoryClickRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                slot=slot,
                click_type=click_type,
                hotbar_slot=hotbar_slot,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Inventory click failed")

    def transfer_inventory_slot(self, slot: int, *, timeout_ms: int | None = None) -> None:
        self.click_inventory(slot, SHIFT_LEFT_CLICK, timeout_ms=timeout_ms)

    def drop_inventory_slot(
        self,
        slot: int,
        *,
        all: bool = True,
        timeout_ms: int | None = None,
    ) -> None:
        self.click_inventory(
            slot,
            DROP_ALL if all else DROP_ONE,
            timeout_ms=timeout_ms,
        )

    def move_inventory_stack(
        self,
        from_slot: int,
        to_slot: int,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        self.click_inventory(from_slot, timeout_ms=timeout_ms)
        self.click_inventory(to_slot, timeout_ms=timeout_ms)
        state = self.inventory(timeout_ms=timeout_ms)
        if state.HasField("carried_item") and state.carried_item.count > 0:
            self.click_inventory(from_slot, timeout_ms=timeout_ms)

    def select_hotbar(self, slot: int, *, timeout_ms: int | None = None) -> None:
        response = self._bot_client.set_hotbar_slot(
            BotSetHotbarSlotRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                slot=slot,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Selecting a hotbar slot failed")

    def set_movement(
        self,
        *,
        forward: bool | None = None,
        backward: bool | None = None,
        left: bool | None = None,
        right: bool | None = None,
        jump: bool | None = None,
        sneak: bool | None = None,
        sprint: bool | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        values = {
            key: value
            for key, value in {
                "forward": forward,
                "backward": backward,
                "left": left,
                "right": right,
                "jump": jump,
                "sneak": sneak,
                "sprint": sprint,
            }.items()
            if value is not None
        }
        response = self._bot_client.set_movement_state(
            BotSetMovementStateRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                **values,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Updating movement failed")

    def reset_movement(self, *, timeout_ms: int | None = None) -> None:
        response = self._bot_client.reset_movement(
            BotResetMovementRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Resetting movement failed")

    def look(
        self,
        yaw: float,
        pitch: float,
        *,
        timeout_ms: int | None = None,
    ) -> None:
        response = self._bot_client.set_rotation(
            BotSetRotationRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                yaw=yaw,
                pitch=pitch,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Updating rotation failed")

    def open_inventory(self, *, timeout_ms: int | None = None) -> None:
        response = self._bot_client.open_inventory(
            BotOpenInventoryRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Opening inventory failed")

    def close_container(self, *, timeout_ms: int | None = None) -> None:
        response = self._bot_client.close_container(
            BotCloseContainerRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, response.error, "Closing container failed")

    def acquire_control(
        self,
        *,
        ttl_seconds: int = 30,
        timeout_ms: int | None = None,
    ) -> SoulFireBotControlLeaseSync:
        if self._control_token is not None:
            raise RuntimeError(f"Bot {self.id} control is already leased by this client")
        response = self._live_client.acquire_bot_control(
            AcquireBotControlRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                ttl_seconds=ttl_seconds,
            ),
            timeout_ms=timeout_ms,
        )
        if not response.HasField("lease"):
            raise RuntimeError("SoulFire did not return the acquired control lease")
        self._control_token = response.lease.token
        return SoulFireBotControlLeaseSync(self, response.lease)

    def _renew_control(
        self,
        lease: BotControlLease,
        ttl_seconds: int,
        timeout_ms: int | None,
    ) -> BotControlLease:
        response = self._live_client.renew_bot_control(
            RenewBotControlRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                token=lease.token,
                ttl_seconds=ttl_seconds,
            ),
            timeout_ms=timeout_ms,
        )
        if not response.HasField("lease"):
            raise RuntimeError("SoulFire did not return the renewed control lease")
        self._control_token = response.lease.token
        return response.lease

    def _release_control(
        self,
        lease: BotControlLease,
        timeout_ms: int | None,
    ) -> None:
        self._live_client.release_bot_control(
            ReleaseBotControlRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                token=lease.token,
            ),
            timeout_ms=timeout_ms,
        )
        if self._control_token == lease.token:
            self._control_token = None


class SoulFireBotControlLease:
    def __init__(self, bot: SoulFireBot, lease: BotControlLease) -> None:
        self._bot = bot
        self._lease: BotControlLease | None = lease

    @property
    def value(self) -> BotControlLease:
        if self._lease is None:
            raise RuntimeError("The bot control lease has been released")
        return self._lease

    async def renew(
        self,
        *,
        ttl_seconds: int = 30,
        timeout_ms: int | None = None,
    ) -> BotControlLease:
        self._lease = await self._bot._renew_control(self.value, ttl_seconds, timeout_ms)
        return self._lease

    async def release(self, *, timeout_ms: int | None = None) -> None:
        if self._lease is None:
            return
        await self._bot._release_control(self._lease, timeout_ms)
        self._lease = None

    async def __aenter__(self) -> SoulFireBotControlLease:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.release()


class SoulFireBotControlLeaseSync:
    def __init__(self, bot: SoulFireBotSync, lease: BotControlLease) -> None:
        self._bot = bot
        self._lease: BotControlLease | None = lease

    @property
    def value(self) -> BotControlLease:
        if self._lease is None:
            raise RuntimeError("The bot control lease has been released")
        return self._lease

    def renew(
        self,
        *,
        ttl_seconds: int = 30,
        timeout_ms: int | None = None,
    ) -> BotControlLease:
        self._lease = self._bot._renew_control(self.value, ttl_seconds, timeout_ms)
        return self._lease

    def release(self, *, timeout_ms: int | None = None) -> None:
        if self._lease is None:
            return
        self._bot._release_control(self._lease, timeout_ms)
        self._lease = None

    def __enter__(self) -> SoulFireBotControlLeaseSync:
        return self

    def __exit__(self, *_: object) -> None:
        self.release()


def _required_status(statuses: Iterable[BotStatus], bot_id: str) -> BotStatus:
    for status in statuses:
        if status.profile_id == bot_id:
            return status
    raise RuntimeError(f"SoulFire did not return status for bot {bot_id}")
