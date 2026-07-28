from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Protocol, TypeVar

from .bot import AsyncSoulFireBot
from .bot_live_pb2 import (
    HAND_MAIN,
    BlockFace,
    PathfindOptions,
)
from .common_pb2 import BlockPosition

ResultT = TypeVar("ResultT", covariant=True)


class BotBehavior(Protocol[ResultT]):
    async def run(self, bot: AsyncSoulFireBot) -> ResultT: ...


@dataclass(frozen=True, slots=True)
class FunctionBehavior[ResultT]:
    function: Callable[[AsyncSoulFireBot], Awaitable[ResultT]]

    async def run(self, bot: AsyncSoulFireBot) -> ResultT:
        return await self.function(bot)


def define_behavior[ResultT](
    function: Callable[[AsyncSoulFireBot], Awaitable[ResultT]],
) -> FunctionBehavior[ResultT]:
    return FunctionBehavior(function)


class SoulFireBehaviorError(RuntimeError):
    pass


class SoulFireBehaviorTimeoutError(SoulFireBehaviorError):
    def __init__(self, duration: float) -> None:
        self.duration = duration
        super().__init__(f"Behavior exceeded {duration:g} seconds")


async def run_behaviors(
    bot: AsyncSoulFireBot,
    behaviors: Iterable[BotBehavior[object]],
) -> None:
    for behavior in behaviors:
        await behavior.run(bot)


@dataclass(frozen=True, slots=True)
class SequenceBehavior:
    behaviors: tuple[BotBehavior[object], ...]

    async def run(self, bot: AsyncSoulFireBot) -> tuple[object, ...]:
        return tuple([await behavior.run(bot) for behavior in self.behaviors])


def sequence(*behaviors: BotBehavior[object]) -> SequenceBehavior:
    return SequenceBehavior(behaviors)


@dataclass(frozen=True, slots=True)
class ParallelBehavior:
    behaviors: tuple[BotBehavior[object], ...]

    async def run(self, bot: AsyncSoulFireBot) -> tuple[object, ...]:
        results: list[object | None] = [None] * len(self.behaviors)

        async def run_one(index: int, behavior: BotBehavior[object]) -> None:
            results[index] = await behavior.run(bot)

        async with asyncio.TaskGroup() as tasks:
            for index, behavior in enumerate(self.behaviors):
                tasks.create_task(run_one(index, behavior))
        return tuple(results)


def parallel(*behaviors: BotBehavior[object]) -> ParallelBehavior:
    return ParallelBehavior(behaviors)


@dataclass(frozen=True, slots=True)
class RaceBehavior:
    behaviors: tuple[BotBehavior[object], ...]

    async def run(self, bot: AsyncSoulFireBot) -> object:
        if not self.behaviors:
            raise ValueError("race requires at least one behavior")
        tasks = {asyncio.create_task(behavior.run(bot)) for behavior in self.behaviors}
        failures: list[Exception] = []
        try:
            pending = tasks
            while pending:
                completed, pending = await asyncio.wait(
                    pending,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in completed:
                    try:
                        result = task.result()
                    except Exception as error:
                        failures.append(error)
                    else:
                        for remaining in pending:
                            remaining.cancel()
                        return result
            raise ExceptionGroup("Every raced behavior failed", failures)
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)


def race(
    first: BotBehavior[object],
    *others: BotBehavior[object],
) -> RaceBehavior:
    return RaceBehavior((first, *others))


@dataclass(frozen=True, slots=True)
class RepeatBehavior[ResultT]:
    behavior: BotBehavior[ResultT]
    times: int

    async def run(self, bot: AsyncSoulFireBot) -> tuple[ResultT, ...]:
        times = _positive_integer(self.times, "times")
        return tuple([await self.behavior.run(bot) for _ in range(times)])


def repeat[ResultT](
    behavior: BotBehavior[ResultT],
    *,
    times: int,
) -> RepeatBehavior[ResultT]:
    _positive_integer(times, "times")
    return RepeatBehavior(behavior, times)


@dataclass(frozen=True, slots=True)
class RetryBehavior[ResultT]:
    behavior: BotBehavior[ResultT]
    attempts: int = 3
    delay: float = 0
    backoff: float = 1
    maximum_delay: float | None = None

    async def run(self, bot: AsyncSoulFireBot) -> ResultT:
        attempts = _positive_integer(self.attempts, "attempts")
        delay = _non_negative_finite(self.delay, "delay")
        backoff = _positive_finite(self.backoff, "backoff")
        maximum_delay = (
            float("inf")
            if self.maximum_delay is None
            else _non_negative_finite(self.maximum_delay, "maximum_delay")
        )
        for attempt in range(1, attempts + 1):
            try:
                return await self.behavior.run(bot)
            except Exception:
                if attempt == attempts:
                    raise
                await asyncio.sleep(delay)
                delay = min(delay * backoff, maximum_delay)
        raise AssertionError("Retry loop exhausted unexpectedly")


def retry[ResultT](
    behavior: BotBehavior[ResultT],
    *,
    attempts: int = 3,
    delay: float = 0,
    backoff: float = 1,
    maximum_delay: float | None = None,
) -> RetryBehavior[ResultT]:
    return RetryBehavior(
        behavior,
        attempts=attempts,
        delay=delay,
        backoff=backoff,
        maximum_delay=maximum_delay,
    )


@dataclass(frozen=True, slots=True)
class TimeoutBehavior[ResultT]:
    behavior: BotBehavior[ResultT]
    seconds: float

    async def run(self, bot: AsyncSoulFireBot) -> ResultT:
        duration = _positive_finite(self.seconds, "seconds")
        try:
            async with asyncio.timeout(duration):
                return await self.behavior.run(bot)
        except TimeoutError as error:
            raise SoulFireBehaviorTimeoutError(duration) from error


def timeout[ResultT](
    behavior: BotBehavior[ResultT],
    seconds: float,
) -> TimeoutBehavior[ResultT]:
    _positive_finite(seconds, "seconds")
    return TimeoutBehavior(behavior, seconds)


@dataclass(frozen=True, slots=True)
class UntilBehavior[ResultT]:
    behavior: BotBehavior[ResultT]
    predicate: Callable[[ResultT], bool | Awaitable[bool]]
    maximum_iterations: int | None = None

    async def run(self, bot: AsyncSoulFireBot) -> ResultT:
        maximum = (
            None
            if self.maximum_iterations is None
            else _positive_integer(self.maximum_iterations, "maximum_iterations")
        )
        iteration = 0
        while maximum is None or iteration < maximum:
            result = await self.behavior.run(bot)
            iteration += 1
            if await _resolve_bool(self.predicate(result)):
                return result
        raise SoulFireBehaviorError(f"Predicate remained false after {maximum} iterations")


def until[ResultT](
    behavior: BotBehavior[ResultT],
    predicate: Callable[[ResultT], bool | Awaitable[bool]],
    *,
    maximum_iterations: int | None = None,
) -> UntilBehavior[ResultT]:
    return UntilBehavior(behavior, predicate, maximum_iterations)


@dataclass(frozen=True, slots=True)
class ConditionalBehavior[ResultT]:
    predicate: Callable[[AsyncSoulFireBot], bool | Awaitable[bool]]
    when_true: BotBehavior[ResultT]
    when_false: BotBehavior[ResultT] | None = None

    async def run(self, bot: AsyncSoulFireBot) -> ResultT | None:
        if await _resolve_bool(self.predicate(bot)):
            return await self.when_true.run(bot)
        if self.when_false is None:
            return None
        return await self.when_false.run(bot)


def conditional[ResultT](
    predicate: Callable[[AsyncSoulFireBot], bool | Awaitable[bool]],
    when_true: BotBehavior[ResultT],
    when_false: BotBehavior[ResultT] | None = None,
) -> ConditionalBehavior[ResultT]:
    return ConditionalBehavior(predicate, when_true, when_false)


@dataclass(frozen=True, slots=True)
class FallbackBehavior[ResultT]:
    behaviors: tuple[BotBehavior[ResultT], ...]

    async def run(self, bot: AsyncSoulFireBot) -> ResultT:
        failures: list[Exception] = []
        for behavior in self.behaviors:
            try:
                return await behavior.run(bot)
            except Exception as error:
                failures.append(error)
        raise ExceptionGroup("Every fallback behavior failed", failures)


def fallback[ResultT](
    primary: BotBehavior[ResultT],
    *alternatives: BotBehavior[ResultT],
) -> FallbackBehavior[ResultT]:
    return FallbackBehavior((primary, *alternatives))


@dataclass(frozen=True, slots=True)
class CleanupBehavior[ResultT]:
    behavior: BotBehavior[ResultT]
    finalizer: BotBehavior[object]

    async def run(self, bot: AsyncSoulFireBot) -> ResultT:
        try:
            result = await self.behavior.run(bot)
        except Exception as behavior_error:
            try:
                await self.finalizer.run(bot)
            except Exception as finalizer_error:
                raise ExceptionGroup(
                    "Behavior and cleanup both failed",
                    [behavior_error, finalizer_error],
                ) from None
            raise
        await self.finalizer.run(bot)
        return result


def cleanup[ResultT](
    behavior: BotBehavior[ResultT],
    finalizer: BotBehavior[object],
) -> CleanupBehavior[ResultT]:
    return CleanupBehavior(behavior, finalizer)


@dataclass(frozen=True, slots=True)
class ScopedLeaseBehavior[ResultT]:
    behavior: BotBehavior[ResultT]
    ttl_seconds: int = 30

    async def run(self, bot: AsyncSoulFireBot) -> ResultT:
        ttl = _positive_integer(self.ttl_seconds, "ttl_seconds")
        async with await bot.acquire_control(ttl_seconds=ttl):
            return await self.behavior.run(bot)


def scoped_lease[ResultT](
    behavior: BotBehavior[ResultT],
    *,
    ttl_seconds: int = 30,
) -> ScopedLeaseBehavior[ResultT]:
    return ScopedLeaseBehavior(behavior, ttl_seconds)


@dataclass(frozen=True, slots=True)
class CollectBlocks:
    block_ids: Sequence[str]
    tags: Sequence[str] = ()
    count: int = 1
    search_radius: int = 32
    allow_placing: bool = False

    async def run(self, bot: AsyncSoulFireBot) -> int:
        task = await bot.tasks.collect_blocks(
            self.block_ids,
            tags=self.tags,
            count=self.count,
            search_radius=self.search_radius,
            options=PathfindOptions(
                allow_mining=True,
                allow_placing=self.allow_placing,
            ),
        )
        return (await task.result()).blocks_broken


@dataclass(frozen=True, slots=True)
class FollowEntity:
    entity_id: int
    radius: float = 3

    async def run(self, bot: AsyncSoulFireBot) -> None:
        async for _ in bot.tasks.run_follow_entity(
            self.entity_id,
            distance=self.radius,
            options=PathfindOptions(allow_mining=False, allow_placing=False),
        ):
            pass


@dataclass(frozen=True, slots=True)
class AttackNearest:
    entity_types: Sequence[str]
    radius: float = 32
    attack_range: float = 3
    sprinting: bool = False
    maximum_attacks: int = 0

    async def run(self, bot: AsyncSoulFireBot) -> bool:
        response = await bot.list_nearby_entities(
            self.radius,
            entity_types=self.entity_types,
            include_players=False,
        )
        if not response.entities:
            return False
        target = response.entities[0]
        async for _ in bot.tasks.run_attack_entity(
            target.entity_id,
            attack_range=self.attack_range,
            sprinting=self.sprinting,
            maximum_attacks=self.maximum_attacks,
            options=PathfindOptions(allow_mining=False, allow_placing=False),
        ):
            pass
        return True


@dataclass(frozen=True, slots=True)
class AutoEat:
    food_item_ids: Sequence[str]
    food_level: int = 14
    check_interval_ticks: int = 20
    maximum_meals: int = 0
    complete_when_no_food: bool = False
    restore_selected_slot: bool = True

    async def run(self, bot: AsyncSoulFireBot) -> None:
        async for _ in bot.tasks.run_auto_eat(
            self.food_item_ids,
            food_level=self.food_level,
            check_interval_ticks=self.check_interval_ticks,
            maximum_meals=self.maximum_meals,
            complete_when_no_food=self.complete_when_no_food,
            restore_selected_slot=self.restore_selected_slot,
        ):
            pass


@dataclass(frozen=True, slots=True)
class AutoRespawn:
    respawn_delay_ticks: int = 0
    maximum_respawns: int = 0

    async def run(self, bot: AsyncSoulFireBot) -> None:
        async for _ in bot.tasks.run_auto_respawn(
            respawn_delay_ticks=self.respawn_delay_ticks,
            maximum_respawns=self.maximum_respawns,
        ):
            pass


@dataclass(frozen=True, slots=True)
class AutoTotem:
    check_interval_ticks: int = 20
    maximum_equips: int = 0
    complete_when_no_totem: bool = False
    replace_occupied_offhand: bool = False

    async def run(self, bot: AsyncSoulFireBot) -> None:
        async for _ in bot.tasks.run_auto_totem(
            check_interval_ticks=self.check_interval_ticks,
            maximum_equips=self.maximum_equips,
            complete_when_no_totem=self.complete_when_no_totem,
            replace_occupied_offhand=self.replace_occupied_offhand,
        ):
            pass


@dataclass(frozen=True, slots=True)
class AutoArmor:
    check_interval_ticks: int = 20
    maximum_equips: int = 0
    complete_when_no_upgrade: bool = False

    async def run(self, bot: AsyncSoulFireBot) -> None:
        async for _ in bot.tasks.run_auto_armor(
            check_interval_ticks=self.check_interval_ticks,
            maximum_equips=self.maximum_equips,
            complete_when_no_upgrade=self.complete_when_no_upgrade,
        ):
            pass


@dataclass(frozen=True, slots=True)
class BuildPlacement:
    against: BlockPosition
    face: BlockFace
    hotbar_slot: int | None = None


@dataclass(frozen=True, slots=True)
class Build:
    placements: Sequence[BuildPlacement]

    async def run(self, bot: AsyncSoulFireBot) -> int:
        placed = 0
        for placement in self.placements:
            if placement.hotbar_slot is not None:
                await bot.select_hotbar(placement.hotbar_slot)
            await bot.place_block(
                placement.against,
                placement.face,
                HAND_MAIN,
            )
            placed += 1
        return placed


async def _resolve_bool(value: bool | Awaitable[bool]) -> bool:
    if isinstance(value, bool):
        return value
    return await value


def _positive_integer(value: int, name: str) -> int:
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


def _non_negative_finite(value: float, name: str) -> float:
    if value < 0 or value == float("inf") or value != value:
        raise ValueError(f"{name} must be a finite non-negative number")
    return value


def _positive_finite(value: float, name: str) -> float:
    if value <= 0 or value == float("inf") or value != value:
        raise ValueError(f"{name} must be a finite positive number")
    return value
