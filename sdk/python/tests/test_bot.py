from collections.abc import AsyncIterator
from typing import cast

import pytest

from soulfire.bot import SoulFireBot
from soulfire.bot_connect import BotServiceClient
from soulfire.bot_live_connect import BotLiveServiceClient
from soulfire.bot_live_pb2 import (
    BotEvent,
    SendChatRequest,
    SendChatResponse,
    WatchBotEventsRequest,
)


class FakeBotLiveClient:
    event_request: WatchBotEventsRequest | None = None
    chat_request: SendChatRequest | None = None

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
        **_kwargs: object,
    ) -> SendChatResponse:
        self.chat_request = request
        return SendChatResponse()


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
