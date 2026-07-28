from __future__ import annotations

from collections.abc import AsyncIterator, Iterable, Iterator

from .protocol_connect import BotProtocolServiceClient, BotProtocolServiceClientSync
from .protocol_pb2 import (
    BotProtocolInfo,
    BotProtocolRequest,
    ListPacketSchemasRequest,
    PacketDirection,
    PacketSchema,
    RawPacketEvent,
    SendRawPacketRequest,
    SendRawPacketResponse,
    WatchPacketsRequest,
)


class AsyncSoulFireProtocol:
    """Advanced access to SoulFire's native Minecraft packet codec."""

    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        client: BotProtocolServiceClient,
    ) -> None:
        self._instance_id = instance_id
        self._bot_id = bot_id
        self._client = client

    async def info(self, *, timeout_ms: int | None = None) -> BotProtocolInfo:
        return await self._client.get_protocol_info(
            BotProtocolRequest(instance_id=self._instance_id, bot_id=self._bot_id),
            timeout_ms=timeout_ms,
        )

    async def schemas(
        self,
        direction: PacketDirection,
        *,
        timeout_ms: int | None = None,
    ) -> list[PacketSchema]:
        response = await self._client.list_packet_schemas(
            ListPacketSchemasRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                direction=direction,
            ),
            timeout_ms=timeout_ms,
        )
        return list(response.packets)

    def packets(
        self,
        *,
        directions: Iterable[PacketDirection] = (),
        names: Iterable[str] = (),
        include_encoded_packet: bool = False,
        maximum_encoded_bytes: int = 0,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[RawPacketEvent]:
        return self._client.watch_packets(
            WatchPacketsRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                directions=directions,
                names=names,
                include_encoded_packet=include_encoded_packet,
                maximum_encoded_bytes=maximum_encoded_bytes,
            ),
            timeout_ms=timeout_ms,
        )

    async def send(
        self,
        encoded_packet: bytes,
        *,
        expected_name: str | None = None,
        timeout_ms: int | None = None,
    ) -> SendRawPacketResponse:
        return await self._client.send_raw_packet(
            SendRawPacketRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                encoded_packet=encoded_packet,
                **({} if expected_name is None else {"expected_name": expected_name}),
            ),
            timeout_ms=timeout_ms,
        )


class SoulFireProtocol:
    """Synchronous advanced access to the native Minecraft packet codec."""

    def __init__(
        self,
        instance_id: str,
        bot_id: str,
        client: BotProtocolServiceClientSync,
    ) -> None:
        self._instance_id = instance_id
        self._bot_id = bot_id
        self._client = client

    def info(self, *, timeout_ms: int | None = None) -> BotProtocolInfo:
        return self._client.get_protocol_info(
            BotProtocolRequest(instance_id=self._instance_id, bot_id=self._bot_id),
            timeout_ms=timeout_ms,
        )

    def schemas(
        self,
        direction: PacketDirection,
        *,
        timeout_ms: int | None = None,
    ) -> list[PacketSchema]:
        response = self._client.list_packet_schemas(
            ListPacketSchemasRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                direction=direction,
            ),
            timeout_ms=timeout_ms,
        )
        return list(response.packets)

    def packets(
        self,
        *,
        directions: Iterable[PacketDirection] = (),
        names: Iterable[str] = (),
        include_encoded_packet: bool = False,
        maximum_encoded_bytes: int = 0,
        timeout_ms: int | None = None,
    ) -> Iterator[RawPacketEvent]:
        return self._client.watch_packets(
            WatchPacketsRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                directions=directions,
                names=names,
                include_encoded_packet=include_encoded_packet,
                maximum_encoded_bytes=maximum_encoded_bytes,
            ),
            timeout_ms=timeout_ms,
        )

    def send(
        self,
        encoded_packet: bytes,
        *,
        expected_name: str | None = None,
        timeout_ms: int | None = None,
    ) -> SendRawPacketResponse:
        return self._client.send_raw_packet(
            SendRawPacketRequest(
                instance_id=self._instance_id,
                bot_id=self._bot_id,
                encoded_packet=encoded_packet,
                **({} if expected_name is None else {"expected_name": expected_name}),
            ),
            timeout_ms=timeout_ms,
        )
