from typing import Any, cast

import pytest

from soulfire.bot_connect import BotServiceClient, BotServiceClientSync
from soulfire.bot_pb2 import (
    BotPovFrame,
    BotRenderPovRequest,
    BotRenderPovResponse,
    BotWatchPovRequest,
    BotWorldMapColumn,
    BotWorldMapRequest,
    BotWorldMapResponse,
)
from soulfire.camera import (
    AsyncSoulFireCamera,
    CameraRenderOptions,
    SoulFireCamera,
    WorldMapOptions,
)


class FakeAsyncCameraClient:
    render_request: BotRenderPovRequest | None = None
    watch_request: BotWatchPovRequest | None = None
    map_request: BotWorldMapRequest | None = None

    async def render_bot_pov(
        self,
        request: BotRenderPovRequest,
        **_options: Any,
    ) -> BotRenderPovResponse:
        self.render_request = request
        return BotRenderPovResponse(image_base64="UE5H", image_mime_type="image/png")

    def watch_bot_pov(
        self,
        request: BotWatchPovRequest,
        **_options: Any,
    ):
        self.watch_request = request

        async def frames():
            yield BotPovFrame(sequence=1, dropped_before=2)

        return frames()

    async def get_bot_world_map(
        self,
        request: BotWorldMapRequest,
        **_options: Any,
    ) -> BotWorldMapResponse:
        self.map_request = request
        return BotWorldMapResponse(
            dimension="minecraft:overworld",
            columns=[BotWorldMapColumn(x=4, z=8, loaded=True, surface_y=70)],
        )


class FakeSyncCameraClient:
    def render_bot_pov(
        self,
        _request: BotRenderPovRequest,
        **_options: Any,
    ) -> BotRenderPovResponse:
        return BotRenderPovResponse(image_base64="UE5H", image_mime_type="image/png")

    def watch_bot_pov(
        self,
        _request: BotWatchPovRequest,
        **_options: Any,
    ):
        return iter([BotPovFrame(sequence=1, dropped_before=0)])

    def get_bot_world_map(
        self,
        request: BotWorldMapRequest,
        **_options: Any,
    ) -> BotWorldMapResponse:
        return BotWorldMapResponse(
            center_x=request.center_x,
            center_z=request.center_z,
            radius=request.radius,
        )


@pytest.mark.asyncio
async def test_async_camera_preserves_presence_streams_and_map_scope() -> None:
    client = FakeAsyncCameraClient()
    camera = AsyncSoulFireCamera(
        "instance-id",
        "bot-id",
        cast(BotServiceClient, client),
    )

    options = CameraRenderOptions(
        width=1280,
        height=720,
        camera_x=12.5,
        yaw=90,
        include_hud=False,
        include_hands=False,
        include_debug_trace=True,
    )
    image = await camera.capture_bytes(options)
    frames = [frame async for frame in camera.frames(options, interval_ms=250)]
    world_map = await camera.world_map(
        WorldMapOptions(
            center_x=4,
            center_z=8,
            radius=32,
            sample_step=2,
            include_entities=True,
        )
    )

    assert image == b"PNG"
    assert frames[0].dropped_before == 2
    assert world_map.columns[0].surface_y == 70
    assert client.render_request is not None
    assert client.render_request.instance_id == "instance-id"
    assert client.render_request.bot_id == "bot-id"
    assert client.render_request.HasField("camera_x")
    assert client.render_request.include_hud is False
    assert not client.render_request.HasField("camera_y")
    assert client.watch_request is not None
    assert client.watch_request.interval_ms == 250
    assert client.map_request is not None
    assert client.map_request.center_x == 4
    assert client.map_request.include_entities is True


def test_sync_camera_captures_streams_and_samples_world_maps() -> None:
    camera = SoulFireCamera(
        "instance-id",
        "bot-id",
        cast(BotServiceClientSync, FakeSyncCameraClient()),
    )

    assert camera.capture_bytes() == b"PNG"
    assert next(camera.frames()).sequence == 1
    world_map = camera.world_map(WorldMapOptions(center_x=-10, center_z=20, radius=16))
    assert (world_map.center_x, world_map.center_z, world_map.radius) == (-10, 20, 16)
