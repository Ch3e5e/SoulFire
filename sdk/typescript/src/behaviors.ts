import type { CallOptions } from "@connectrpc/connect";

import type { SoulFireBot } from "./client.js";
import {
  BlockFace,
  Hand,
  PathfindStatus,
  type BlockPosition,
  type PathfindProgress,
} from "./generated/soulfire/bot_live_pb.js";

export interface BehaviorContext {
  signal?: AbortSignal;
}

export interface BotBehavior<T = void> {
  run(bot: SoulFireBot, context?: BehaviorContext): Promise<T>;
}

export function defineBehavior<T>(
  run: BotBehavior<T>["run"],
): BotBehavior<T> {
  return { run };
}

export async function runBehaviors(
  bot: SoulFireBot,
  behaviors: readonly BotBehavior[],
  context?: BehaviorContext,
): Promise<void> {
  for (const behavior of behaviors) {
    context?.signal?.throwIfAborted();
    await behavior.run(bot, context);
  }
}

export interface CollectBlocksOptions {
  blockIds: readonly string[];
  maxCount?: number;
  maxDistance?: number;
  pathRadius?: number;
}

export function collectBlocks(
  options: CollectBlocksOptions,
): BotBehavior<number> {
  return defineBehavior(async (bot, context) => {
    const response = await bot.findBlocks(
      {
        blockIds: [...options.blockIds],
        maxCount: options.maxCount ?? 64,
        maxDistance: options.maxDistance ?? 64,
      },
      callOptions(context),
    );
    let collected = 0;
    for (const block of response.blocks) {
      context?.signal?.throwIfAborted();
      if (block.position === undefined) {
        continue;
      }
      await completePath(bot.goTo(
        {
          goal: {
            goal: {
              case: "block",
              value: {
                position: block.position,
                radius: options.pathRadius ?? 3,
              },
            },
          },
          options: {
            allowMining: false,
            allowPlacing: false,
          },
        },
        callOptions(context),
      ));
      await bot.digBlock(
        { position: block.position, cancel: false },
        callOptions(context),
      );
      collected += 1;
    }
    return collected;
  });
}

export function followEntity(
  entityId: number,
  radius = 3,
): BotBehavior<void> {
  return defineBehavior(async (bot, context) => {
    await completePath(bot.goTo(
      {
        goal: {
          goal: {
            case: "entity",
            value: { entityId, radius },
          },
        },
        options: {
          allowMining: false,
          allowPlacing: false,
        },
      },
      callOptions(context),
    ));
  });
}

export interface AttackNearestOptions {
  entityTypes: readonly string[];
  radius?: number;
  sprinting?: boolean;
}

export function attackNearest(
  options: AttackNearestOptions,
): BotBehavior<boolean> {
  return defineBehavior(async (bot, context) => {
    const response = await bot.listNearbyEntities(
      {
        entityTypes: [...options.entityTypes],
        includePlayers: false,
        radius: options.radius ?? 32,
      },
      callOptions(context),
    );
    const target = response.entities[0];
    if (target === undefined) {
      return false;
    }
    if (target.distance > 3) {
      await followEntity(target.entityId, 2.5).run(bot, context);
    }
    await bot.attackEntity(
      {
        entityId: target.entityId,
        sprinting: options.sprinting ?? false,
      },
      callOptions(context),
    );
    return true;
  });
}

export interface AutoEatOptions {
  foodItemIds: readonly string[];
  foodLevel?: number;
  intervalMs?: number;
  useDurationMs?: number;
}

export function autoEat(options: AutoEatOptions): BotBehavior<never> {
  return defineBehavior(async (bot, context) => {
    const foodItems = new Set(options.foodItemIds);
    for (;;) {
      context?.signal?.throwIfAborted();
      const liveState = await bot.liveState(callOptions(context));
      if (liveState.foodLevel <= (options.foodLevel ?? 14)) {
        const inventory = await bot.inventory(callOptions(context));
        const food = inventory.slots.find(
          (slot) =>
            slot.slot >= 36
            && slot.slot <= 44
            && foodItems.has(slot.itemId),
        );
        if (food !== undefined) {
          await bot.selectHotbar(food.slot - 36, callOptions(context));
          await bot.useItem({ hand: Hand.MAIN }, callOptions(context));
          await sleep(options.useDurationMs ?? 1_700, context?.signal);
        }
      }
      await sleep(options.intervalMs ?? 1_000, context?.signal);
    }
  });
}

export interface BuildPlacement {
  against: BlockPosition;
  face: BlockFace;
  hotbarSlot?: number;
}

export function build(
  placements: readonly BuildPlacement[],
): BotBehavior<number> {
  return defineBehavior(async (bot, context) => {
    let placed = 0;
    for (const placement of placements) {
      context?.signal?.throwIfAborted();
      if (placement.hotbarSlot !== undefined) {
        await bot.selectHotbar(placement.hotbarSlot, callOptions(context));
      }
      await bot.placeBlock(
        {
          against: placement.against,
          face: placement.face,
          hand: Hand.MAIN,
        },
        callOptions(context),
      );
      placed += 1;
    }
    return placed;
  });
}

async function completePath(
  progress: AsyncIterable<PathfindProgress>,
): Promise<void> {
  for await (const update of progress) {
    if (update.status === PathfindStatus.COMPLETED) {
      return;
    }
    if (
      update.status === PathfindStatus.CANCELLED
      || update.status === PathfindStatus.FAILED
    ) {
      throw new Error(update.error ?? "Pathfinding did not complete");
    }
  }
  throw new Error("Pathfinding stream ended without a final status");
}

function callOptions(context?: BehaviorContext): CallOptions | undefined {
  return context?.signal === undefined
    ? undefined
    : { signal: context.signal };
}

async function sleep(
  durationMs: number,
  signal?: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, durationMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
  });
}
