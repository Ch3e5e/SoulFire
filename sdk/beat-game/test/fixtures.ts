import { Effect, Stream } from "effect";

import {
  BEAT_GAME_CHECKPOINT_SCHEMA_VERSION,
  BeatGamePhase,
  BeatGameRunStatus,
  BeatGameTeamRole,
  emptyBeatGameWorldMemory,
  objectiveForPhase,
  type BeatGameBlockObservation,
  type BeatGameCheckpoint,
  type BeatGameDriver,
  type BeatGameDriverError,
  type BeatGameEntityObservation,
  type BeatGameObservation,
  type BeatGamePathPolicy,
  type BeatGamePosition,
  type BeatGamePrimitiveAction,
  type BeatGameQueryBlocks,
  type BeatGameQueryEntities,
  type BeatGameRecipe,
  type BeatGameTask,
  type BeatGameCraftability,
  type BeatGameTaskExecutionOptions,
} from "../src/index.js";

export function observation(
  overrides: {
    readonly dimension?: string;
    readonly dead?: boolean;
    readonly counts?: Readonly<Record<string, number>>;
    readonly position?: Partial<BeatGamePosition>;
    readonly connectionEpoch?: string;
    readonly food?: number;
    readonly health?: number;
  } = {},
): BeatGameObservation {
  const dimension = overrides.dimension ?? "minecraft:overworld";
  return {
    observedAt: "2026-01-01T00:00:00.000Z",
    player: {
      position: {
        x: overrides.position?.x ?? 0,
        y: overrides.position?.y ?? 64,
        z: overrides.position?.z ?? 0,
        dimension: overrides.position?.dimension ?? dimension,
      },
      rotation: { yaw: 0, pitch: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      health: overrides.health ?? 20,
      maxHealth: 20,
      food: overrides.food ?? 20,
      dead: overrides.dead ?? false,
      sleeping: false,
      usingItem: false,
      connectionEpoch: overrides.connectionEpoch ?? "epoch-1",
      revision: 1n,
    },
    inventory: {
      revision: 1n,
      selectedHotbarSlot: 0,
      counts: overrides.counts ?? {},
      hotbar: {},
    },
  };
}

export function checkpoint(
  phase: BeatGamePhase,
  overrides: Partial<BeatGameCheckpoint> = {},
): BeatGameCheckpoint {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    schemaVersion: BEAT_GAME_CHECKPOINT_SCHEMA_VERSION,
    runId: "run-1",
    teamId: "team-1",
    instanceId: "instance-1",
    botId: "bot-1",
    role: BeatGameTeamRole.LEAD,
    revision: 1,
    connectionEpoch: "epoch-1",
    planner: {
      phase,
      status: BeatGameRunStatus.CREATED,
      objective: objectiveForPhase(phase),
      requirements: [],
      retryCount: 0,
      completedActions: [],
      startedAt: now,
      updatedAt: now,
    },
    memory: emptyBeatGameWorldMemory(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export class FakeBeatGameDriver implements BeatGameDriver {
  public readonly instanceId: string;
  public readonly botId: string;
  public currentObservation: BeatGameObservation = observation();
  public blockResults: readonly BeatGameBlockObservation[] = [];
  public entityResults: readonly BeatGameEntityObservation[] = [];
  public readonly blockQueries: BeatGameQueryBlocks[] = [];
  public readonly entityQueries: BeatGameQueryEntities[] = [];
  public readonly tasks: BeatGameTask[] = [];
  public readonly taskExecutions: BeatGameTaskExecutionOptions[] = [];
  public readonly actions: BeatGamePrimitiveAction[] = [];
  public readonly paths: {
    readonly position: BeatGamePosition;
    readonly radius: number;
    readonly policy: BeatGamePathPolicy;
  }[] = [];
  public activeControlScopes = 0;
  public recipeResolver: (
    resultItemId: string,
  ) => readonly BeatGameRecipe[] = () => [];
  public craftabilityResolver: (
    recipeId: string,
    count: number,
  ) => BeatGameCraftability = () => ({
    canCraft: false,
    maximumCraftCount: 0,
    missing: [],
  });
  public taskObserver: (task: BeatGameTask) => void = () => undefined;
  public taskResolver: (
    task: BeatGameTask,
    execution: BeatGameTaskExecutionOptions,
  ) => Effect.Effect<unknown, BeatGameDriverError> = (task) =>
    Effect.sync(() => {
      this.tasks.push(task);
      this.taskObserver(task);
      return {};
    });
  public blockQueryResolver: (
    query: BeatGameQueryBlocks,
  ) => readonly BeatGameBlockObservation[] = () => this.blockResults;
  public observationResolver: () => Effect.Effect<
    BeatGameObservation,
    BeatGameDriverError
  > = () => Effect.succeed(this.currentObservation);

  public constructor(
    instanceId = "instance-1",
    botId = "bot-1",
  ) {
    this.instanceId = instanceId;
    this.botId = botId;
  }

  public readonly observe = Effect.suspend(() => this.observationResolver());
  public readonly events = Stream.empty;

  public readonly queryBlocks: BeatGameDriver["queryBlocks"] = (query) =>
    Effect.sync(() => {
      this.blockQueries.push(query);
      return this.blockQueryResolver(query);
    });

  public readonly queryEntities: BeatGameDriver["queryEntities"] = (query) =>
    Effect.sync(() => {
      this.entityQueries.push(query);
      return this.entityResults;
    });

  public readonly recipesFor: BeatGameDriver["recipesFor"] = (resultItemId) =>
    Effect.sync(() => this.recipeResolver(resultItemId));

  public readonly canCraft: BeatGameDriver["canCraft"] = (recipeId, count) =>
    Effect.sync(() => this.craftabilityResolver(recipeId, count));

  public readonly pathfind: BeatGameDriver["pathfind"] = (
    position,
    radius,
    policy,
  ) =>
    Effect.sync(() => {
      this.paths.push({ position, radius, policy });
    });

  public readonly runTask: BeatGameDriver["runTask"] = (
    task,
    _policy,
    execution = {},
  ) =>
    Effect.suspend(() => {
      this.taskExecutions.push(execution);
      return this.taskResolver(task, execution);
    });

  public readonly act: BeatGameDriver["act"] = (action) =>
    Effect.sync(() => {
      this.actions.push(action);
      return {};
    });

  public readonly withControl: BeatGameDriver["withControl"] = (effect) =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        this.activeControlScopes += 1;
      }),
      () => effect,
      () =>
        Effect.sync(() => {
          this.activeControlScopes -= 1;
        }),
    );
}
