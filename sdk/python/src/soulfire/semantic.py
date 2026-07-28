from __future__ import annotations

import asyncio
import re
from collections.abc import (
    AsyncIterator,
    Callable,
    Iterable,
    Iterator,
    Mapping,
)
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, NotRequired, TypedDict, Unpack, cast

from .actions import require_action
from .bot_live_pb2 import (
    BotActionResult,
    BotChatEvent,
    BotEvent,
    BotEventFilter,
    ChatSource,
)
from .chat_connect import ChatServiceClient, ChatServiceClientSync
from .chat_pb2 import (
    ChatScope,
    SendCommandRequest,
    SendPublicChatRequest,
    SendWhisperRequest,
    TabCompleteRequest,
    TabCompleteResponse,
)
from .common_pb2 import BlockPosition, WorldPosition
from .domain_pb2 import (
    BlockSnapshot,
    EntityReference,
    EntitySnapshot,
    PlayerSnapshot,
    Vec3,
)
from .inventory_connect import InventoryServiceClient, InventoryServiceClientSync
from .inventory_pb2 import (
    INVENTORY_AREA_CONTAINER,
    INVENTORY_AREA_PLAYER,
    INVENTORY_RECOMMENDATION_KIND_ARMOR,
    INVENTORY_RECOMMENDATION_KIND_FOOD,
    INVENTORY_RECOMMENDATION_KIND_MELEE_WEAPON,
    INVENTORY_RECOMMENDATION_KIND_SCAFFOLD,
    INVENTORY_RECOMMENDATION_KIND_TOOL,
    CloseSemanticContainerRequest,
    ContainerSnapshot,
    CountItemsRequest,
    EquipItemRequest,
    FindInventorySlotsRequest,
    FindInventorySlotsResponse,
    GetContainerSnapshotRequest,
    InventoryArea,
    InventoryItemRecommendation,
    InventoryMutationResponse,
    InventoryRecommendationKind,
    InventoryScope,
    ItemSelector,
    MoveInventoryItemRequest,
    OpenBlockContainerRequest,
    RankInventoryItemsRequest,
    RankInventoryItemsResponse,
    SelectHotbarItemRequest,
    TossItemsRequest,
    TransferItemsRequest,
    UnequipItemRequest,
)
from .recipe_connect import RecipeServiceClient, RecipeServiceClientSync
from .recipe_pb2 import (
    BrewTaskResult,
    CanCraftRequest,
    CanCraftResponse,
    CraftTaskResult,
    ListRecipesRequest,
    ListRecipesResponse,
    ListVillagerTradesRequest,
    ListVillagerTradesResponse,
    SmeltTaskResult,
    VillagerTradeTaskResult,
)
from .registry_connect import RegistryServiceClient, RegistryServiceClientSync
from .registry_pb2 import (
    GetRegistryEntryRequest,
    GetRegistryEntryResponse,
    GetRegistryIdentityRequest,
    GetRegistryIdentityResponse,
    ListRegistryEntriesRequest,
    ListRegistryEntriesResponse,
    ListRegistryTagsRequest,
    ListRegistryTagsResponse,
    RegistryKind,
)
from .tasks import (
    AsyncSoulFireTask,
    AsyncSoulFireTasks,
    SoulFireTask,
    SoulFireTasks,
)
from .world_connect import WorldServiceClient, WorldServiceClientSync
from .world_pb2 import (
    QUERY_SORT_UNSPECIFIED,
    BlockSelector,
    CanSeeBlockRequest,
    CanSeeBlockResponse,
    EntitySelector,
    EstimateDigTimeRequest,
    EstimateDigTimeResponse,
    EstimateExplosionDamageRequest,
    EstimateExplosionDamageResponse,
    GetPlayerSnapshotRequest,
    GetWorldBlockRequest,
    GetWorldBlockResponse,
    GetWorldEntityRequest,
    GetWorldEntityResponse,
    QueryBlocksRequest,
    QueryBlocksResponse,
    QueryEntitiesRequest,
    QueryEntitiesResponse,
    QueryRegion,
    QuerySort,
    RaycastRequest,
    RaycastResponse,
)

type HeaderProvider = Callable[[dict[str, str] | None], dict[str, str] | None]


class InventoryRankingOptions(TypedDict):
    selector: NotRequired[ItemSelector]
    areas: NotRequired[Iterable[InventoryArea]]
    prefer_hotbar: NotRequired[bool]
    preferred_enchantment_ids: NotRequired[Iterable[str]]
    excluded_enchantment_ids: NotRequired[Iterable[str]]
    prefer_high_durability: NotRequired[bool]
    timeout_ms: NotRequired[int | None]


def _optional(value: object | None, field: str) -> dict[str, Any]:
    return {} if value is None else {field: value}


def _ranking_request(
    scope: InventoryScope,
    kind: InventoryRecommendationKind,
    *,
    selector: ItemSelector | None,
    areas: Iterable[InventoryArea],
    target_block: BlockPosition | None,
    equipment_slot: str | None,
    limit: int,
    prefer_hotbar: bool,
    preferred_enchantment_ids: Iterable[str],
    excluded_enchantment_ids: Iterable[str],
    prefer_high_durability: bool,
) -> RankInventoryItemsRequest:
    return RankInventoryItemsRequest(
        scope=scope,
        kind=kind,
        areas=areas,
        limit=limit,
        prefer_hotbar=prefer_hotbar,
        preferred_enchantment_ids=preferred_enchantment_ids,
        excluded_enchantment_ids=excluded_enchantment_ids,
        prefer_high_durability=prefer_high_durability,
        **_optional(selector, "selector"),
        **_optional(target_block, "target_block"),
        **_optional(equipment_slot, "equipment_slot"),
    )


def _first_recommendation(
    response: RankInventoryItemsResponse,
) -> InventoryItemRecommendation | None:
    return response.recommendations[0] if response.recommendations else None


type ChatMatcher = str | re.Pattern[str] | Callable[[BotChatEvent], bool]
type AsyncChatEventStream = Callable[
    [BotEventFilter, int | None],
    AsyncIterator[BotEvent],
]
type ChatEventStream = Callable[[BotEventFilter, int | None], Iterator[BotEvent]]


@dataclass(frozen=True, slots=True)
class ChatMatch:
    event: BotChatEvent
    captures: tuple[str, ...] = ()
    groups: Mapping[str, str] = MappingProxyType({})


def match_chat(event: BotChatEvent, matcher: ChatMatcher) -> ChatMatch | None:
    if isinstance(matcher, str):
        return ChatMatch(event) if matcher in event.plain_text else None
    if isinstance(matcher, re.Pattern):
        result = matcher.search(event.plain_text)
        if result is None:
            return None
        return ChatMatch(
            event,
            tuple(value or "" for value in result.groups()),
            MappingProxyType({name: value or "" for name, value in result.groupdict().items()}),
        )
    return ChatMatch(event) if matcher(event) else None


class AsyncSoulFireChat:
    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        client: ChatServiceClient,
        headers: HeaderProvider,
        event_stream: AsyncChatEventStream | None = None,
    ) -> None:
        self._scope = ChatScope(instance_id=instance_id, bot_id=bot_id)
        self._client = client
        self._headers = headers
        self._event_stream = event_stream

    async def send(
        self,
        message: str,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._client.send_public_chat(
            SendPublicChatRequest(
                scope=self._scope,
                message=message,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        return require_action(response.result)

    async def command(
        self,
        command: str,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._client.send_command(
            SendCommandRequest(
                scope=self._scope,
                command=command,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        return require_action(response.result)

    async def whisper(
        self,
        recipient: str,
        message: str,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = await self._client.send_whisper(
            SendWhisperRequest(
                scope=self._scope,
                recipient=recipient,
                message=message,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        return require_action(response.result)

    async def complete(
        self,
        value: str,
        *,
        cursor: int | None = None,
        timeout_ms: int | None = None,
    ) -> TabCompleteResponse:
        return await self._client.tab_complete(
            TabCompleteRequest(
                scope=self._scope,
                input=value,
                **_optional(cursor, "cursor"),
            ),
            timeout_ms=timeout_ms,
        )

    async def watch(
        self,
        matcher: ChatMatcher,
        *,
        sources: Iterable[ChatSource] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[ChatMatch]:
        if self._event_stream is None:
            raise RuntimeError("The bot event stream is unavailable")
        accepted_sources = None if sources is None else frozenset(sources)
        async for envelope in self._event_stream(
            BotEventFilter(include_chat=True),
            timeout_ms,
        ):
            if envelope.WhichOneof("event") != "chat":
                continue
            event = envelope.chat
            if accepted_sources is not None and event.source not in accepted_sources:
                continue
            match = match_chat(event, matcher)
            if match is not None:
                yield match

    async def wait_for(
        self,
        matcher: ChatMatcher,
        *,
        sources: Iterable[ChatSource] | None = None,
        timeout_ms: int | None = None,
    ) -> ChatMatch:
        async def find() -> ChatMatch:
            async for match in self.watch(
                matcher,
                sources=sources,
                timeout_ms=timeout_ms,
            ):
                return match
            raise RuntimeError("The bot event stream ended before chat matched")

        if timeout_ms is None:
            return await find()
        async with asyncio.timeout(timeout_ms / 1_000):
            return await find()


class SoulFireChat:
    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        client: ChatServiceClientSync,
        headers: HeaderProvider,
        event_stream: ChatEventStream | None = None,
    ) -> None:
        self._scope = ChatScope(instance_id=instance_id, bot_id=bot_id)
        self._client = client
        self._headers = headers
        self._event_stream = event_stream

    def send(
        self,
        message: str,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._client.send_public_chat(
            SendPublicChatRequest(
                scope=self._scope,
                message=message,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        return require_action(response.result)

    def command(
        self,
        command: str,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._client.send_command(
            SendCommandRequest(
                scope=self._scope,
                command=command,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        return require_action(response.result)

    def whisper(
        self,
        recipient: str,
        message: str,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> BotActionResult:
        response = self._client.send_whisper(
            SendWhisperRequest(
                scope=self._scope,
                recipient=recipient,
                message=message,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        return require_action(response.result)

    def complete(
        self,
        value: str,
        *,
        cursor: int | None = None,
        timeout_ms: int | None = None,
    ) -> TabCompleteResponse:
        return self._client.tab_complete(
            TabCompleteRequest(
                scope=self._scope,
                input=value,
                **_optional(cursor, "cursor"),
            ),
            timeout_ms=timeout_ms,
        )

    def watch(
        self,
        matcher: ChatMatcher,
        *,
        sources: Iterable[ChatSource] | None = None,
        timeout_ms: int | None = None,
    ) -> Iterator[ChatMatch]:
        if self._event_stream is None:
            raise RuntimeError("The bot event stream is unavailable")
        accepted_sources = None if sources is None else frozenset(sources)
        for envelope in self._event_stream(
            BotEventFilter(include_chat=True),
            timeout_ms,
        ):
            if envelope.WhichOneof("event") != "chat":
                continue
            event = envelope.chat
            if accepted_sources is not None and event.source not in accepted_sources:
                continue
            match = match_chat(event, matcher)
            if match is not None:
                yield match

    def wait_for(
        self,
        matcher: ChatMatcher,
        *,
        sources: Iterable[ChatSource] | None = None,
        timeout_ms: int | None = None,
    ) -> ChatMatch:
        for match in self.watch(
            matcher,
            sources=sources,
            timeout_ms=timeout_ms,
        ):
            return match
        raise RuntimeError("The bot event stream ended before chat matched")


class AsyncSoulFireWorld:
    def __init__(self, instance_id: str, bot_id: str, client: WorldServiceClient) -> None:
        self._instance_id = instance_id
        self._bot_id = bot_id
        self._client = client

    async def player(self, *, timeout_ms: int | None = None) -> PlayerSnapshot:
        response = await self._client.get_player_snapshot(
            GetPlayerSnapshotRequest(instance_id=self._instance_id, bot_id=self._bot_id),
            timeout_ms=timeout_ms,
        )
        return response.player

    async def block(
        self,
        position: BlockPosition,
        *,
        include_block_entity: bool = False,
        include_shapes: bool = False,
        timeout_ms: int | None = None,
    ) -> GetWorldBlockResponse:
        return await self._client.get_world_block(
            GetWorldBlockRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                position=position,
                include_block_entity=include_block_entity,
                include_shapes=include_shapes,
            ),
            timeout_ms=timeout_ms,
        )

    async def query_blocks(
        self,
        region: QueryRegion,
        selector: BlockSelector,
        *,
        sort: QuerySort = QUERY_SORT_UNSPECIFIED,
        page_size: int = 0,
        page_token: str = "",
        timeout_ms: int | None = None,
    ) -> QueryBlocksResponse:
        return await self._client.query_blocks(
            QueryBlocksRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                region=region,
                selector=selector,
                sort=sort,
                page_size=page_size,
                page_token=page_token,
            ),
            timeout_ms=timeout_ms,
        )

    async def entity(
        self,
        reference: EntityReference,
        *,
        timeout_ms: int | None = None,
    ) -> GetWorldEntityResponse:
        return await self._client.get_world_entity(
            GetWorldEntityRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                entity=reference,
            ),
            timeout_ms=timeout_ms,
        )

    async def query_entities(
        self,
        radius: float,
        selector: EntitySelector,
        *,
        origin: WorldPosition | None = None,
        sort: QuerySort = QUERY_SORT_UNSPECIFIED,
        page_size: int = 0,
        page_token: str = "",
        timeout_ms: int | None = None,
    ) -> QueryEntitiesResponse:
        return await self._client.query_entities(
            QueryEntitiesRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                radius=radius,
                selector=selector,
                sort=sort,
                page_size=page_size,
                page_token=page_token,
                **_optional(origin, "origin"),
            ),
            timeout_ms=timeout_ms,
        )

    async def raycast(
        self,
        origin: WorldPosition,
        direction: Vec3,
        maximum_distance: float,
        *,
        include_fluids: bool = False,
        include_entities: bool = True,
        timeout_ms: int | None = None,
    ) -> RaycastResponse:
        return await self._client.raycast(
            RaycastRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                origin=origin,
                direction=direction,
                maximum_distance=maximum_distance,
                include_fluids=include_fluids,
                include_entities=include_entities,
            ),
            timeout_ms=timeout_ms,
        )

    async def raycast_from_player(
        self,
        maximum_distance: float = 6,
        *,
        include_fluids: bool = False,
        include_entities: bool = True,
        timeout_ms: int | None = None,
    ) -> RaycastResponse:
        return await self._client.raycast(
            RaycastRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                maximum_distance=maximum_distance,
                include_fluids=include_fluids,
                include_entities=include_entities,
            ),
            timeout_ms=timeout_ms,
        )

    async def block_at_cursor(
        self,
        maximum_distance: float = 256,
        *,
        timeout_ms: int | None = None,
    ) -> BlockSnapshot | None:
        response = await self.raycast_from_player(
            maximum_distance,
            include_entities=False,
            timeout_ms=timeout_ms,
        )
        return response.block if response.HasField("block") else None

    async def entity_at_cursor(
        self,
        maximum_distance: float = 3.5,
        *,
        timeout_ms: int | None = None,
    ) -> EntitySnapshot | None:
        response = await self.raycast_from_player(
            maximum_distance,
            include_entities=True,
            timeout_ms=timeout_ms,
        )
        return response.entity if response.HasField("entity") else None

    async def estimate_explosion_damage(
        self,
        target: EntityReference,
        center: WorldPosition,
        power: float,
        *,
        timeout_ms: int | None = None,
    ) -> EstimateExplosionDamageResponse:
        return await self._client.estimate_explosion_damage(
            EstimateExplosionDamageRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                target=target,
                center=center,
                power=power,
            ),
            timeout_ms=timeout_ms,
        )

    async def can_see_block(
        self,
        position: BlockPosition,
        *,
        timeout_ms: int | None = None,
    ) -> CanSeeBlockResponse:
        return await self._client.can_see_block(
            CanSeeBlockRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                position=position,
            ),
            timeout_ms=timeout_ms,
        )

    async def estimate_dig_time(
        self,
        position: BlockPosition,
        *,
        timeout_ms: int | None = None,
    ) -> EstimateDigTimeResponse:
        return await self._client.estimate_dig_time(
            EstimateDigTimeRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                position=position,
            ),
            timeout_ms=timeout_ms,
        )


class SoulFireWorld:
    def __init__(self, instance_id: str, bot_id: str, client: WorldServiceClientSync) -> None:
        self._instance_id = instance_id
        self._bot_id = bot_id
        self._client = client

    def player(self, *, timeout_ms: int | None = None) -> PlayerSnapshot:
        return self._client.get_player_snapshot(
            GetPlayerSnapshotRequest(instance_id=self._instance_id, bot_id=self._bot_id),
            timeout_ms=timeout_ms,
        ).player

    def block(
        self,
        position: BlockPosition,
        *,
        include_block_entity: bool = False,
        include_shapes: bool = False,
        timeout_ms: int | None = None,
    ) -> GetWorldBlockResponse:
        return self._client.get_world_block(
            GetWorldBlockRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                position=position,
                include_block_entity=include_block_entity,
                include_shapes=include_shapes,
            ),
            timeout_ms=timeout_ms,
        )

    def query_blocks(
        self,
        region: QueryRegion,
        selector: BlockSelector,
        *,
        sort: QuerySort = QUERY_SORT_UNSPECIFIED,
        page_size: int = 0,
        page_token: str = "",
        timeout_ms: int | None = None,
    ) -> QueryBlocksResponse:
        return self._client.query_blocks(
            QueryBlocksRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                region=region,
                selector=selector,
                sort=sort,
                page_size=page_size,
                page_token=page_token,
            ),
            timeout_ms=timeout_ms,
        )

    def entity(
        self,
        reference: EntityReference,
        *,
        timeout_ms: int | None = None,
    ) -> GetWorldEntityResponse:
        return self._client.get_world_entity(
            GetWorldEntityRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                entity=reference,
            ),
            timeout_ms=timeout_ms,
        )

    def query_entities(
        self,
        radius: float,
        selector: EntitySelector,
        *,
        origin: WorldPosition | None = None,
        sort: QuerySort = QUERY_SORT_UNSPECIFIED,
        page_size: int = 0,
        page_token: str = "",
        timeout_ms: int | None = None,
    ) -> QueryEntitiesResponse:
        return self._client.query_entities(
            QueryEntitiesRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                radius=radius,
                selector=selector,
                sort=sort,
                page_size=page_size,
                page_token=page_token,
                **_optional(origin, "origin"),
            ),
            timeout_ms=timeout_ms,
        )

    def raycast(
        self,
        origin: WorldPosition,
        direction: Vec3,
        maximum_distance: float,
        *,
        include_fluids: bool = False,
        include_entities: bool = True,
        timeout_ms: int | None = None,
    ) -> RaycastResponse:
        return self._client.raycast(
            RaycastRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                origin=origin,
                direction=direction,
                maximum_distance=maximum_distance,
                include_fluids=include_fluids,
                include_entities=include_entities,
            ),
            timeout_ms=timeout_ms,
        )

    def raycast_from_player(
        self,
        maximum_distance: float = 6,
        *,
        include_fluids: bool = False,
        include_entities: bool = True,
        timeout_ms: int | None = None,
    ) -> RaycastResponse:
        return self._client.raycast(
            RaycastRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                maximum_distance=maximum_distance,
                include_fluids=include_fluids,
                include_entities=include_entities,
            ),
            timeout_ms=timeout_ms,
        )

    def block_at_cursor(
        self,
        maximum_distance: float = 256,
        *,
        timeout_ms: int | None = None,
    ) -> BlockSnapshot | None:
        response = self.raycast_from_player(
            maximum_distance,
            include_entities=False,
            timeout_ms=timeout_ms,
        )
        return response.block if response.HasField("block") else None

    def entity_at_cursor(
        self,
        maximum_distance: float = 3.5,
        *,
        timeout_ms: int | None = None,
    ) -> EntitySnapshot | None:
        response = self.raycast_from_player(
            maximum_distance,
            include_entities=True,
            timeout_ms=timeout_ms,
        )
        return response.entity if response.HasField("entity") else None

    def estimate_explosion_damage(
        self,
        target: EntityReference,
        center: WorldPosition,
        power: float,
        *,
        timeout_ms: int | None = None,
    ) -> EstimateExplosionDamageResponse:
        return self._client.estimate_explosion_damage(
            EstimateExplosionDamageRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                target=target,
                center=center,
                power=power,
            ),
            timeout_ms=timeout_ms,
        )

    def can_see_block(
        self,
        position: BlockPosition,
        *,
        timeout_ms: int | None = None,
    ) -> CanSeeBlockResponse:
        return self._client.can_see_block(
            CanSeeBlockRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                position=position,
            ),
            timeout_ms=timeout_ms,
        )

    def estimate_dig_time(
        self,
        position: BlockPosition,
        *,
        timeout_ms: int | None = None,
    ) -> EstimateDigTimeResponse:
        return self._client.estimate_dig_time(
            EstimateDigTimeRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                position=position,
            ),
            timeout_ms=timeout_ms,
        )


class _InventoryBase:
    def __init__(self, instance_id: str, bot_id: str, headers: HeaderProvider) -> None:
        self._scope = InventoryScope(instance_id=instance_id, bot_id=bot_id)
        self._headers = headers


class SoulFireContainerClosedError(RuntimeError):
    def __init__(self, container_id: int) -> None:
        self.container_id = container_id
        super().__init__(f"Container {container_id} is already closed")


class AsyncSoulFireContainer:
    def __init__(
        self,
        scope: InventoryScope,
        client: InventoryServiceClient,
        headers: HeaderProvider,
        snapshot: ContainerSnapshot,
    ) -> None:
        self._scope = scope
        self._client = client
        self._headers = headers
        self._snapshot = snapshot
        self._closed = False

    @property
    def snapshot(self) -> ContainerSnapshot:
        return self._snapshot

    @property
    def closed(self) -> bool:
        return self._closed

    async def __aenter__(self) -> AsyncSoulFireContainer:
        self._require_open()
        return self

    async def __aexit__(
        self,
        _exc_type: object,
        _exc: object,
        _traceback: object,
    ) -> None:
        await self.close()

    async def refresh(
        self,
        *,
        timeout_ms: int | None = None,
    ) -> ContainerSnapshot:
        self._require_open()
        response = await self._client.get_container_snapshot(
            GetContainerSnapshotRequest(scope=self._scope),
            timeout_ms=timeout_ms,
        )
        if response.container.container_id != self._snapshot.container_id:
            self._closed = True
            raise SoulFireContainerClosedError(self._snapshot.container_id)
        self._snapshot = response.container
        return self._snapshot

    async def deposit(
        self,
        selector: ItemSelector,
        count: int,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> ContainerSnapshot:
        return await self._transfer(
            selector,
            count,
            from_area=INVENTORY_AREA_PLAYER,
            to_area=INVENTORY_AREA_CONTAINER,
            idempotency_key=idempotency_key,
            timeout_ms=timeout_ms,
        )

    async def withdraw(
        self,
        selector: ItemSelector,
        count: int,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> ContainerSnapshot:
        return await self._transfer(
            selector,
            count,
            from_area=INVENTORY_AREA_CONTAINER,
            to_area=INVENTORY_AREA_PLAYER,
            idempotency_key=idempotency_key,
            timeout_ms=timeout_ms,
        )

    async def close(
        self,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> ContainerSnapshot:
        if self._closed:
            return self._snapshot
        response = await self._client.close_semantic_container(
            CloseSemanticContainerRequest(
                scope=self._scope,
                container_id=self._snapshot.container_id,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        self._closed = True
        self._snapshot = response.container
        return self._snapshot

    async def _transfer(
        self,
        selector: ItemSelector,
        count: int,
        *,
        from_area: InventoryArea,
        to_area: InventoryArea,
        idempotency_key: str | None,
        timeout_ms: int | None,
    ) -> ContainerSnapshot:
        self._require_open()
        response = await self._client.transfer_items(
            TransferItemsRequest(
                scope=self._scope,
                selector=selector,
                count=count,
                to=to_area,
                expected_revision=self._snapshot.revision,
                **_optional(idempotency_key, "idempotency_key"),
                **{"from": cast(Any, from_area)},
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        self._snapshot = response.container
        return self._snapshot

    def _require_open(self) -> None:
        if self._closed:
            raise SoulFireContainerClosedError(self._snapshot.container_id)


class SoulFireContainer:
    def __init__(
        self,
        scope: InventoryScope,
        client: InventoryServiceClientSync,
        headers: HeaderProvider,
        snapshot: ContainerSnapshot,
    ) -> None:
        self._scope = scope
        self._client = client
        self._headers = headers
        self._snapshot = snapshot
        self._closed = False

    @property
    def snapshot(self) -> ContainerSnapshot:
        return self._snapshot

    @property
    def closed(self) -> bool:
        return self._closed

    def __enter__(self) -> SoulFireContainer:
        self._require_open()
        return self

    def __exit__(
        self,
        _exc_type: object,
        _exc: object,
        _traceback: object,
    ) -> None:
        self.close()

    def refresh(
        self,
        *,
        timeout_ms: int | None = None,
    ) -> ContainerSnapshot:
        self._require_open()
        response = self._client.get_container_snapshot(
            GetContainerSnapshotRequest(scope=self._scope),
            timeout_ms=timeout_ms,
        )
        if response.container.container_id != self._snapshot.container_id:
            self._closed = True
            raise SoulFireContainerClosedError(self._snapshot.container_id)
        self._snapshot = response.container
        return self._snapshot

    def deposit(
        self,
        selector: ItemSelector,
        count: int,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> ContainerSnapshot:
        return self._transfer(
            selector,
            count,
            from_area=INVENTORY_AREA_PLAYER,
            to_area=INVENTORY_AREA_CONTAINER,
            idempotency_key=idempotency_key,
            timeout_ms=timeout_ms,
        )

    def withdraw(
        self,
        selector: ItemSelector,
        count: int,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> ContainerSnapshot:
        return self._transfer(
            selector,
            count,
            from_area=INVENTORY_AREA_CONTAINER,
            to_area=INVENTORY_AREA_PLAYER,
            idempotency_key=idempotency_key,
            timeout_ms=timeout_ms,
        )

    def close(
        self,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> ContainerSnapshot:
        if self._closed:
            return self._snapshot
        response = self._client.close_semantic_container(
            CloseSemanticContainerRequest(
                scope=self._scope,
                container_id=self._snapshot.container_id,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        self._closed = True
        self._snapshot = response.container
        return self._snapshot

    def _transfer(
        self,
        selector: ItemSelector,
        count: int,
        *,
        from_area: InventoryArea,
        to_area: InventoryArea,
        idempotency_key: str | None,
        timeout_ms: int | None,
    ) -> ContainerSnapshot:
        self._require_open()
        response = self._client.transfer_items(
            TransferItemsRequest(
                scope=self._scope,
                selector=selector,
                count=count,
                to=to_area,
                expected_revision=self._snapshot.revision,
                **_optional(idempotency_key, "idempotency_key"),
                **{"from": cast(Any, from_area)},
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        self._snapshot = response.container
        return self._snapshot

    def _require_open(self) -> None:
        if self._closed:
            raise SoulFireContainerClosedError(self._snapshot.container_id)


class AsyncSoulFireInventory(_InventoryBase):
    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        client: InventoryServiceClient,
        headers: HeaderProvider,
    ) -> None:
        super().__init__(instance_id, bot_id, headers)
        self._client = client

    async def snapshot(self, *, timeout_ms: int | None = None) -> ContainerSnapshot:
        response = await self._client.get_container_snapshot(
            GetContainerSnapshotRequest(scope=self._scope),
            timeout_ms=timeout_ms,
        )
        return response.container

    async def count(
        self,
        selector: ItemSelector,
        *,
        areas: Iterable[InventoryArea] = (),
        timeout_ms: int | None = None,
    ) -> int:
        response = await self._client.count_items(
            CountItemsRequest(scope=self._scope, selector=selector, areas=areas),
            timeout_ms=timeout_ms,
        )
        return response.count

    async def find(
        self,
        selector: ItemSelector,
        *,
        areas: Iterable[InventoryArea] = (),
        timeout_ms: int | None = None,
    ) -> FindInventorySlotsResponse:
        return await self._client.find_inventory_slots(
            FindInventorySlotsRequest(scope=self._scope, selector=selector, areas=areas),
            timeout_ms=timeout_ms,
        )

    async def rank(
        self,
        kind: InventoryRecommendationKind,
        *,
        selector: ItemSelector | None = None,
        areas: Iterable[InventoryArea] = (),
        target_block: BlockPosition | None = None,
        equipment_slot: str | None = None,
        limit: int = 10,
        prefer_hotbar: bool = False,
        preferred_enchantment_ids: Iterable[str] = (),
        excluded_enchantment_ids: Iterable[str] = (),
        prefer_high_durability: bool = False,
        timeout_ms: int | None = None,
    ) -> RankInventoryItemsResponse:
        return await self._client.rank_inventory_items(
            _ranking_request(
                self._scope,
                kind,
                selector=selector,
                areas=areas,
                target_block=target_block,
                equipment_slot=equipment_slot,
                limit=limit,
                prefer_hotbar=prefer_hotbar,
                preferred_enchantment_ids=preferred_enchantment_ids,
                excluded_enchantment_ids=excluded_enchantment_ids,
                prefer_high_durability=prefer_high_durability,
            ),
            timeout_ms=timeout_ms,
        )

    async def best_tool(
        self,
        target_block: BlockPosition,
        **options: Unpack[InventoryRankingOptions],
    ) -> InventoryItemRecommendation | None:
        return _first_recommendation(
            await self.rank(
                INVENTORY_RECOMMENDATION_KIND_TOOL,
                target_block=target_block,
                limit=1,
                **options,
            )
        )

    async def best_weapon(
        self,
        **options: Unpack[InventoryRankingOptions],
    ) -> InventoryItemRecommendation | None:
        return _first_recommendation(
            await self.rank(
                INVENTORY_RECOMMENDATION_KIND_MELEE_WEAPON,
                limit=1,
                **options,
            )
        )

    async def best_armor(
        self,
        equipment_slot: str,
        **options: Unpack[InventoryRankingOptions],
    ) -> InventoryItemRecommendation | None:
        return _first_recommendation(
            await self.rank(
                INVENTORY_RECOMMENDATION_KIND_ARMOR,
                equipment_slot=equipment_slot,
                limit=1,
                **options,
            )
        )

    async def best_food(
        self,
        **options: Unpack[InventoryRankingOptions],
    ) -> InventoryItemRecommendation | None:
        return _first_recommendation(
            await self.rank(
                INVENTORY_RECOMMENDATION_KIND_FOOD,
                limit=1,
                **options,
            )
        )

    async def best_scaffold(
        self,
        **options: Unpack[InventoryRankingOptions],
    ) -> InventoryItemRecommendation | None:
        return _first_recommendation(
            await self.rank(
                INVENTORY_RECOMMENDATION_KIND_SCAFFOLD,
                limit=1,
                **options,
            )
        )

    async def move(
        self,
        source_slot: int,
        destination_slot: int,
        *,
        count: int | None = None,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        return await self._client.move_inventory_item(
            MoveInventoryItemRequest(
                scope=self._scope,
                source_slot=source_slot,
                destination_slot=destination_slot,
                expected_revision=expected_revision,
                **_optional(count, "count"),
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    async def transfer(
        self,
        selector: ItemSelector,
        count: int,
        *,
        from_area: InventoryArea,
        to_area: InventoryArea,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        return await self._client.transfer_items(
            TransferItemsRequest(
                scope=self._scope,
                selector=selector,
                count=count,
                to=to_area,
                expected_revision=expected_revision,
                **_optional(idempotency_key, "idempotency_key"),
                **{"from": cast(Any, from_area)},
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    async def toss(
        self,
        selector: ItemSelector,
        count: int,
        *,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        return await self._client.toss_items(
            TossItemsRequest(
                scope=self._scope,
                selector=selector,
                count=count,
                expected_revision=expected_revision,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    async def select_hotbar(
        self,
        *,
        slot: int | None = None,
        selector: ItemSelector | None = None,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        if (slot is None) == (selector is None):
            raise ValueError("Provide exactly one of slot or selector")
        return await self._client.select_hotbar_item(
            SelectHotbarItemRequest(
                scope=self._scope,
                expected_revision=expected_revision,
                **_optional(slot, "hotbar_slot"),
                **_optional(selector, "selector"),
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    async def equip(
        self,
        selector: ItemSelector,
        equipment_slot: str,
        *,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        return await self._client.equip_item(
            EquipItemRequest(
                scope=self._scope,
                selector=selector,
                equipment_slot=equipment_slot,
                expected_revision=expected_revision,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    async def unequip(
        self,
        equipment_slot: str,
        *,
        destination_area: InventoryArea | None = None,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        return await self._client.unequip_item(
            UnequipItemRequest(
                scope=self._scope,
                equipment_slot=equipment_slot,
                expected_revision=expected_revision,
                **_optional(destination_area, "destination_area"),
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    async def open(
        self,
        position: BlockPosition,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncSoulFireContainer:
        response = await self._client.open_block_container(
            OpenBlockContainerRequest(
                scope=self._scope,
                position=position,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        return AsyncSoulFireContainer(
            self._scope,
            self._client,
            self._headers,
            response.container,
        )


class SoulFireInventory(_InventoryBase):
    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        client: InventoryServiceClientSync,
        headers: HeaderProvider,
    ) -> None:
        super().__init__(instance_id, bot_id, headers)
        self._client = client

    def snapshot(self, *, timeout_ms: int | None = None) -> ContainerSnapshot:
        return self._client.get_container_snapshot(
            GetContainerSnapshotRequest(scope=self._scope),
            timeout_ms=timeout_ms,
        ).container

    def count(
        self,
        selector: ItemSelector,
        *,
        areas: Iterable[InventoryArea] = (),
        timeout_ms: int | None = None,
    ) -> int:
        return self._client.count_items(
            CountItemsRequest(scope=self._scope, selector=selector, areas=areas),
            timeout_ms=timeout_ms,
        ).count

    def find(
        self,
        selector: ItemSelector,
        *,
        areas: Iterable[InventoryArea] = (),
        timeout_ms: int | None = None,
    ) -> FindInventorySlotsResponse:
        return self._client.find_inventory_slots(
            FindInventorySlotsRequest(scope=self._scope, selector=selector, areas=areas),
            timeout_ms=timeout_ms,
        )

    def rank(
        self,
        kind: InventoryRecommendationKind,
        *,
        selector: ItemSelector | None = None,
        areas: Iterable[InventoryArea] = (),
        target_block: BlockPosition | None = None,
        equipment_slot: str | None = None,
        limit: int = 10,
        prefer_hotbar: bool = False,
        preferred_enchantment_ids: Iterable[str] = (),
        excluded_enchantment_ids: Iterable[str] = (),
        prefer_high_durability: bool = False,
        timeout_ms: int | None = None,
    ) -> RankInventoryItemsResponse:
        return self._client.rank_inventory_items(
            _ranking_request(
                self._scope,
                kind,
                selector=selector,
                areas=areas,
                target_block=target_block,
                equipment_slot=equipment_slot,
                limit=limit,
                prefer_hotbar=prefer_hotbar,
                preferred_enchantment_ids=preferred_enchantment_ids,
                excluded_enchantment_ids=excluded_enchantment_ids,
                prefer_high_durability=prefer_high_durability,
            ),
            timeout_ms=timeout_ms,
        )

    def best_tool(
        self,
        target_block: BlockPosition,
        **options: Unpack[InventoryRankingOptions],
    ) -> InventoryItemRecommendation | None:
        return _first_recommendation(
            self.rank(
                INVENTORY_RECOMMENDATION_KIND_TOOL,
                target_block=target_block,
                limit=1,
                **options,
            )
        )

    def best_weapon(
        self,
        **options: Unpack[InventoryRankingOptions],
    ) -> InventoryItemRecommendation | None:
        return _first_recommendation(
            self.rank(
                INVENTORY_RECOMMENDATION_KIND_MELEE_WEAPON,
                limit=1,
                **options,
            )
        )

    def best_armor(
        self,
        equipment_slot: str,
        **options: Unpack[InventoryRankingOptions],
    ) -> InventoryItemRecommendation | None:
        return _first_recommendation(
            self.rank(
                INVENTORY_RECOMMENDATION_KIND_ARMOR,
                equipment_slot=equipment_slot,
                limit=1,
                **options,
            )
        )

    def best_food(
        self,
        **options: Unpack[InventoryRankingOptions],
    ) -> InventoryItemRecommendation | None:
        return _first_recommendation(
            self.rank(
                INVENTORY_RECOMMENDATION_KIND_FOOD,
                limit=1,
                **options,
            )
        )

    def best_scaffold(
        self,
        **options: Unpack[InventoryRankingOptions],
    ) -> InventoryItemRecommendation | None:
        return _first_recommendation(
            self.rank(
                INVENTORY_RECOMMENDATION_KIND_SCAFFOLD,
                limit=1,
                **options,
            )
        )

    def move(
        self,
        source_slot: int,
        destination_slot: int,
        *,
        count: int | None = None,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        return self._client.move_inventory_item(
            MoveInventoryItemRequest(
                scope=self._scope,
                source_slot=source_slot,
                destination_slot=destination_slot,
                expected_revision=expected_revision,
                **_optional(count, "count"),
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    def transfer(
        self,
        selector: ItemSelector,
        count: int,
        *,
        from_area: InventoryArea,
        to_area: InventoryArea,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        return self._client.transfer_items(
            TransferItemsRequest(
                scope=self._scope,
                selector=selector,
                count=count,
                to=to_area,
                expected_revision=expected_revision,
                **_optional(idempotency_key, "idempotency_key"),
                **{"from": cast(Any, from_area)},
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    def toss(
        self,
        selector: ItemSelector,
        count: int,
        *,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        return self._client.toss_items(
            TossItemsRequest(
                scope=self._scope,
                selector=selector,
                count=count,
                expected_revision=expected_revision,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    def select_hotbar(
        self,
        *,
        slot: int | None = None,
        selector: ItemSelector | None = None,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        if (slot is None) == (selector is None):
            raise ValueError("Provide exactly one of slot or selector")
        return self._client.select_hotbar_item(
            SelectHotbarItemRequest(
                scope=self._scope,
                expected_revision=expected_revision,
                **_optional(slot, "hotbar_slot"),
                **_optional(selector, "selector"),
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    def equip(
        self,
        selector: ItemSelector,
        equipment_slot: str,
        *,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        return self._client.equip_item(
            EquipItemRequest(
                scope=self._scope,
                selector=selector,
                equipment_slot=equipment_slot,
                expected_revision=expected_revision,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    def unequip(
        self,
        equipment_slot: str,
        *,
        destination_area: InventoryArea | None = None,
        expected_revision: int = 0,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> InventoryMutationResponse:
        return self._client.unequip_item(
            UnequipItemRequest(
                scope=self._scope,
                equipment_slot=equipment_slot,
                expected_revision=expected_revision,
                **_optional(destination_area, "destination_area"),
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )

    def open(
        self,
        position: BlockPosition,
        *,
        idempotency_key: str | None = None,
        timeout_ms: int | None = None,
    ) -> SoulFireContainer:
        response = self._client.open_block_container(
            OpenBlockContainerRequest(
                scope=self._scope,
                position=position,
                **_optional(idempotency_key, "idempotency_key"),
            ),
            headers=self._headers(None),
            timeout_ms=timeout_ms,
        )
        return SoulFireContainer(
            self._scope,
            self._client,
            self._headers,
            response.container,
        )


class AsyncSoulFireRecipes:
    def __init__(
        self,
        scope: InventoryScope,
        client: RecipeServiceClient,
        tasks: AsyncSoulFireTasks,
    ) -> None:
        self._scope = scope
        self._client = client
        self._tasks = tasks

    async def list(
        self,
        *,
        result_item_id: str | None = None,
        ingredient: ItemSelector | None = None,
        recipe_types: Iterable[str] = (),
        page_size: int = 0,
        page_token: str = "",
        timeout_ms: int | None = None,
    ) -> ListRecipesResponse:
        return await self._client.list_recipes(
            ListRecipesRequest(
                scope=self._scope,
                recipe_types=recipe_types,
                page_size=page_size,
                page_token=page_token,
                **_optional(result_item_id, "result_item_id"),
                **_optional(ingredient, "ingredient"),
            ),
            timeout_ms=timeout_ms,
        )

    async def can_craft(
        self,
        recipe_id: str,
        *,
        count: int = 1,
        timeout_ms: int | None = None,
    ) -> CanCraftResponse:
        return await self._client.can_craft(
            CanCraftRequest(scope=self._scope, recipe_id=recipe_id, count=count),
            timeout_ms=timeout_ms,
        )

    async def list_villager_trades(
        self,
        *,
        timeout_ms: int | None = None,
    ) -> ListVillagerTradesResponse:
        return await self._client.list_villager_trades(
            ListVillagerTradesRequest(scope=self._scope),
            timeout_ms=timeout_ms,
        )

    async def craft(
        self,
        recipe_id: str,
        *,
        count: int = 1,
        station: BlockPosition | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncSoulFireTask[CraftTaskResult]:
        return await self._tasks.craft(
            recipe_id,
            count=count,
            station=station,
            timeout_ms=timeout_ms,
        )

    async def smelt(
        self,
        input: ItemSelector,
        *,
        count: int = 1,
        fuel: ItemSelector | None = None,
        station: BlockPosition | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncSoulFireTask[SmeltTaskResult]:
        return await self._tasks.smelt(
            input,
            count=count,
            fuel=fuel,
            station=station,
            timeout_ms=timeout_ms,
        )

    async def brew(
        self,
        input: ItemSelector,
        ingredient: ItemSelector,
        *,
        count: int = 1,
        fuel: ItemSelector | None = None,
        station: BlockPosition | None = None,
        expected_result: ItemSelector | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncSoulFireTask[BrewTaskResult]:
        return await self._tasks.brew(
            input,
            ingredient,
            count=count,
            fuel=fuel,
            station=station,
            expected_result=expected_result,
            timeout_ms=timeout_ms,
        )

    async def villager_trade(
        self,
        offer_index: int,
        *,
        count: int = 1,
        expected_result: ItemSelector | None = None,
        close_when_done: bool = False,
        timeout_ms: int | None = None,
    ) -> AsyncSoulFireTask[VillagerTradeTaskResult]:
        return await self._tasks.villager_trade(
            offer_index,
            count=count,
            expected_result=expected_result,
            close_when_done=close_when_done,
            timeout_ms=timeout_ms,
        )


class SoulFireRecipes:
    def __init__(
        self,
        scope: InventoryScope,
        client: RecipeServiceClientSync,
        tasks: SoulFireTasks,
    ) -> None:
        self._scope = scope
        self._client = client
        self._tasks = tasks

    def list(
        self,
        *,
        result_item_id: str | None = None,
        ingredient: ItemSelector | None = None,
        recipe_types: Iterable[str] = (),
        page_size: int = 0,
        page_token: str = "",
        timeout_ms: int | None = None,
    ) -> ListRecipesResponse:
        return self._client.list_recipes(
            ListRecipesRequest(
                scope=self._scope,
                recipe_types=recipe_types,
                page_size=page_size,
                page_token=page_token,
                **_optional(result_item_id, "result_item_id"),
                **_optional(ingredient, "ingredient"),
            ),
            timeout_ms=timeout_ms,
        )

    def can_craft(
        self,
        recipe_id: str,
        *,
        count: int = 1,
        timeout_ms: int | None = None,
    ) -> CanCraftResponse:
        return self._client.can_craft(
            CanCraftRequest(scope=self._scope, recipe_id=recipe_id, count=count),
            timeout_ms=timeout_ms,
        )

    def list_villager_trades(
        self,
        *,
        timeout_ms: int | None = None,
    ) -> ListVillagerTradesResponse:
        return self._client.list_villager_trades(
            ListVillagerTradesRequest(scope=self._scope),
            timeout_ms=timeout_ms,
        )

    def craft(
        self,
        recipe_id: str,
        *,
        count: int = 1,
        station: BlockPosition | None = None,
        timeout_ms: int | None = None,
    ) -> SoulFireTask[CraftTaskResult]:
        return self._tasks.craft(
            recipe_id,
            count=count,
            station=station,
            timeout_ms=timeout_ms,
        )

    def smelt(
        self,
        input: ItemSelector,
        *,
        count: int = 1,
        fuel: ItemSelector | None = None,
        station: BlockPosition | None = None,
        timeout_ms: int | None = None,
    ) -> SoulFireTask[SmeltTaskResult]:
        return self._tasks.smelt(
            input,
            count=count,
            fuel=fuel,
            station=station,
            timeout_ms=timeout_ms,
        )

    def brew(
        self,
        input: ItemSelector,
        ingredient: ItemSelector,
        *,
        count: int = 1,
        fuel: ItemSelector | None = None,
        station: BlockPosition | None = None,
        expected_result: ItemSelector | None = None,
        timeout_ms: int | None = None,
    ) -> SoulFireTask[BrewTaskResult]:
        return self._tasks.brew(
            input,
            ingredient,
            count=count,
            fuel=fuel,
            station=station,
            expected_result=expected_result,
            timeout_ms=timeout_ms,
        )

    def villager_trade(
        self,
        offer_index: int,
        *,
        count: int = 1,
        expected_result: ItemSelector | None = None,
        close_when_done: bool = False,
        timeout_ms: int | None = None,
    ) -> SoulFireTask[VillagerTradeTaskResult]:
        return self._tasks.villager_trade(
            offer_index,
            count=count,
            expected_result=expected_result,
            close_when_done=close_when_done,
            timeout_ms=timeout_ms,
        )


class AsyncSoulFireRegistry:
    def __init__(self, instance_id: str, bot_id: str, client: RegistryServiceClient) -> None:
        self._instance_id = instance_id
        self._bot_id = bot_id
        self._client = client

    async def identity(self, *, timeout_ms: int | None = None) -> GetRegistryIdentityResponse:
        return await self._client.get_registry_identity(
            GetRegistryIdentityRequest(instance_id=self._instance_id, bot_id=self._bot_id),
            timeout_ms=timeout_ms,
        )

    async def entries(
        self,
        kind: RegistryKind,
        *,
        id_prefix: str = "",
        tags: Iterable[str] = (),
        page_size: int = 0,
        page_token: str = "",
        timeout_ms: int | None = None,
    ) -> ListRegistryEntriesResponse:
        return await self._client.list_registry_entries(
            ListRegistryEntriesRequest(
                kind=kind,
                id_prefix=id_prefix,
                tags=tags,
                page_size=page_size,
                page_token=page_token,
                instance_id=self._instance_id,
                bot_id=self._bot_id,
            ),
            timeout_ms=timeout_ms,
        )

    async def entry(
        self,
        kind: RegistryKind,
        item_id: str,
        *,
        timeout_ms: int | None = None,
    ) -> GetRegistryEntryResponse:
        return await self._client.get_registry_entry(
            GetRegistryEntryRequest(
                kind=kind,
                id=item_id,
                instance_id=self._instance_id,
                bot_id=self._bot_id,
            ),
            timeout_ms=timeout_ms,
        )

    async def tags(
        self,
        kind: RegistryKind,
        *,
        prefix: str = "",
        page_size: int = 0,
        page_token: str = "",
        timeout_ms: int | None = None,
    ) -> ListRegistryTagsResponse:
        return await self._client.list_registry_tags(
            ListRegistryTagsRequest(
                kind=kind,
                prefix=prefix,
                page_size=page_size,
                page_token=page_token,
                instance_id=self._instance_id,
                bot_id=self._bot_id,
            ),
            timeout_ms=timeout_ms,
        )


class SoulFireRegistry:
    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        client: RegistryServiceClientSync,
    ) -> None:
        self._instance_id = instance_id
        self._bot_id = bot_id
        self._client = client

    def identity(self, *, timeout_ms: int | None = None) -> GetRegistryIdentityResponse:
        return self._client.get_registry_identity(
            GetRegistryIdentityRequest(instance_id=self._instance_id, bot_id=self._bot_id),
            timeout_ms=timeout_ms,
        )

    def entries(
        self,
        kind: RegistryKind,
        *,
        id_prefix: str = "",
        tags: Iterable[str] = (),
        page_size: int = 0,
        page_token: str = "",
        timeout_ms: int | None = None,
    ) -> ListRegistryEntriesResponse:
        return self._client.list_registry_entries(
            ListRegistryEntriesRequest(
                kind=kind,
                id_prefix=id_prefix,
                tags=tags,
                page_size=page_size,
                page_token=page_token,
                instance_id=self._instance_id,
                bot_id=self._bot_id,
            ),
            timeout_ms=timeout_ms,
        )

    def entry(
        self,
        kind: RegistryKind,
        item_id: str,
        *,
        timeout_ms: int | None = None,
    ) -> GetRegistryEntryResponse:
        return self._client.get_registry_entry(
            GetRegistryEntryRequest(
                kind=kind,
                id=item_id,
                instance_id=self._instance_id,
                bot_id=self._bot_id,
            ),
            timeout_ms=timeout_ms,
        )

    def tags(
        self,
        kind: RegistryKind,
        *,
        prefix: str = "",
        page_size: int = 0,
        page_token: str = "",
        timeout_ms: int | None = None,
    ) -> ListRegistryTagsResponse:
        return self._client.list_registry_tags(
            ListRegistryTagsRequest(
                kind=kind,
                prefix=prefix,
                page_size=page_size,
                page_token=page_token,
                instance_id=self._instance_id,
                bot_id=self._bot_id,
            ),
            timeout_ms=timeout_ms,
        )
