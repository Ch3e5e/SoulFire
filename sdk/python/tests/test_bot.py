from collections.abc import AsyncIterator
from typing import cast

import pytest

from soulfire.bot import SoulFireBot
from soulfire.bot_connect import BotServiceClient
from soulfire.bot_live_connect import BotLiveServiceClient
from soulfire.bot_live_pb2 import (
    BOT_ACTION_STATUS_COMPLETED,
    AcquireBotControlRequest,
    AcquireBotControlResponse,
    BotActionResult,
    BotControlLease,
    BotEvent,
    ReleaseBotControlRequest,
    ReleaseBotControlResponse,
    SendChatRequest,
    SendChatResponse,
    WatchBotEventsRequest,
)


class FakeBotLiveClient:
    event_request: WatchBotEventsRequest | None = None
    chat_request: SendChatRequest | None = None
    action_headers: list[dict[str, str] | None]

    def __init__(self) -> None:
        self.action_headers = []

    async def _events(self) -> AsyncIterator[BotEvent]:
        yield BotEvent()

    def watch_bot_events(
        self,
        request: WatchBotEventsRequest,
        **_kwargs: object,
    ) -> AsyncIterator[BotEvent]:
        self.event_request = request
        return self._events()

    async def send_chat(
        self,
        request: SendChatRequest,
        **kwargs: object,
    ) -> SendChatResponse:
        self.chat_request = request
        self.action_headers.append(cast(dict[str, str] | None, kwargs.get("headers")))
        return SendChatResponse(
            result=BotActionResult(
                action_id="action-id",
                status=BOT_ACTION_STATUS_COMPLETED,
            )
        )

    async def acquire_bot_control(
        self,
        request: AcquireBotControlRequest,
        **_kwargs: object,
    ) -> AcquireBotControlResponse:
        assert request.instance_id == "instance-id"
        assert request.bot_id == "bot-id"
        return AcquireBotControlResponse(lease=BotControlLease(token="lease-token"))

    async def release_bot_control(
        self,
        request: ReleaseBotControlRequest,
        **_kwargs: object,
    ) -> ReleaseBotControlResponse:
        assert request.token == "lease-token"
        return ReleaseBotControlResponse()


@pytest.mark.asyncio
async def test_bot_scopes_event_stream() -> None:
    service = FakeBotLiveClient()
    bot = SoulFireBot(
        "instance-id",
        "bot-id",
        cast(BotServiceClient, object()),
        cast(BotLiveServiceClient, service),
    )

    async for _event in bot.events():
        break

    assert service.event_request is not None
    assert service.event_request.instance_id == "instance-id"
    assert service.event_request.bot_id == "bot-id"
    assert service.event_request.filter.include_chat
    assert service.event_request.filter.include_damage
    assert service.event_request.filter.include_inventory
    assert service.event_request.filter.include_lifecycle
    assert service.event_request.filter.include_state_deltas


@pytest.mark.asyncio
async def test_bot_scopes_chat_command() -> None:
    service = FakeBotLiveClient()
    bot = SoulFireBot(
        "instance-id",
        "bot-id",
        cast(BotServiceClient, object()),
        cast(BotLiveServiceClient, service),
    )

    await bot.send_chat("hello")

    assert service.chat_request is not None
    assert service.chat_request.instance_id == "instance-id"
    assert service.chat_request.bot_id == "bot-id"
    assert service.chat_request.message == "hello"


@pytest.mark.asyncio
async def test_bot_attaches_and_clears_an_acquired_control_lease() -> None:
    service = FakeBotLiveClient()
    bot = SoulFireBot(
        "instance-id",
        "bot-id",
        cast(BotServiceClient, object()),
        cast(BotLiveServiceClient, service),
    )

    lease = await bot.acquire_control()
    await bot.send_chat("leased")
    await lease.release()
    await bot.send_chat("unleased")

    assert service.action_headers == [
        {"X-SoulFire-Control-Token": "lease-token"},
        None,
    ]
