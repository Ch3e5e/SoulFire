from typing import Any, cast

import pytest

from soulfire.protocol import AsyncSoulFireProtocol, SoulFireProtocol
from soulfire.protocol_connect import BotProtocolServiceClient, BotProtocolServiceClientSync
from soulfire.protocol_pb2 import (
    PACKET_DIRECTION_CLIENTBOUND,
    BotProtocolInfo,
    ListPacketSchemasRequest,
    ListPacketSchemasResponse,
    PacketSchema,
    RawPacketEvent,
    SendRawPacketRequest,
    SendRawPacketResponse,
    WatchPacketsRequest,
)


class FakeAsyncProtocolClient:
    schemas_request: ListPacketSchemasRequest | None = None
    watch_request: WatchPacketsRequest | None = None
    send_request: SendRawPacketRequest | None = None

    async def get_protocol_info(self, request: Any, **_options: Any) -> BotProtocolInfo:
        assert request.instance_id == "instance-id"
        assert request.bot_id == "bot-id"
        return BotProtocolInfo(
            minecraft_protocol_version=772,
            minecraft_version_name="26.2",
            protocol_state="play",
        )

    async def list_packet_schemas(
        self,
        request: ListPacketSchemasRequest,
        **_options: Any,
    ) -> ListPacketSchemasResponse:
        self.schemas_request = request
        return ListPacketSchemasResponse(
            packets=[
                PacketSchema(
                    direction=request.direction,
                    name="minecraft:game_event",
                    network_id=31,
                    protocol_state="play",
                )
            ]
        )

    def watch_packets(
        self,
        request: WatchPacketsRequest,
        **_options: Any,
    ):
        self.watch_request = request

        async def events():
            yield RawPacketEvent(
                sequence=1,
                direction=PACKET_DIRECTION_CLIENTBOUND,
                name="minecraft:game_event",
            )

        return events()

    async def send_raw_packet(
        self,
        request: SendRawPacketRequest,
        **_options: Any,
    ) -> SendRawPacketResponse:
        self.send_request = request
        return SendRawPacketResponse(
            name=request.expected_name,
            encoded_bytes=len(request.encoded_packet),
        )


class FakeSyncProtocolClient:
    def get_protocol_info(self, request: Any, **_options: Any) -> BotProtocolInfo:
        return BotProtocolInfo(
            minecraft_protocol_version=772,
            minecraft_version_name="26.2",
            protocol_state="play",
        )

    def list_packet_schemas(
        self,
        request: ListPacketSchemasRequest,
        **_options: Any,
    ) -> ListPacketSchemasResponse:
        return ListPacketSchemasResponse(
            packets=[
                PacketSchema(
                    direction=request.direction,
                    name="minecraft:game_event",
                    network_id=31,
                    protocol_state="play",
                )
            ]
        )

    def watch_packets(self, request: WatchPacketsRequest, **_options: Any):
        return iter(
            [
                RawPacketEvent(
                    sequence=1,
                    direction=request.directions[0],
                    name=request.names[0],
                )
            ]
        )

    def send_raw_packet(
        self,
        request: SendRawPacketRequest,
        **_options: Any,
    ) -> SendRawPacketResponse:
        return SendRawPacketResponse(
            name=request.expected_name,
            encoded_bytes=len(request.encoded_packet),
        )


@pytest.mark.asyncio
async def test_async_protocol_scopes_queries_streams_and_raw_sends() -> None:
    client = FakeAsyncProtocolClient()
    protocol = AsyncSoulFireProtocol(
        "instance-id",
        "bot-id",
        cast(BotProtocolServiceClient, client),
    )

    info = await protocol.info()
    schemas = await protocol.schemas(PACKET_DIRECTION_CLIENTBOUND)
    events = [
        event
        async for event in protocol.packets(
            directions=[PACKET_DIRECTION_CLIENTBOUND],
            names=["minecraft:game_event"],
            include_encoded_packet=True,
            maximum_encoded_bytes=128,
        )
    ]
    sent = await protocol.send(b"\x01\x02", expected_name="minecraft:game_event")

    assert info.minecraft_protocol_version == 772
    assert schemas[0].network_id == 31
    assert events[0].sequence == 1
    assert sent.encoded_bytes == 2
    assert client.schemas_request is not None
    assert client.schemas_request.instance_id == "instance-id"
    assert client.watch_request is not None
    assert client.watch_request.maximum_encoded_bytes == 128
    assert client.send_request is not None
    assert client.send_request.bot_id == "bot-id"


def test_sync_protocol_preserves_filters_and_packet_bytes() -> None:
    protocol = SoulFireProtocol(
        "instance-id",
        "bot-id",
        cast(BotProtocolServiceClientSync, FakeSyncProtocolClient()),
    )

    events = list(
        protocol.packets(
            directions=[PACKET_DIRECTION_CLIENTBOUND],
            names=["minecraft:game_event"],
        )
    )
    sent = protocol.send(b"\x01\x02", expected_name="minecraft:game_event")

    assert events[0].direction == PACKET_DIRECTION_CLIENTBOUND
    assert events[0].name == "minecraft:game_event"
    assert sent.name == "minecraft:game_event"
    assert sent.encoded_bytes == 2
