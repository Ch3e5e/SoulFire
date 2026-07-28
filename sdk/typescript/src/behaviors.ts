import type { CallOptions } from "@connectrpc/connect";

import type { SoulFireBot } from "./client.js";
import {
  BlockFace,
  Hand,
} from "./generated/soulfire/bot_live_pb.js";
import type { BlockPosition } from "./generated/soulfire/common_pb.js";
import {
  BotTaskStatus,
  type BotTaskEvent,
} from "./generated/soulfire/task_pb.js";

export interface BehaviorContext {
  signal?: AbortSignal;
}

export interface BotBehavior<T = void> {
  run(bot: SoulFireBot, context?: BehaviorContext): Promise<T>;
}

export type BehaviorResult<Behavior> =
  Behavior extends BotBehavior<infer Result> ? Result : never;

export type BehaviorResults<
  Behaviors extends readonly BotBehavior<unknown>[],
> = {
  readonly [Index in keyof Behaviors]: BehaviorResult<Behaviors[Index]>;
};

export class SoulFireBehaviorError extends Error {
  public constructor(
    public readonly behavior: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SoulFireBehaviorError";
  }
}

export class SoulFireBehaviorTimeoutError extends SoulFireBehaviorError {
  public constructor(public readonly durationMs: number) {
    super("timeout", `Behavior exceeded ${durationMs} ms`);
    this.name = "SoulFireBehaviorTimeoutError";
  }
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

export function sequence<
  const Behaviors extends readonly BotBehavior<unknown>[],
>(
  ...behaviors: Behaviors
): BotBehavior<BehaviorResults<Behaviors>> {
  return defineBehavior(async (bot, context) => {
    const results: unknown[] = [];
    for (const behavior of behaviors) {
      context?.signal?.throwIfAborted();
      results.push(await behavior.run(bot, context));
    }
    return results as BehaviorResults<Behaviors>;
  });
}

export interface ParallelOptions {
  readonly concurrency?: number;
}

export function parallel<
  const Behaviors extends readonly BotBehavior<unknown>[],
>(
  behaviors: Behaviors,
  options: ParallelOptions = {},
): BotBehavior<BehaviorResults<Behaviors>> {
  const concurrency = options.concurrency === undefined
    ? behaviors.length || 1
    : positiveInteger(options.concurrency, "concurrency");
  return defineBehavior(async (bot, context) => {
    const link = linkedAbortController(context?.signal);
    try {
      const results = await mapConcurrent(
        behaviors,
        concurrency,
        (behavior) => behavior.run(bot, { signal: link.controller.signal }),
      );
      return results as BehaviorResults<Behaviors>;
    } catch (error) {
      link.controller.abort(error);
      throw error;
    } finally {
      link.dispose();
    }
  });
}

export function race<
  const Behaviors extends readonly [
    BotBehavior<unknown>,
    ...BotBehavior<unknown>[],
  ],
>(
  ...behaviors: Behaviors
): BotBehavior<BehaviorResults<Behaviors>[number]> {
  return defineBehavior(async (bot, context) => {
    const link = linkedAbortController(context?.signal);
    try {
      return await Promise.any(
        behaviors.map((behavior) =>
          behavior.run(bot, { signal: link.controller.signal })
        ),
      ) as BehaviorResults<Behaviors>[number];
    } finally {
      link.controller.abort("Behavior race completed");
      link.dispose();
    }
  });
}

export interface RepeatOptions {
  readonly times: number;
}

export function repeat<T>(
  behavior: BotBehavior<T>,
  options: RepeatOptions,
): BotBehavior<readonly T[]> {
  const times = positiveInteger(options.times, "times");
  return defineBehavior(async (bot, context) => {
    const results: T[] = [];
    for (let iteration = 0; iteration < times; iteration += 1) {
      context?.signal?.throwIfAborted();
      results.push(await behavior.run(bot, context));
    }
    return results;
  });
}

export interface RetryOptions {
  readonly attempts?: number;
  readonly delayMs?: number;
  readonly backoff?: number;
  readonly maximumDelayMs?: number;
}

export function retry<T>(
  behavior: BotBehavior<T>,
  options: RetryOptions = {},
): BotBehavior<T> {
  const attempts = positiveInteger(options.attempts ?? 3, "attempts");
  const initialDelay = nonNegativeFinite(options.delayMs ?? 0, "delayMs");
  const backoff = positiveFinite(options.backoff ?? 1, "backoff");
  const maximumDelay = nonNegativeFinite(
    options.maximumDelayMs ?? Number.MAX_SAFE_INTEGER,
    "maximumDelayMs",
  );
  return defineBehavior(async (bot, context) => {
    let delayMs = initialDelay;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      context?.signal?.throwIfAborted();
      try {
        return await behavior.run(bot, context);
      } catch (error) {
        if (attempt === attempts || context?.signal?.aborted === true) {
          throw error;
        }
        await abortableDelay(delayMs, context?.signal);
        delayMs = Math.min(delayMs * backoff, maximumDelay);
      }
    }
    throw new AssertionError("Retry loop exhausted unexpectedly");
  });
}

export function timeout<T>(
  behavior: BotBehavior<T>,
  durationMs: number,
): BotBehavior<T> {
  const duration = positiveFinite(durationMs, "durationMs");
  return defineBehavior(async (bot, context) => {
    const link = linkedAbortController(context?.signal);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutError = new SoulFireBehaviorTimeoutError(duration);
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        link.controller.abort(timeoutError);
        reject(timeoutError);
      }, duration);
    });
    try {
      return await Promise.race([
        behavior.run(bot, { signal: link.controller.signal }),
        expired,
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      link.dispose();
    }
  });
}

export interface UntilOptions {
  readonly maximumIterations?: number;
}

export type BehaviorPredicate<T> = (
  result: T,
) => boolean | Promise<boolean>;

export function until<T>(
  behavior: BotBehavior<T>,
  predicate: BehaviorPredicate<T>,
  options: UntilOptions = {},
): BotBehavior<T> {
  const maximumIterations = options.maximumIterations === undefined
    ? Number.MAX_SAFE_INTEGER
    : positiveInteger(options.maximumIterations, "maximumIterations");
  return defineBehavior(async (bot, context) => {
    for (
      let iteration = 1;
      iteration <= maximumIterations;
      iteration += 1
    ) {
      context?.signal?.throwIfAborted();
      const result = await behavior.run(bot, context);
      if (await predicate(result)) {
        return result;
      }
    }
    throw new SoulFireBehaviorError(
      "until",
      `Predicate remained false after ${maximumIterations} iterations`,
    );
  });
}

export type BotPredicate = (
  bot: SoulFireBot,
) => boolean | Promise<boolean>;

export function conditional<WhenTrue, WhenFalse = void>(
  predicate: BotPredicate,
  whenTrue: BotBehavior<WhenTrue>,
  whenFalse?: BotBehavior<WhenFalse>,
): BotBehavior<WhenTrue | WhenFalse> {
  return defineBehavior(async (bot, context) =>
    await predicate(bot)
      ? whenTrue.run(bot, context)
      : whenFalse === undefined
        ? undefined as WhenFalse
        : whenFalse.run(bot, context)
  );
}

export function fallback<T>(
  primary: BotBehavior<T>,
  ...alternatives: readonly BotBehavior<T>[]
): BotBehavior<T> {
  return defineBehavior(async (bot, context) => {
    const failures: unknown[] = [];
    for (const behavior of [primary, ...alternatives]) {
      context?.signal?.throwIfAborted();
      try {
        return await behavior.run(bot, context);
      } catch (error) {
        failures.push(error);
      }
    }
    throw new AggregateError(failures, "Every fallback behavior failed");
  });
}

export function cleanup<T>(
  behavior: BotBehavior<T>,
  finalizer: BotBehavior<unknown>,
): BotBehavior<T> {
  return defineBehavior(async (bot, context) => {
    let failure: unknown;
    try {
      return await behavior.run(bot, context);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      try {
        await finalizer.run(bot, context);
      } catch (finalizerError) {
        if (failure !== undefined) {
          throw new AggregateError(
            [failure, finalizerError],
            "Behavior and cleanup both failed",
          );
        }
        throw finalizerError;
      }
    }
  });
}

export function scopedLease<T>(
  behavior: BotBehavior<T>,
  ttlSeconds = 30,
): BotBehavior<T> {
  const ttl = positiveInteger(ttlSeconds, "ttlSeconds");
  return defineBehavior(async (bot, context) => {
    const lease = await bot.acquireControl(ttl, callOptions(context));
    try {
      return await behavior.run(bot, context);
    } finally {
      await lease.release(callOptions(context));
    }
  });
}

export interface CollectBlocksOptions {
  blockIds: readonly string[];
  tags?: readonly string[];
  count?: number;
  searchRadius?: number;
  allowPlacing?: boolean;
}

export function collectBlocks(
  options: CollectBlocksOptions,
): BotBehavior<number> {
  return defineBehavior(async (bot, context) => {
    const call = callOptions(context);
    const task = await bot.tasks.collectBlocks(options.blockIds, {
      tags: options.tags ?? [],
      count: options.count ?? 1,
      searchRadius: options.searchRadius ?? 32,
      path: {
        allowMining: true,
        allowPlacing: options.allowPlacing ?? false,
      },
      ...(call === undefined ? {} : { call }),
    });
    return (await task.result(
      call === undefined ? {} : { call },
    )).blocksBroken;
  });
}

export function followEntity(
  entityId: number,
  radius = 3,
): BotBehavior<void> {
  return defineBehavior(async (bot, context) => {
    const call = callOptions(context);
    await completeTask(bot.tasks.runFollowEntity(
      entityId,
      radius,
      {
        path: {
          allowMining: false,
          allowPlacing: false,
        },
        ...(call === undefined
          ? {}
          : { call }),
      },
    ));
  });
}

export interface AttackNearestOptions {
  entityTypes: readonly string[];
  radius?: number;
  attackRange?: number;
  sprinting?: boolean;
  maximumAttacks?: number;
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
    const call = callOptions(context);
    await completeTask(bot.tasks.runAttackEntity(
      target.entityId,
      {
        attackRange: options.attackRange ?? 3,
        sprinting: options.sprinting ?? false,
        maximumAttacks: options.maximumAttacks ?? 0,
        path: {
          allowMining: false,
          allowPlacing: false,
        },
        ...(call === undefined ? {} : { call }),
      },
    ));
    return true;
  });
}

export interface AutoEatOptions {
  foodItemIds: readonly string[];
  foodLevel?: number;
  checkIntervalTicks?: number;
  maximumMeals?: number;
  completeWhenNoFood?: boolean;
  restoreSelectedSlot?: boolean;
}

export function autoEat(options: AutoEatOptions): BotBehavior<void> {
  return defineBehavior(async (bot, context) => {
    const call = callOptions(context);
    await completeTask(
      bot.tasks.runAutoEat(options.foodItemIds, {
        foodLevel: options.foodLevel ?? 14,
        checkIntervalTicks: options.checkIntervalTicks ?? 20,
        maximumMeals: options.maximumMeals ?? 0,
        completeWhenNoFood: options.completeWhenNoFood ?? false,
        restoreSelectedSlot: options.restoreSelectedSlot ?? true,
        ...(call === undefined ? {} : { call }),
      }),
      "autoEat",
    );
  });
}

export interface AutoRespawnOptions {
  respawnDelayTicks?: number;
  maximumRespawns?: number;
}

export function autoRespawn(
  options: AutoRespawnOptions = {},
): BotBehavior<void> {
  return defineBehavior(async (bot, context) => {
    const call = callOptions(context);
    await completeTask(
      bot.tasks.runAutoRespawn({
        respawnDelayTicks: options.respawnDelayTicks ?? 0,
        maximumRespawns: options.maximumRespawns ?? 0,
        ...(call === undefined ? {} : { call }),
      }),
      "autoRespawn",
    );
  });
}

export interface AutoTotemOptions {
  checkIntervalTicks?: number;
  maximumEquips?: number;
  completeWhenNoTotem?: boolean;
  replaceOccupiedOffhand?: boolean;
}

export function autoTotem(
  options: AutoTotemOptions = {},
): BotBehavior<void> {
  return defineBehavior(async (bot, context) => {
    const call = callOptions(context);
    await completeTask(
      bot.tasks.runAutoTotem({
        checkIntervalTicks: options.checkIntervalTicks ?? 20,
        maximumEquips: options.maximumEquips ?? 0,
        completeWhenNoTotem: options.completeWhenNoTotem ?? false,
        replaceOccupiedOffhand: options.replaceOccupiedOffhand ?? false,
        ...(call === undefined ? {} : { call }),
      }),
      "autoTotem",
    );
  });
}

export interface AutoArmorOptions {
  checkIntervalTicks?: number;
  maximumEquips?: number;
  completeWhenNoUpgrade?: boolean;
}

export function autoArmor(
  options: AutoArmorOptions = {},
): BotBehavior<void> {
  return defineBehavior(async (bot, context) => {
    const call = callOptions(context);
    await completeTask(
      bot.tasks.runAutoArmor({
        checkIntervalTicks: options.checkIntervalTicks ?? 20,
        maximumEquips: options.maximumEquips ?? 0,
        completeWhenNoUpgrade: options.completeWhenNoUpgrade ?? false,
        ...(call === undefined ? {} : { call }),
      }),
      "autoArmor",
    );
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

async function completeTask(
  events: AsyncIterable<BotTaskEvent>,
  behavior = "task",
): Promise<void> {
  let last: BotTaskEvent | undefined;
  for await (const event of events) {
    last = event;
  }
  const task = last?.task;
  if (task?.status === BotTaskStatus.COMPLETED) {
    return;
  }
  throw new Error(
    task?.failure?.message
      ?? `${behavior} ended without successful completion`,
  );
}

function callOptions(context?: BehaviorContext): CallOptions | undefined {
  return context?.signal === undefined
    ? undefined
    : { signal: context.signal };
}

async function mapConcurrent<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  operation: (value: Input) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await operation(values[index] as Input);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      worker,
    ),
  );
  return results;
}

function linkedAbortController(parent?: AbortSignal): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  if (parent === undefined) {
    return { controller, dispose: () => undefined };
  }
  if (parent.aborted) {
    controller.abort(parent.reason);
    return { controller, dispose: () => undefined };
  }
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", abort, { once: true });
  return {
    controller,
    dispose: () => parent.removeEventListener("abort", abort),
  };
}

function abortableDelay(
  durationMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (durationMs === 0) {
    signal?.throwIfAborted();
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, durationMs);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
  return value;
}

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
  return value;
}

class AssertionError extends Error {
  public override readonly name = "AssertionError";
}
