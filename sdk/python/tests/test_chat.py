import re
from collections.abc import AsyncIterator, Iterator
from typing import cast

import pytest

from soulfire.bot_live_pb2 import (
    CHAT_SOURCE_PLAYER,
    CHAT_SOURCE_SYSTEM,
    BotChatEvent,
    BotEvent,
    BotEventFilter,
)
from soulfire.chat_connect import ChatServiceClient, ChatServiceClientSync
from soulfire.semantic import (
    AsyncSoulFireChat,
    SoulFireChat,
    match_chat,
)


def test_match_chat_preserves_captures_and_named_groups() -> None:
    event = BotChatEvent(
        plain_text="Alex joined with code 4821",
        source=CHAT_SOURCE_SYSTEM,
    )

    match = match_chat(
        event,
        re.compile(r"(?P<player>\w+) joined with code (\d+)"),
    )

    assert match is not None
    assert match.captures == ("Alex", "4821")
    assert match.groups == {"player": "Alex"}


@pytest.mark.asyncio
async def test_async_chat_wait_filters_sources() -> None:
    async def events(
        event_filter: BotEventFilter,
        _timeout_ms: int | None,
    ) -> AsyncIterator[BotEvent]:
        assert event_filter.include_chat
        yield _chat_event(CHAT_SOURCE_PLAYER)
        yield _chat_event(CHAT_SOURCE_SYSTEM)

    chat = AsyncSoulFireChat(
        "instance-id",
        "bot-id",
        cast(ChatServiceClient, object()),
        lambda headers: headers,
        events,
    )

    match = await chat.wait_for(
        "authentication accepted",
        sources=[CHAT_SOURCE_SYSTEM],
        timeout_ms=100,
    )

    assert match.event.source == CHAT_SOURCE_SYSTEM


def test_sync_chat_wait_filters_sources() -> None:
    def events(
        event_filter: BotEventFilter,
        _timeout_ms: int | None,
    ) -> Iterator[BotEvent]:
        assert event_filter.include_chat
        yield _chat_event(CHAT_SOURCE_PLAYER)
        yield _chat_event(CHAT_SOURCE_SYSTEM)

    chat = SoulFireChat(
        "instance-id",
        "bot-id",
        cast(ChatServiceClientSync, object()),
        lambda headers: headers,
        events,
    )

    match = chat.wait_for(
        "authentication accepted",
        sources=[CHAT_SOURCE_SYSTEM],
        timeout_ms=100,
    )

    assert match.event.source == CHAT_SOURCE_SYSTEM


def _chat_event(source: int) -> BotEvent:
    return BotEvent(
        chat=BotChatEvent(
            plain_text="authentication accepted",
            source=source,
        )
    )
