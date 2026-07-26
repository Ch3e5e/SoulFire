from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterable, Sequence
from dataclasses import dataclass
from typing import Protocol, TypeVar

from .bot import SoulFireBot
from .bot_live_pb2 import (
    HAND_MAIN,
    PATHFIND_STATUS_CANCELLED,
    PATHFIND_STATUS_COMPLETED,
    PATHFIND_STATUS_FAILED,
    BlockPosition,
    PathfindGoal,
    PathfindOptions,
    PathfindProgress,
)

ResultT = TypeVar("ResultT", covariant=True)


class BotBehavior(Protocol[ResultT]):
    async def run(self, bot: SoulFireBot) -> ResultT: ...


async def run_behaviors(
    bot: SoulFireBot,
    behaviors: Iterable[BotBehavior[object]],
) -> None:
    for behavior in behaviors:
        await behavior.run(bot)


@dataclass(frozen=True)
class CollectBlocks:
    block_ids: Sequence[str]
    max_count: int = 64
    max_distance: int = 64
    path_radius: float = 3

    async def run(self, bot: SoulFireBot) -> int:
        response = await bot.find_blocks(
            self.block_ids,
            max_count=self.max_count,
            max_distance=self.max_distance,
        )
        collected = 0
        for block in response.blocks:
            if not block.HasField("position"):
                continue
            await _complete_path(
                bot.go_to(
                    PathfindGoal(
                        block=PathfindGoal.BlockGoal(
                            position=block.position,
                            radius=self.path_radius,
                        )
                    ),
                    PathfindOptions(allow_mining=False, allow_placing=False),
                )
            )
            await bot.dig_block(block.position)
            collected += 1
        return collected


@dataclass(frozen=True)
class FollowEntity:
    entity_id: int
    radius: float = 3

    async def run(self, bot: SoulFireBot) -> None:
        await _complete_path(
            bot.go_to(
                PathfindGoal(
                    entity=PathfindGoal.EntityGoal(
                        entity_id=self.entity_id,
                        radius=self.radius,
                    )
                ),
                PathfindOptions(allow_mining=False, allow_placing=False),
            )
        )


@dataclass(frozen=True)
class AttackNearest:
    entity_types: Sequence[str]
    radius: float = 32
    sprinting: bool = False

    async def run(self, bot: SoulFireBot) -> bool:
        response = await bot.list_nearby_entities(
            self.radius,
            entity_types=self.entity_types,
            include_players=False,
        )
        if not response.entities:
            return False
        target = response.entities[0]
        if target.distance > 3:
            await FollowEntity(target.entity_id, 2.5).run(bot)
        await bot.attack_entity(target.entity_id, sprinting=self.sprinting)
        return True


@dataclass(frozen=True)
class AutoEat:
    food_item_ids: Sequence[str]
    food_level: int = 14
    interval: float = 1
    use_duration: float = 1.7

    async def run(self, bot: SoulFireBot) -> None:
        food_items = frozenset(self.food_item_ids)
        while True:
            info = await bot.info()
            if info.HasField("live_state") and info.live_state.food_level <= self.food_level:
                inventory = await bot.inventory()
                food = next(
                    (
                        slot
                        for slot in inventory.slots
                        if 36 <= slot.slot <= 44 and slot.item_id in food_items
                    ),
                    None,
                )
                if food is not None:
                    await bot.select_hotbar(food.slot - 36)
                    await bot.use_item(HAND_MAIN)
                    await asyncio.sleep(self.use_duration)
            await asyncio.sleep(self.interval)


@dataclass(frozen=True)
class BuildPlacement:
    against: BlockPosition
    face: int
    hotbar_slot: int | None = None


@dataclass(frozen=True)
class Build:
    placements: Sequence[BuildPlacement]

    async def run(self, bot: SoulFireBot) -> int:
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


async def _complete_path(progress: AsyncIterator[PathfindProgress]) -> None:
    async for update in progress:
        if update.status == PATHFIND_STATUS_COMPLETED:
            return
        _require_path_progress(update)
    raise RuntimeError("Pathfinding stream ended without a final status")


def _require_path_progress(update: PathfindProgress) -> None:
    if update.status in {PATHFIND_STATUS_CANCELLED, PATHFIND_STATUS_FAILED}:
        raise RuntimeError(update.error or "Pathfinding did not complete")
