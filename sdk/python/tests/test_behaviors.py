import asyncio
from typing import cast

import pytest

from soulfire.behaviors import (
    SoulFireBehaviorTimeoutError,
    cleanup,
    define_behavior,
    parallel,
    race,
    retry,
    sequence,
    timeout,
)
from soulfire.bot import AsyncSoulFireBot

bot = cast(AsyncSoulFireBot, object())


@pytest.mark.asyncio
async def test_combinators_preserve_order_parallelize_and_retry() -> None:
    calls: list[int] = []
    attempts = 0

    async def first(_: AsyncSoulFireBot) -> str:
        calls.append(1)
        return "first"

    async def second(_: AsyncSoulFireBot) -> str:
        calls.append(2)
        return "second"

    async def unstable(_: AsyncSoulFireBot) -> int:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise RuntimeError
        return attempts

    assert await sequence(define_behavior(first), define_behavior(second)).run(bot) == (
        "first",
        "second",
    )
    assert calls == [1, 2]
    assert await parallel(define_behavior(second), define_behavior(first)).run(bot) == (
        "second",
        "first",
    )
    assert await retry(define_behavior(unstable), attempts=3).run(bot) == 3


@pytest.mark.asyncio
async def test_race_cancels_loser_and_cleanup_runs_after_failure() -> None:
    loser_cancelled = asyncio.Event()
    cleaned = False

    async def winner(_: AsyncSoulFireBot) -> int:
        await asyncio.sleep(0)
        return 7

    async def loser(_: AsyncSoulFireBot) -> int:
        try:
            await asyncio.Event().wait()
        finally:
            loser_cancelled.set()
        return 0

    async def failing(_: AsyncSoulFireBot) -> None:
        raise RuntimeError

    async def finalizer(_: AsyncSoulFireBot) -> None:
        nonlocal cleaned
        cleaned = True

    assert await race(define_behavior(loser), define_behavior(winner)).run(bot) == 7
    await asyncio.wait_for(loser_cancelled.wait(), timeout=1)
    with pytest.raises(RuntimeError):
        await cleanup(define_behavior(failing), define_behavior(finalizer)).run(bot)
    assert cleaned


@pytest.mark.asyncio
async def test_timeout_finishes_when_behavior_ignores_external_cancellation() -> None:
    async def never(_: AsyncSoulFireBot) -> None:
        await asyncio.Event().wait()

    with pytest.raises(SoulFireBehaviorTimeoutError):
        await timeout(define_behavior(never), 0.001).run(bot)
