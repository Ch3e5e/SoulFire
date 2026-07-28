from typing import cast

import pytest

from soulfire.common_pb2 import BlockPosition, WorldPosition
from soulfire.domain_pb2 import BlockSnapshot, EntityReference, EntitySnapshot
from soulfire.semantic import AsyncSoulFireWorld, SoulFireWorld
from soulfire.world_connect import WorldServiceClient, WorldServiceClientSync
from soulfire.world_pb2 import (
    CanSeeBlockRequest,
    CanSeeBlockResponse,
    EstimateDigTimeRequest,
    EstimateDigTimeResponse,
    EstimateExplosionDamageRequest,
    EstimateExplosionDamageResponse,
    RaycastRequest,
    RaycastResponse,
)


class FakeAsyncWorldClient:
    request: EstimateExplosionDamageRequest | None = None
    raycast_requests: list[RaycastRequest]
    visibility_request: CanSeeBlockRequest | None = None
    dig_time_request: EstimateDigTimeRequest | None = None

    def __init__(self) -> None:
        self.raycast_requests = []

    async def estimate_explosion_damage(
        self,
        request: EstimateExplosionDamageRequest,
        **_kwargs: object,
    ) -> EstimateExplosionDamageResponse:
        self.request = request
        return _estimate()

    async def raycast(
        self,
        request: RaycastRequest,
        **_kwargs: object,
    ) -> RaycastResponse:
        self.raycast_requests.append(request)
        if request.include_entities:
            return RaycastResponse(entity=EntitySnapshot(entity_type="minecraft:zombie"))
        return RaycastResponse(block=BlockSnapshot(block_id="minecraft:stone"))

    async def can_see_block(
        self,
        request: CanSeeBlockRequest,
        **_kwargs: object,
    ) -> CanSeeBlockResponse:
        self.visibility_request = request
        return CanSeeBlockResponse(visible=True, distance=4.5)

    async def estimate_dig_time(
        self,
        request: EstimateDigTimeRequest,
        **_kwargs: object,
    ) -> EstimateDigTimeResponse:
        self.dig_time_request = request
        return EstimateDigTimeResponse(
            diggable=True,
            ticks=6,
            duration_ms=300,
            correct_tool_for_drops=True,
        )


class FakeSyncWorldClient:
    request: EstimateExplosionDamageRequest | None = None
    raycast_requests: list[RaycastRequest]
    visibility_request: CanSeeBlockRequest | None = None
    dig_time_request: EstimateDigTimeRequest | None = None

    def __init__(self) -> None:
        self.raycast_requests = []

    def estimate_explosion_damage(
        self,
        request: EstimateExplosionDamageRequest,
        **_kwargs: object,
    ) -> EstimateExplosionDamageResponse:
        self.request = request
        return _estimate()

    def raycast(
        self,
        request: RaycastRequest,
        **_kwargs: object,
    ) -> RaycastResponse:
        self.raycast_requests.append(request)
        if request.include_entities:
            return RaycastResponse(entity=EntitySnapshot(entity_type="minecraft:zombie"))
        return RaycastResponse(block=BlockSnapshot(block_id="minecraft:stone"))

    def can_see_block(
        self,
        request: CanSeeBlockRequest,
        **_kwargs: object,
    ) -> CanSeeBlockResponse:
        self.visibility_request = request
        return CanSeeBlockResponse(visible=True, distance=4.5)

    def estimate_dig_time(
        self,
        request: EstimateDigTimeRequest,
        **_kwargs: object,
    ) -> EstimateDigTimeResponse:
        self.dig_time_request = request
        return EstimateDigTimeResponse(
            diggable=True,
            ticks=6,
            duration_ms=300,
            correct_tool_for_drops=True,
        )


@pytest.mark.asyncio
async def test_async_world_cursor_helpers_use_player_view() -> None:
    client = FakeAsyncWorldClient()
    world = AsyncSoulFireWorld(
        "instance-id",
        "bot-id",
        cast(WorldServiceClient, client),
    )

    block = await world.block_at_cursor()
    entity = await world.entity_at_cursor()

    assert block is not None and block.block_id == "minecraft:stone"
    assert entity is not None and entity.entity_type == "minecraft:zombie"
    assert len(client.raycast_requests) == 2
    assert not client.raycast_requests[0].HasField("origin")
    assert not client.raycast_requests[0].HasField("direction")
    assert client.raycast_requests[0].maximum_distance == 256
    assert client.raycast_requests[1].maximum_distance == 3.5


@pytest.mark.asyncio
async def test_async_world_visibility_and_dig_time_are_scoped() -> None:
    client = FakeAsyncWorldClient()
    world = AsyncSoulFireWorld(
        "instance-id",
        "bot-id",
        cast(WorldServiceClient, client),
    )
    position = _stone_position()

    visibility = await world.can_see_block(position)
    dig_time = await world.estimate_dig_time(position)

    assert visibility.visible
    assert dig_time.duration_ms == 300
    assert client.visibility_request is not None
    assert client.visibility_request.instance_id == "instance-id"
    assert client.dig_time_request is not None
    assert client.dig_time_request.position == position


@pytest.mark.asyncio
async def test_async_world_scopes_explosion_estimate() -> None:
    client = FakeAsyncWorldClient()
    world = AsyncSoulFireWorld(
        "instance-id",
        "bot-id",
        cast(WorldServiceClient, client),
    )

    estimate = await world.estimate_explosion_damage(
        EntityReference(connection_epoch="epoch", network_id=42),
        WorldPosition(dimension="minecraft:overworld", x=10, y=64, z=-3),
        6,
    )

    assert client.request is not None
    assert client.request.instance_id == "instance-id"
    assert client.request.bot_id == "bot-id"
    assert client.request.target.network_id == 42
    assert estimate.estimated_health_damage == pytest.approx(6.08)


def test_sync_world_scopes_explosion_estimate() -> None:
    client = FakeSyncWorldClient()
    world = SoulFireWorld(
        "instance-id",
        "bot-id",
        cast(WorldServiceClientSync, client),
    )

    estimate = world.estimate_explosion_damage(
        EntityReference(connection_epoch="epoch", network_id=42),
        WorldPosition(dimension="minecraft:overworld", x=10, y=64, z=-3),
        6,
    )

    assert client.request is not None
    assert client.request.power == 6
    assert estimate.raw_damage == 35


def test_sync_world_cursor_helpers_use_player_view() -> None:
    client = FakeSyncWorldClient()
    world = SoulFireWorld(
        "instance-id",
        "bot-id",
        cast(WorldServiceClientSync, client),
    )

    block = world.block_at_cursor()
    entity = world.entity_at_cursor()

    assert block is not None and block.block_id == "minecraft:stone"
    assert entity is not None and entity.entity_type == "minecraft:zombie"


def test_sync_world_visibility_and_dig_time_are_scoped() -> None:
    client = FakeSyncWorldClient()
    world = SoulFireWorld(
        "instance-id",
        "bot-id",
        cast(WorldServiceClientSync, client),
    )
    position = _stone_position()

    visibility = world.can_see_block(position)
    dig_time = world.estimate_dig_time(position)

    assert visibility.visible
    assert dig_time.ticks == 6
    assert client.visibility_request is not None
    assert client.dig_time_request is not None


def _estimate() -> EstimateExplosionDamageResponse:
    return EstimateExplosionDamageResponse(
        damage_radius=12,
        exposure=0.75,
        raw_damage=35,
        damage_after_armor=21,
        damage_after_resistance=16.8,
        damage_after_enchantments=10.08,
        absorbed_damage=4,
        estimated_health_damage=6.08,
        armor_points=20,
        armor_toughness=8,
        resistance_level=1,
        explosion_protection=10,
    )


def _stone_position() -> BlockPosition:
    return BlockPosition(
        dimension="minecraft:overworld",
        x=4,
        y=63,
        z=2,
    )
