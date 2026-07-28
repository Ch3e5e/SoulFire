from __future__ import annotations

from collections.abc import AsyncIterator, Iterable, Iterator

from .actions import action_headers, require_action
from .bot_connect import BotServiceClient, BotServiceClientSync
from .bot_live_connect import BotLiveServiceClient, BotLiveServiceClientSync
from .bot_live_pb2 import (
    HAND_MAIN,
    AcquireBotControlRequest,
    AttackEntityRequest,
    BlockFace,
    BotActionResult,
    BotControlLease,
    BotEvent,
    BotEventFilter,
    CreativeItemStack,
    DigBlockRequest,
    DismountRequest,
    FindBlocksRequest,
    FindBlocksResponse,
    GetBlockRequest,
    GetBlockResponse,
    GoToRequest,
    Hand,
    InteractBlockRequest,
    InteractEntityRequest,
    ListNearbyEntitiesRequest,
    ListNearbyEntitiesResponse,
    MountEntityRequest,
    MountEntityResponse,
    PathfindGoal,
    PathfindOptions,
    PathfindProgress,
    PlaceBlockRequest,
    ReleaseBotControlRequest,
    ReleaseItemRequest,
    RenewBotControlRequest,
    ResourcePackResponse,
    RespawnRequest,
    RespondResourcePackRequest,
    SetCreativeSlotRequest,
    SetFlyingRequest,
    SetVehicleControlRequest,
    SetVehicleControlResponse,
    SleepRequest,
    StartElytraFlightRequest,
    StopPathfindingRequest,
    SwingArmRequest,
    UpdateSignRequest,
    UseItemRequest,
    WaitForChunksRequest,
    WaitForChunksResponse,
    WakeRequest,
    WatchBotEventsRequest,
    WriteBookRequest,
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
    ClickType,
    RestartBotsRequest,
    SetBotsDesiredStateRequest,
)
from .camera import AsyncSoulFireCamera, SoulFireCamera
from .chat_connect import ChatServiceClient, ChatServiceClientSync
from .common_pb2 import BlockPosition
from .inventory_connect import InventoryServiceClient, InventoryServiceClientSync
from .inventory_pb2 import InventoryScope
from .pathfinding import AsyncSoulFirePathfinder, SoulFirePathfinder
from .pathfinding_connect import (
    PathfinderServiceClient,
    PathfinderServiceClientSync,
)
from .protocol import AsyncSoulFireProtocol, SoulFireProtocol
from .protocol_connect import BotProtocolServiceClient, BotProtocolServiceClientSync
from .recipe_connect import RecipeServiceClient, RecipeServiceClientSync
from .registry_connect import RegistryServiceClient, RegistryServiceClientSync
from .semantic import (
    AsyncSoulFireChat,
    AsyncSoulFireInventory,
    AsyncSoulFireRecipes,
    AsyncSoulFireRegistry,
    AsyncSoulFireWorld,
    SoulFireChat,
    SoulFireInventory,
    SoulFireRecipes,
    SoulFireRegistry,
    SoulFireWorld,
)
from .session import (
    AsyncBotSession,
    BotSession,
    BotSessionOptions,
)
from .task_connect import BotTaskServiceClient, BotTaskServiceClientSync
from .tasks import AsyncSoulFireTasks, SoulFireTasks
from .world_connect import WorldServiceClient, WorldServiceClientSync


def default_event_filter() -> BotEventFilter:
    return BotEventFilter(
        include_state_deltas=True,
        include_chat=True,
        include_lifecycle=True,
        include_inventory=True,
        include_damage=True,
        include_resource_packs=True,
        include_titles=True,
    )


def _require_success(success: bool, error: str, fallback: str) -> None:
    if not success:
        raise RuntimeError(error or fallback)


def _required_service[ServiceT](service: ServiceT | None, name: str) -> ServiceT:
    if service is None:
        raise RuntimeError(f"The {name} service is unavailable")
    return service


_require_action = require_action
_action_headers = action_headers


class AsyncSoulFireBot:
    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        bot_client: BotServiceClient,
        live_client: BotLiveServiceClient,
        task_client: BotTaskServiceClient | None = None,
        pathfinder_client: PathfinderServiceClient | None = None,
        chat_client: ChatServiceClient | None = None,
        inventory_client: InventoryServiceClient | None = None,
        recipe_client: RecipeServiceClient | None = None,
        registry_client: RegistryServiceClient | None = None,
        world_client: WorldServiceClient | None = None,
        protocol_client: BotProtocolServiceClient | None = None,
    ) -> None:
        self.instance_id = instance_id
        self.id = bot_id
        self._bot_client = bot_client
        self._live_client = live_client
        self._task_client = task_client
        self._pathfinder_client = pathfinder_client
        self._chat_client = chat_client
        self._inventory_client = inventory_client
        self._recipe_client = recipe_client
        self._registry_client = registry_client
        self._world_client = world_client
        self._protocol_client = protocol_client
        self._control_token: str | None = None

    @property
    def tasks(self) -> AsyncSoulFireTasks:
        if self._task_client is None:
            raise RuntimeError("The bot task service is unavailable")
        return AsyncSoulFireTasks(
            self.instance_id,
            self.id,
            self._task_client,
            lambda headers: _action_headers(headers, self._control_token),
        )

    @property
    def pathfinder(self) -> AsyncSoulFirePathfinder:
        return AsyncSoulFirePathfinder(
            self.instance_id,
            self.id,
            _required_service(self._pathfinder_client, "pathfinder"),
            self.tasks,
        )

    @property
    def chat(self) -> AsyncSoulFireChat:
        return AsyncSoulFireChat(
            self.instance_id,
            self.id,
            _required_service(self._chat_client, "chat"),
            lambda headers: _action_headers(headers, self._control_token),
            lambda event_filter, timeout_ms: self.events(
                event_filter,
                timeout_ms=timeout_ms,
            ),
        )

    @property
    def inventory(self) -> AsyncSoulFireInventory:
        return AsyncSoulFireInventory(
            self.instance_id,
            self.id,
            _required_service(self._inventory_client, "inventory"),
            lambda headers: _action_headers(headers, self._control_token),
        )

    @property
    def recipes(self) -> AsyncSoulFireRecipes:
        return AsyncSoulFireRecipes(
            InventoryScope(instance_id=self.instance_id, bot_id=self.id),
            _required_service(self._recipe_client, "recipe"),
            self.tasks,
        )

    @property
    def registry(self) -> AsyncSoulFireRegistry:
        return AsyncSoulFireRegistry(
            self.instance_id,
            self.id,
            _required_service(self._registry_client, "registry"),
        )

    @property
    def world(self) -> AsyncSoulFireWorld:
        return AsyncSoulFireWorld(
            self.instance_id,
            self.id,
            _required_service(self._world_client, "world"),
        )

    @property
    def camera(self) -> AsyncSoulFireCamera:
        return AsyncSoulFireCamera(self.instance_id, self.id, self._bot_client)

    @property
    def protocol(self) -> AsyncSoulFireProtocol:
        return AsyncSoulFireProtocol(
            self.instance_id,
            self.id,
            _required_service(self._protocol_client, "protocol"),
        )

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
        return self._live_client.watch_bot_events(
            WatchBotEventsRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                filter=event_filter or default_event_filter(),
            ),
            timeout_ms=timeout_ms,
        )

    async def observe(
        self,
        options: BotSessionOptions | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> AsyncBotSession:
        def stream(request: WatchBotEventsRequest) -> AsyncIterator[BotEvent]:
            request.instance_id = self.instance_id
            request.bot_id = self.id
            return self._live_client.watch_bot_events(
                request,
                timeout_ms=timeout_ms,
            )

        return await AsyncBotSession.open(stream, options)

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
        face: BlockFace,
        hand: Hand = HAND_MAIN,
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

    async def interact_block(
        self,
        position: BlockPosition,
        face: BlockFace,
        hand: Hand = HAND_MAIN,
        *,
        sneaking: bool = False,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.interact_block(
            InteractBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                position=position,
                face=face,
                hand=hand,
                sneaking=sneaking,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def use_item(
        self,
        hand: Hand = HAND_MAIN,
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
        hand: Hand = HAND_MAIN,
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
        hand: Hand = HAND_MAIN,
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

    async def sleep(
        self,
        bed: BlockPosition,
        hand: Hand = HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.sleep(
            SleepRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                bed=bed,
                hand=hand,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def wake(self, *, timeout_ms: int | None = None) -> BotActionResult:
        response = await self._live_client.wake(
            WakeRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def mount(
        self,
        entity_id: int,
        hand: Hand = HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> MountEntityResponse:
        response = await self._live_client.mount_entity(
            MountEntityRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                entity_id=entity_id,
                hand=hand,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_action(response.result)
        return response

    async def dismount(self, *, timeout_ms: int | None = None) -> BotActionResult:
        response = await self._live_client.dismount(
            DismountRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def set_vehicle_control(
        self,
        *,
        forward: bool | None = None,
        backward: bool | None = None,
        left: bool | None = None,
        right: bool | None = None,
        jump: bool | None = None,
        sneak: bool | None = None,
        sprint: bool | None = None,
        yaw: float | None = None,
        pitch: float | None = None,
        timeout_ms: int | None = None,
    ) -> SetVehicleControlResponse:
        request = SetVehicleControlRequest(
            instance_id=self.instance_id,
            bot_id=self.id,
        )
        _apply_vehicle_control(
            request,
            forward=forward,
            backward=backward,
            left=left,
            right=right,
            jump=jump,
            sneak=sneak,
            sprint=sprint,
            yaw=yaw,
            pitch=pitch,
        )
        response = await self._live_client.set_vehicle_control(
            request,
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_action(response.result)
        return response

    async def update_sign(
        self,
        position: BlockPosition,
        lines: Iterable[str],
        *,
        front_text: bool = True,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.update_sign(
            UpdateSignRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                position=position,
                front_text=front_text,
                lines=list(lines),
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def write_book(
        self,
        inventory_slot: int,
        pages: Iterable[str],
        *,
        title: str | None = None,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.write_book(
            WriteBookRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                inventory_slot=inventory_slot,
                pages=list(pages),
                **({} if title is None else {"title": title}),
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def respond_resource_pack(
        self,
        pack_id: str,
        response: ResourcePackResponse,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        result = await self._live_client.respond_resource_pack(
            RespondResourcePackRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                pack_id=pack_id,
                response=response,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(result.result)

    async def set_flying(
        self,
        flying: bool,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.set_flying(
            SetFlyingRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                flying=flying,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def start_elytra_flight(
        self,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.start_elytra_flight(
            StartElytraFlightRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def set_creative_slot(
        self,
        slot: int,
        item_id: str | None = None,
        *,
        count: int = 1,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._live_client.set_creative_slot(
            SetCreativeSlotRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                slot=slot,
                **(
                    {}
                    if item_id is None
                    else {"item": CreativeItemStack(item_id=item_id, count=count)}
                ),
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    async def wait_for_chunks(
        self,
        radius_chunks: int = 0,
        *,
        wait_timeout_ms: int = 0,
        timeout_ms: int | None = None,
    ) -> WaitForChunksResponse:
        return await self._live_client.wait_for_chunks(
            WaitForChunksRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                radius_chunks=radius_chunks,
                timeout_ms=wait_timeout_ms,
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

    async def inventory_state(self, *, timeout_ms: int | None = None) -> BotInventoryStateResponse:
        return await self._bot_client.get_inventory_state(
            BotInventoryStateRequest(instance_id=self.instance_id, bot_id=self.id),
            timeout_ms=timeout_ms,
        )

    async def click_inventory(
        self,
        slot: int,
        click_type: ClickType = LEFT_CLICK,
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
        state = await self.inventory_state(timeout_ms=timeout_ms)
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
        _require_success(response.success, "", "Opening inventory failed")

    async def close_container(self, *, timeout_ms: int | None = None) -> None:
        response = await self._bot_client.close_container(
            BotCloseContainerRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, "", "Closing container failed")

    async def acquire_control(
        self,
        *,
        ttl_seconds: int = 30,
        timeout_ms: int | None = None,
    ) -> AsyncSoulFireBotControlLease:
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
        return AsyncSoulFireBotControlLease(self, response.lease)

    async def renew_control(
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

    async def release_control(
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


class SoulFireBot:
    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        bot_client: BotServiceClientSync,
        live_client: BotLiveServiceClientSync,
        task_client: BotTaskServiceClientSync | None = None,
        pathfinder_client: PathfinderServiceClientSync | None = None,
        chat_client: ChatServiceClientSync | None = None,
        inventory_client: InventoryServiceClientSync | None = None,
        recipe_client: RecipeServiceClientSync | None = None,
        registry_client: RegistryServiceClientSync | None = None,
        world_client: WorldServiceClientSync | None = None,
        protocol_client: BotProtocolServiceClientSync | None = None,
    ) -> None:
        self.instance_id = instance_id
        self.id = bot_id
        self._bot_client = bot_client
        self._live_client = live_client
        self._task_client = task_client
        self._pathfinder_client = pathfinder_client
        self._chat_client = chat_client
        self._inventory_client = inventory_client
        self._recipe_client = recipe_client
        self._registry_client = registry_client
        self._world_client = world_client
        self._protocol_client = protocol_client
        self._control_token: str | None = None

    @property
    def tasks(self) -> SoulFireTasks:
        if self._task_client is None:
            raise RuntimeError("The bot task service is unavailable")
        return SoulFireTasks(
            self.instance_id,
            self.id,
            self._task_client,
            lambda headers: _action_headers(headers, self._control_token),
        )

    @property
    def pathfinder(self) -> SoulFirePathfinder:
        return SoulFirePathfinder(
            self.instance_id,
            self.id,
            _required_service(self._pathfinder_client, "pathfinder"),
            self.tasks,
        )

    @property
    def chat(self) -> SoulFireChat:
        return SoulFireChat(
            self.instance_id,
            self.id,
            _required_service(self._chat_client, "chat"),
            lambda headers: _action_headers(headers, self._control_token),
            lambda event_filter, timeout_ms: self.events(
                event_filter,
                timeout_ms=timeout_ms,
            ),
        )

    @property
    def inventory(self) -> SoulFireInventory:
        return SoulFireInventory(
            self.instance_id,
            self.id,
            _required_service(self._inventory_client, "inventory"),
            lambda headers: _action_headers(headers, self._control_token),
        )

    @property
    def recipes(self) -> SoulFireRecipes:
        return SoulFireRecipes(
            InventoryScope(instance_id=self.instance_id, bot_id=self.id),
            _required_service(self._recipe_client, "recipe"),
            self.tasks,
        )

    @property
    def registry(self) -> SoulFireRegistry:
        return SoulFireRegistry(
            self.instance_id,
            self.id,
            _required_service(self._registry_client, "registry"),
        )

    @property
    def world(self) -> SoulFireWorld:
        return SoulFireWorld(
            self.instance_id,
            self.id,
            _required_service(self._world_client, "world"),
        )

    @property
    def camera(self) -> SoulFireCamera:
        return SoulFireCamera(self.instance_id, self.id, self._bot_client)

    @property
    def protocol(self) -> SoulFireProtocol:
        return SoulFireProtocol(
            self.instance_id,
            self.id,
            _required_service(self._protocol_client, "protocol"),
        )

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
        return self._live_client.watch_bot_events(
            WatchBotEventsRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                filter=event_filter or default_event_filter(),
            ),
            timeout_ms=timeout_ms,
        )

    def observe(
        self,
        options: BotSessionOptions | None = None,
        *,
        timeout_ms: int | None = None,
    ) -> BotSession:
        def stream(request: WatchBotEventsRequest) -> Iterator[BotEvent]:
            request.instance_id = self.instance_id
            request.bot_id = self.id
            return self._live_client.watch_bot_events(
                request,
                timeout_ms=timeout_ms,
            )

        return BotSession(stream, options)

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
        face: BlockFace,
        hand: Hand = HAND_MAIN,
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

    def interact_block(
        self,
        position: BlockPosition,
        face: BlockFace,
        hand: Hand = HAND_MAIN,
        *,
        sneaking: bool = False,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.interact_block(
            InteractBlockRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                position=position,
                face=face,
                hand=hand,
                sneaking=sneaking,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def use_item(
        self,
        hand: Hand = HAND_MAIN,
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
        hand: Hand = HAND_MAIN,
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
        hand: Hand = HAND_MAIN,
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

    def sleep(
        self,
        bed: BlockPosition,
        hand: Hand = HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.sleep(
            SleepRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                bed=bed,
                hand=hand,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def wake(self, *, timeout_ms: int | None = None) -> BotActionResult:
        response = self._live_client.wake(
            WakeRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def mount(
        self,
        entity_id: int,
        hand: Hand = HAND_MAIN,
        *,
        timeout_ms: int | None = None,
    ) -> MountEntityResponse:
        response = self._live_client.mount_entity(
            MountEntityRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                entity_id=entity_id,
                hand=hand,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_action(response.result)
        return response

    def dismount(self, *, timeout_ms: int | None = None) -> BotActionResult:
        response = self._live_client.dismount(
            DismountRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def set_vehicle_control(
        self,
        *,
        forward: bool | None = None,
        backward: bool | None = None,
        left: bool | None = None,
        right: bool | None = None,
        jump: bool | None = None,
        sneak: bool | None = None,
        sprint: bool | None = None,
        yaw: float | None = None,
        pitch: float | None = None,
        timeout_ms: int | None = None,
    ) -> SetVehicleControlResponse:
        request = SetVehicleControlRequest(
            instance_id=self.instance_id,
            bot_id=self.id,
        )
        _apply_vehicle_control(
            request,
            forward=forward,
            backward=backward,
            left=left,
            right=right,
            jump=jump,
            sneak=sneak,
            sprint=sprint,
            yaw=yaw,
            pitch=pitch,
        )
        response = self._live_client.set_vehicle_control(
            request,
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_action(response.result)
        return response

    def update_sign(
        self,
        position: BlockPosition,
        lines: Iterable[str],
        *,
        front_text: bool = True,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.update_sign(
            UpdateSignRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                position=position,
                front_text=front_text,
                lines=list(lines),
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def write_book(
        self,
        inventory_slot: int,
        pages: Iterable[str],
        *,
        title: str | None = None,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.write_book(
            WriteBookRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                inventory_slot=inventory_slot,
                pages=list(pages),
                **({} if title is None else {"title": title}),
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def respond_resource_pack(
        self,
        pack_id: str,
        response: ResourcePackResponse,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        result = self._live_client.respond_resource_pack(
            RespondResourcePackRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                pack_id=pack_id,
                response=response,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(result.result)

    def set_flying(
        self,
        flying: bool,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.set_flying(
            SetFlyingRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                flying=flying,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def start_elytra_flight(
        self,
        *,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.start_elytra_flight(
            StartElytraFlightRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def set_creative_slot(
        self,
        slot: int,
        item_id: str | None = None,
        *,
        count: int = 1,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._live_client.set_creative_slot(
            SetCreativeSlotRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                slot=slot,
                **(
                    {}
                    if item_id is None
                    else {"item": CreativeItemStack(item_id=item_id, count=count)}
                ),
            ),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        return _require_action(response.result)

    def wait_for_chunks(
        self,
        radius_chunks: int = 0,
        *,
        wait_timeout_ms: int = 0,
        timeout_ms: int | None = None,
    ) -> WaitForChunksResponse:
        return self._live_client.wait_for_chunks(
            WaitForChunksRequest(
                instance_id=self.instance_id,
                bot_id=self.id,
                radius_chunks=radius_chunks,
                timeout_ms=wait_timeout_ms,
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

    def inventory_state(self, *, timeout_ms: int | None = None) -> BotInventoryStateResponse:
        return self._bot_client.get_inventory_state(
            BotInventoryStateRequest(instance_id=self.instance_id, bot_id=self.id),
            timeout_ms=timeout_ms,
        )

    def click_inventory(
        self,
        slot: int,
        click_type: ClickType = LEFT_CLICK,
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
        state = self.inventory_state(timeout_ms=timeout_ms)
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
        _require_success(response.success, "", "Opening inventory failed")

    def close_container(self, *, timeout_ms: int | None = None) -> None:
        response = self._bot_client.close_container(
            BotCloseContainerRequest(instance_id=self.instance_id, bot_id=self.id),
            headers=_action_headers(None, self._control_token),
            timeout_ms=timeout_ms,
        )
        _require_success(response.success, "", "Closing container failed")

    def acquire_control(
        self,
        *,
        ttl_seconds: int = 30,
        timeout_ms: int | None = None,
    ) -> SoulFireBotControlLease:
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
        return SoulFireBotControlLease(self, response.lease)

    def renew_control(
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

    def release_control(
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


class AsyncSoulFireBotControlLease:
    def __init__(self, bot: AsyncSoulFireBot, lease: BotControlLease) -> None:
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
        self._lease = await self._bot.renew_control(self.value, ttl_seconds, timeout_ms)
        return self._lease

    async def release(self, *, timeout_ms: int | None = None) -> None:
        if self._lease is None:
            return
        await self._bot.release_control(self._lease, timeout_ms)
        self._lease = None

    async def __aenter__(self) -> AsyncSoulFireBotControlLease:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.release()


class SoulFireBotControlLease:
    def __init__(self, bot: SoulFireBot, lease: BotControlLease) -> None:
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
        self._lease = self._bot.renew_control(self.value, ttl_seconds, timeout_ms)
        return self._lease

    def release(self, *, timeout_ms: int | None = None) -> None:
        if self._lease is None:
            return
        self._bot.release_control(self._lease, timeout_ms)
        self._lease = None

    def __enter__(self) -> SoulFireBotControlLease:
        return self

    def __exit__(self, *_: object) -> None:
        self.release()


def _apply_vehicle_control(
    request: SetVehicleControlRequest,
    *,
    forward: bool | None,
    backward: bool | None,
    left: bool | None,
    right: bool | None,
    jump: bool | None,
    sneak: bool | None,
    sprint: bool | None,
    yaw: float | None,
    pitch: float | None,
) -> None:
    if forward is not None:
        request.forward = forward
    if backward is not None:
        request.backward = backward
    if left is not None:
        request.left = left
    if right is not None:
        request.right = right
    if jump is not None:
        request.jump = jump
    if sneak is not None:
        request.sneak = sneak
    if sprint is not None:
        request.sprint = sprint
    if yaw is not None:
        request.yaw = yaw
    if pitch is not None:
        request.pitch = pitch


def _required_status(statuses: Iterable[BotStatus], bot_id: str) -> BotStatus:
    for status in statuses:
        if status.profile_id == bot_id:
            return status
    raise RuntimeError(f"SoulFire did not return status for bot {bot_id}")
