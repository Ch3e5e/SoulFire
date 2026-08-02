import {
  Data,
  Effect,
  Stream,
  type Cause,
} from "effect";

import type {
  EffectSoulFireBot,
  SoulFireRpcError,
  SoulFireTaskFailed,
} from "./effect-client.js";
import {
  BlockFace,
  Hand,
} from "./generated/soulfire/bot_live_pb.js";
import type { BlockPosition } from "./generated/soulfire/common_pb.js";
import {
  BotTaskStatus,
  type BotTaskEvent,
} from "./generated/soulfire/task_pb.js";

interface SoulFireBehaviorErrorFields {
  readonly behavior: string;
  readonly message: string;
}

const SoulFireBehaviorErrorBase: new (
  args: SoulFireBehaviorErrorFields,
) => Cause.YieldableError & {
  readonly _tag: "SoulFireBehaviorError";
} & Readonly<SoulFireBehaviorErrorFields> = Data.TaggedError(
  "SoulFireBehaviorError",
)<SoulFireBehaviorErrorFields>;

export class SoulFireBehaviorError extends SoulFireBehaviorErrorBase {}

export interface BotBehavior<T = void> {
  readonly run: (
    bot: EffectSoulFireBot,
  ) => Effect.Effect<
    T,
    SoulFireRpcError | SoulFireTaskFailed | SoulFireBehaviorError
  >;
}

type BehaviorFailure =
  | SoulFireRpcError
  | SoulFireTaskFailed
  | SoulFireBehaviorError;

export type BehaviorResult<Behavior> =
  Behavior extends BotBehavior<infer Result> ? Result : never;

export type BehaviorResults<
  Behaviors extends readonly BotBehavior<unknown>[],
> = {
  readonly [Index in keyof Behaviors]: BehaviorResult<Behaviors[Index]>;
};

export function defineBehavior<T>(
  run: BotBehavior<T>["run"],
): BotBehavior<T> {
  return { run };
}

export function runBehaviors(
  bot: EffectSoulFireBot,
  behaviors: readonly BotBehavior[],
): Effect.Effect<
  void,
  SoulFireRpcError | SoulFireTaskFailed | SoulFireBehaviorError
> {
  return Effect.forEach(
    behaviors,
    (behavior) => behavior.run(bot),
    { concurrency: 1, discard: true },
  );
}

export function sequence<
  const Behaviors extends readonly BotBehavior<unknown>[],
>(
  ...behaviors: Behaviors
): BotBehavior<BehaviorResults<Behaviors>> {
  return defineBehavior((bot) =>
    Effect.forEach(
      behaviors,
      (behavior) => behavior.run(bot),
      { concurrency: 1 },
    ) as Effect.Effect<BehaviorResults<Behaviors>, BehaviorFailure>
  );
}

export interface ParallelOptions {
  readonly concurrency?: number | "unbounded";
}

export function parallel<
  const Behaviors extends readonly BotBehavior<unknown>[],
>(
  behaviors: Behaviors,
  options: ParallelOptions = {},
): BotBehavior<BehaviorResults<Behaviors>> {
  return defineBehavior((bot) =>
    Effect.forEach(
      behaviors,
      (behavior) => behavior.run(bot),
      { concurrency: options.concurrency ?? "unbounded" },
    ) as Effect.Effect<BehaviorResults<Behaviors>, BehaviorFailure>
  );
}

export function race<
  const Behaviors extends readonly [
    BotBehavior<unknown>,
    ...BotBehavior<unknown>[],
  ],
>(
  ...behaviors: Behaviors
): BotBehavior<BehaviorResults<Behaviors>[number]> {
  return defineBehavior((bot) =>
    Effect.raceAll(
      behaviors.map((behavior) => behavior.run(bot)),
    ) as Effect.Effect<
      BehaviorResults<Behaviors>[number],
      BehaviorFailure
    >
  );
}

export interface RepeatOptions {
  readonly times: number;
}

export function repeat<T>(
  behavior: BotBehavior<T>,
  options: RepeatOptions,
): BotBehavior<readonly T[]> {
  const times = positiveInteger(options.times, "times");
  return defineBehavior((bot) =>
    Effect.forEach(
      Array.from({ length: times }),
      () => behavior.run(bot),
      { concurrency: 1 },
    )
  );
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
  return defineBehavior((bot) => {
    const runAttempt = (
      attempt: number,
      delay: number,
    ): Effect.Effect<T, BehaviorFailure> =>
      behavior.run(bot).pipe(
        Effect.catchAll((error) => {
          if (attempt >= attempts) {
            return Effect.fail(error);
          }
          const nextDelay = Math.min(delay * backoff, maximumDelay);
          const next = Effect.suspend(() =>
            runAttempt(attempt + 1, nextDelay)
          );
          return delay === 0
            ? next
            : Effect.sleep(`${delay} millis`).pipe(Effect.zipRight(next));
        }),
      );
    return runAttempt(1, initialDelay);
  });
}

export function timeout<T>(
  behavior: BotBehavior<T>,
  durationMs: number,
): BotBehavior<T> {
  const duration = positiveFinite(durationMs, "durationMs");
  return defineBehavior((bot) =>
    behavior.run(bot).pipe(
      Effect.timeoutFail({
        duration: `${duration} millis`,
        onTimeout: () => new SoulFireBehaviorError({
          behavior: "timeout",
          message: `Behavior exceeded ${duration} ms`,
        }),
      }),
    )
  );
}

export interface UntilOptions {
  readonly maximumIterations?: number;
}

export type BehaviorPredicate<T> = (
  result: T,
) => boolean | Effect.Effect<boolean, BehaviorFailure>;

export function until<T>(
  behavior: BotBehavior<T>,
  predicate: BehaviorPredicate<T>,
  options: UntilOptions = {},
): BotBehavior<T> {
  const maximumIterations = options.maximumIterations === undefined
    ? Number.MAX_SAFE_INTEGER
    : positiveInteger(options.maximumIterations, "maximumIterations");
  return defineBehavior((bot) => {
    const loop = (iteration: number): Effect.Effect<T, BehaviorFailure> =>
      behavior.run(bot).pipe(
        Effect.flatMap((result) => {
          const decision = predicate(result);
          const checked = Effect.isEffect(decision)
            ? decision
            : Effect.succeed(decision);
          return checked.pipe(
            Effect.flatMap((done) => {
              if (done) {
                return Effect.succeed(result);
              }
              if (iteration >= maximumIterations) {
                return Effect.fail(new SoulFireBehaviorError({
                  behavior: "until",
                  message:
                    `Predicate remained false after ${maximumIterations} iterations`,
                }));
              }
              return Effect.suspend(() => loop(iteration + 1));
            }),
          );
        }),
      );
    return loop(1);
  });
}

export type BotPredicate = (
  bot: EffectSoulFireBot,
) => boolean | Effect.Effect<boolean, BehaviorFailure>;

export function conditional<WhenTrue, WhenFalse = void>(
  predicate: BotPredicate,
  whenTrue: BotBehavior<WhenTrue>,
  whenFalse?: BotBehavior<WhenFalse>,
): BotBehavior<WhenTrue | WhenFalse> {
  return defineBehavior((bot) => {
    const decision = predicate(bot);
    const checked: Effect.Effect<boolean, BehaviorFailure> =
      Effect.isEffect(decision)
      ? decision as Effect.Effect<boolean, BehaviorFailure>
      : Effect.succeed(decision);
    return checked.pipe(
      Effect.flatMap((matches) =>
        matches
          ? whenTrue.run(bot).pipe(
            Effect.map((value): WhenTrue | WhenFalse => value),
          )
          : whenFalse === undefined
            ? Effect.succeed(undefined as WhenFalse)
            : whenFalse.run(bot).pipe(
              Effect.map((value): WhenTrue | WhenFalse => value),
            )
      ),
    );
  });
}

export function fallback<T>(
  primary: BotBehavior<T>,
  ...alternatives: readonly BotBehavior<T>[]
): BotBehavior<T> {
  return defineBehavior((bot) =>
    alternatives.reduce(
      (current, alternative) =>
        current.pipe(Effect.orElse(() => alternative.run(bot))),
      primary.run(bot),
    )
  );
}

export function cleanup<T>(
  behavior: BotBehavior<T>,
  finalizer: BotBehavior<unknown>,
): BotBehavior<T> {
  return defineBehavior((bot) =>
    behavior.run(bot).pipe(
      Effect.ensuring(finalizer.run(bot).pipe(Effect.ignore)),
    )
  );
}

export function scopedLease<T>(
  behavior: BotBehavior<T>,
  ttlSeconds = 30,
): BotBehavior<T> {
  const ttl = positiveInteger(ttlSeconds, "ttlSeconds");
  return defineBehavior((bot) =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* bot.acquireControlScoped(ttl);
        return yield* behavior.run(bot);
      }),
    )
  );
}

export interface CollectBlocksOptions {
  readonly blockIds: readonly string[];
  readonly tags?: readonly string[];
  readonly count?: number;
  readonly searchRadius?: number;
  readonly allowPlacing?: boolean;
  readonly requireLineOfSight?: boolean;
  readonly targetYRange?: Readonly<{
    minimum?: number;
    maximum?: number;
  }>;
}

export function collectBlocks(
  options: CollectBlocksOptions,
): BotBehavior<number> {
  return defineBehavior((bot) =>
    Effect.gen(function* () {
      const task = yield* bot.tasks.collectBlocks(options.blockIds, {
        tags: options.tags ?? [],
        count: options.count ?? 1,
        searchRadius: options.searchRadius ?? 32,
        requireLineOfSight: options.requireLineOfSight ?? false,
        ...(options.targetYRange === undefined
          ? {}
          : { targetYRange: options.targetYRange }),
        path: {
          allowMining: true,
          allowPlacing: options.allowPlacing ?? false,
        },
      });
      return (yield* task.result()).blocksBroken;
    })
  );
}

export function followEntity(
  entityId: number,
  radius = 3,
): BotBehavior<void> {
  return defineBehavior((bot) =>
    completeTask(
      bot.tasks.runFollowEntity(
        entityId,
        radius,
        {
          path: {
            allowMining: false,
            allowPlacing: false,
          },
        },
      ),
    )
  );
}

export interface AttackNearestOptions {
  readonly entityTypes: readonly string[];
  readonly radius?: number;
  readonly attackRange?: number;
  readonly sprinting?: boolean;
  readonly maximumAttacks?: number;
}

export function attackNearest(
  options: AttackNearestOptions,
): BotBehavior<boolean> {
  return defineBehavior((bot) =>
    Effect.gen(function* () {
      const response = yield* bot.listNearbyEntities({
        entityTypes: [...options.entityTypes],
        includePlayers: false,
        radius: options.radius ?? 32,
      });
      const target = response.entities[0];
      if (target === undefined) {
        return false;
      }
      yield* completeTask(bot.tasks.runAttackEntity(
        target.entityId,
        {
          attackRange: options.attackRange ?? 3,
          sprinting: options.sprinting ?? false,
          maximumAttacks: options.maximumAttacks ?? 0,
          path: {
            allowMining: false,
            allowPlacing: false,
          },
        },
      ));
      return true;
    })
  );
}

export interface AutoEatOptions {
  readonly foodItemIds: readonly string[];
  readonly foodLevel?: number;
  readonly checkIntervalTicks?: number;
  readonly maximumMeals?: number;
  readonly completeWhenNoFood?: boolean;
  readonly restoreSelectedSlot?: boolean;
}

export function autoEat(options: AutoEatOptions): BotBehavior<void> {
  return defineBehavior((bot) =>
    completeTask(
      bot.tasks.runAutoEat(options.foodItemIds, {
        foodLevel: options.foodLevel ?? 14,
        checkIntervalTicks: options.checkIntervalTicks ?? 20,
        maximumMeals: options.maximumMeals ?? 0,
        completeWhenNoFood: options.completeWhenNoFood ?? false,
        restoreSelectedSlot: options.restoreSelectedSlot ?? true,
      }),
      "autoEat",
    )
  );
}

export interface AutoRespawnOptions {
  readonly respawnDelayTicks?: number;
  readonly maximumRespawns?: number;
}

export function autoRespawn(
  options: AutoRespawnOptions = {},
): BotBehavior<void> {
  return defineBehavior((bot) =>
    completeTask(
      bot.tasks.runAutoRespawn({
        respawnDelayTicks: options.respawnDelayTicks ?? 0,
        maximumRespawns: options.maximumRespawns ?? 0,
      }),
      "autoRespawn",
    )
  );
}

export interface AutoTotemOptions {
  readonly checkIntervalTicks?: number;
  readonly maximumEquips?: number;
  readonly completeWhenNoTotem?: boolean;
  readonly replaceOccupiedOffhand?: boolean;
}

export function autoTotem(
  options: AutoTotemOptions = {},
): BotBehavior<void> {
  return defineBehavior((bot) =>
    completeTask(
      bot.tasks.runAutoTotem({
        checkIntervalTicks: options.checkIntervalTicks ?? 20,
        maximumEquips: options.maximumEquips ?? 0,
        completeWhenNoTotem: options.completeWhenNoTotem ?? false,
        replaceOccupiedOffhand: options.replaceOccupiedOffhand ?? false,
      }),
      "autoTotem",
    )
  );
}

export interface AutoArmorOptions {
  readonly checkIntervalTicks?: number;
  readonly maximumEquips?: number;
  readonly completeWhenNoUpgrade?: boolean;
}

export function autoArmor(
  options: AutoArmorOptions = {},
): BotBehavior<void> {
  return defineBehavior((bot) =>
    completeTask(
      bot.tasks.runAutoArmor({
        checkIntervalTicks: options.checkIntervalTicks ?? 20,
        maximumEquips: options.maximumEquips ?? 0,
        completeWhenNoUpgrade: options.completeWhenNoUpgrade ?? false,
      }),
      "autoArmor",
    )
  );
}

export interface BuildPlacement {
  readonly against: BlockPosition;
  readonly face: BlockFace;
  readonly hotbarSlot?: number;
}

export function build(
  placements: readonly BuildPlacement[],
): BotBehavior<number> {
  return defineBehavior((bot) =>
    Effect.gen(function* () {
      let placed = 0;
      for (const placement of placements) {
        if (placement.hotbarSlot !== undefined) {
          yield* bot.selectHotbar(placement.hotbarSlot);
        }
        yield* bot.placeBlock({
          against: placement.against,
          face: placement.face,
          hand: Hand.MAIN,
        });
        placed += 1;
      }
      return placed;
    })
  );
}

function completeTask(
  events: Stream.Stream<BotTaskEvent, SoulFireRpcError>,
  behavior = "task",
): Effect.Effect<void, SoulFireRpcError | SoulFireBehaviorError> {
  return Stream.runFold(
    events,
    undefined as BotTaskEvent | undefined,
    (_, event) => event,
  ).pipe(
    Effect.flatMap((last) => {
      const task = last?.task;
      if (task?.status === BotTaskStatus.COMPLETED) {
        return Effect.void;
      }
      return Effect.fail(new SoulFireBehaviorError({
        behavior,
        message: task?.failure?.message
          ?? `${behavior} ended without successful completion`,
      }));
    }),
  );
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
