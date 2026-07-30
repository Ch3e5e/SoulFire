import type { SoulFireBot } from "@soulfiremc/sdk";
import {
  Deferred,
  Effect,
  Fiber,
  Ref,
  Stream,
  type Scope,
} from "effect";

import {
  acquire,
  activateEndPortal,
  attackEntity,
  attackNearest,
  buildNetherPortal,
  buildStructure,
  castNetherPortal,
  collectDragonEgg,
  collectBlocks,
  collectNearbyDrops,
  craftItem,
  eatWhenNeeded,
  enterEndPortal,
  enterPortal,
  equipBestArmor,
  exitEnd,
  excavateStaircase,
  explore,
  flee,
  fightEnderDragon,
  respawnAndRecover,
  smelt,
  throwEyeOfEnder,
  transferContainerItems,
} from "./behaviors.js";
import { ReplayBroadcast } from "./broadcast.js";
import {
  InMemoryBeatGameCoordinator,
  type BeatGameCoordinator,
} from "./coordinator.js";
import {
  makeSoulFireBeatGameDriver,
  type BeatGameDriver,
} from "./driver.js";
import {
  BeatGameActionError,
  BeatGameCancelled,
  BeatGameDriverError,
  BeatGameObservationError,
  BeatGamePathfindingError,
  BeatGameProtocolError,
  BeatGameRequirementError,
  type BeatGameError,
} from "./errors.js";
import {
  distanceSquared,
  NETHER_PORTAL_FRAME_OBSIDIAN_COUNT,
  rotationToward,
  triangulateStronghold,
} from "./geometry.js";
import {
  BEAT_GAME_CHECKPOINT_SCHEMA_VERSION,
  BeatGamePhase,
  BeatGameRunStatus,
  BeatGameTeamRole,
  PortalStrategy,
  defaultBeatGameStrategy,
  emptyBeatGameWorldMemory,
  type BeatGameBlockPosition,
  type BeatGameBlockObservation,
  type BeatGameCheckpoint,
  type BeatGameClaim,
  type BeatGameEntityObservation,
  type BeatGameEvent,
  type BeatGameItemRequirement,
  type BeatGameObservation,
  type BeatGameOptions,
  type BeatGamePlannerState,
  type BeatGameResult,
  type BeatGamePosition,
  type BeatGameSnapshot,
  type BeatGameStrategy,
  type BeatGameStrategyOptions,
  type BeatGameTeamRunOptions,
} from "./model.js";
import {
  decideBeatGameAction,
  isEnd,
  isNether,
  objectiveForPhase,
  plannerWithObservation,
  type BeatGamePlannerDecision,
} from "./planner.js";
import type {
  BeatGamePolicyContext,
  BeatGameStrategyHooks,
} from "./policy.js";
import {
  COOKED_FOOD_ITEM_IDS,
  EDIBLE_FOOD_ITEM_IDS,
  EMERGENCY_FOOD_ITEM_IDS,
  LOG_ITEM_IDS,
  PLANK_ITEM_IDS,
  RAW_FOOD_TO_COOKED,
  requirementCount,
} from "./requirements.js";
import {
  assertValidCheckpoint,
  InMemoryBeatGameCheckpointStore,
  type BeatGameCheckpointStore,
} from "./stores.js";

type EventInput<T extends BeatGameEvent = BeatGameEvent> =
  T extends BeatGameEvent
    ? Omit<T, "sequence" | "timestamp" | "runId" | "instanceId" | "botId"
      | "phase">
    : never;

const WORKSTATION_REUSE_RADIUS = 32;
const DISPOSABLE_DEATH_RECOVERY_ITEM_IDS = new Set([
  "minecraft:coarse_dirt",
  "minecraft:dirt",
  "minecraft:grass_block",
  "minecraft:mud",
  "minecraft:mycelium",
  "minecraft:podzol",
  "minecraft:rooted_dirt",
]);
const FURNACE_FUEL_SEARCH_RADIUS = 16;
const HUNT_ATTACK_APPROACH_RADIUS = 24;
const HUNT_MAXIMUM_APPROACH_DISTANCE = 48;
const EXPLORATION_REANCHOR_DISTANCE = 16;
const AIR_ESCAPE_SURFACE_SEARCH_RADIUS = 16;
const AIR_ESCAPE_SURFACE_APPROACH_ATTEMPTS = 60;
const AIR_ESCAPE_STAGNANT_OBSERVATIONS = 10;
const AIR_ESCAPE_DIRECTION_SECTORS = 8;
const COAL_ORE_BLOCK_IDS = [
  "minecraft:coal_ore",
  "minecraft:deepslate_coal_ore",
] as const;
const FURNACE_FUEL_ITEM_IDS = [
  "minecraft:coal",
  "minecraft:charcoal",
] as const;
const RESOURCE_COLLECTION_BUFFERS = {
  "blaze-rods": 2,
  cobblestone: 12,
  diamond: 2,
  "ender-pearls": 2,
  food: 4,
  fuel: 2,
  gold: 8,
  iron: 3,
  logs: 4,
} as const;
type BufferedResource = keyof typeof RESOURCE_COLLECTION_BUFFERS;

const DANGEROUS_NEUTRAL_ENTITY_TYPES = [
  "minecraft:bee",
  "minecraft:dolphin",
  "minecraft:goat",
  "minecraft:iron_golem",
  "minecraft:llama",
  "minecraft:panda",
  "minecraft:polar_bear",
  "minecraft:trader_llama",
  "minecraft:wolf",
] as const;
const PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES = new Set([
  "minecraft:blaze",
  "minecraft:bogged",
  "minecraft:breeze",
  "minecraft:cave_spider",
  "minecraft:drowned",
  "minecraft:elder_guardian",
  "minecraft:endermite",
  "minecraft:evoker",
  "minecraft:guardian",
  "minecraft:hoglin",
  "minecraft:husk",
  "minecraft:magma_cube",
  "minecraft:phantom",
  "minecraft:piglin_brute",
  "minecraft:pillager",
  "minecraft:ravager",
  "minecraft:shulker",
  "minecraft:silverfish",
  "minecraft:slime",
  "minecraft:spider",
  "minecraft:stray",
  "minecraft:vex",
  "minecraft:vindicator",
  "minecraft:witch",
  "minecraft:wither_skeleton",
  "minecraft:zoglin",
  "minecraft:zombie",
  "minecraft:zombie_villager",
]);
const SHIELD_BLOCKING_HOSTILE_ENTITY_TYPES = new Set([
  "minecraft:bogged",
  "minecraft:drowned",
  "minecraft:pillager",
  "minecraft:skeleton",
  "minecraft:stray",
]);
const PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES = new Set([
  "minecraft:bogged",
  "minecraft:pillager",
  "minecraft:skeleton",
  "minecraft:stray",
]);
const ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES = new Set([
  "minecraft:creeper",
  "minecraft:enderman",
]);
const PROACTIVE_CREEPER_EVASION_RADIUS = 12;
const MINIMUM_SAFE_AIR_TICKS = 200;

export interface BeatGameRun {
  readonly id: string;
  readonly teamId: string;
  readonly instanceId: string;
  readonly botId: string;
  readonly events: Stream.Stream<BeatGameEvent, BeatGameError>;
  readonly snapshots: Stream.Stream<BeatGameSnapshot, BeatGameError>;
  readonly awaitCompletion: Effect.Effect<BeatGameResult, BeatGameError>;
  readonly pause: Effect.Effect<void, BeatGameError>;
  readonly resume: Effect.Effect<void, BeatGameError>;
  readonly stop: Effect.Effect<void, BeatGameError>;
  readonly snapshot: Effect.Effect<BeatGameSnapshot, BeatGameError>;
}

export interface BeatGameTeamRun {
  readonly teamId: string;
  readonly runs: readonly BeatGameRun[];
  readonly awaitCompletion: Effect.Effect<
    readonly BeatGameResult[],
    BeatGameError
  >;
  readonly pause: Effect.Effect<void, BeatGameError>;
  readonly resume: Effect.Effect<void, BeatGameError>;
  readonly stop: Effect.Effect<void, BeatGameError>;
}

interface RunState {
  readonly driver: BeatGameDriver;
  readonly store: BeatGameCheckpointStore;
  readonly coordinator: BeatGameCoordinator;
  readonly strategy: BeatGameStrategy;
  readonly hooks: BeatGameStrategyHooks;
  readonly checkpoint: Ref.Ref<BeatGameCheckpoint>;
  readonly observation: Ref.Ref<BeatGameObservation>;
  readonly lastLivingObservation: Ref.Ref<BeatGameObservation>;
  readonly pendingDeaths: Ref.Ref<readonly PendingDeath[]>;
  readonly explorationFrontiers: Ref.Ref<
    Readonly<Record<string, ExplorationFrontier>>
  >;
  readonly checkedRecoveryContainers: Ref.Ref<ReadonlySet<string>>;
  readonly paused: Ref.Ref<boolean>;
  readonly stopped: Deferred.Deferred<void>;
  readonly checkpointMutex: Effect.Semaphore;
  readonly eventMutex: Effect.Semaphore;
  readonly events: ReplayBroadcast<BeatGameEvent>;
  readonly snapshots: ReplayBroadcast<BeatGameSnapshot>;
  readonly sequence: Ref.Ref<bigint>;
  readonly startedAtMs: number;
}

interface ExplorationFrontier {
  readonly origin: BeatGamePosition;
  readonly nextIndex: number;
  readonly lastPosition?: BeatGamePosition;
}

interface PendingDeath {
  readonly observedAt: string;
  readonly position: BeatGamePosition;
  readonly recoverItems: boolean;
  readonly message?: string;
}

interface ActionResult {
  readonly checkpoint?: (
    checkpoint: BeatGameCheckpoint,
  ) => BeatGameCheckpoint;
  readonly phase?: BeatGamePhase;
  readonly replanReason?: string;
  readonly defenseTarget?: BeatGameEntityObservation;
  readonly escapeTarget?: BeatGameEntityObservation;
  readonly airEscapePosition?: BeatGamePosition;
}

interface ImmediateThreat {
  readonly target: BeatGameEntityObservation;
  readonly response: "attack" | "flee";
}

export function beatGame(
  bot: SoulFireBot,
  options: BeatGameOptions = {},
): Effect.Effect<BeatGameRun, BeatGameError, Scope.Scope> {
  return beatGameWithDriver(makeSoulFireBeatGameDriver(bot), options);
}

export function beatGameWithDriver(
  driver: BeatGameDriver,
  options: BeatGameOptions = {},
): Effect.Effect<BeatGameRun, BeatGameError, Scope.Scope> {
  return Effect.gen(function* () {
    const runId = options.runId ?? crypto.randomUUID();
    const teamId = options.team?.teamId ?? runId;
    const store = options.checkpointStore
      ?? new InMemoryBeatGameCheckpointStore();
    const coordinator = options.coordinator
      ?? new InMemoryBeatGameCoordinator();
    const strategy = yield* Effect.try({
      try: () => mergeStrategy(options.strategy),
      catch: (cause) =>
        new BeatGameProtocolError({
          runId,
          instanceId: driver.instanceId,
          botId: driver.botId,
          phase: BeatGamePhase.PREPARE_OVERWORLD,
          action: "configure",
          retryable: false,
          message: cause instanceof Error
            ? cause.message
            : "Beat-game strategy configuration is invalid",
          cause,
        }),
    });
    const observation = yield* driver.observe.pipe(
      Effect.mapError((cause) =>
        observationError(
          runId,
          driver,
          BeatGamePhase.PREPARE_OVERWORLD,
          cause,
        )
      ),
    );
    const restored = yield* store.load(runId);
    yield* Effect.try({
      try: () => validateRestoredCheckpoint(restored, driver, teamId),
      catch: (cause) =>
        new BeatGameProtocolError({
          runId,
          instanceId: driver.instanceId,
          botId: driver.botId,
          phase: BeatGamePhase.PREPARE_OVERWORLD,
          action: "restore-checkpoint",
          retryable: false,
          message: cause instanceof Error
            ? cause.message
            : "The restored checkpoint is invalid",
          cause,
        }),
    });
    const member = yield* coordinator.register({
      teamId,
      instanceId: driver.instanceId,
      botId: driver.botId,
      ...(options.team?.role === undefined
        ? {}
        : { requestedRole: options.team.role }),
    });
    const initial = restored ?? createInitialCheckpoint(
      runId,
      teamId,
      driver,
      member.role,
      observation,
      strategy,
    );
    const stored = restored ?? (yield* store.save(initial, undefined));
    const checkpointRef = yield* Ref.make(stored);
    const observationRef = yield* Ref.make(observation);
    const lastLivingObservation = yield* Ref.make(observation);
    const pendingDeaths = yield* Ref.make<readonly PendingDeath[]>([]);
    const explorationFrontiers = yield* Ref.make<
      Readonly<Record<string, ExplorationFrontier>>
    >({});
    const checkedRecoveryContainers = yield* Ref.make<ReadonlySet<string>>(
      new Set(),
    );
    const paused = yield* Ref.make(false);
    const stopped = yield* Deferred.make<void>();
    const checkpointMutex = yield* Effect.makeSemaphore(1);
    const eventMutex = yield* Effect.makeSemaphore(1);
    const events = new ReplayBroadcast<BeatGameEvent>(128);
    const snapshots = new ReplayBroadcast<BeatGameSnapshot>(1);
    const sequence = yield* Ref.make(0n);
    const state: RunState = {
      driver,
      store,
      coordinator,
      strategy,
      hooks: options.hooks ?? {},
      checkpoint: checkpointRef,
      observation: observationRef,
      lastLivingObservation,
      pendingDeaths,
      explorationFrontiers,
      checkedRecoveryContainers,
      paused,
      stopped,
      checkpointMutex,
      eventMutex,
      events,
      snapshots,
      sequence,
      startedAtMs: Date.now(),
    };
    yield* publishSnapshot(state);
    yield* emit(state, restored === undefined
      ? { type: "run-started" }
      : { type: "checkpoint-restored", revision: restored.revision });
    if (restored !== undefined) {
      yield* emit(state, { type: "run-started" });
    }
    yield* emit(state, {
      type: "team-role-changed",
      role: member.role,
    });
    for (const requirement of stored.planner.requirements) {
      yield* emit(state, {
        type: "requirement-discovered",
        requirement,
      });
    }

    yield* Effect.forkScoped(monitorDriverEvents(state));
    const runtime = runLoop(state).pipe(
      Effect.ensuring(
        Effect.all([
          coordinator.unregister(teamId, driver.botId).pipe(Effect.ignore),
          events.end(),
          snapshots.end(),
        ], { discard: true }),
      ),
    );
    const fiber = yield* Effect.forkScoped(runtime);

    const changeStatus = (
      status: BeatGameRunStatus,
      event: EventInput,
    ): Effect.Effect<void, BeatGameError> =>
      Effect.gen(function* () {
        const checkpoint = yield* persist(state, (current) => ({
          ...current,
          planner: {
            ...current.planner,
            status,
            updatedAt: new Date().toISOString(),
          },
        }));
        yield* coordinator.updateMember(
          teamId,
          driver.botId,
          checkpoint.planner.phase,
          status,
        );
        yield* emit(state, event);
      });

    return {
      id: runId,
      teamId,
      instanceId: driver.instanceId,
      botId: driver.botId,
      events: events.stream,
      snapshots: snapshots.stream,
      awaitCompletion: Fiber.join(fiber),
      pause: Ref.get(paused).pipe(
        Effect.flatMap((isPaused) =>
          isPaused
            ? Effect.void
            : Ref.set(paused, true).pipe(
              Effect.zipRight(changeStatus(
                BeatGameRunStatus.PAUSED,
                { type: "run-paused" },
              )),
            )
        ),
      ),
      resume: Ref.get(paused).pipe(
        Effect.flatMap((isPaused) =>
          !isPaused
            ? Effect.void
            : Ref.set(paused, false).pipe(
              Effect.zipRight(changeStatus(
                BeatGameRunStatus.RUNNING,
                { type: "run-resumed" },
              )),
            )
        ),
      ),
      stop: Deferred.isDone(stopped).pipe(
        Effect.flatMap((isStopped) =>
          isStopped
            ? Effect.void
            : Ref.set(paused, false).pipe(
              Effect.zipRight(changeStatus(
                BeatGameRunStatus.STOPPED,
                { type: "run-stopped" },
              )),
              Effect.zipRight(Deferred.succeed(stopped, undefined)),
              Effect.asVoid,
            )
        ),
      ),
      snapshot: currentSnapshot(state),
    };
  });
}

export function beatGameTeam(
  bots: readonly SoulFireBot[],
  options: BeatGameTeamRunOptions = {},
): Effect.Effect<BeatGameTeamRun, BeatGameError, Scope.Scope> {
  return beatGameTeamWithDrivers(
    bots.map(makeSoulFireBeatGameDriver),
    options,
  );
}

export function beatGameTeamWithDrivers(
  drivers: readonly BeatGameDriver[],
  options: BeatGameTeamRunOptions = {},
): Effect.Effect<BeatGameTeamRun, BeatGameError, Scope.Scope> {
  if (drivers.length === 0) {
    return Effect.die(
      new RangeError("beatGameTeamWithDrivers needs at least one driver"),
    );
  }
  return Effect.gen(function* () {
    const teamId = options.teamId ?? crypto.randomUUID();
    const store = options.checkpointStore
      ?? new InMemoryBeatGameCheckpointStore();
    const coordinator = options.coordinator
      ?? new InMemoryBeatGameCoordinator();
    const runs = yield* Effect.all(
      drivers.map((driver, index) =>
        beatGameWithDriver(driver, {
          runId: `${teamId}-${driver.botId}`,
          team: {
            teamId,
            role: roleForIndex(index),
          },
          ...(options.strategy === undefined
            ? {}
            : { strategy: options.strategy }),
          checkpointStore: store,
          coordinator,
          ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
        })
      ),
      { concurrency: "unbounded" },
    );
    return {
      teamId,
      runs,
      awaitCompletion: Effect.all(
        runs.map(({ awaitCompletion }) => awaitCompletion),
        { concurrency: "unbounded" },
      ),
      pause: Effect.all(runs.map(({ pause }) => pause), {
        concurrency: "unbounded",
        discard: true,
      }),
      resume: Effect.all(runs.map(({ resume }) => resume), {
        concurrency: "unbounded",
        discard: true,
      }),
      stop: Effect.all(runs.map(({ stop }) => stop), {
        concurrency: "unbounded",
        discard: true,
      }),
    };
  });
}

function runLoop(
  state: RunState,
): Effect.Effect<BeatGameResult, BeatGameError> {
  return Effect.gen(function* () {
    yield* persist(state, (checkpoint) => ({
      ...checkpoint,
      planner: {
        ...checkpoint.planner,
        status: BeatGameRunStatus.RUNNING,
        updatedAt: new Date().toISOString(),
      },
    }));
    for (;;) {
      yield* awaitRunnable(state);
      const observation = yield* cancellable(
        state,
        observeWithRecovery(state),
      );
      let checkpoint = yield* Ref.get(state.checkpoint);
      const previousRequirements = new Map(
        checkpoint.planner.requirements.map((requirement) => [
          requirement.key,
          requirement,
        ]),
      );
      checkpoint = yield* persist(state, (current) => ({
        ...current,
        connectionEpoch: observation.player.connectionEpoch,
        planner: plannerWithObservation(
          current.planner,
          observation,
          state.strategy,
        ),
      }));
      yield* emit(state, {
        type: "observation-recorded",
        observedAt: observation.observedAt,
        connectionEpoch: observation.player.connectionEpoch,
        playerRevision: observation.player.revision.toString(),
        inventoryRevision: observation.inventory.revision.toString(),
      });
      checkpoint = yield* mergeSharedDiscoveries(state, checkpoint);
      for (const requirement of checkpoint.planner.requirements) {
        const previous = previousRequirements.get(requirement.key);
        if (
          previous?.currentCount !== requirement.currentCount
          || previous?.targetCount !== requirement.targetCount
          || previous?.satisfied !== requirement.satisfied
        ) {
          yield* emit(
            state,
            {
              type: previous === undefined
                ? "requirement-discovered"
                : requirement.satisfied && !previous.satisfied
                ? "requirement-satisfied"
                : "requirement-updated",
              requirement,
            },
          );
        }
        yield* state.coordinator.publishRequirement(
          checkpoint.teamId,
          checkpoint.botId,
          requirement.key,
          Math.max(0, requirement.targetCount - requirement.currentCount),
        );
      }
      if (checkpoint.planner.phase === BeatGamePhase.COMPLETE) {
        return yield* completeRun(state);
      }
      const decision = decideBeatGameAction({
        checkpoint,
        observation,
        strategy: state.strategy,
      });
      if (decision.type === "advance-phase") {
        yield* advancePhase(state, decision.to);
        continue;
      }
      const claim = yield* claimAction(state, decision);
      if (claim === undefined) {
        yield* Effect.sleep(state.strategy.observationPollMs);
        continue;
      }
      yield* runDecisionWithRetry(state, decision, observation).pipe(
        Effect.ensuring(releaseActionClaim(state, claim)),
      );
    }
    return yield* Effect.die(
      new Error("The beat-game loop ended without a terminal phase"),
    );
  }).pipe(
    Effect.catchAll((
      error,
    ): Effect.Effect<never, BeatGameError> =>
      error instanceof BeatGameCancelled
        ? Effect.fail(error)
        : markFailed(state, error).pipe(
          Effect.zipRight(Effect.fail(error)),
        )
    ),
  );
}

function runDecisionWithRetry(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  firstObservation: BeatGameObservation,
): Effect.Effect<void, BeatGameError> {
  const action = decision.action;
  const maximumAttempts = state.strategy.maximumActionRetries + 1;
  const attempt = (
    number: number,
    observation: BeatGameObservation,
  ): Effect.Effect<void, BeatGameError> =>
    Effect.gen(function* () {
      yield* emit(state, {
        type: number === 1 ? "action-started" : "action-retried",
        action,
        attempt: number,
      });
      const actionCheckpoint = yield* persist(state, (checkpoint) => ({
        ...checkpoint,
        planner: {
          ...checkpoint.planner,
          currentAction: action,
          currentActionId:
            number === 1
              && checkpoint.planner.currentAction === action
              && checkpoint.planner.currentActionId !== undefined
              ? checkpoint.planner.currentActionId
              : crypto.randomUUID(),
          retryCount: number - 1,
          updatedAt: new Date().toISOString(),
        },
      }));
      const result = yield* cancellable(
        state,
        executeDecision(
          state,
          decision,
          observation,
          actionCheckpoint,
        ),
      ).pipe(
        Effect.timeoutFail({
          duration: state.strategy.actionTimeoutMs,
          onTimeout: () => actionError(
            actionCheckpoint,
            `Action ${action} timed out`,
            true,
          ),
        }),
        Effect.catchAll((error) =>
          number < maximumAttempts && retryable(error)
            ? Effect.gen(function* () {
              yield* emit(state, {
                type: "action-failed",
                action,
                attempt: number,
                detail: error.message,
              });
              yield* Effect.sleep(backoffDuration(number));
              const fresh = yield* observeFresh(state);
              if (actionObservedComplete(
                decision,
                fresh,
                state.strategy,
              )) {
                yield* persist(state, (checkpoint) => ({
                  ...checkpoint,
                  connectionEpoch: fresh.player.connectionEpoch,
                  lastStableAction: stableActionResult(
                    action,
                    actionCheckpoint,
                    fresh,
                    "OBSERVATION_AFTER_UNCERTAIN_RESULT",
                  ),
                  planner: withoutCurrentAction({
                    ...plannerWithObservation(
                      checkpoint.planner,
                      fresh,
                      state.strategy,
                    ),
                    retryCount: 0,
                    completedActions: [
                      ...checkpoint.planner.completedActions,
                      action,
                    ].slice(-128),
                  }),
                }));
                yield* emit(state, {
                  type: "action-succeeded",
                  action,
                  attempt: number,
                  detail:
                    "A fresh observation confirmed the action before retry",
                });
                return;
              }
              return yield* attempt(number + 1, fresh);
            })
            : Effect.fail(error)
        ),
      );
      if (result === undefined) {
        return;
      }
      if (result.replanReason !== undefined) {
        yield* persist(state, (checkpoint) => ({
          ...checkpoint,
          planner: withoutCurrentAction({
            ...checkpoint.planner,
            retryCount: 0,
            updatedAt: new Date().toISOString(),
          }),
        }));
        yield* emit(state, {
          type: "action-failed",
          action,
          attempt: number,
          detail: `Interrupted for replanning: ${result.replanReason}`,
        });
        return;
      }
      if (result.phase !== undefined) {
        yield* advancePhase(state, result.phase);
      }
      if (decision.type === "recover-death") {
        yield* completePendingDeath(state, observation.observedAt);
      }
      const latestObservation = yield* Ref.get(state.observation);
      yield* persist(state, (checkpoint) => {
        const transformed = result.checkpoint?.(checkpoint) ?? checkpoint;
        return {
          ...transformed,
          lastStableAction: stableActionResult(
            action,
            actionCheckpoint,
            latestObservation,
            result.phase === undefined ? "TASK_RESULT" : "OBSERVED_STATE",
          ),
          planner: withoutCurrentAction({
            ...transformed.planner,
            retryCount: 0,
            completedActions: [
              ...transformed.planner.completedActions,
              action,
            ].slice(-128),
            updatedAt: new Date().toISOString(),
          }),
        };
      });
      yield* emit(state, {
        type: "action-succeeded",
        action,
        attempt: number,
      });
    });
  return attempt(1, firstObservation);
}

function executeDecision(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  observation: BeatGameObservation,
  actionCheckpoint: BeatGameCheckpoint,
): Effect.Effect<ActionResult, BeatGameError> {
  state = {
    ...state,
    driver: withTaskIdempotency(
      state.driver,
      actionCheckpoint.planner.currentActionId ?? crypto.randomUUID(),
      new Date(Date.now() + state.strategy.actionTimeoutMs),
      stableFingerprint({
        connectionEpoch: observation.player.connectionEpoch,
        playerRevision: observation.player.revision.toString(),
        inventoryRevision: observation.inventory.revision.toString(),
      }),
    ),
  };
  const policyContext = policyContextFor(
    state,
    observation,
    actionCheckpoint,
  );
  const execute: Effect.Effect<
    ActionResult,
    unknown
  > = (() => {
    switch (decision.type) {
      case "recover-death": {
        return Effect.gen(function* () {
          const [pendingDeaths, lastLivingObservation] = yield* Effect.all([
            Ref.get(state.pendingDeaths),
            Ref.get(state.lastLivingObservation),
          ]);
          const pendingDeath = pendingDeaths.find((candidate) =>
            candidate.observedAt === observation.observedAt
          ) ?? {
            observedAt: observation.observedAt,
            position: observation.player.position,
            recoverItems: hasMeaningfulRecoveryInventory(
              lastLivingObservation,
            ),
          };
          yield* enqueuePendingDeath(state, pendingDeath);
          yield* Effect.all([
            emit(state, {
              type: "death-observed",
              detail: positionKey(pendingDeath.position),
            }),
            state.coordinator.publishDiscovery(
              actionCheckpoint.teamId,
              {
                key:
                  `death:${actionCheckpoint.botId}:${pendingDeath.observedAt}`,
                kind: "death",
                botId: actionCheckpoint.botId,
                position: pendingDeath.position,
                observedAt: pendingDeath.observedAt,
                confidence: 1,
              },
            ),
          ], { discard: true });
          yield* (state.hooks.recoverDeath?.(policyContext)
            ?? respawnAndRecover(state.driver, {
              ...(pendingDeath.recoverItems
                ? { deathPosition: pendingDeath.position }
                : {}),
              path: state.strategy.path,
            }));
          yield* emit(state, {
            type: "items-recovered",
            detail: pendingDeath.recoverItems
              ? "Death recovery completed"
              : "Respawn completed without a risky corpse recovery",
          });
          return {
            checkpoint: (checkpoint) => ({
              ...checkpoint,
              memory: {
                ...checkpoint.memory,
                deathPositions: [
                  ...checkpoint.memory.deathPositions,
                  {
                    key: `death:${pendingDeath.observedAt}`,
                    value: pendingDeath.position,
                    observedAt: pendingDeath.observedAt,
                    confidence: 1,
                  },
                ].slice(-16),
              },
            }),
          } satisfies ActionResult;
        });
      }
      case "eat":
        return (
          state.hooks.eat?.(policyContext)
            ?? eatWhenNeeded(state.driver, {
              foodItemIds: preferredUsableFoodItemIds(observation),
              foodLevel: state.strategy.eatBelowFood,
              maximumMeals: 1,
              path: state.strategy.path,
            })
        ).pipe(Effect.as({} satisfies ActionResult));
      case "retreat":
        return (
          state.hooks.retreat?.(policyContext)
            ?? retreatAndRecover(state)
        ).pipe(Effect.as({} satisfies ActionResult));
      case "prepare-equipment":
        return (
          state.hooks.prepareEquipment?.(policyContext)
            ?? equipBestArmor(state.driver, {
              path: state.strategy.path,
            })
        ).pipe(Effect.as({} satisfies ActionResult));
      case "satisfy-requirement":
        if (state.hooks.satisfyRequirement !== undefined) {
          return state.hooks.satisfyRequirement({
            ...policyContext,
            requirement: decision.requirement,
          }).pipe(Effect.as({} satisfies ActionResult));
        }
        return satisfyRequirement(
          state,
          decision.requirement,
          observation,
        ).pipe(Effect.as({} satisfies ActionResult));
      case "build-and-enter-nether": {
        if (state.hooks.buildAndEnterNether !== undefined) {
          return state.hooks.buildAndEnterNether(policyContext).pipe(
            Effect.as({} satisfies ActionResult),
          );
        }
        const useCastPortal =
          state.strategy.portalStrategy === PortalStrategy.CAST
          || (
            state.strategy.portalStrategy === PortalStrategy.AUTO
            && (
              observation.inventory.counts["minecraft:obsidian"] ?? 0
            ) < state.strategy.targetObsidianCount
          );
        return enterKnownPortal(
          state,
          actionCheckpoint,
          observation,
        ).pipe(
          Effect.flatMap((knownPortal): Effect.Effect<
            ActionResult,
            BeatGameError | BeatGameDriverError
          > =>
            knownPortal
              ? Effect.succeed({})
              : resolvePortalBuildOrigin(state.driver, observation).pipe(
                Effect.flatMap((origin) =>
                  useCastPortal
                    ? castNetherPortal(state.driver, {
                      origin,
                      path: state.strategy.path,
                    })
                    : buildNetherPortal(state.driver, {
                      origin,
                      path: state.strategy.path,
                    })
                ),
                Effect.tap((frame) => {
                  const observedAt = new Date().toISOString();
                  return state.coordinator.publishDiscovery(
                    actionCheckpoint.teamId,
                    {
                      key: `portal:${positionKey(frame.origin)}`,
                      kind: "portal",
                      botId: actionCheckpoint.botId,
                      position: frame.origin,
                      observedAt,
                      confidence: 0.9,
                    },
                  );
                }),
                Effect.flatMap((frame) =>
                  enterPortal(state.driver, {
                    portal: frame.interior[0] ?? frame.origin,
                    path: state.strategy.path,
                  }).pipe(Effect.as(frame))
                ),
                Effect.map((frame): ActionResult => ({
                  checkpoint: (checkpoint) => ({
                    ...checkpoint,
                    memory: {
                      ...checkpoint.memory,
                      portals: [
                        ...checkpoint.memory.portals,
                        {
                          key: `portal:${positionKey(frame.origin)}`,
                          value: {
                            blockId: "minecraft:nether_portal",
                            position: frame.origin,
                            properties: {},
                            diggable: false,
                            replaceable: false,
                            interactive: false,
                            observedAt: new Date().toISOString(),
                          },
                          observedAt: new Date().toISOString(),
                          confidence: 0.9,
                        },
                      ].slice(-32),
                    },
                  }),
                })),
              )
          ),
        );
      }
      case "return-through-portal":
        if (state.hooks.returnThroughPortal !== undefined) {
          return state.hooks.returnThroughPortal(policyContext).pipe(
            Effect.as({} satisfies ActionResult),
          );
        }
        return enterKnownPortal(
          state,
          actionCheckpoint,
          observation,
        ).pipe(
          Effect.flatMap((entered) =>
            entered
              ? Effect.void
              : enterPortal(state.driver, {
                path: state.strategy.path,
              })
          ),
          Effect.as({} satisfies ActionResult),
        );
      case "throw-eye":
        return moveToEyeBaseline(state).pipe(
          Effect.zipRight(
            state.hooks.throwEye?.(policyContext)
              ?? throwEyeOfEnder(state.driver),
          ),
          Effect.flatMap((sample) => {
            const eyeSamples = [
              ...actionCheckpoint.memory.eyeSamples,
              sample,
            ].slice(-16);
            const estimate = triangulateStronghold(eyeSamples);
            return Effect.all([
              state.coordinator.publishDiscovery(
                actionCheckpoint.teamId,
                {
                  key:
                    `eye:${actionCheckpoint.botId}:${sample.observedAt}`,
                  kind: "eye-sample",
                  botId: actionCheckpoint.botId,
                  position: sample.origin,
                  observedAt: sample.observedAt,
                  confidence: sample.confidence,
                  metadata: {
                    directionX: sample.direction.x,
                    directionZ: sample.direction.z,
                  },
                },
              ),
              estimate === undefined
                ? Effect.void
                : state.coordinator.publishDiscovery(
                  actionCheckpoint.teamId,
                  {
                    key: "stronghold:estimate",
                    kind: "stronghold",
                    botId: actionCheckpoint.botId,
                    position: estimate.position,
                    observedAt: sample.observedAt,
                    confidence: estimate.confidence,
                    metadata: {
                      baseline: estimate.baseline,
                      angleDegrees: estimate.angleDegrees,
                    },
                  },
                ),
            ], { discard: true }).pipe(
              Effect.as({
                checkpoint: (
                  checkpoint: BeatGameCheckpoint,
                ): BeatGameCheckpoint => ({
                  ...checkpoint,
                  memory: {
                    ...checkpoint.memory,
                    eyeSamples,
                    ...(estimate === undefined
                      ? {}
                      : { strongholdEstimate: estimate.position }),
                  },
                }),
              } satisfies ActionResult),
            );
          }),
        );
      case "search-stronghold":
        return (
          state.hooks.searchStronghold?.(policyContext)
            ?? searchStronghold(state)
        ).pipe(
          Effect.tap((found) =>
            !found
              ? Effect.void
              : state.coordinator.publishDiscovery(
                actionCheckpoint.teamId,
                {
                  key: "stronghold:portal-room",
                  kind: "stronghold",
                  botId: actionCheckpoint.botId,
                  position:
                    actionCheckpoint.memory.strongholdEstimate
                      ?? observation.player.position,
                  observedAt: new Date().toISOString(),
                  confidence: 1,
                },
              )
          ),
          Effect.map((found): ActionResult =>
            found
              ? { phase: BeatGamePhase.ACTIVATE_END_PORTAL }
              : {}
          ),
        );
      case "activate-end-portal":
        if (state.hooks.activateEndPortal !== undefined) {
          return state.hooks.activateEndPortal(policyContext).pipe(
            Effect.as({} satisfies ActionResult),
          );
        }
        return activateEndPortal(state.driver, {
          path: state.strategy.path,
        }).pipe(
          Effect.zipRight(enterEndPortal(state.driver, {
            path: state.strategy.path,
          })),
          Effect.as({
            phase: BeatGamePhase.FIGHT_ENDER_DRAGON,
          } satisfies ActionResult),
        );
      case "fight-ender-dragon":
        if (state.hooks.fightEnderDragon !== undefined) {
          return state.hooks.fightEnderDragon(policyContext).pipe(
            Effect.map((defeated): ActionResult =>
              defeated ? { phase: BeatGamePhase.COLLECT_DRAGON_EGG } : {}
            ),
          );
        }
        return fightDragon(state);
      case "collect-dragon-egg":
        return (
          state.hooks.collectDragonEgg?.(policyContext)
            ?? collectDragonEgg(state.driver, {
              path: state.strategy.path,
            })
        ).pipe(Effect.as({} satisfies ActionResult));
      case "exit-end":
        return (
          state.hooks.exitEnd?.(policyContext)
            ?? exitEnd(state.driver, {
              path: state.strategy.path,
            })
        ).pipe(Effect.as({} satisfies ActionResult));
    }
  })();
  return Effect.raceFirst(
    execute,
    monitorActionSafety(state, decision, observation),
  ).pipe(
    Effect.flatMap((result) => {
      const response = result.airEscapePosition !== undefined
        ? emergencyAirAscent(state, result.airEscapePosition)
        : result.escapeTarget !== undefined
        ? escapeFromTarget(state, result.escapeTarget)
        : result.defenseTarget !== undefined
        ? defendAgainstTarget(state, result.defenseTarget)
        : Effect.void;
      const interruptedForSafety =
        result.airEscapePosition !== undefined
        || result.escapeTarget !== undefined
        || result.defenseTarget !== undefined;
      return response.pipe(
        Effect.catchTag("BeatGameDriverError", () => Effect.void),
        Effect.flatMap(() =>
          decision.type === "recover-death" && interruptedForSafety
            ? Effect.all([
              observeDriverFresh(state),
              Ref.get(state.pendingDeaths),
            ]).pipe(
              Effect.flatMap(([latest, pendingDeaths]) => {
                const latestDeath = pendingDeaths.at(-1);
                return latest.player.dead
                    || (
                      latestDeath !== undefined
                      && latestDeath.observedAt !== observation.observedAt
                    )
                  ? Effect.succeed({
                    replanReason: "bot died again during recovery",
                  } satisfies ActionResult)
                  : execute;
              }),
            )
            : Effect.succeed(result)
        ),
      );
    }),
    Effect.mapError((error) =>
      error instanceof BeatGameDriverError
        ? error.operation === "pathfind"
          ? pathfindingError(actionCheckpoint, error)
          : actionError(
            actionCheckpoint,
            error.message,
            error.retryable,
            error,
          )
        : isBeatGameError(error)
        ? error
        : actionError(
          actionCheckpoint,
          error instanceof Error
            ? error.message
            : `Action ${decision.action} failed`,
          false,
          error,
        )
    ),
  );
}

function monitorActionSafety(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  actionObservation: BeatGameObservation,
): Effect.Effect<ActionResult, BeatGameError | BeatGameDriverError> {
  const monitor = (
    previousObservation: BeatGameObservation,
  ): Effect.Effect<ActionResult, BeatGameError | BeatGameDriverError> =>
    Effect.sleep(Math.max(100, state.strategy.observationPollMs)).pipe(
      Effect.zipRight(Ref.get(state.paused)),
      Effect.flatMap((paused) =>
        paused
          ? Effect.succeed({
            replanReason: "run paused",
          } satisfies ActionResult)
          : Ref.get(state.pendingDeaths).pipe(
            Effect.flatMap((pendingDeath) =>
              decision.type === "recover-death"
                && pendingDeath.at(-1) !== undefined
                && pendingDeath.at(-1)?.observedAt
                  !== actionObservation.observedAt
                ? Effect.succeed({
                  replanReason: "bot died again during recovery",
                } satisfies ActionResult)
                : observeDriverFresh(state).pipe(
                  Effect.flatMap((observation) => {
              if (
                decision.type !== "recover-death"
                && observation.player.dead
              ) {
                return Effect.succeed({
                  replanReason: "bot died",
                } satisfies ActionResult);
              }
              if (
                decision.type !== "retreat"
                && decision.type !== "fight-ender-dragon"
                && !observation.player.dead
              ) {
                if (hasUnsafeAir(observation)) {
                  return Effect.succeed({
                    replanReason: "air fell below the safety threshold",
                    airEscapePosition: observation.player.position,
                  } satisfies ActionResult);
                }
                return findImmediateThreat(state, observation).pipe(
                  Effect.flatMap((threat) =>
                    threat === undefined
                      ? monitorObservedSafety(
                        state,
                        decision,
                        previousObservation,
                        observation,
                        monitor,
                      )
                      : Effect.succeed({
                        replanReason: threat.response === "flee"
                          ? "interrupted an action to evade an immediate threat"
                          : "interrupted an action to preempt a nearby hostile",
                        ...(threat.response === "flee"
                          ? { escapeTarget: threat.target }
                          : { defenseTarget: threat.target }),
                      } satisfies ActionResult)
                  ),
                );
              }
              return monitorObservedSafety(
                state,
                decision,
                previousObservation,
                observation,
                monitor,
              );
                  }),
                )
            ),
          )
      ),
    );
  return Effect.suspend(() => monitor(actionObservation));
}

function monitorObservedSafety(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  previousObservation: BeatGameObservation,
  observation: BeatGameObservation,
  monitor: (
    previousObservation: BeatGameObservation,
  ) => Effect.Effect<ActionResult, BeatGameError | BeatGameDriverError>,
): Effect.Effect<ActionResult, BeatGameError | BeatGameDriverError> {
  if (
    !observation.player.dead
    && hasUnsafeAir(observation)
  ) {
    return Effect.succeed({
      replanReason: "air fell below the safety threshold",
      airEscapePosition: observation.player.position,
    } satisfies ActionResult);
  }
  if (
    decision.type !== "retreat"
    && decision.type !== "fight-ender-dragon"
    && observation.player.health < previousObservation.player.health
  ) {
    return findNearbyAttackThreat(state, observation).pipe(
      Effect.flatMap((target) => {
        if (target === undefined) {
          return Effect.suspend(() => monitor(observation));
        }
        const shouldEscape =
          ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(target.entityType);
        return Effect.succeed({
          replanReason: shouldEscape
            ? "interrupted an action to escape a dangerous attacker"
            : "interrupted an action to defend against an attacker",
          ...(shouldEscape
            ? { escapeTarget: target }
            : { defenseTarget: target }),
        } satisfies ActionResult);
      }),
    );
  }
  if (
    decision.type !== "recover-death"
    && decision.type !== "retreat"
    && decision.type !== "eat"
    && observation.player.health < state.strategy.minimumHealth
    && !(
      decision.type === "satisfy-requirement"
      && decision.requirement.key === "food"
      && !hasRecoveryFood(observation)
    )
  ) {
    return Effect.succeed({
      replanReason: "health fell below the safety threshold",
    } satisfies ActionResult);
  }
  if (
    decision.type !== "recover-death"
    && decision.type !== "eat"
    && observation.player.food <= state.strategy.eatBelowFood
    && hasUsableFood(observation)
  ) {
    return Effect.succeed({
      replanReason: "hunger fell below the eating threshold",
    } satisfies ActionResult);
  }
  return Effect.suspend(() => monitor(observation));
}

function findImmediateThreat(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<ImmediateThreat | undefined, BeatGameDriverError> {
  return state.driver.queryEntities({
    origin: observation.player.position,
    radius: 24,
    selector: {
      categories: [2],
      alive: true,
      requireLineOfSight: true,
    },
    maximumResults: 32,
  }).pipe(
    Effect.map((hostiles) => {
      const candidates = hostiles
        .map((target) => ({
          target,
          distanceSquared: distanceSquared(
            observation.player.position,
            target.position,
          ),
        }))
        .sort((left, right) => left.distanceSquared - right.distanceSquared);
      const explosive = candidates.find(({ target, distanceSquared }) =>
        target.entityType === "minecraft:creeper"
        && distanceSquared
          <= PROACTIVE_CREEPER_EVASION_RADIUS
            * PROACTIVE_CREEPER_EVASION_RADIUS
      );
      if (explosive !== undefined) {
        return { target: explosive.target, response: "flee" };
      }
      const ranged = candidates.find(({ target, distanceSquared }) =>
        PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
        && distanceSquared <= 144
      );
      if (ranged !== undefined) {
        return { target: ranged.target, response: "attack" };
      }
      const melee = candidates.find(({ target, distanceSquared }) =>
        PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(target.entityType)
        && distanceSquared <= 16
      );
      return melee === undefined
        ? undefined
        : {
          target: melee.target,
          response: "attack",
        };
    }),
  );
}

function escapeFromTarget(
  state: RunState,
  target: BeatGameEntityObservation,
): Effect.Effect<void, BeatGameDriverError> {
  const escapePath = {
    ...state.strategy.path,
    maxSearchTimeMs: Math.min(
      state.strategy.path.maxSearchTimeMs,
      3_000,
    ),
  };
  const escape = state.driver.observe.pipe(
    Effect.flatMap((observation) =>
      observation.player.dead
        ? Effect.void
        : needsOverworldSurfaceRecovery(
          state,
          observation.player.position,
        ).pipe(
          Effect.flatMap((needsRecovery) =>
            needsRecovery
              ? state.driver.pathfind(
                surfaceEscapeTarget(
                  observation.player.position,
                  target.position,
                ),
                17,
                {
                  ...escapePath,
                  allowMining: true,
                  allowPlacing: true,
                },
              )
              : flee(state.driver, {
                selector: {
                  networkId: target.networkId,
                  alive: true,
                },
                triggerRadius: 12,
                safeDistance: 16,
                completeWhenSafe: true,
                maximumEscapes: 1,
                path: escapePath,
              })
          ),
        )
    ),
  );
  return Effect.raceFirst(
    escape.pipe(Effect.as("escaped" as const)),
    waitForUnsafeAir(state),
  ).pipe(
    Effect.flatMap((outcome) =>
      outcome === "unsafe-air"
        ? state.driver.observe.pipe(
          Effect.flatMap((observation) =>
            emergencyAirAscent(state, observation.player.position)
          ),
        )
        : Effect.void
    ),
  );
}

function surfaceEscapeTarget(
  player: BeatGamePosition,
  threat: BeatGamePosition,
): BeatGamePosition {
  const deltaX = player.x - threat.x;
  const deltaZ = player.z - threat.z;
  const horizontalDistance = Math.hypot(deltaX, deltaZ);
  const directionX = horizontalDistance > 0.001
    ? deltaX / horizontalDistance
    : 1;
  const directionZ = horizontalDistance > 0.001
    ? deltaZ / horizontalDistance
    : 0;
  return {
    x: player.x + directionX * 24,
    y: 80,
    z: player.z + directionZ * 24,
    dimension: player.dimension,
  };
}

function hasUsableFood(observation: BeatGameObservation): boolean {
  return preferredUsableFoodItemIds(observation).length > 0;
}

function hasRecoveryFood(observation: BeatGameObservation): boolean {
  return observation.player.food >= 18
    || [...COOKED_FOOD_ITEM_IDS, ...EMERGENCY_FOOD_ITEM_IDS].some((itemId) =>
      (observation.inventory.counts[itemId] ?? 0) > 0
    );
}

function preferredUsableFoodItemIds(
  observation: BeatGameObservation,
): readonly string[] {
  const regularFood = EDIBLE_FOOD_ITEM_IDS.filter((itemId) =>
    (observation.inventory.counts[itemId] ?? 0) > 0
  );
  return regularFood.length > 0
    ? regularFood
    : EMERGENCY_FOOD_ITEM_IDS.filter((itemId) =>
      (observation.inventory.counts[itemId] ?? 0) > 0
    );
}

function hasUnsafeAir(observation: BeatGameObservation): boolean {
  return observation.player.maxAir > 0
    && observation.player.air
      <= Math.min(MINIMUM_SAFE_AIR_TICKS, observation.player.maxAir * 2 / 3);
}

function waitForUnsafeAir(
  state: RunState,
): Effect.Effect<"dead" | "unsafe-air", BeatGameDriverError> {
  const poll = (): Effect.Effect<
    "dead" | "unsafe-air",
    BeatGameDriverError
  > =>
    Effect.sleep(Math.max(100, state.strategy.observationPollMs)).pipe(
      Effect.zipRight(state.driver.observe),
      Effect.flatMap((observation) =>
        observation.player.dead
          ? Effect.succeed("dead" as const)
          : hasUnsafeAir(observation)
          ? Effect.succeed("unsafe-air" as const)
          : Effect.suspend(poll)
      ),
    );
  return Effect.suspend(poll);
}

function emergencyAirAscent(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<void, BeatGameDriverError> {
  return state.driver.observe.pipe(
    Effect.flatMap((observation) =>
      observation.player.dead
        ? Effect.void
        : state.driver.withControl(
          state.driver.act({
            type: "look",
            yaw: observation.player.rotation.yaw,
            pitch: -90,
          }).pipe(
            Effect.zipRight(state.driver.act({
              type: "set-movement",
              forward: true,
              jump: true,
              sprint: true,
            })),
            Effect.zipRight(waitForAirRecovery(state, 30)),
            Effect.ensuring(
              state.driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
            ),
          ),
        ).pipe(
          Effect.flatMap((recovered) =>
            recovered
              ? swimToNearbyDrySurface(state)
              : returnToOverworldSurface(state, position)
          ),
        )
    ),
  );
}

function waitForAirRecovery(
  state: RunState,
  attemptsRemaining: number,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.sleep(100).pipe(
    Effect.zipRight(state.driver.observe),
    Effect.flatMap((observation) =>
      observation.player.dead
        ? Effect.succeed(true)
        : observation.player.maxAir <= 0
          || observation.player.air >= observation.player.maxAir
        ? Effect.succeed(true)
        : attemptsRemaining <= 1
        ? Effect.succeed(false)
        : waitForAirRecovery(state, attemptsRemaining - 1)
    ),
  );
}

function swimToNearbyDrySurface(
  state: RunState,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const observation = yield* state.driver.observe;
    if (observation.player.dead) {
      return;
    }
    const columns = yield* state.driver.sampleSurface(
      observation.player.position,
      AIR_ESCAPE_SURFACE_SEARCH_RADIUS,
      1,
    );
    const surfaces = selectSurfaceEscapeColumns(
      columns,
      observation.player.position,
    );
    if (surfaces.length === 0) {
      yield* returnToOverworldSurface(state, observation.player.position);
      return;
    }
    for (const surface of surfaces) {
      const reached = yield* swimTowardDrySurface(state, surface);
      if (reached) {
        return;
      }
    }
  });
}

function swimTowardDrySurface(
  state: RunState,
  surface: Readonly<{ x: number; z: number; surfaceY: number }>,
): Effect.Effect<boolean, BeatGameDriverError> {
  return state.driver.observe.pipe(
    Effect.flatMap((observation) => {
      if (observation.player.dead) {
        return Effect.succeed(true);
      }
      const target = {
        x: surface.x + 0.5,
        y: surface.surfaceY + 1,
        z: surface.z + 0.5,
        dimension: observation.player.position.dimension,
      };
      const rotation = rotationToward(
        observation.player.position,
        {
          ...target,
          y: observation.player.position.y,
        },
      );
      return state.driver.withControl(
        state.driver.act({
          type: "look",
          yaw: rotation.yaw,
          pitch: -20,
        }).pipe(
          Effect.zipRight(state.driver.act({
            type: "set-movement",
            forward: true,
            jump: true,
            sprint: true,
          })),
          Effect.zipRight(waitForDrySurfaceApproach(
            state,
            target,
            AIR_ESCAPE_SURFACE_APPROACH_ATTEMPTS,
          )),
          Effect.ensuring(
            state.driver.act({ type: "reset-movement" }).pipe(
              Effect.ignore,
            ),
          ),
        ),
      );
    }),
  );
}

function waitForDrySurfaceApproach(
  state: RunState,
  target: BeatGamePosition,
  attemptsRemaining: number,
  previousDistanceSquared?: number,
  stagnantObservations = 0,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.sleep(100).pipe(
    Effect.zipRight(state.driver.observe),
    Effect.flatMap((observation) => {
      const position = observation.player.position;
      const distanceToTarget = horizontalDistanceSquared(position, target);
      const reachedSurface = distanceToTarget <= 1.5 * 1.5
        && position.y >= target.y - 0.25;
      if (observation.player.dead || reachedSurface) {
        return Effect.succeed(true);
      }
      const madeProgress = previousDistanceSquared === undefined
        || distanceToTarget < previousDistanceSquared - 0.05;
      const nextStagnantObservations = madeProgress
        ? 0
        : stagnantObservations + 1;
      return attemptsRemaining <= 1
          || nextStagnantObservations >= AIR_ESCAPE_STAGNANT_OBSERVATIONS
        ? Effect.succeed(false)
        : waitForDrySurfaceApproach(
          state,
          target,
          attemptsRemaining - 1,
          distanceToTarget,
          nextStagnantObservations,
        );
    }),
  );
}

function findNearbyAttackThreat(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<
  BeatGameEntityObservation | undefined,
  BeatGameDriverError
> {
  const radius = 16;
  return Effect.all([
    state.driver.queryEntities({
      origin: observation.player.position,
      radius,
      selector: {
        categories: [2],
        alive: true,
      },
      maximumResults: 8,
    }),
    state.driver.queryEntities({
      origin: observation.player.position,
      radius,
      selector: {
        entityTypes: DANGEROUS_NEUTRAL_ENTITY_TYPES,
        alive: true,
      },
      maximumResults: 8,
    }),
  ]).pipe(
    Effect.map(([hostiles, dangerousNeutralMobs]) => {
      const threats = new Map(
        [...hostiles, ...dangerousNeutralMobs].map((entity) => [
          `${entity.connectionEpoch}:${entity.networkId}`,
          entity,
        ]),
      );
      const nearest = [...threats.values()].reduce(
        (closest, candidate) =>
            closest === undefined
            || distanceSquared(
                observation.player.position,
                candidate.position,
              ) < distanceSquared(
                observation.player.position,
                closest.position,
              )
          ? candidate
          : closest,
        undefined as BeatGameEntityObservation | undefined,
      );
      return nearest;
    }),
  );
}

function defendAgainstTarget(
  state: RunState,
  target: BeatGameEntityObservation,
): Effect.Effect<void, BeatGameDriverError> {
  const attack = attackEntity(state.driver, {
    target,
    sprinting: true,
    targetUnavailableTimeoutSeconds: 3,
    selectBestWeapon: true,
    path: {
      ...state.strategy.path,
      allowMining: false,
      allowPlacing: false,
      maxSearchTimeMs: Math.min(
        state.strategy.path.maxSearchTimeMs,
        3_000,
      ),
    },
  });
  return state.driver.observe.pipe(
    Effect.flatMap((observation) => {
      const canBlockWithShield =
        SHIELD_BLOCKING_HOSTILE_ENTITY_TYPES.has(target.entityType)
        && (observation.inventory.counts["minecraft:shield"] ?? 0) > 0;
      const prepareShield = canBlockWithShield
        ? state.driver.withControl(Effect.gen(function* () {
          if (
            observation.player.equipment.offhand !== "minecraft:shield"
          ) {
            yield* state.driver.act({
              type: "equip-item",
              selector: { itemIds: ["minecraft:shield"] },
              equipmentSlot: "offhand",
            });
          }
          const rotation = rotationToward(
            {
              ...observation.player.position,
              y: observation.player.position.y + 1.62,
            },
            {
              ...target.position,
              y: target.position.y + 1,
            },
          );
          yield* state.driver.act({
            type: "look",
            yaw: rotation.yaw,
            pitch: rotation.pitch,
          });
          yield* state.driver.act({ type: "use-item", hand: "off" });
          yield* Effect.sleep(1_000);
        }).pipe(
          Effect.ensuring(
            state.driver.act({ type: "release-item" }).pipe(Effect.ignore),
          ),
        ))
        : Effect.void;
      return prepareShield.pipe(Effect.zipRight(attack));
    }),
  );
}

function retreatAndRecover(
  state: RunState,
): Effect.Effect<void, BeatGameDriverError> {
  const escapePath = {
    ...state.strategy.path,
    maxSearchTimeMs: Math.min(
      state.strategy.path.maxSearchTimeMs,
      3_000,
    ),
  };
  const fleeFromNearbyNeutralThreat = state.driver.observe.pipe(
    Effect.flatMap((observation) =>
      state.driver.queryEntities({
        origin: observation.player.position,
        radius: 24,
        selector: {
          entityTypes: DANGEROUS_NEUTRAL_ENTITY_TYPES,
          alive: true,
        },
        maximumResults: 1,
      })
    ),
    Effect.flatMap((threats) =>
      threats.length === 0
        ? Effect.void
        : flee(state.driver, {
          selector: {
            entityTypes: DANGEROUS_NEUTRAL_ENTITY_TYPES,
            alive: true,
          },
          triggerRadius: 24,
          safeDistance: 32,
          completeWhenSafe: true,
          maximumEscapes: 2,
          path: escapePath,
        })
    ),
  );
  const eatAvailableFood = state.driver.observe.pipe(
    Effect.flatMap((observation) =>
      hasUsableFood(observation)
        ? eatWhenNeeded(state.driver, {
          foodItemIds: preferredUsableFoodItemIds(observation),
          foodLevel: Math.max(18, state.strategy.eatBelowFood),
          maximumMeals: 8,
          completeWhenNoFood: true,
          path: state.strategy.path,
        })
        : Effect.void
    ),
  );
  const defendAgainstNearbyHostiles = (
    defensesRemaining: number,
  ): Effect.Effect<void, BeatGameDriverError> =>
    defensesRemaining === 0
      ? Effect.void
      : state.driver.observe.pipe(
        Effect.flatMap((observation) =>
          state.driver.queryEntities({
            origin: observation.player.position,
            radius: 24,
            selector: {
              categories: [2],
              alive: true,
              requireLineOfSight: true,
            },
            maximumResults: 16,
          }).pipe(
            Effect.map((hostiles) =>
              hostiles
                .map((target) => ({
                  target,
                  distanceSquared: distanceSquared(
                    observation.player.position,
                    target.position,
                  ),
                }))
                .filter(({ target, distanceSquared: targetDistanceSquared }) => {
                  const engagementRadius =
                    PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(
                      target.entityType,
                    )
                      || ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(
                        target.entityType,
                      )
                      ? 12
                      : 4;
                  return targetDistanceSquared
                    <= engagementRadius * engagementRadius;
                })
                .sort((left, right) =>
                  left.distanceSquared - right.distanceSquared
                )[0]?.target
            ),
          )
        ),
        Effect.flatMap((target) =>
          target === undefined
            ? Effect.void
            : (
              ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(target.entityType)
                ? escapeFromTarget(state, target)
                : defendAgainstTarget(state, target)
            ).pipe(
              Effect.matchEffect({
                onFailure: (error) =>
                  error.operation === "task.attack-entity"
                      || error.code === "not_found"
                      || error.code === "unreachable"
                    ? Effect.void
                    : Effect.fail(error),
                onSuccess: () =>
                  defendAgainstNearbyHostiles(defensesRemaining - 1),
              }),
            )
        ),
      );
  const waitForRecovery = (
    attemptsRemaining: number,
  ): Effect.Effect<void, BeatGameDriverError> =>
    state.driver.observe.pipe(
      Effect.flatMap((observation) =>
        observation.player.dead
        || observation.player.health >= state.strategy.minimumHealth
        || attemptsRemaining === 0
          ? Effect.void
          : Effect.sleep(1_000).pipe(
            Effect.zipRight(waitForRecovery(attemptsRemaining - 1)),
          )
      ),
    );
  return fleeFromNearbyNeutralThreat.pipe(
    Effect.zipRight(defendAgainstNearbyHostiles(8)),
    Effect.zipRight(eatAvailableFood),
    Effect.zipRight(waitForRecovery(20)),
  );
}

function policyContextFor(
  state: RunState,
  observation: BeatGameObservation,
  checkpoint: BeatGameCheckpoint,
): BeatGamePolicyContext {
  return {
    driver: state.driver,
    checkpoint,
    observation,
    strategy: state.strategy,
  };
}

function satisfyRequirement(
  state: RunState,
  requirement: BeatGameItemRequirement,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  const missing = Math.max(
    1,
    requirement.targetCount - requirement.currentCount,
  );
  switch (requirement.key) {
    case "food":
      return satisfyFoodRequirement(
        state,
        requirement,
        observation,
      );
    case "logs":
      return collectBlocksOrExplore(state, observation, {
        blockIds: requirement.itemIds,
        tags: requirement.tags,
        count: bufferedCollectionCount("logs", missing),
        progressItemIds: requirement.itemIds,
        purpose: "find-logs",
      });
    case "cobblestone":
      return ensureMiningPickaxe(
        state,
        observation,
        "minecraft:wooden_pickaxe",
        [
          "minecraft:wooden_pickaxe",
          "minecraft:stone_pickaxe",
          "minecraft:iron_pickaxe",
          "minecraft:diamond_pickaxe",
          "minecraft:netherite_pickaxe",
        ],
      ).pipe(
        Effect.zipRight(collectBlocksOrExplore(state, observation, {
          blockIds: ["minecraft:stone"],
          count: bufferedCollectionCount("cobblestone", missing),
          progressItemIds: ["minecraft:cobblestone"],
          purpose: "find-stone",
        })),
      );
    case "melee-weapon":
      return craftWithTable(
        state,
        observation,
        "minecraft:stone_sword",
        1,
      );
    case "obsidian":
      return acquire(state.driver, requirement, {
        searchRadius: state.strategy.blockSearchRadius,
        path: state.strategy.path,
      });
    case "iron": {
      const rawIron = observation.inventory.counts["minecraft:raw_iron"] ?? 0;
      if (rawIron >= missing) {
        const batchCount = Math.min(
          rawIron,
          bufferedCollectionCount("iron", missing),
        );
        return ensureWorkstation(
          state,
          observation,
          "minecraft:furnace",
        ).pipe(
          Effect.flatMap((station) =>
            ensureEfficientFurnaceFuel(
              state,
              observation,
              station,
              batchCount,
            ).pipe(
              Effect.zipRight(smelt(state.driver, {
                input: { itemIds: ["minecraft:raw_iron"] },
                count: batchCount,
                fuel: {
                  itemIds: ["minecraft:coal", "minecraft:charcoal"],
                },
                station,
                path: state.strategy.path,
              })),
            )
          ),
        );
      }
      return ensureMiningPickaxe(
        state,
        observation,
        "minecraft:stone_pickaxe",
        [
          "minecraft:stone_pickaxe",
          "minecraft:iron_pickaxe",
          "minecraft:diamond_pickaxe",
          "minecraft:netherite_pickaxe",
        ],
      ).pipe(
        Effect.zipRight(collectBlocks(state.driver, {
          blockIds: [
            "minecraft:iron_ore",
            "minecraft:deepslate_iron_ore",
          ],
          count: bufferedCollectionCount("iron", missing - rawIron),
          searchRadius: state.strategy.blockSearchRadius,
          path: state.strategy.path,
        })),
      );
    }
    case "pickaxe":
      return craftWithTable(
        state,
        observation,
        (observation.inventory.counts["minecraft:iron_ingot"] ?? 0) >= 3
          ? "minecraft:iron_pickaxe"
          : "minecraft:stone_pickaxe",
        1,
      );
    case "diamond-pickaxe": {
      const diamonds =
        observation.inventory.counts["minecraft:diamond"] ?? 0;
      if (diamonds < 3) {
        return collectBlocks(state.driver, {
          blockIds: [
            "minecraft:diamond_ore",
            "minecraft:deepslate_diamond_ore",
          ],
          count: bufferedCollectionCount("diamond", 3 - diamonds),
          searchRadius: state.strategy.blockSearchRadius,
          path: state.strategy.path,
        });
      }
      return craftWithTable(
        state,
        observation,
        "minecraft:diamond_pickaxe",
        1,
      );
    }
    case "water-bucket":
      return fillLiquidBucket(state, observation, "water");
    case "lava-bucket":
      return fillLiquidBucket(state, observation, "lava");
    case "ignition":
      return ensureFlint(state, observation).pipe(
        Effect.zipRight(craftItem(state.driver, {
          resultItemId: "minecraft:flint_and_steel",
          count: 1,
          path: state.strategy.path,
        })),
      );
    case "shield":
      return craftWithTable(
        state,
        observation,
        "minecraft:shield",
        1,
      );
    case "blaze-rods":
      return huntOrExplore(
        state,
        observation,
        { entityTypes: ["minecraft:blaze"], alive: true },
        bufferedCollectionCount("blaze-rods", missing),
        "find-nether-fortress",
      );
    case "ender-pearls":
      return acquireEnderPearls(
        state,
        observation,
        bufferedCollectionCount("ender-pearls", missing),
      );
    case "gold":
      return collectBlocks(state.driver, {
        blockIds: [
          "minecraft:nether_gold_ore",
          "minecraft:gold_ore",
          "minecraft:deepslate_gold_ore",
        ],
        count: bufferedCollectionCount("gold", missing),
        searchRadius: state.strategy.blockSearchRadius,
        path: state.strategy.path,
      });
    case "eyes-of-ender":
      return craftItem(state.driver, {
        resultItemId: "minecraft:ender_eye",
        count: missing,
        path: state.strategy.path,
      });
    case "ranged-weapon":
      return ensureString(state, observation, 3).pipe(
        Effect.zipRight(craftWithTable(
          state,
          observation,
          "minecraft:bow",
          1,
        )),
      );
    case "arrows":
      return ensureArrowIngredients(state, observation, missing).pipe(
        Effect.zipRight(craftWithTable(
          state,
          observation,
          "minecraft:arrow",
          missing,
        )),
      );
    case "torch":
      return craftItem(state.driver, {
        resultItemId: "minecraft:torch",
        count: missing,
        path: state.strategy.path,
      });
    default:
      return acquire(state.driver, requirement, {
        searchRadius: state.strategy.blockSearchRadius,
        path: state.strategy.path,
      }).pipe(
        Effect.catchTag("BeatGameDriverError", (cause) =>
          Effect.fail(new BeatGameRequirementError({
            runId: "",
            instanceId: state.driver.instanceId,
            botId: state.driver.botId,
            phase: BeatGamePhase.PREPARE_OVERWORLD,
            action: `satisfy:${requirement.key}`,
            retryable: cause.retryable,
            message: `No acquisition strategy succeeded for ${requirement.key}`,
            requirement: requirement.key,
            cause,
          }))
        ),
      );
  }
}

function satisfyFoodRequirement(
  state: RunState,
  requirement: BeatGameItemRequirement,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  const missingCookedFood = Math.max(
    1,
    requirement.targetCount - requirement.currentCount,
  );
  const rawFood = Object.entries(RAW_FOOD_TO_COOKED)
    .map(([rawItemId, cookedItemId]) => ({
      rawItemId,
      cookedItemId,
      count: observation.inventory.counts[rawItemId] ?? 0,
    }))
    .filter(({ count }) => count > 0);
  const rawFoodCount = rawFood.reduce(
    (total, { count }) => total + count,
    0,
  );
  if (rawFoodCount === 0) {
    return recoverNearbyFurnaceContents(state, observation).pipe(
      Effect.flatMap(({ observation: current, recovered }) => {
        if (recovered) {
          return Effect.void;
        }
        const maximumTargets =
          current.player.health < state.strategy.minimumHealth
            ? 1
            : bufferedCollectionCount("food", missingCookedFood);
        return huntOrExplore(
          state,
          current,
          {
            entityTypes: [
              "minecraft:cow",
              "minecraft:pig",
              "minecraft:sheep",
              "minecraft:chicken",
            ],
            alive: true,
          },
          maximumTargets,
          "find-food-animals",
        );
      }),
    );
  }
  const batch = rawFood[0];
  if (batch === undefined) {
    return Effect.void;
  }
  if (observation.player.health < state.strategy.minimumHealth) {
    return state.driver.queryBlocks({
      center: observation.player.position,
      radius: WORKSTATION_REUSE_RADIUS,
      selector: { blockIds: ["minecraft:furnace"] },
      maximumResults: 1,
    }).pipe(
      Effect.flatMap((furnaces) =>
        furnaces.length > 0
          || (observation.inventory.counts["minecraft:furnace"] ?? 0) > 0
          ? cookRawFoodBatch(state, observation, batch, missingCookedFood)
          : eatWhenNeeded(state.driver, {
            foodItemIds: [batch.rawItemId],
            foodLevel: Math.max(18, state.strategy.eatBelowFood),
            maximumMeals: batch.count,
            completeWhenNoFood: true,
            path: state.strategy.path,
          }).pipe(Effect.zipRight(retreatAndRecover(state)))
      ),
    );
  }
  return cookRawFoodBatch(state, observation, batch, missingCookedFood);
}

function recoverNearbyFurnaceContents(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<{
  readonly observation: BeatGameObservation;
  readonly recovered: boolean;
}, BeatGameDriverError> {
  return state.driver.queryBlocks({
    center: observation.player.position,
    radius: state.strategy.blockSearchRadius,
    selector: { blockIds: ["minecraft:furnace"] },
    maximumResults: 16,
  }).pipe(
    Effect.flatMap((furnaces) =>
      Ref.get(state.checkedRecoveryContainers).pipe(
        Effect.map((checked) =>
          furnaces.find((furnace) =>
            !checked.has(positionKey(furnace.position))
          )
        ),
      )
    ),
    Effect.flatMap((furnace) => {
      if (furnace === undefined) {
        return Effect.succeed({ observation, recovered: false });
      }
      const initialItemCount = inventoryItemCount(observation);
      return Ref.update(
        state.checkedRecoveryContainers,
        (checked) => new Set([...checked, positionKey(furnace.position)]),
      ).pipe(
        Effect.zipRight(
          transferContainerItems(state.driver, {
            direction: "withdraw",
            container: furnace.position,
            operations: [{
              selector: {},
              count: 192,
              allowPartial: true,
            }],
            path: state.strategy.path,
          }),
        ),
        Effect.zipRight(state.driver.observe),
        Effect.map((current) => ({
          observation: current,
          recovered: inventoryItemCount(current) > initialItemCount,
        })),
      );
    }),
  );
}

function inventoryItemCount(observation: BeatGameObservation): number {
  return Object.values(observation.inventory.counts).reduce(
    (total, count) => total + count,
    0,
  );
}

function cookRawFoodBatch(
  state: RunState,
  observation: BeatGameObservation,
  batch: {
    readonly rawItemId: string;
    readonly cookedItemId: string;
    readonly count: number;
  },
  missingCookedFood: number,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  const batchCount = Math.min(
    batch.count,
    bufferedCollectionCount("food", missingCookedFood),
  );
  return ensureWorkstation(
    state,
    observation,
    "minecraft:furnace",
  ).pipe(
    Effect.flatMap((station) =>
      ensureEfficientFurnaceFuel(
        state,
        observation,
        station,
        batchCount,
      ).pipe(
        Effect.zipRight(smelt(state.driver, {
          input: { itemIds: [batch.rawItemId] },
          count: batchCount,
          fuel: {
            itemIds: ["minecraft:coal", "minecraft:charcoal"],
          },
          station,
          path: state.strategy.path,
        })),
      )
    ),
  );
}

function ensureEfficientFurnaceFuel(
  state: RunState,
  observation: BeatGameObservation,
  station: BeatGameBlockPosition,
  outputCount: number,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const requiredFuel = Math.ceil(outputCount / 8);
    let currentObservation = observation;
    let missingFuel = Math.max(
      0,
      requiredFuel - furnaceFuelCount(currentObservation),
    );
    if (missingFuel === 0) {
      return;
    }

    currentObservation = yield* state.driver.observe;
    missingFuel = Math.max(
      0,
      requiredFuel - furnaceFuelCount(currentObservation),
    );
    if (missingFuel === 0) {
      return;
    }

    const visibleCoal = yield* state.driver.queryBlocks({
      center: currentObservation.player.position,
      radius: Math.min(
        FURNACE_FUEL_SEARCH_RADIUS,
        state.strategy.blockSearchRadius,
      ),
      selector: {
        blockIds: COAL_ORE_BLOCK_IDS,
        diggable: true,
        requireLineOfSight: true,
      },
      maximumResults: bufferedCollectionCount("fuel", missingFuel),
    });
    if (visibleCoal.length > 0) {
      yield* collectBlocks(state.driver, {
        blockIds: COAL_ORE_BLOCK_IDS,
        count: bufferedCollectionCount("fuel", missingFuel),
        searchRadius: FURNACE_FUEL_SEARCH_RADIUS,
        path: state.strategy.path,
      });
      yield* collectNearbyDrops(state.driver, {
        itemIds: FURNACE_FUEL_ITEM_IDS,
        radius: 8,
        maximumDrops: 16,
        path: state.strategy.path,
      });
      currentObservation = yield* state.driver.observe;
      missingFuel = Math.max(
        0,
        requiredFuel - furnaceFuelCount(currentObservation),
      );
      if (missingFuel === 0) {
        return;
      }
    }

    const charcoalFuelItemIds = PLANK_ITEM_IDS.some(
        (itemId) =>
          (currentObservation.inventory.counts[itemId] ?? 0) > 0,
      )
      ? PLANK_ITEM_IDS
      : LOG_ITEM_IDS;
    yield* smelt(state.driver, {
      input: { itemIds: LOG_ITEM_IDS },
      count: missingFuel,
      fuel: { itemIds: charcoalFuelItemIds },
      station,
      path: state.strategy.path,
    });
  });
}

function furnaceFuelCount(observation: BeatGameObservation): number {
  return FURNACE_FUEL_ITEM_IDS.reduce(
    (count, itemId) =>
      count + (observation.inventory.counts[itemId] ?? 0),
    0,
  );
}

function bufferedCollectionCount(
  resource: BufferedResource,
  missing: number,
): number {
  return Math.max(1, missing) + RESOURCE_COLLECTION_BUFFERS[resource];
}

function ensureMiningPickaxe(
  state: RunState,
  observation: BeatGameObservation,
  resultItemId: "minecraft:wooden_pickaxe" | "minecraft:stone_pickaxe",
  usableItemIds: readonly string[],
): Effect.Effect<void, BeatGameDriverError> {
  return usableItemIds.some((itemId) =>
      (observation.inventory.counts[itemId] ?? 0) > 0
    )
    ? Effect.void
    : craftWithTable(state, observation, resultItemId, 1);
}

function collectBlocksOrExplore(
  state: RunState,
  observation: BeatGameObservation,
  options: {
    readonly blockIds: readonly string[];
    readonly tags?: readonly string[];
    readonly count: number;
    readonly progressItemIds: readonly string[];
    readonly purpose: string;
  },
): Effect.Effect<void, BeatGameDriverError> {
  const countItems = (current: BeatGameObservation): number =>
    options.progressItemIds.reduce(
      (total, itemId) => total + (current.inventory.counts[itemId] ?? 0),
      0,
    );
  return Effect.gen(function* () {
    let current = observation;
    const targetCount = countItems(observation) + options.count;
    const resourcePath = state.strategy.path;
    const explorationPath = {
      ...resourcePath,
      allowMining: false,
    };
    while (countItems(current) < targetCount) {
      const beforeAttempt = countItems(current);
      yield* collectBlocks(state.driver, {
        blockIds: options.blockIds,
        ...(options.tags === undefined ? {} : { tags: options.tags }),
        count: targetCount - beforeAttempt,
        searchRadius: state.strategy.blockSearchRadius,
        path: resourcePath,
      });
      yield* collectNearbyDrops(state.driver, {
        itemIds: options.progressItemIds,
        radius: 12,
        maximumDrops: 32,
        settleDelayMs: 500,
        path: resourcePath,
      });
      current = yield* state.driver.observe;
      for (
        let attempt = 0;
        attempt < 5 && countItems(current) <= beforeAttempt;
        attempt += 1
      ) {
        yield* Effect.sleep(Math.max(50, state.strategy.observationPollMs));
        current = yield* state.driver.observe;
      }
      if (countItems(current) <= beforeAttempt) {
        if (
          yield* needsOverworldSurfaceRecovery(
            state,
            current.player.position,
          )
        ) {
          yield* returnToOverworldSurface(
            state,
            current.player.position,
          );
          return;
        }
        yield* advanceExplorationFrontier(
          state,
          current.player.position,
          options.purpose,
          state.strategy.blockSearchRadius,
          explorationPath,
        );
        return;
      }
    }
  });
}

function fillLiquidBucket(
  state: RunState,
  observation: BeatGameObservation,
  liquid: "water" | "lava",
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    if ((observation.inventory.counts["minecraft:bucket"] ?? 0) === 0) {
      yield* craftWithTable(
        state,
        observation,
        "minecraft:bucket",
        1,
      );
    }
    const source = (yield* state.driver.queryBlocks({
      center: observation.player.position,
      radius: state.strategy.blockSearchRadius,
      selector: {
        blockIds: [`minecraft:${liquid}`],
        properties: { level: "0" },
      },
      maximumResults: 1,
    }))[0];
    if (source === undefined) {
      return yield* explore(state.driver, {
        origin: observation.player.position,
        radius: discoveryHopRadius(
          state,
          state.strategy.blockSearchRadius,
        ),
        maximumWaypoints: 1,
        purpose: explorationPurpose(
          `find-${liquid}`,
          observation.player.position,
        ),
        path: state.strategy.path,
      });
    }
    yield* state.driver.withControl(Effect.gen(function* () {
      yield* state.driver.pathfind(source.position, 2, state.strategy.path);
      const current = yield* state.driver.observe;
      const rotation = rotationToward(
        {
          ...current.player.position,
          y: current.player.position.y + 1.62,
        },
        {
          x: source.position.x + 0.5,
          y: source.position.y + 0.5,
          z: source.position.z + 0.5,
        },
      );
      yield* state.driver.act({
        type: "select-item",
        selector: { itemIds: ["minecraft:bucket"] },
      });
      yield* state.driver.act({
        type: "look",
        yaw: rotation.yaw,
        pitch: rotation.pitch,
      });
      yield* waitForViewRotation(
        state.driver,
        rotation.yaw,
        rotation.pitch,
        40,
      );
      yield* state.driver.act({
        type: "interact-block",
        position: source.position,
        face: "up",
        hand: "main",
      });
    }));
  });
}

function waitForViewRotation(
  driver: BeatGameDriver,
  yaw: number,
  pitch: number,
  attempts: number,
): Effect.Effect<void, BeatGameDriverError> {
  return driver.observe.pipe(
    Effect.flatMap((observation) => {
      const rotation = observation.player.rotation;
      if (
        Math.abs(wrappedDegrees(rotation.yaw - yaw)) <= 4
        && Math.abs(rotation.pitch - pitch) <= 4
      ) {
        return Effect.void;
      }
      if (attempts <= 1) {
        return Effect.fail(new BeatGameDriverError({
          operation: "wait-for-view-rotation",
          retryable: true,
          message: `The bot did not finish facing yaw ${yaw.toFixed(1)}, pitch ${
            pitch.toFixed(1)
          }`,
        }));
      }
      return Effect.sleep(50).pipe(
        Effect.zipRight(waitForViewRotation(
          driver,
          yaw,
          pitch,
          attempts - 1,
        )),
      );
    }),
  );
}

function wrappedDegrees(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function ensureFlint(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    let current = observation;
    if ((current.inventory.counts["minecraft:flint"] ?? 0) > 0) {
      return;
    }
    if ((current.inventory.counts["minecraft:gravel"] ?? 0) === 0) {
      yield* collectBlocks(state.driver, {
        blockIds: ["minecraft:gravel"],
        count: 8,
        searchRadius: state.strategy.blockSearchRadius,
        path: state.strategy.path,
      });
      yield* collectNearbyDrops(state.driver, {
        radius: 8,
        maximumDrops: 16,
        path: state.strategy.path,
      });
      current = yield* state.driver.observe;
    }
    if ((current.inventory.counts["minecraft:flint"] ?? 0) > 0) {
      return;
    }
    if ((current.inventory.counts["minecraft:gravel"] ?? 0) === 0) {
      return yield* Effect.fail(new BeatGameDriverError({
        operation: "acquire-flint",
        retryable: true,
        message: "Breaking nearby gravel produced neither gravel nor flint",
      }));
    }

    const target = (yield* findWorkstationTargets(
      state.driver,
      current.player.position,
    ))[0];
    if (target === undefined) {
      return yield* Effect.fail(new BeatGameDriverError({
        operation: "acquire-flint",
        retryable: true,
        message: "No supported position is available for recycling gravel",
      }));
    }
    yield* state.driver.pathfind(
      blockCenter(target),
      3,
      {
        ...state.strategy.path,
        allowMining: false,
        allowPlacing: false,
      },
    );

    for (let attempt = 0; attempt < 64; attempt += 1) {
      current = yield* state.driver.observe;
      if ((current.inventory.counts["minecraft:flint"] ?? 0) > 0) {
        return;
      }
      if ((current.inventory.counts["minecraft:gravel"] ?? 0) === 0) {
        yield* collectNearbyDrops(state.driver, {
          radius: 4,
          maximumDrops: 8,
          settleDelayMs: 100,
          path: state.strategy.path,
        });
        current = yield* state.driver.observe;
        if ((current.inventory.counts["minecraft:flint"] ?? 0) > 0) {
          return;
        }
        if ((current.inventory.counts["minecraft:gravel"] ?? 0) === 0) {
          return yield* Effect.fail(new BeatGameDriverError({
            operation: "acquire-flint",
            retryable: true,
            message: "The recycled gravel item could not be recovered",
          }));
        }
      }

      yield* state.driver.act({
        type: "select-item",
        selector: { itemIds: ["minecraft:gravel"] },
      });
      yield* state.driver.act({
        type: "place-block",
        against: { ...target, y: target.y - 1 },
        face: "up",
        hand: "main",
      });
      const placed = yield* waitForExactBlockId(
        state.driver,
        target,
        "minecraft:gravel",
      );
      if (!placed) {
        return yield* Effect.fail(new BeatGameDriverError({
          operation: "acquire-flint",
          retryable: true,
          message: "Gravel placement was not confirmed by the server",
        }));
      }
      yield* state.driver.act({ type: "dig-block", position: target });
      yield* collectNearbyDrops(state.driver, {
        radius: 4,
        maximumDrops: 8,
        settleDelayMs: 100,
        path: state.strategy.path,
      });
    }

    return yield* Effect.fail(new BeatGameDriverError({
      operation: "acquire-flint",
      retryable: true,
      message: "Recycling gravel did not produce flint after 64 attempts",
    }));
  });
}

function waitForExactBlockId(
  driver: BeatGameDriver,
  target: BeatGameBlockPosition,
  blockId: string,
  attempts = 20,
): Effect.Effect<boolean, BeatGameDriverError> {
  return driver.queryBlocks({
    center: blockCenter(target),
    radius: 0.25,
    selector: { blockIds: [blockId] },
    maximumResults: 1,
  }).pipe(
    Effect.flatMap((blocks) =>
      blocks.some(({ position }) => sameBlockPosition(position, target))
        ? Effect.succeed(true)
        : attempts <= 1
        ? Effect.succeed(false)
        : Effect.sleep(50).pipe(
          Effect.zipRight(
            waitForExactBlockId(driver, target, blockId, attempts - 1),
          ),
        )
    ),
  );
}

function ensureString(
  state: RunState,
  observation: BeatGameObservation,
  count: number,
): Effect.Effect<void, BeatGameDriverError | BeatGameError> {
  const missing = Math.max(
    0,
    count - (observation.inventory.counts["minecraft:string"] ?? 0),
  );
  return missing === 0
    ? Effect.void
    : huntOrExplore(
      state,
      observation,
      {
        entityTypes: ["minecraft:spider", "minecraft:cave_spider"],
        alive: true,
      },
      missing,
      "find-spiders",
    );
}

function ensureArrowIngredients(
  state: RunState,
  observation: BeatGameObservation,
  arrowCount: number,
): Effect.Effect<void, BeatGameDriverError | BeatGameError> {
  const operations = Math.ceil(arrowCount / 4);
  const flintMissing = Math.max(
    0,
    operations - (observation.inventory.counts["minecraft:flint"] ?? 0),
  );
  const featherMissing = Math.max(
    0,
    operations - (observation.inventory.counts["minecraft:feather"] ?? 0),
  );
  return Effect.gen(function* () {
    if (flintMissing > 0) {
      yield* collectBlocks(state.driver, {
        blockIds: ["minecraft:gravel"],
        count: flintMissing * 4,
        searchRadius: state.strategy.blockSearchRadius,
        path: state.strategy.path,
      });
    }
    if (featherMissing > 0) {
      yield* huntOrExplore(
        state,
        observation,
        {
          entityTypes: ["minecraft:chicken"],
          alive: true,
        },
        featherMissing,
        "find-chickens",
      );
    }
  });
}

function huntOrExplore(
  state: RunState,
  observation: BeatGameObservation,
  selector: Parameters<BeatGameDriver["queryEntities"]>[0]["selector"],
  maximumTargets: number,
  purpose: string,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  return Effect.gen(function* () {
    const attemptedTargets = new Set<string>();
    const locallyUnreachable = new Set<string>();
    let attacked = 0;
    while (attacked < maximumTargets) {
      const current = yield* state.driver.observe;
      const huntingPath = survivalPathPolicy(
        state.strategy.path,
        current.player.health,
        state.strategy.minimumHealth,
      );
      const explorationPath = {
        ...huntingPath,
        allowMining: false,
      };
      if (yield* needsOverworldSurfaceRecovery(state, current.player.position)) {
        yield* returnToOverworldSurface(state, current.player.position);
        return;
      }
      const checkpoint = yield* Ref.get(state.checkpoint);
      const now = Date.now();
      const unreachableTargets = new Set([
        ...locallyUnreachable,
        ...checkpoint.memory.unreachable
          .filter(({ expiresAt }) =>
            expiresAt === undefined || Date.parse(expiresAt) > now
          )
          .map(({ key }) => key),
      ]);
      const targets = yield* state.driver.queryEntities({
        origin: current.player.position,
        radius: state.strategy.entitySearchRadius,
        selector,
        maximumResults: Math.min(
          256,
          Math.max(16, maximumTargets + attemptedTargets.size),
        ),
      });
      const maximumVerticalDistance =
        current.player.health < state.strategy.minimumHealth ? 12 : 32;
      const candidates = targets.filter((target) =>
        !unreachableTargets.has(
          `target:${target.connectionEpoch}:${target.networkId}`,
        )
        && !attemptedTargets.has(
          `${target.connectionEpoch}:${target.networkId}`,
        )
        && Math.abs(
            target.position.y - current.player.position.y,
          ) <= maximumVerticalDistance
      );
      const target = candidates.reduce<BeatGameEntityObservation | undefined>(
        (nearest, candidate) =>
          nearest === undefined
            || horizontalDistanceSquared(
                candidate.position,
                current.player.position,
              )
                < horizontalDistanceSquared(
                  nearest.position,
                  current.player.position,
                )
            ? candidate
            : nearest,
        undefined,
      );
      if (target === undefined) {
        if (attacked === 0) {
          if (
            yield* needsOverworldSurfaceRecovery(
              state,
              current.player.position,
            )
          ) {
            yield* returnToOverworldSurface(
              state,
              current.player.position,
            );
          } else {
            yield* Effect.raceFirst(
              advanceExplorationFrontier(
                state,
                current.player.position,
                purpose,
                state.strategy.entitySearchRadius,
                explorationPath,
              ),
              waitForVisibleHuntingTarget(
                state,
                selector,
                attemptedTargets,
                unreachableTargets,
              ),
            );
          }
        }
        return;
      }
      const targetId = `${target.connectionEpoch}:${target.networkId}`;
      const targetKey = `target:${targetId}`;
      const targetDistanceSquared = horizontalDistanceSquared(
        target.position,
        current.player.position,
      );
      if (
        targetDistanceSquared
          > HUNT_ATTACK_APPROACH_RADIUS * HUNT_ATTACK_APPROACH_RADIUS
      ) {
        const targetDistance = Math.sqrt(targetDistanceSquared);
        const approachDistance = Math.min(
          HUNT_MAXIMUM_APPROACH_DISTANCE,
          targetDistance - HUNT_ATTACK_APPROACH_RADIUS,
        );
        const approachRatio = approachDistance / targetDistance;
        const approached = yield* state.driver.pathfindXZ(
          current.player.position.x
            + (target.position.x - current.player.position.x) * approachRatio,
          current.player.position.z
            + (target.position.z - current.player.position.z) * approachRatio,
          current.player.position.dimension,
          4,
          explorationPath,
        ).pipe(
          Effect.as(true),
          Effect.catchAll((cause) =>
            cause.operation === "pathfindXZ"
              ? Effect.succeed(false)
              : Effect.fail(cause)
          ),
        );
        if (!approached) {
          locallyUnreachable.add(targetKey);
          yield* persist(state, (currentCheckpoint) => ({
            ...currentCheckpoint,
            memory: {
              ...currentCheckpoint.memory,
              unreachable: [
                ...currentCheckpoint.memory.unreachable,
                {
                  key: targetKey,
                  value: target.position,
                  observedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 600_000).toISOString(),
                  confidence: 1,
                },
              ].slice(-64),
            },
          }));
          continue;
        }
        continue;
      }
      attemptedTargets.add(targetId);
      const claim = yield* state.coordinator.claim({
        teamId: checkpoint.teamId,
        runId: checkpoint.runId,
        botId: checkpoint.botId,
        key: targetKey,
        purpose,
        ttlMs: Math.max(
          state.strategy.claimTtlMs,
          state.strategy.actionTimeoutMs + 5_000,
        ),
      });
      if (claim === undefined) {
        continue;
      }
      yield* emit(state, {
        type: "team-claim-changed",
        claim,
        released: false,
      });
      yield* state.coordinator.publishDiscovery(
        checkpoint.teamId,
        {
          key:
            `resource:${target.entityType}:${target.connectionEpoch}:${target.networkId}`,
          kind: "resource",
          botId: checkpoint.botId,
          position: target.position,
          observedAt: target.observedAt,
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
          confidence: 1,
          metadata: {
            entityType: target.entityType,
            connectionEpoch: target.connectionEpoch,
            networkId: target.networkId,
          },
        },
      );
      const defeated = yield* attackEntity(state.driver, {
        target,
        targetUnavailableTimeoutSeconds: 3,
        selectBestWeapon: true,
        path: huntingPath,
      }).pipe(
        Effect.tapError(() =>
          persist(state, (current) => ({
            ...current,
            memory: {
              ...current.memory,
              unreachable: [
                ...current.memory.unreachable,
                {
                  key: targetKey,
                  value: target.position,
                  observedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 600_000).toISOString(),
                  confidence: 1,
                },
              ].slice(-64),
            },
          })).pipe(Effect.ignore)
        ),
        Effect.as(true),
        Effect.catchTag("BeatGameDriverError", (cause) =>
          cause.code === "not_found"
            || cause.operation === "task.attack-entity"
            ? Effect.sync(() => {
              locallyUnreachable.add(targetKey);
            }).pipe(
              Effect.zipRight(
                current.player.position.dimension === "minecraft:overworld"
                    && target.position.y - current.player.position.y > 6
                  ? returnToOverworldSurface(
                    state,
                    current.player.position,
                  )
                  : Effect.void,
              ),
              Effect.as(false),
            )
            : Effect.fail(cause)
        ),
        Effect.ensuring(releaseActionClaim(state, claim)),
      );
      if (!defeated) {
        continue;
      }
      yield* collectNearbyDrops(state.driver, {
        radius: 8,
        maximumDrops: 16,
        settleDelayMs: 500,
        path: huntingPath,
      });
      attacked += 1;
    }
  });
}

function waitForVisibleHuntingTarget(
  state: RunState,
  selector: Parameters<BeatGameDriver["queryEntities"]>[0]["selector"],
  attemptedTargets: ReadonlySet<string>,
  unreachableTargets: ReadonlySet<string>,
): Effect.Effect<void, BeatGameDriverError> {
  const poll = (): Effect.Effect<void, BeatGameDriverError> =>
    Effect.sleep(Math.max(100, state.strategy.observationPollMs)).pipe(
      Effect.zipRight(state.driver.observe),
      Effect.flatMap((observation) =>
        state.driver.queryEntities({
          origin: observation.player.position,
          radius: state.strategy.entitySearchRadius,
          selector,
          maximumResults: 64,
        }).pipe(
          Effect.flatMap((targets) => {
            const maximumVerticalDistance =
              observation.player.health < state.strategy.minimumHealth
                ? 12
                : 32;
            const found = targets.some((target) =>
              !unreachableTargets.has(
                `target:${target.connectionEpoch}:${target.networkId}`,
              )
              && !attemptedTargets.has(
                `${target.connectionEpoch}:${target.networkId}`,
              )
              && Math.abs(
                  target.position.y - observation.player.position.y,
                ) <= maximumVerticalDistance
            );
            return found ? Effect.void : Effect.suspend(poll);
          }),
        )
      ),
    );
  return Effect.suspend(poll);
}

function survivalPathPolicy(
  path: BeatGameStrategy["path"],
  health: number,
  minimumHealth: number,
): BeatGameStrategy["path"] {
  return health < minimumHealth && path.maxFallDistance > 1
    ? { ...path, maxFallDistance: 1 }
    : path;
}

function needsOverworldSurfaceRecovery(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<boolean, BeatGameDriverError> {
  if (position.dimension !== "minecraft:overworld") {
    return Effect.succeed(false);
  }
  return state.driver.sampleSurface(position, 4, 1).pipe(
    Effect.map((columns) => selectSurfaceColumn(columns, position)),
    Effect.map((surface) =>
      surface !== undefined && surface.surfaceY - position.y > 2
    ),
  );
}

function returnToOverworldSurface(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<void, BeatGameDriverError> {
  return state.driver.sampleSurface(position, 4, 1).pipe(
    Effect.map((columns) => selectSurfaceColumn(columns, position)),
    Effect.flatMap((surface) =>
      state.driver.pathfind(
        surface === undefined
          ? {
            ...position,
            y: Math.max(80, position.y + 48),
          }
          : {
            x: surface.x + 0.5,
            y: surface.surfaceY + 1,
            z: surface.z + 0.5,
            dimension: position.dimension,
          },
        1.5,
        {
          ...state.strategy.path,
          allowMining: true,
          allowPlacing: true,
        },
      )
    ),
  );
}

function selectSurfaceColumn(
  columns: readonly {
    readonly x: number;
    readonly z: number;
    readonly loaded: boolean;
    readonly surfaceY?: number;
    readonly blockId?: string;
  }[],
  position: BeatGamePosition,
): { readonly x: number; readonly z: number; readonly surfaceY: number }
  | undefined {
  return selectSurfaceEscapeColumns(columns, position, 1)[0];
}

function selectSurfaceEscapeColumns(
  columns: readonly {
    readonly x: number;
    readonly z: number;
    readonly loaded: boolean;
    readonly surfaceY?: number;
    readonly blockId?: string;
  }[],
  position: BeatGamePosition,
  maximumResults = AIR_ESCAPE_DIRECTION_SECTORS,
): readonly {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
}[] {
  const candidates = columns.flatMap((column) =>
    column.loaded
      && column.surfaceY !== undefined
      && !isUnsafeSurfaceBlock(column.blockId)
      ? [{ x: column.x, z: column.z, surfaceY: column.surfaceY }]
      : []
  ).sort((left, right) =>
    surfaceHorizontalDistanceSquared(left, position)
      - surfaceHorizontalDistanceSquared(right, position)
  );
  const selected = new Map<number, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const angle = Math.atan2(
      candidate.z + 0.5 - position.z,
      candidate.x + 0.5 - position.x,
    );
    const normalizedAngle = (angle + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.floor(
      normalizedAngle / (Math.PI * 2 / AIR_ESCAPE_DIRECTION_SECTORS),
    );
    if (!selected.has(sector)) {
      selected.set(sector, candidate);
    }
    if (selected.size >= maximumResults) {
      break;
    }
  }
  return [...selected.values()];
}

function surfaceHorizontalDistanceSquared(
  surface: { readonly x: number; readonly z: number },
  position: BeatGamePosition,
): number {
  const deltaX = surface.x + 0.5 - position.x;
  const deltaZ = surface.z + 0.5 - position.z;
  return deltaX * deltaX + deltaZ * deltaZ;
}

function isUnsafeSurfaceBlock(blockId: string | undefined): boolean {
  return blockId === undefined
    || blockId === "minecraft:water"
    || blockId === "minecraft:lava"
    || blockId === "minecraft:powder_snow"
    || blockId.endsWith("_leaves");
}

function explorationPurpose(
  purpose: string,
  position: BeatGamePosition,
  rotation?: number,
): string {
  const cellX = Math.floor(position.x / 32);
  const cellZ = Math.floor(position.z / 32);
  const prefix = `${purpose.slice(0, 40)}:${cellX}:${cellZ}`;
  return rotation === undefined
    ? prefix
    : `${purpose.slice(0, 24)}:${cellX}:${cellZ}:${rotation}`;
}

function advanceExplorationFrontier(
  state: RunState,
  position: BeatGamePosition,
  purpose: string,
  scanRadius: number,
  path: BeatGameStrategy["path"],
): Effect.Effect<void, BeatGameDriverError> {
  const key = `${position.dimension}:${purpose}`;
  const hop = discoveryHopRadius(state, scanRadius);
  return Ref.modify(state.explorationFrontiers, (frontiers) => {
    const existing = frontiers[key];
    const wasExternallyDisplaced = existing?.lastPosition !== undefined
      && horizontalDistanceSquared(existing.lastPosition, position)
        > EXPLORATION_REANCHOR_DISTANCE
          * EXPLORATION_REANCHOR_DISTANCE;
    const frontier = existing?.origin.dimension === position.dimension
        && !wasExternallyDisplaced
      ? existing
      : { origin: position, nextIndex: 1 };
    const offset = squareSpiralOffset(frontier.nextIndex);
    const target = {
      x: frontier.origin.x + offset.x * hop,
      z: frontier.origin.z + offset.z * hop,
    };
    return [
      target,
      {
        ...frontiers,
        [key]: {
          origin: frontier.origin,
          nextIndex: frontier.nextIndex + 1,
        },
      },
    ] as const;
  }).pipe(
    Effect.flatMap((target) =>
      state.driver.pathfindXZ(
        target.x,
        target.z,
        position.dimension,
        2,
        path,
      ).pipe(
        Effect.catchAll((cause) =>
          cause.operation === "pathfindXZ"
            ? recoverSurfaceAfterExplorationFailure(state)
            : Effect.fail(cause)
        ),
        Effect.ensuring(
          state.driver.observe.pipe(
            Effect.flatMap((observation) =>
              Ref.update(state.explorationFrontiers, (frontiers) => {
                const frontier = frontiers[key];
                return frontier === undefined
                  ? frontiers
                  : {
                    ...frontiers,
                    [key]: {
                      ...frontier,
                      lastPosition: observation.player.position,
                    },
                  };
              })
            ),
            Effect.ignore,
          ),
        ),
      )
    ),
  );
}

function recoverSurfaceAfterExplorationFailure(
  state: RunState,
): Effect.Effect<void, BeatGameDriverError> {
  return state.driver.observe.pipe(
    Effect.flatMap((observation) =>
      needsOverworldSurfaceRecovery(
        state,
        observation.player.position,
      ).pipe(
        Effect.flatMap((needsRecovery) =>
          needsRecovery
            ? returnToOverworldSurface(state, observation.player.position)
            : Effect.void
        ),
      )
    ),
  );
}

function squareSpiralOffset(index: number): {
  readonly x: number;
  readonly z: number;
} {
  if (index <= 0) {
    return { x: 0, z: 0 };
  }
  let x = 0;
  let z = 0;
  let deltaX = 1;
  let deltaZ = 0;
  let segmentLength = 1;
  let segmentProgress = 0;
  let segmentsAtLength = 0;
  for (let step = 0; step < index; step += 1) {
    x += deltaX;
    z += deltaZ;
    segmentProgress += 1;
    if (segmentProgress < segmentLength) {
      continue;
    }
    segmentProgress = 0;
    [deltaX, deltaZ] = [-deltaZ, deltaX];
    segmentsAtLength += 1;
    if (segmentsAtLength === 2) {
      segmentsAtLength = 0;
      segmentLength += 1;
    }
  }
  return { x, z };
}

function discoveryHopRadius(
  state: RunState,
  scanRadius: number,
): number {
  return Math.max(
    8,
    Math.min(
      64,
      state.strategy.explorationRadius,
      Math.floor(scanRadius / 2),
    ),
  );
}

function acquireEnderPearls(
  state: RunState,
  observation: BeatGameObservation,
  missing: number,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  return Effect.gen(function* () {
    const endermen = yield* state.driver.queryEntities({
      origin: observation.player.position,
      radius: state.strategy.entitySearchRadius,
      selector: {
        entityTypes: ["minecraft:enderman"],
        alive: true,
      },
      maximumResults: Math.max(1, missing),
    });
    if (endermen.length > 0) {
      yield* huntOrExplore(
        state,
        observation,
        {
          entityTypes: ["minecraft:enderman"],
          alive: true,
        },
        missing,
        "hunt-endermen",
      );
      return;
    }

    const goldIngots =
      observation.inventory.counts["minecraft:gold_ingot"] ?? 0;
    if (goldIngots > 0) {
      const piglins = yield* state.driver.queryEntities({
        origin: observation.player.position,
        radius: state.strategy.entitySearchRadius,
        selector: {
          entityTypes: ["minecraft:piglin"],
          alive: true,
        },
        maximumResults: 1,
      });
      const piglin = piglins[0];
      if (piglin === undefined) {
        yield* explore(state.driver, {
          origin: observation.player.position,
          radius: discoveryHopRadius(
            state,
            state.strategy.entitySearchRadius,
          ),
          maximumWaypoints: 1,
          purpose: "find-bartering-piglin",
          path: state.strategy.path,
        });
        return;
      }
      yield* barterWithPiglin(
        state,
        piglin,
        Math.min(goldIngots, Math.max(1, missing * 2), 8),
      );
      return;
    }

    const nuggets =
      observation.inventory.counts["minecraft:gold_nugget"] ?? 0;
    if (nuggets >= 9) {
      yield* craftWithTable(
        state,
        observation,
        "minecraft:gold_ingot",
        Math.floor(nuggets / 9),
      );
      return;
    }

    yield* collectBlocks(state.driver, {
      blockIds: ["minecraft:nether_gold_ore"],
      count: Math.max(1, Math.min(
        state.strategy.targetGoldCount,
        Math.max(8, missing * 4),
      )),
      searchRadius: state.strategy.blockSearchRadius,
      path: state.strategy.path,
    });
  });
}

function barterWithPiglin(
  state: RunState,
  piglin: BeatGameEntityObservation,
  trades: number,
): Effect.Effect<void, BeatGameDriverError> {
  return state.driver.withControl(
    Effect.gen(function* () {
      yield* state.driver.pathfind(
        piglin.position,
        3,
        state.strategy.path,
      );
      yield* state.driver.act({
        type: "select-item",
        selector: { itemIds: ["minecraft:gold_ingot"] },
      });
      for (let trade = 0; trade < trades; trade += 1) {
        yield* state.driver.act({
          type: "interact-entity",
          connectionEpoch: piglin.connectionEpoch,
          networkId: piglin.networkId,
          hand: "main",
        });
        yield* Effect.sleep(6_500);
        const drops = yield* state.driver.queryEntities({
          origin: piglin.position,
          radius: 12,
          selector: {
            categories: [6],
            alive: true,
          },
          maximumResults: 64,
        });
        for (
          const pearl of drops.filter(({ itemId }) =>
            itemId === "minecraft:ender_pearl"
          )
        ) {
          yield* state.driver.pathfind(
            pearl.position,
            1,
            state.strategy.path,
          );
        }
      }
    }).pipe(
      Effect.ensuring(
        state.driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
      ),
    ),
  );
}

function craftWithTable(
  state: RunState,
  observation: BeatGameObservation,
  resultItemId: string,
  count: number,
): Effect.Effect<void, BeatGameDriverError> {
  return ensureWorkstation(
    state,
    observation,
    "minecraft:crafting_table",
  ).pipe(
    Effect.flatMap((station) =>
      craftItem(state.driver, {
        resultItemId,
        count,
        station,
        path: state.strategy.path,
      })
    ),
  );
}

function ensureWorkstation(
  state: RunState,
  observation: BeatGameObservation,
  blockId: "minecraft:crafting_table" | "minecraft:furnace",
): Effect.Effect<
  BeatGameBlockPosition,
  BeatGameDriverError
> {
  return Effect.gen(function* () {
    const existing = yield* state.driver.queryBlocks({
      center: observation.player.position,
      radius: WORKSTATION_REUSE_RADIUS,
      selector: { blockIds: [blockId] },
      maximumResults: 8,
    });
    for (const candidate of existing) {
      const approached = yield* state.driver.pathfind(
        {
          x: candidate.position.x + 0.5,
          y: candidate.position.y,
          z: candidate.position.z + 0.5,
          dimension: candidate.position.dimension,
        },
        3,
        {
          ...state.strategy.path,
          allowMining: false,
          allowPlacing: false,
        },
      ).pipe(Effect.either);
      if (approached._tag === "Right") {
        return candidate.position;
      }
    }
    const craftingTable = blockId === "minecraft:furnace"
      ? yield* ensureWorkstation(
        state,
        observation,
        "minecraft:crafting_table",
      )
      : undefined;
    const current = yield* state.driver.observe;
    const targets = yield* findWorkstationTargets(
      state.driver,
      current.player.position,
    );
    if ((current.inventory.counts[blockId] ?? 0) === 0) {
      yield* craftItem(state.driver, {
        resultItemId: blockId,
        count: 1,
        ...(craftingTable === undefined ? {} : { station: craftingTable }),
        path: state.strategy.path,
      });
    }
    for (const target of targets) {
      yield* buildStructure(state.driver, {
        origin: target,
        blocks: [{
          offset: { x: 0, y: 0, z: 0 },
          blockId,
        }],
        path: state.strategy.path,
      });
      let placed = yield* queryExactWorkstation(
        state.driver,
        target,
        blockId,
      );
      if (placed === undefined) {
        yield* placeWorkstationDirectly(
          state.driver,
          target,
          blockId,
        ).pipe(Effect.ignore);
        placed = yield* waitForWorkstation(
          state.driver,
          target,
          blockId,
        );
      }
      if (
        placed !== undefined
        && placed.position.x === target.x
        && placed.position.y === target.y
        && placed.position.z === target.z
        && placed.position.dimension === target.dimension
      ) {
        return placed.position;
      }
    }
    return yield* Effect.fail(new BeatGameDriverError({
      operation: "ensure-workstation",
      retryable: true,
      message: `${blockId} could not be placed on any nearby support`,
    }));
  });
}

function placeWorkstationDirectly(
  driver: BeatGameDriver,
  target: BeatGameBlockPosition,
  blockId: "minecraft:crafting_table" | "minecraft:furnace",
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const targetBlock = (yield* driver.queryBlocks({
      center: blockCenter(target),
      radius: 0.25,
      selector: {},
      maximumResults: 1,
    }))[0];
    if (targetBlock !== undefined && !targetBlock.replaceable) {
      yield* driver.act({ type: "dig-block", position: target });
    }
    const cleared = (yield* driver.queryBlocks({
      center: blockCenter(target),
      radius: 0.25,
      selector: { replaceable: true },
      maximumResults: 1,
    })).some(({ position }) => sameBlockPosition(position, target));
    if (!cleared) {
      return yield* Effect.fail(new BeatGameDriverError({
        operation: "place-workstation",
        retryable: true,
        message: `Could not clear a local position for ${blockId}`,
      }));
    }
    yield* driver.act({
      type: "select-item",
      selector: { itemIds: [blockId] },
    });
    yield* driver.act({
      type: "place-block",
      against: {
        ...target,
        y: target.y - 1,
      },
      face: "up",
      hand: "main",
    });
  });
}

function waitForWorkstation(
  driver: BeatGameDriver,
  target: BeatGameBlockPosition,
  blockId: "minecraft:crafting_table" | "minecraft:furnace",
): Effect.Effect<
  BeatGameBlockObservation | undefined,
  BeatGameDriverError
> {
  return Effect.gen(function* () {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const workstation = yield* queryExactWorkstation(
        driver,
        target,
        blockId,
      );
      if (workstation !== undefined) {
        return workstation;
      }
      yield* Effect.sleep(50);
    }
    return undefined;
  });
}

function queryExactWorkstation(
  driver: BeatGameDriver,
  target: BeatGameBlockPosition,
  blockId: "minecraft:crafting_table" | "minecraft:furnace",
): Effect.Effect<
  BeatGameBlockObservation | undefined,
  BeatGameDriverError
> {
  return driver.queryBlocks({
    center: blockCenter(target),
    radius: 0.25,
    selector: { blockIds: [blockId] },
    maximumResults: 1,
  }).pipe(
    Effect.map((blocks) =>
      blocks.find(({ position }) => sameBlockPosition(position, target))
    ),
  );
}

function blockCenter(
  position: BeatGameBlockPosition,
): BeatGamePosition {
  return {
    x: position.x + 0.5,
    y: position.y + 0.5,
    z: position.z + 0.5,
    dimension: position.dimension,
  };
}

function sameBlockPosition(
  left: BeatGameBlockPosition,
  right: BeatGameBlockPosition,
): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.z === right.z
    && left.dimension === right.dimension;
}

function findWorkstationTargets(
  driver: BeatGameDriver,
  position: BeatGamePosition,
): Effect.Effect<readonly BeatGameBlockPosition[], BeatGameDriverError> {
  return Effect.gen(function* () {
    const playerBlock = {
      x: Math.floor(position.x),
      y: Math.floor(position.y),
      z: Math.floor(position.z),
    };
    const supports = yield* driver.queryBlocks({
      center: position,
      radius: 4,
      selector: { replaceable: false },
      maximumResults: 256,
    });
    const candidates = supports
      .map(({ position: support }) => ({
        x: support.x,
        y: support.y + 1,
        z: support.z,
        dimension: support.dimension,
      }))
      .filter((candidate) =>
        candidate.dimension === position.dimension
        && !(
          candidate.x === playerBlock.x
          && candidate.z === playerBlock.z
          && (
            candidate.y === playerBlock.y
            || candidate.y === playerBlock.y - 1
            || candidate.y === playerBlock.y + 1
          )
        )
      )
      .sort((left, right) =>
        workstationDistanceSquared(left, position)
        - workstationDistanceSquared(right, position)
      )
      .slice(0, 64);
    const available: BeatGameBlockPosition[] = [];
    const clearable: BeatGameBlockPosition[] = [];
    for (const candidate of candidates) {
      const replaceable = yield* driver.queryBlocks({
        center: {
          x: candidate.x + 0.5,
          y: candidate.y + 0.5,
          z: candidate.z + 0.5,
          dimension: candidate.dimension,
        },
        radius: 0.25,
        selector: { replaceable: true },
        maximumResults: 1,
      });
      if (replaceable.some(({ position: observed }) =>
        observed.x === candidate.x
        && observed.y === candidate.y
        && observed.z === candidate.z
        && observed.dimension === candidate.dimension
      )) {
        available.push(candidate);
        if (available.length >= 16) {
          break;
        }
        continue;
      }
      const diggable = yield* driver.queryBlocks({
        center: {
          x: candidate.x + 0.5,
          y: candidate.y + 0.5,
          z: candidate.z + 0.5,
          dimension: candidate.dimension,
        },
        radius: 0.25,
        selector: {
          diggable: true,
          interactive: false,
        },
        maximumResults: 1,
      });
      if (diggable.some(({ position: observed }) =>
        observed.x === candidate.x
        && observed.y === candidate.y
        && observed.z === candidate.z
        && observed.dimension === candidate.dimension
      )) {
        clearable.push(candidate);
      }
    }
    return available.length > 0
      ? available
      : clearable.length > 0
      ? clearable.slice(0, 16)
      : yield* Effect.fail(new BeatGameDriverError({
        operation: "find-workstation-targets",
        retryable: true,
        message:
          "No supported open or diggable block is available for a workstation",
      }));
  });
}

function workstationDistanceSquared(
  target: BeatGameBlockPosition,
  player: BeatGamePosition,
): number {
  const dx = target.x + 0.5 - player.x;
  const dy = target.y - player.y;
  const dz = target.z + 0.5 - player.z;
  return dx * dx + dy * dy + dz * dz;
}

function moveToEyeBaseline(
  state: RunState,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    const latest = checkpoint.memory.eyeSamples.at(-1);
    if (latest === undefined) {
      return;
    }
    const baseline = Math.max(32, Math.min(
      192,
      state.strategy.explorationRadius,
    ));
    yield* state.driver.pathfind({
      x: latest.origin.x - latest.direction.z * baseline,
      y: latest.origin.y,
      z: latest.origin.z + latest.direction.x * baseline,
      dimension: latest.origin.dimension,
    }, 4, state.strategy.path);
  });
}

function enterKnownPortal(
  state: RunState,
  checkpoint: BeatGameCheckpoint,
  observation: BeatGameObservation,
): Effect.Effect<boolean, BeatGameError | BeatGameDriverError> {
  return Effect.gen(function* () {
    const nearby = yield* state.driver.queryBlocks({
      center: observation.player.position,
      radius: 48,
      selector: { blockIds: ["minecraft:nether_portal"] },
      maximumResults: 16,
    });
    const immediate = nearby[0];
    if (immediate !== undefined) {
      yield* enterPortal(state.driver, {
        portal: immediate.position,
        path: state.strategy.path,
      });
      return true;
    }

    const remembered = checkpoint.memory.portals
      .filter(({ value }) =>
        value.position.dimension
          === observation.player.position.dimension
      )
      .sort((left, right) =>
        right.confidence - left.confidence
        || Date.parse(right.observedAt) - Date.parse(left.observedAt)
      );
    for (const memory of remembered) {
      const approached = yield* state.driver.pathfind(
        memory.value.position,
        8,
        state.strategy.path,
      ).pipe(Effect.either);
      if (approached._tag === "Left") {
        continue;
      }
      const revalidated = yield* state.driver.queryBlocks({
        center: memory.value.position,
        radius: 8,
        selector: { blockIds: ["minecraft:nether_portal"] },
        maximumResults: 16,
      });
      const portal = revalidated[0];
      if (portal === undefined) {
        continue;
      }
      yield* enterPortal(state.driver, {
        portal: portal.position,
        path: state.strategy.path,
      });
      return true;
    }
    return false;
  });
}

function searchStronghold(
  state: RunState,
): Effect.Effect<boolean, BeatGameError | BeatGameDriverError> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    const estimate = checkpoint.memory.strongholdEstimate;
    if (estimate === undefined) {
      return false;
    }
    let approachObservation = yield* state.driver.observe;
    const surveyPortalFrames = state.driver.queryBlocks({
      center: {
        ...estimate,
        y: 32,
      },
      radius: Math.min(
        128,
        Math.max(64, state.strategy.blockSearchRadius),
      ),
      selector: { blockIds: ["minecraft:end_portal_frame"] },
      maximumResults: 12,
    });
    let surveyedFrames = yield* surveyPortalFrames;
    if (surveyedFrames.length === 0) {
      yield* state.driver.pathfind({
        ...estimate,
        y: Math.floor(approachObservation.player.position.y),
      }, 16, state.strategy.path);
      approachObservation = yield* state.driver.observe;
      surveyedFrames = yield* surveyPortalFrames;
    }
    if (surveyedFrames.length > 0) {
      yield* approachStrongholdPortalRoom(
        state,
        surveyedFrames,
        estimate,
        approachObservation.player.position,
      );
      return true;
    }
    const undergroundTarget = {
      ...estimate,
      y: Math.min(32, estimate.y - 24),
    };
    yield* state.driver.pathfind(
      undergroundTarget,
      16,
      state.strategy.path,
    );
    const observation = yield* state.driver.observe;
    const frames = yield* state.driver.queryBlocks({
      center: observation.player.position,
      radius: 96,
      selector: { blockIds: ["minecraft:end_portal_frame"] },
      maximumResults: 12,
    });
    if (frames.length > 0) {
      yield* approachStrongholdPortalRoom(
        state,
        frames,
        estimate,
        observation.player.position,
      );
      return true;
    }
    yield* explore(state.driver, {
      origin: {
        x: Math.floor(observation.player.position.x),
        y: Math.floor(observation.player.position.y),
        z: Math.floor(observation.player.position.z),
        dimension: observation.player.position.dimension,
      },
      radius: 96,
      maximumWaypoints: 2,
      purpose: "find-stronghold-portal",
      path: state.strategy.path,
    });
    return false;
  });
}

function approachStrongholdPortalRoom(
  state: RunState,
  frames: readonly BeatGameBlockObservation[],
  estimate: BeatGamePosition,
  currentPosition: BeatGamePosition,
): Effect.Effect<void, BeatGameDriverError> {
  const destination = strongholdEntryPosition(frames, estimate);
  const current = floorBlockPosition(currentPosition);
  const depth = current.y - destination.y;
  if (depth <= 0) {
    return state.driver.pathfind(
      destination,
      4,
      state.strategy.path,
    );
  }
  return excavateStaircase(state.driver, {
    from: staircaseStartPosition(destination, current),
    to: destination,
    path: state.strategy.path,
    openSpaceHandoffRadius: 1,
  });
}

function staircaseStartPosition(
  destination: BeatGameBlockPosition,
  current: BeatGameBlockPosition,
): BeatGameBlockPosition {
  const depth = current.y - destination.y;
  let x = current.x;
  let z = current.z;
  let xDistance = Math.abs(destination.x - x);
  let zDistance = Math.abs(destination.z - z);
  let excessDistance = xDistance + zDistance - depth;
  if (excessDistance > 0) {
    const xReduction = Math.min(xDistance, excessDistance);
    x += Math.sign(destination.x - x) * xReduction;
    xDistance -= xReduction;
    excessDistance -= xReduction;
    const zReduction = Math.min(zDistance, excessDistance);
    z += Math.sign(destination.z - z) * zReduction;
    zDistance -= zReduction;
  }
  if ((depth - xDistance - zDistance) % 2 !== 0) {
    if (xDistance > 0) {
      x += Math.sign(destination.x - x);
    } else if (zDistance > 0) {
      z += Math.sign(destination.z - z);
    } else {
      x += 1;
    }
  }
  return {
    x,
    y: current.y,
    z,
    dimension: destination.dimension,
  };
}

function floorBlockPosition(
  position: BeatGamePosition,
): BeatGameBlockPosition {
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z),
    dimension: position.dimension,
  };
}

function strongholdEntryPosition(
  frames: readonly BeatGameBlockObservation[],
  origin: BeatGamePosition,
): BeatGameBlockPosition {
  const minimumX = Math.min(...frames.map(({ position }) => position.x));
  const maximumX = Math.max(...frames.map(({ position }) => position.x));
  const minimumY = Math.min(...frames.map(({ position }) => position.y));
  const minimumZ = Math.min(...frames.map(({ position }) => position.z));
  const maximumZ = Math.max(...frames.map(({ position }) => position.z));
  const centerX = Math.round((minimumX + maximumX) / 2);
  const centerZ = Math.round((minimumZ + maximumZ) / 2);
  const dimension = frames[0]?.position.dimension ?? origin.dimension;
  const candidates: readonly BeatGameBlockPosition[] = [
    {
      x: centerX,
      y: minimumY + 1,
      z: minimumZ - 2,
      dimension,
    },
    {
      x: centerX,
      y: minimumY + 1,
      z: maximumZ + 2,
      dimension,
    },
    {
      x: minimumX - 2,
      y: minimumY + 1,
      z: centerZ,
      dimension,
    },
    {
      x: maximumX + 2,
      y: minimumY + 1,
      z: centerZ,
      dimension,
    },
  ];
  return candidates.reduce((nearest, candidate) =>
      horizontalDistanceSquared(candidate, origin)
          < horizontalDistanceSquared(nearest, origin)
        ? candidate
        : nearest
  );
}

function horizontalDistanceSquared(
  left: Pick<BeatGamePosition, "x" | "z">,
  right: Pick<BeatGamePosition, "x" | "z">,
): number {
  return (left.x - right.x) ** 2 + (left.z - right.z) ** 2;
}

function fightDragon(
  state: RunState,
): Effect.Effect<ActionResult, BeatGameDriverError> {
  return Effect.gen(function* () {
    yield* fightEnderDragon(state.driver, {
      searchRadius: 320,
      path: state.strategy.path,
    });
    return { phase: BeatGamePhase.COLLECT_DRAGON_EGG };
  });
}

function advancePhase(
  state: RunState,
  phase: BeatGamePhase,
): Effect.Effect<void, BeatGameError> {
  return Effect.gen(function* () {
    const current = yield* Ref.get(state.checkpoint);
    if (current.planner.phase === phase) {
      return;
    }
    yield* persist(state, (checkpoint) => ({
      ...checkpoint,
      planner: withoutCurrentAction({
        ...checkpoint.planner,
        phase,
        objective: objectiveForPhase(phase),
        requirements: [],
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      }),
    }));
    yield* state.coordinator.updateMember(
      current.teamId,
      current.botId,
      phase,
      BeatGameRunStatus.RUNNING,
    );
    yield* emit(state, {
      type: "phase-changed",
      previous: current.planner.phase,
      current: phase,
    });
    yield* emit(state, {
      type: "objective-changed",
      objective: objectiveForPhase(phase),
    });
  });
}

function completeRun(
  state: RunState,
): Effect.Effect<BeatGameResult, BeatGameError> {
  return Effect.gen(function* () {
    const completedAt = new Date().toISOString();
    const finalCheckpoint = yield* persist(state, (checkpoint) => ({
      ...checkpoint,
      planner: withoutCurrentAction({
        ...checkpoint.planner,
        status: BeatGameRunStatus.COMPLETED,
        objective: objectiveForPhase(BeatGamePhase.COMPLETE),
        updatedAt: completedAt,
      }),
    }));
    yield* state.coordinator.updateMember(
      finalCheckpoint.teamId,
      finalCheckpoint.botId,
      BeatGamePhase.COMPLETE,
      BeatGameRunStatus.COMPLETED,
    );
    yield* emit(state, { type: "run-completed" });
    return {
      runId: finalCheckpoint.runId,
      teamId: finalCheckpoint.teamId,
      instanceId: finalCheckpoint.instanceId,
      botId: finalCheckpoint.botId,
      completedAt,
      durationMs: Date.now() - state.startedAtMs,
      finalCheckpoint,
    };
  });
}

function observeFresh(
  state: RunState,
): Effect.Effect<BeatGameObservation, BeatGameError> {
  return observeDriverFresh(state).pipe(
    Effect.flatMap((observation) =>
      Ref.get(state.pendingDeaths).pipe(
        Effect.map((pendingDeaths) => {
          const pendingDeath = pendingDeaths.at(-1);
          if (pendingDeath === undefined) {
            return observation;
          }
          return {
            ...observation,
            observedAt: pendingDeath.observedAt,
            player: {
              ...observation.player,
              position: pendingDeath.position,
              health: 0,
              dead: true,
            },
          };
        }),
      )
    ),
  );
}

function hasMeaningfulRecoveryInventory(
  observation: BeatGameObservation,
): boolean {
  return Object.entries(observation.inventory.counts).some(
    ([itemId, count]) =>
      count > 0 && !DISPOSABLE_DEATH_RECOVERY_ITEM_IDS.has(itemId),
  );
}

function updateObservedState(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<void> {
  return Effect.all([
    Ref.set(state.observation, observation),
    observation.player.dead
      ? Effect.void
      : Ref.set(state.lastLivingObservation, observation),
  ], { discard: true });
}

function observeDriverFresh(
  state: RunState,
): Effect.Effect<BeatGameObservation, BeatGameError> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    return yield* state.driver.observe.pipe(
      Effect.mapError((cause) =>
        observationError(
          checkpoint.runId,
          state.driver,
          checkpoint.planner.phase,
          cause,
        )
      ),
      Effect.tap((observation) => updateObservedState(state, observation)),
    );
  });
}

function monitorDriverEvents(
  state: RunState,
): Effect.Effect<void, never> {
  return state.driver.events.pipe(
    Stream.runForEach((event) => {
      if (event.type !== "bot-died") {
        return Effect.void;
      }
      return Ref.get(state.lastLivingObservation).pipe(
        Effect.flatMap((lastLivingObservation) =>
          state.driver.observe.pipe(
            Effect.tap((observation) =>
              updateObservedState(state, observation)
            ),
            Effect.catchAll(() => Ref.get(state.observation)),
            Effect.map((observation) => ({
              lastLivingObservation,
              observation,
            })),
          )
        ),
        Effect.flatMap(({ lastLivingObservation, observation }) =>
          enqueuePendingDeath(state, {
            observedAt: event.observedAt,
            position: observation.player.dead
              ? observation.player.position
              : lastLivingObservation.player.position,
            recoverItems: hasMeaningfulRecoveryInventory(
              lastLivingObservation,
            ),
            ...(event.message === undefined
              ? {}
              : { message: event.message }),
          })
        ),
      );
    }),
    Effect.catchAll(() => Effect.void),
  );
}

function enqueuePendingDeath(
  state: RunState,
  pendingDeath: PendingDeath,
): Effect.Effect<void> {
  return Ref.update(state.pendingDeaths, (pendingDeaths) => {
    const duplicateIndex = pendingDeaths.findIndex((candidate) =>
      candidate.observedAt === pendingDeath.observedAt
      || samePosition(candidate.position, pendingDeath.position)
    );
    if (duplicateIndex === -1) {
      return [...pendingDeaths, pendingDeath];
    }
    const duplicate = pendingDeaths[duplicateIndex];
    if (
      duplicate === undefined
      || duplicate.recoverItems
      || !pendingDeath.recoverItems
    ) {
      return pendingDeaths;
    }
    return pendingDeaths.map((candidate, index) =>
      index === duplicateIndex
        ? { ...candidate, recoverItems: true }
        : candidate
    );
  });
}

function completePendingDeath(
  state: RunState,
  observedAt: string,
): Effect.Effect<void> {
  return Ref.update(
    state.pendingDeaths,
    (pendingDeaths) =>
      pendingDeaths.filter((pendingDeath) =>
        pendingDeath.observedAt !== observedAt
      ),
  );
}

function observeWithRecovery(
  state: RunState,
): Effect.Effect<BeatGameObservation, BeatGameError> {
  const attempt = (
    recovering: boolean,
    retryCount: number,
  ): Effect.Effect<BeatGameObservation, BeatGameError> =>
    observeFresh(state).pipe(
      Effect.tap((observation) =>
        !recovering
          ? Effect.void
          : Effect.gen(function* () {
            const checkpoint = yield* Ref.get(state.checkpoint);
            const paused = yield* Ref.get(state.paused);
            const status = paused
              ? BeatGameRunStatus.PAUSED
              : BeatGameRunStatus.RUNNING;
            yield* persist(state, (current) => ({
              ...current,
              connectionEpoch: observation.player.connectionEpoch,
              planner: {
                ...current.planner,
                status,
                updatedAt: new Date().toISOString(),
              },
            }));
            yield* state.coordinator.updateMember(
              checkpoint.teamId,
              checkpoint.botId,
              checkpoint.planner.phase,
              status,
            );
            yield* emit(state, {
              type: "bot-recovered",
              detail:
                `Observation stream recovered after ${retryCount} retries`,
            });
          })
      ),
      Effect.catchAll((error) => {
        if (!error.retryable) {
          return Effect.fail(error);
        }
        const enterRecovery = recovering
          ? Effect.void
          : Effect.gen(function* () {
            const checkpoint = yield* persist(state, (current) => ({
              ...current,
              planner: {
                ...current.planner,
                status: BeatGameRunStatus.RECOVERING,
                updatedAt: new Date().toISOString(),
              },
            }));
            yield* state.coordinator.updateMember(
              checkpoint.teamId,
              checkpoint.botId,
              checkpoint.planner.phase,
              BeatGameRunStatus.RECOVERING,
            );
            yield* emit(state, {
              type: "bot-disconnected",
              detail: error.message,
            });
          });
        return enterRecovery.pipe(
          Effect.zipRight(Effect.sleep(backoffDuration(retryCount + 1))),
          Effect.zipRight(attempt(true, retryCount + 1)),
        );
      }),
    );
  return attempt(false, 0);
}

function persist(
  state: RunState,
  update: (checkpoint: BeatGameCheckpoint) => BeatGameCheckpoint,
): Effect.Effect<BeatGameCheckpoint, BeatGameError> {
  return state.checkpointMutex.withPermits(1)(Effect.uninterruptible(
    Effect.gen(function* () {
    const current = yield* Ref.get(state.checkpoint);
    const now = new Date().toISOString();
    const updated = update(current);
    const next: BeatGameCheckpoint = {
      ...updated,
      revision: current.revision + 1,
      updatedAt: now,
      planner: {
        ...updated.planner,
        updatedAt: updated.planner.updatedAt || now,
      },
    };
    const stored = yield* state.store.save(next, current.revision);
    yield* Ref.set(state.checkpoint, stored);
    yield* publishSnapshot(state);
    yield* emit(state, {
      type: "checkpoint-saved",
      revision: stored.revision,
    });
    return stored;
    }),
  ));
}

function currentSnapshot(
  state: RunState,
): Effect.Effect<BeatGameSnapshot, BeatGameError> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    const observation = yield* Ref.get(state.observation);
    const team = yield* state.coordinator.snapshot(checkpoint.teamId);
    return { checkpoint, observation, team };
  });
}

function mergeSharedDiscoveries(
  state: RunState,
  checkpoint: BeatGameCheckpoint,
): Effect.Effect<BeatGameCheckpoint, BeatGameError> {
  return Effect.gen(function* () {
    const team = yield* state.coordinator.snapshot(checkpoint.teamId);
    const knownPortals = new Set(
      checkpoint.memory.portals.map(({ key }) => key),
    );
    const sharedPortals = team.discoveries
      .filter(({ kind, key }) =>
        kind === "portal" && !knownPortals.has(key)
      )
      .map((discovery) => ({
        key: discovery.key,
        value: {
          blockId: "minecraft:nether_portal",
          position: {
            x: Math.floor(discovery.position.x),
            y: Math.floor(discovery.position.y),
            z: Math.floor(discovery.position.z),
            dimension: discovery.position.dimension,
          },
          properties: {},
          diggable: false,
          replaceable: false,
          interactive: false,
          observedAt: discovery.observedAt,
        },
        observedAt: discovery.observedAt,
        ...(discovery.expiresAt === undefined
          ? {}
          : { expiresAt: discovery.expiresAt }),
        confidence: discovery.confidence,
      }));
    const knownEyeSamples = new Set(
      checkpoint.memory.eyeSamples.map((sample) =>
        `${sample.observedAt}:${positionKey(sample.origin)}`
      ),
    );
    const sharedEyeSamples = team.discoveries.flatMap((discovery) => {
      if (discovery.kind !== "eye-sample") {
        return [];
      }
      const directionX = discovery.metadata?.directionX;
      const directionZ = discovery.metadata?.directionZ;
      const key = `${discovery.observedAt}:${positionKey(discovery.position)}`;
      if (
        knownEyeSamples.has(key)
        || typeof directionX !== "number"
        || typeof directionZ !== "number"
      ) {
        return [];
      }
      return [{
        origin: discovery.position,
        direction: { x: directionX, z: directionZ },
        observedAt: discovery.observedAt,
        confidence: discovery.confidence,
      }];
    });
    const stronghold = team.discoveries
      .filter(({ kind }) => kind === "stronghold")
      .sort((left, right) =>
        right.confidence - left.confidence
        || Date.parse(right.observedAt) - Date.parse(left.observedAt)
      )[0]?.position;
    const changedStronghold = stronghold !== undefined
      && (
        checkpoint.memory.strongholdEstimate === undefined
        || !samePosition(checkpoint.memory.strongholdEstimate, stronghold)
      );
    if (
      sharedPortals.length === 0
      && sharedEyeSamples.length === 0
      && !changedStronghold
    ) {
      return checkpoint;
    }
    return yield* persist(state, (current) => ({
      ...current,
      memory: {
        ...current.memory,
        portals: [
          ...current.memory.portals,
          ...sharedPortals,
        ].slice(-64),
        eyeSamples: [
          ...current.memory.eyeSamples,
          ...sharedEyeSamples,
        ].slice(-32),
        ...(stronghold === undefined
          ? {}
          : { strongholdEstimate: stronghold }),
      },
    }));
  });
}

function publishSnapshot(
  state: RunState,
): Effect.Effect<void, BeatGameError> {
  return currentSnapshot(state).pipe(
    Effect.flatMap((snapshot) => state.snapshots.publish(snapshot)),
  );
}

function emit(
  state: RunState,
  input: EventInput,
): Effect.Effect<void, never> {
  return state.eventMutex.withPermits(1)(
    Effect.gen(function* () {
      const checkpoint = yield* Ref.get(state.checkpoint);
      const sequence = yield* Ref.updateAndGet(
        state.sequence,
        (current) => current + 1n,
      );
      const event = {
        ...input,
        sequence,
        timestamp: new Date().toISOString(),
        runId: checkpoint.runId,
        instanceId: checkpoint.instanceId,
        botId: checkpoint.botId,
        phase: checkpoint.planner.phase,
      } as BeatGameEvent;
      yield* state.events.publish(event);
    }),
  );
}

function awaitRunnable(
  state: RunState,
): Effect.Effect<void, BeatGameError> {
  return Effect.gen(function* () {
    if (yield* Deferred.isDone(state.stopped)) {
      const checkpoint = yield* Ref.get(state.checkpoint);
      return yield* Effect.fail(cancelled(checkpoint, "stopped"));
    }
    while (yield* Ref.get(state.paused)) {
      if (yield* Deferred.isDone(state.stopped)) {
        const checkpoint = yield* Ref.get(state.checkpoint);
        return yield* Effect.fail(cancelled(checkpoint, "stopped"));
      }
      yield* Effect.sleep(50);
    }
  });
}

function cancellable<A>(
  state: RunState,
  effect: Effect.Effect<A, BeatGameError>,
): Effect.Effect<A, BeatGameError> {
  const stopped = Deferred.await(state.stopped).pipe(
    Effect.flatMap(() =>
      Ref.get(state.checkpoint).pipe(
        Effect.flatMap((checkpoint) =>
          Effect.fail(cancelled(checkpoint, "stopped"))
        ),
      )
    ),
  );
  return Effect.raceFirst(effect, stopped);
}

function claimAction(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
): Effect.Effect<BeatGameClaim | undefined, BeatGameError> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    const baseKey = decision.type === "satisfy-requirement"
      ? `requirement:${decision.requirement.key}`
      : `${checkpoint.planner.phase}:${decision.action}`;
    const capacity = decision.type === "activate-end-portal"
      ? state.strategy.maximumConcurrentEndEntries
      : 1;
    let claim: BeatGameClaim | undefined;
    for (let slot = 0; slot < capacity; slot += 1) {
      claim = yield* state.coordinator.claim({
        teamId: checkpoint.teamId,
        runId: checkpoint.runId,
        botId: checkpoint.botId,
        key: capacity === 1 ? baseKey : `${baseKey}:${slot}`,
        purpose: decision.action,
        ttlMs: Math.max(
          state.strategy.claimTtlMs,
          state.strategy.actionTimeoutMs + 5_000,
        ),
      });
      if (claim !== undefined) {
        break;
      }
    }
    if (claim === undefined) {
      return undefined;
    }
    yield* emit(state, {
      type: "team-claim-changed",
      claim,
      released: false,
    });
    if (decision.type === "satisfy-requirement") {
      yield* emit(state, {
        type: "requirement-claimed",
        requirement: decision.requirement,
        claim,
      });
    }
    return claim;
  });
}

function releaseActionClaim(
  state: RunState,
  claim: BeatGameClaim,
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    const released = yield* state.coordinator.release(
      checkpoint.teamId,
      claim.key,
      checkpoint.botId,
    ).pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (released) {
      yield* emit(state, {
        type: "team-claim-changed",
        claim,
        released: true,
      });
    }
  });
}

function markFailed(
  state: RunState,
  error: BeatGameError,
): Effect.Effect<void, never> {
  return persist(state, (checkpoint) => ({
    ...checkpoint,
    planner: {
      ...checkpoint.planner,
      status: BeatGameRunStatus.FAILED,
      updatedAt: new Date().toISOString(),
    },
  })).pipe(
    Effect.zipRight(emit(state, {
      type: "diagnostic",
      message: error.message,
      data: { error: error._tag },
    })),
    Effect.ignore,
  );
}

function createInitialCheckpoint(
  runId: string,
  teamId: string,
  driver: BeatGameDriver,
  role: BeatGameTeamRole,
  observation: BeatGameObservation,
  strategy: BeatGameStrategy,
): BeatGameCheckpoint {
  const now = new Date().toISOString();
  return {
    schemaVersion: BEAT_GAME_CHECKPOINT_SCHEMA_VERSION,
    runId,
    teamId,
    instanceId: driver.instanceId,
    botId: driver.botId,
    role,
    revision: 1,
    connectionEpoch: observation.player.connectionEpoch,
    planner: {
      phase: BeatGamePhase.PREPARE_OVERWORLD,
      status: BeatGameRunStatus.CREATED,
      objective: objectiveForPhase(BeatGamePhase.PREPARE_OVERWORLD),
      requirements: plannerWithObservation({
        phase: BeatGamePhase.PREPARE_OVERWORLD,
        status: BeatGameRunStatus.CREATED,
        objective: objectiveForPhase(BeatGamePhase.PREPARE_OVERWORLD),
        requirements: [],
        retryCount: 0,
        completedActions: [],
        startedAt: now,
        updatedAt: now,
      }, observation, strategy).requirements,
      retryCount: 0,
      completedActions: [],
      startedAt: now,
      updatedAt: now,
    },
    memory: emptyBeatGameWorldMemory(),
    createdAt: now,
    updatedAt: now,
  };
}

function validateRestoredCheckpoint(
  checkpoint: BeatGameCheckpoint | undefined,
  driver: BeatGameDriver,
  teamId: string,
): void {
  if (checkpoint === undefined) {
    return;
  }
  assertValidCheckpoint(checkpoint);
  if (
    checkpoint.instanceId !== driver.instanceId
    || checkpoint.botId !== driver.botId
    || checkpoint.teamId !== teamId
  ) {
    throw new TypeError(
      "The restored checkpoint belongs to another bot, instance, or team",
    );
  }
}

function mergeStrategy(
  override: BeatGameStrategyOptions | undefined,
): BeatGameStrategy {
  const strategy: BeatGameStrategy = {
    ...defaultBeatGameStrategy,
    ...override,
    path: {
      ...defaultBeatGameStrategy.path,
      ...(override?.path ?? {}),
    },
  };
  validateStrategy(strategy);
  return strategy;
}

function validateStrategy(strategy: BeatGameStrategy): void {
  for (const [name, value] of Object.entries({
    targetFoodCount: strategy.targetFoodCount,
    targetLogCount: strategy.targetLogCount,
    targetCobblestoneCount: strategy.targetCobblestoneCount,
    targetIronCount: strategy.targetIronCount,
    targetGoldCount: strategy.targetGoldCount,
    targetBlazeRodCount: strategy.targetBlazeRodCount,
    targetEnderPearlCount: strategy.targetEnderPearlCount,
    targetEyeCount: strategy.targetEyeCount,
    targetObsidianCount: strategy.targetObsidianCount,
    maximumActionRetries: strategy.maximumActionRetries,
  })) {
    requireNonNegativeInteger(value, name);
  }
  for (const [name, value] of Object.entries({
    blockSearchRadius: strategy.blockSearchRadius,
    entitySearchRadius: strategy.entitySearchRadius,
    explorationRadius: strategy.explorationRadius,
    actionTimeoutMs: strategy.actionTimeoutMs,
    observationPollMs: strategy.observationPollMs,
    claimTtlMs: strategy.claimTtlMs,
    maximumConcurrentEndEntries: strategy.maximumConcurrentEndEntries,
    maxFallDistance: strategy.path.maxFallDistance,
    maxSearchTimeMs: strategy.path.maxSearchTimeMs,
  })) {
    requirePositiveInteger(value, name);
  }
  if (
    !Number.isFinite(strategy.minimumHealth)
    || strategy.minimumHealth <= 0
    || strategy.minimumHealth > 20
  ) {
    throw new RangeError("minimumHealth must be greater than 0 and at most 20");
  }
  if (
    !Number.isFinite(strategy.eatBelowFood)
    || strategy.eatBelowFood < 0
    || strategy.eatBelowFood > 20
  ) {
    throw new RangeError("eatBelowFood must be between 0 and 20");
  }
  if (
    strategy.portalStrategy !== PortalStrategy.CAST
    && strategy.targetObsidianCount < NETHER_PORTAL_FRAME_OBSIDIAN_COUNT
  ) {
    throw new RangeError(
      `targetObsidianCount must be at least ${
        NETHER_PORTAL_FRAME_OBSIDIAN_COUNT
      } unless portalStrategy is CAST`,
    );
  }
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function roleForIndex(index: number): BeatGameTeamRole {
  const roles: readonly BeatGameTeamRole[] = [
    BeatGameTeamRole.LEAD,
    BeatGameTeamRole.PORTAL_ENGINEER,
    BeatGameTeamRole.NETHER_RUNNER,
    BeatGameTeamRole.STRONGHOLD_SCOUT,
    BeatGameTeamRole.END_SUPPORT,
  ];
  return roles[index % roles.length] ?? BeatGameTeamRole.END_SUPPORT;
}

function observationError(
  runId: string,
  driver: BeatGameDriver,
  phase: BeatGamePhase,
  cause: BeatGameDriverError,
): BeatGameObservationError {
  return new BeatGameObservationError({
    runId,
    instanceId: driver.instanceId,
    botId: driver.botId,
    phase,
    retryable: cause.retryable,
    message: cause.message,
    cause,
  });
}

function actionError(
  checkpoint: BeatGameCheckpoint | undefined,
  message: string,
  isRetryable: boolean,
  cause?: unknown,
): BeatGameActionError {
  return new BeatGameActionError({
    runId: checkpoint?.runId ?? "",
    instanceId: checkpoint?.instanceId ?? "",
    botId: checkpoint?.botId ?? "",
    phase: checkpoint?.planner.phase ?? BeatGamePhase.PREPARE_OVERWORLD,
    ...(checkpoint?.planner.currentAction === undefined
      ? {}
      : { action: checkpoint.planner.currentAction }),
    retryable: isRetryable,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function pathfindingError(
  checkpoint: BeatGameCheckpoint,
  cause: BeatGameDriverError,
): BeatGamePathfindingError {
  return new BeatGamePathfindingError({
    runId: checkpoint.runId,
    instanceId: checkpoint.instanceId,
    botId: checkpoint.botId,
    phase: checkpoint.planner.phase,
    ...(checkpoint.planner.currentAction === undefined
      ? {}
      : { action: checkpoint.planner.currentAction }),
    retryable: cause.retryable,
    message: cause.message,
    cause,
  });
}

function cancelled(
  checkpoint: BeatGameCheckpoint,
  reason: string,
): BeatGameCancelled {
  return new BeatGameCancelled({
    runId: checkpoint.runId,
    instanceId: checkpoint.instanceId,
    botId: checkpoint.botId,
    phase: checkpoint.planner.phase,
    ...(checkpoint.planner.currentAction === undefined
      ? {}
      : { action: checkpoint.planner.currentAction }),
    retryable: false,
    message: `Beat-game run ${checkpoint.runId} was ${reason}`,
    reason,
  });
}

function retryable(error: BeatGameError): boolean {
  return "retryable" in error && error.retryable;
}

function isBeatGameError(value: unknown): value is BeatGameError {
  if (!(value instanceof Error) || !("_tag" in value)) {
    return false;
  }
  return [
    "BeatGameActionError",
    "BeatGameCancelled",
    "BeatGameCheckpointError",
    "BeatGameCoordinationError",
    "BeatGameDriverError",
    "BeatGameObservationError",
    "BeatGamePathfindingError",
    "BeatGameProtocolError",
    "BeatGameRequirementError",
  ].includes(String(value._tag));
}

function actionObservedComplete(
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  observation: BeatGameObservation,
  strategy: BeatGameStrategy,
): boolean {
  switch (decision.type) {
    case "recover-death":
      return !observation.player.dead;
    case "eat":
      return observation.player.food > strategy.eatBelowFood;
    case "retreat":
      return observation.player.health >= strategy.minimumHealth;
    case "satisfy-requirement":
      return requirementCount(
        observation.inventory,
        decision.requirement,
      ) >= decision.requirement.targetCount;
    case "build-and-enter-nether":
      return isNether(observation.player.position.dimension);
    case "return-through-portal":
      return !isNether(observation.player.position.dimension);
    case "activate-end-portal":
      return isEnd(observation.player.position.dimension);
    case "collect-dragon-egg":
      return (observation.inventory.counts["minecraft:dragon_egg"] ?? 0) > 0;
    case "exit-end":
      return !isEnd(observation.player.position.dimension);
    case "prepare-equipment":
    case "throw-eye":
    case "search-stronghold":
    case "fight-ender-dragon":
      return false;
  }
}

function backoffDuration(attempt: number): number {
  return Math.min(5_000, 250 * 2 ** Math.max(0, attempt - 1));
}

function resolvePortalBuildOrigin(
  driver: BeatGameDriver,
  observation: BeatGameObservation,
): Effect.Effect<BeatGameBlockPosition, BeatGameDriverError> {
  const player = observation.player.position;
  const x = Math.floor(player.x) - 1;
  const z = Math.floor(player.z) + 2;
  const highestY = Math.floor(player.y);
  const lowestY = highestY - 12;
  const findFloor = (
    y: number,
  ): Effect.Effect<number, BeatGameDriverError> => {
    if (y < lowestY) {
      return Effect.fail(new BeatGameDriverError({
        operation: "resolvePortalBuildOrigin",
        retryable: true,
        message:
          `Could not find solid ground below the planned portal at ${x}, ${z}`,
      }));
    }
    const candidate: BeatGameBlockPosition = {
      x: x + 1,
      y,
      z,
      dimension: player.dimension,
    };
    return driver.queryBlocks({
      center: {
        ...candidate,
        x: candidate.x + 0.5,
        y: candidate.y + 0.5,
        z: candidate.z + 0.5,
      },
      radius: 0.25,
      selector: { replaceable: false },
      maximumResults: 1,
    }).pipe(
      Effect.flatMap((blocks) =>
        blocks.some(({ position }) => samePosition(position, candidate))
          ? Effect.succeed(y)
          : findFloor(y - 1)
      ),
    );
  };

  return findFloor(highestY).pipe(
    Effect.map((y) => ({
      x,
      y,
      z,
      dimension: player.dimension,
    })),
  );
}

function positionKey(
  position: Readonly<{
    dimension: string;
    x: number;
    y: number;
    z: number;
  }>,
): string {
  return `${position.dimension}:${position.x}:${position.y}:${position.z}`;
}

function samePosition(
  left: BeatGamePosition,
  right: BeatGamePosition,
): boolean {
  return left.dimension === right.dimension
    && left.x === right.x
    && left.y === right.y
    && left.z === right.z;
}

function stableActionResult(
  action: string,
  checkpoint: BeatGameCheckpoint,
  observation: BeatGameObservation,
  evidence:
    | "TASK_RESULT"
    | "OBSERVED_STATE"
    | "OBSERVATION_AFTER_UNCERTAIN_RESULT",
) {
  return {
    action,
    phase: checkpoint.planner.phase,
    completedAt: new Date().toISOString(),
    evidence,
    connectionEpoch: observation.player.connectionEpoch,
    playerRevision: observation.player.revision.toString(),
    inventoryRevision: observation.inventory.revision.toString(),
  } as const;
}

function withoutCurrentAction(
  planner: BeatGamePlannerState & {
    readonly currentAction?: string | undefined;
    readonly currentActionId?: string | undefined;
  },
): BeatGamePlannerState {
  const {
    currentAction: _currentAction,
    currentActionId: _currentActionId,
    ...rest
  } = planner;
  return rest;
}

function withTaskIdempotency(
  driver: BeatGameDriver,
  actionId: string,
  deadline: Date,
  observationFingerprint: string,
): BeatGameDriver {
  let taskInvocation = 0;
  return {
    instanceId: driver.instanceId,
    botId: driver.botId,
    observe: driver.observe,
    events: driver.events,
    queryBlocks: driver.queryBlocks,
    queryEntities: driver.queryEntities,
    sampleSurface: driver.sampleSurface,
    recipesFor: driver.recipesFor,
    canCraft: driver.canCraft,
    waitForChunks: driver.waitForChunks,
    pathfind: driver.pathfind,
    pathfindXZ: driver.pathfindXZ,
    runTask: (task, policy, execution = {}) =>
      driver.runTask(task, policy, {
        idempotencyKey:
          execution.idempotencyKey
            ?? `beat-game:${actionId}:${observationFingerprint}:${
              ++taskInvocation
            }:${stableFingerprint(task)}`,
        deadline: execution.deadline ?? deadline,
      }),
    act: driver.act,
    withControl: driver.withControl,
  };
}

function stableFingerprint(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
