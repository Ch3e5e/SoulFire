import {
  create,
  type DescMessage,
  type MessageInitShape,
  type MessageShape,
} from "@bufbuild/protobuf";
import {
  anyPack,
  anyUnpack,
  timestampFromDate,
} from "@bufbuild/protobuf/wkt";
import type {
  CallOptions,
  Client,
} from "@connectrpc/connect";

import type {
  PathfindGoal,
} from "./generated/soulfire/bot_live_pb.js";
import {
  PathfindOptionsSchema,
} from "./generated/soulfire/bot_live_pb.js";
import { BlockPositionSchema } from "./generated/soulfire/common_pb.js";
import type { EntityReference } from "./generated/soulfire/domain_pb.js";
import {
  ItemSelectorSchema,
} from "./generated/soulfire/inventory_pb.js";
import {
  EntitySelectorSchema,
} from "./generated/soulfire/world_pb.js";
import {
  BrewTaskResultSchema,
  BrewTaskSchema,
  type BrewTaskResult,
  CraftTaskResultSchema,
  CraftTaskSchema,
  type CraftTaskResult,
  SmeltTaskResultSchema,
  SmeltTaskSchema,
  type SmeltTaskResult,
  VillagerTradeTaskResultSchema,
  VillagerTradeTaskSchema,
  type VillagerTradeTaskResult,
} from "./generated/soulfire/recipe_pb.js";
import {
  AttackEntityTaskResultSchema,
  AttackEntityTaskSchema,
  type AttackEntityTaskResult,
  AttackNearestTaskResultSchema,
  AttackNearestTaskSchema,
  type AttackNearestTaskResult,
  AutoArmorTaskResultSchema,
  AutoArmorTaskSchema,
  type AutoArmorTaskResult,
  AutoEatTaskResultSchema,
  AutoEatTaskSchema,
  type AutoEatTaskResult,
  AutoRespawnTaskResultSchema,
  AutoRespawnTaskSchema,
  type AutoRespawnTaskResult,
  AutoTotemTaskResultSchema,
  AutoTotemTaskSchema,
  type AutoTotemTaskResult,
  BuildMirror,
  BuildRotation,
  BuildTaskResultSchema,
  BuildTaskSchema,
  type BuildTaskResult,
  BotTaskConflictPolicy,
  BotTaskDisconnectPolicy,
  BotTaskPriority,
  BotTaskReconnectPolicy,
  BotTaskService,
  BotTaskStatus,
  BreedTaskResultSchema,
  BreedTaskSchema,
  type BreedTaskResult,
  CollectBlocksTaskResultSchema,
  CollectBlocksTaskSchema,
  type CollectBlocksTaskResult,
  ContainerTransferDirection,
  ContainerTransferTaskResultSchema,
  ContainerTransferTaskSchema,
  type ContainerTransferTaskResult,
  ExploreTaskResultSchema,
  ExploreTaskSchema,
  type ExploreTaskResult,
  ExcavateTaskResultSchema,
  ExcavateTaskSchema,
  type ExcavateTaskResult,
  FarmTaskResultSchema,
  FarmTaskSchema,
  type FarmTaskResult,
  FishTaskResultSchema,
  FishTaskSchema,
  type FishTaskResult,
  FollowEntityTaskResultSchema,
  FollowEntityTaskSchema,
  type FollowEntityTaskResult,
  FleeTaskResultSchema,
  FleeTaskSchema,
  type FleeTaskResult,
  GuardTaskResultSchema,
  GuardTaskSchema,
  type GuardTaskResult,
  MaintainLoadoutTaskResultSchema,
  MaintainLoadoutTaskSchema,
  type MaintainLoadoutTaskResult,
  GoToTaskResultSchema,
  GoToTaskSchema,
  type BotTask,
  type BotTaskEvent,
  type GoToTaskResult,
  type ListBotTasksRequestSchema,
  RangedAttackTaskResultSchema,
  RangedAttackTaskSchema,
  type RangedAttackTaskResult,
  SleepTaskResultSchema,
  SleepTaskSchema,
  type SleepTaskResult,
  type StartBotTaskRequestSchema,
} from "./generated/soulfire/task_pb.js";

export type {
  AttackEntityTaskResult,
  AttackNearestTaskResult,
  AutoArmorTaskResult,
  AutoEatTaskResult,
  AutoRespawnTaskResult,
  AutoTotemTaskResult,
  BuildTaskResult,
  BreedTaskResult,
  CollectBlocksTaskResult,
  ContainerTransferTaskResult,
  ExploreTaskResult,
  ExcavateTaskResult,
  FarmTaskResult,
  BrewTaskResult,
  CraftTaskResult,
  FishTaskResult,
  FollowEntityTaskResult,
  FleeTaskResult,
  GuardTaskResult,
  MaintainLoadoutTaskResult,
  RangedAttackTaskResult,
  SleepTaskResult,
  SmeltTaskResult,
  VillagerTradeTaskResult,
};

type ScopedTaskStartRequest = Omit<
  MessageInitShape<typeof StartBotTaskRequestSchema>,
  "$typeName" | "botId" | "deadline" | "input" | "instanceId"
>;

type ScopedTaskListRequest = Omit<
  MessageInitShape<typeof ListBotTasksRequestSchema>,
  "$typeName" | "botId" | "instanceId"
>;

type GuardSubject = Exclude<
  MessageInitShape<typeof GuardTaskSchema>["subject"],
  undefined
>;

export interface TaskStartOptions extends ScopedTaskStartRequest {
  call?: CallOptions;
  deadline?: Date;
}

export interface GoToTaskOptions extends TaskStartOptions {
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
}

export interface FollowEntityTaskOptions extends TaskStartOptions {
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  targetUnavailableTimeoutSeconds?: number;
}

export interface AttackEntityTaskOptions extends TaskStartOptions {
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  attackRange?: number;
  sprinting?: boolean;
  maximumAttacks?: number;
  targetUnavailableTimeoutSeconds?: number;
  selectBestWeapon?: boolean;
  weapon?: MessageInitShape<typeof ItemSelectorSchema>;
  restoreSelectedSlot?: boolean;
}

export interface AttackNearestTaskOptions extends TaskStartOptions {
  radius?: number;
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  attackRange?: number;
  sprinting?: boolean;
  maximumAttacks?: number;
  maximumTargets?: number;
  noTargetTimeoutSeconds?: number;
  completeWhenNoTarget?: boolean;
  selectBestWeapon?: boolean;
  weapon?: MessageInitShape<typeof ItemSelectorSchema>;
  restoreSelectedSlot?: boolean;
}

export interface RangedAttackTaskOptions extends TaskStartOptions {
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  minimumRange?: number;
  maximumRange?: number;
  maximumShots?: number;
  targetUnavailableTimeoutSeconds?: number;
  weapon?: MessageInitShape<typeof ItemSelectorSchema>;
  bowDrawTicks?: number;
  leadTarget?: boolean;
  compensateGravity?: boolean;
  strafe?: boolean;
  restoreSelectedSlot?: boolean;
}

export interface FleeTaskOptions extends TaskStartOptions {
  triggerRadius?: number;
  safeDistance?: number;
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  safeSeconds?: number;
  completeWhenSafe?: boolean;
  maximumEscapes?: number;
}

export interface GuardTaskOptions extends TaskStartOptions {
  guardRadius?: number;
  maximumPursuitDistance?: number;
  returnRadius?: number;
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  attackRange?: number;
  sprinting?: boolean;
  maximumAttacks?: number;
  maximumTargets?: number;
  completeWhenClear?: boolean;
  clearSeconds?: number;
  selectBestWeapon?: boolean;
  weapon?: MessageInitShape<typeof ItemSelectorSchema>;
  restoreSelectedSlot?: boolean;
}

export interface SleepTaskOptions extends TaskStartOptions {
  bed?: MessageInitShape<typeof BlockPositionSchema>;
  searchRadius?: number;
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  waitUntilPossible?: boolean;
  retryIntervalTicks?: number;
}

export interface FishTaskOptions extends TaskStartOptions {
  maximumCatches?: number;
  rod?: MessageInitShape<typeof ItemSelectorSchema>;
  castTimeoutTicks?: number;
  biteTimeoutTicks?: number;
  completeWhenNoRod?: boolean;
  restoreSelectedSlot?: boolean;
}

export interface FarmTaskOptions extends TaskStartOptions {
  cropIds?: readonly string[];
  center?: MessageInitShape<typeof BlockPositionSchema>;
  radius?: number;
  maximumHarvests?: number;
  replant?: boolean;
  completeWhenNoMatureCrops?: boolean;
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  rescanIntervalTicks?: number;
  restoreSelectedSlot?: boolean;
}

export interface BreedTaskOptions extends TaskStartOptions {
  animals?: MessageInitShape<typeof EntitySelectorSchema>;
  food?: MessageInitShape<typeof ItemSelectorSchema>;
  center?: MessageInitShape<typeof BlockPositionSchema>;
  radius?: number;
  maximumPairs?: number;
  completeWhenNoPair?: boolean;
  completeWhenNoFood?: boolean;
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  rescanIntervalTicks?: number;
  breedingTimeoutTicks?: number;
  restoreSelectedSlot?: boolean;
}

export interface ExploreTaskOptions extends TaskStartOptions {
  origin?: MessageInitShape<typeof BlockPositionSchema>;
  radius?: number;
  waypointSpacing?: number;
  maximumWaypoints?: number;
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  returnToOrigin?: boolean;
  purpose?: string;
}

export interface ContainerTransferSpec {
  selector: MessageInitShape<typeof ItemSelectorSchema>;
  count: number;
  allowPartial?: boolean;
}

export interface ContainerTransferTaskOptions extends TaskStartOptions {
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  closeContainer?: boolean;
}

export interface LoadoutRequirementSpec {
  selector: MessageInitShape<typeof ItemSelectorSchema>;
  minimumCount: number;
  targetCount: number;
  maximumCount?: number;
}

export interface MaintainLoadoutTaskOptions extends TaskStartOptions {
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  checkIntervalTicks?: number;
  maximumRebalances?: number;
  completeWhenSatisfied?: boolean;
  closeContainer?: boolean;
}

export interface AutoEatTaskOptions extends TaskStartOptions {
  foodLevel?: number;
  checkIntervalTicks?: number;
  maximumMeals?: number;
  completeWhenNoFood?: boolean;
  restoreSelectedSlot?: boolean;
}

export interface AutoRespawnTaskOptions extends TaskStartOptions {
  respawnDelayTicks?: number;
  maximumRespawns?: number;
}

export interface AutoTotemTaskOptions extends TaskStartOptions {
  checkIntervalTicks?: number;
  maximumEquips?: number;
  completeWhenNoTotem?: boolean;
  replaceOccupiedOffhand?: boolean;
}

export interface AutoArmorTaskOptions extends TaskStartOptions {
  checkIntervalTicks?: number;
  maximumEquips?: number;
  completeWhenNoUpgrade?: boolean;
}

export interface CollectBlocksTaskOptions extends TaskStartOptions {
  tags?: readonly string[];
  count?: number;
  searchRadius?: number;
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
}

export interface ExcavateTaskOptions extends TaskStartOptions {
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  maximumBlocks?: number;
}

export interface SchematicBlock {
  offset: {
    x: number;
    y: number;
    z: number;
  };
  blockId: string;
  properties?: Readonly<Record<string, string>>;
}

export interface BuildTaskOptions extends TaskStartOptions {
  rotation?: BuildRotation;
  mirror?: BuildMirror;
  substitutions?: Readonly<Record<string, readonly string[]>>;
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  breakIncorrectBlocks?: boolean;
  restoreSelectedSlot?: boolean;
  partitionIndex?: number;
  partitionCount?: number;
}

export interface CraftTaskOptions extends TaskStartOptions {
  station?: MessageInitShape<typeof BlockPositionSchema>;
}

export interface SmeltTaskOptions extends TaskStartOptions {
  fuel?: MessageInitShape<typeof ItemSelectorSchema>;
  station?: MessageInitShape<typeof BlockPositionSchema>;
}

export interface BrewTaskOptions extends TaskStartOptions {
  fuel?: MessageInitShape<typeof ItemSelectorSchema>;
  station?: MessageInitShape<typeof BlockPositionSchema>;
  expectedResult?: MessageInitShape<typeof ItemSelectorSchema>;
}

export interface VillagerTradeTaskOptions extends TaskStartOptions {
  closeWhenDone?: boolean;
  expectedResult?: MessageInitShape<typeof ItemSelectorSchema>;
}

export type FollowEntityTarget = Pick<
  EntityReference,
  "connectionEpoch" | "networkId"
> | number;

export type AttackEntityTarget = (
  Pick<EntityReference, "networkId">
  & Partial<Pick<EntityReference, "connectionEpoch" | "uuid">>
) | number;

export interface TaskListOptions extends ScopedTaskListRequest {
  call?: CallOptions;
}

export class SoulFireTaskError extends Error {
  public constructor(public readonly task: BotTask) {
    super(
      task.failure?.message
        ?? `Task ${task.taskId} ended in status ${task.status}`,
    );
    this.name = "SoulFireTaskError";
  }
}

export class SoulFireTask<Result extends DescMessage | undefined = undefined> {
  #snapshot: BotTask;

  public constructor(
    private readonly client: Client<typeof BotTaskService>,
    snapshot: BotTask,
    private readonly resultSchema: Result,
    private readonly callOptions: (options?: CallOptions) =>
      CallOptions | undefined,
  ) {
    this.#snapshot = snapshot;
  }

  public get id(): string {
    return this.#snapshot.taskId;
  }

  public get snapshot(): Readonly<BotTask> {
    return this.#snapshot;
  }

  public get terminal(): boolean {
    return isTerminalTaskStatus(this.#snapshot.status);
  }

  public async refresh(options?: CallOptions): Promise<BotTask> {
    this.#snapshot = await this.client.getBotTask(
      { taskId: this.id },
      options,
    );
    return this.#snapshot;
  }

  public events(options?: {
    afterRevision?: bigint;
    call?: CallOptions;
  }): AsyncIterable<BotTaskEvent> {
    return this.client.watchBotTask(
      {
        taskId: this.id,
        afterRevision: options?.afterRevision ?? this.#snapshot.revision,
        follow: true,
      },
      options?.call,
    );
  }

  public async wait(options?: {
    call?: CallOptions;
  }): Promise<BotTask> {
    if (this.terminal) {
      return this.#snapshot;
    }
    for await (const event of this.client.watchBotTask(
      {
        taskId: this.id,
        afterRevision: this.#snapshot.revision,
        follow: true,
      },
      options?.call,
    )) {
      if (event.task !== undefined) {
        this.#snapshot = event.task;
      }
    }
    if (!this.terminal) {
      await this.refresh(options?.call);
    }
    return this.#snapshot;
  }

  public async cancel(
    reason = "",
    options?: CallOptions,
  ): Promise<BotTask> {
    this.#snapshot = await this.client.cancelBotTask(
      { taskId: this.id, reason },
      this.callOptions(options),
    );
    return this.#snapshot;
  }

  public async result(options?: {
    call?: CallOptions;
  }): Promise<
    Result extends DescMessage ? MessageShape<Result> : BotTask
  > {
    const task = await this.wait(options);
    if (task.status !== BotTaskStatus.COMPLETED) {
      throw new SoulFireTaskError(task);
    }
    if (this.resultSchema === undefined) {
      return task as Result extends DescMessage
        ? MessageShape<Result>
        : BotTask;
    }
    if (task.result === undefined) {
      throw new SoulFireTaskError({
        ...task,
        failure: {
          $typeName: "soulfire.v1.BotTaskFailure",
          code: "missing_result",
          message: "Completed task did not return a result",
          retryable: false,
        },
      });
    }
    const result = anyUnpack(task.result, this.resultSchema);
    if (result === undefined) {
      throw new SoulFireTaskError({
        ...task,
        failure: {
          $typeName: "soulfire.v1.BotTaskFailure",
          code: "result_type_mismatch",
          message:
            `Task returned ${task.result.typeUrl}, expected ${this.resultSchema.typeName}`,
          retryable: false,
        },
      });
    }
    return result as Result extends DescMessage
      ? MessageShape<Result>
      : BotTask;
  }
}

export class SoulFireTasks {
  public constructor(
    private readonly instanceId: string,
    private readonly botId: string,
    private readonly client: Client<typeof BotTaskService>,
    private readonly callOptions: (options?: CallOptions) =>
      CallOptions | undefined,
  ) {}

  public async start<
    Input extends DescMessage,
    Result extends DescMessage | undefined = undefined,
  >(
    inputSchema: Input,
    input: MessageInitShape<Input>,
    resultSchema?: Result,
    options: TaskStartOptions = {},
  ): Promise<SoulFireTask<Result>> {
    const {
      call,
      deadline,
      ...taskOptions
    } = options;
    const request = create(inputSchema, input);
    const task = await this.client.startBotTask(
      {
        ...taskOptions,
        instanceId: this.instanceId,
        botId: this.botId,
        input: anyPack(inputSchema, request),
        ...(deadline === undefined
          ? {}
          : { deadline: timestampFromDate(deadline) }),
      },
      this.callOptions(call),
    );
    return new SoulFireTask(
      this.client,
      task,
      resultSchema as Result,
      this.callOptions,
    );
  }

  public run<Input extends DescMessage>(
    inputSchema: Input,
    input: MessageInitShape<Input>,
    options: TaskStartOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      call,
      deadline,
      ...taskOptions
    } = options;
    const request = create(inputSchema, input);
    return this.client.runBotTask(
      {
        ...taskOptions,
        instanceId: this.instanceId,
        botId: this.botId,
        input: anyPack(inputSchema, request),
        disconnectPolicy:
          taskOptions.disconnectPolicy
          ?? BotTaskDisconnectPolicy.CANCEL_WITH_CALL,
        ...(deadline === undefined
          ? {}
          : { deadline: timestampFromDate(deadline) }),
      },
      this.callOptions(call),
    );
  }

  public goTo(
    goal: PathfindGoal,
    options: GoToTaskOptions = {},
  ): Promise<SoulFireTask<typeof GoToTaskResultSchema>> {
    const {
      path,
      ...taskOptions
    } = options;
    return this.start(
      GoToTaskSchema,
      { goal, ...(path === undefined ? {} : { options: path }) },
      GoToTaskResultSchema,
      taskOptions,
    );
  }

  public runGoTo(
    goal: PathfindGoal,
    options: GoToTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      path,
      ...taskOptions
    } = options;
    return this.run(
      GoToTaskSchema,
      { goal, ...(path === undefined ? {} : { options: path }) },
      taskOptions,
    );
  }

  public followEntity(
    target: FollowEntityTarget,
    distance = 3,
    options: FollowEntityTaskOptions = {},
  ): Promise<SoulFireTask<typeof FollowEntityTaskResultSchema>> {
    const {
      path,
      targetUnavailableTimeoutSeconds = 0,
      ...taskOptions
    } = options;
    return this.start(
      FollowEntityTaskSchema,
      {
        target: {
          entityId: typeof target === "number"
            ? target
            : target.networkId,
          radius: distance,
          ...(typeof target === "number"
              || target.connectionEpoch.length === 0
            ? {}
            : { connectionEpoch: target.connectionEpoch }),
        },
        ...(path === undefined ? {} : { options: path }),
        targetUnavailableTimeoutSeconds,
      },
      FollowEntityTaskResultSchema,
      taskOptions,
    );
  }

  public runFollowEntity(
    target: FollowEntityTarget,
    distance = 3,
    options: FollowEntityTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      path,
      targetUnavailableTimeoutSeconds = 0,
      ...taskOptions
    } = options;
    return this.run(
      FollowEntityTaskSchema,
      {
        target: {
          entityId: typeof target === "number"
            ? target
            : target.networkId,
          radius: distance,
          ...(typeof target === "number"
              || target.connectionEpoch.length === 0
            ? {}
            : { connectionEpoch: target.connectionEpoch }),
        },
        ...(path === undefined ? {} : { options: path }),
        targetUnavailableTimeoutSeconds,
      },
      taskOptions,
    );
  }

  public attackEntity(
    target: AttackEntityTarget,
    options: AttackEntityTaskOptions = {},
  ): Promise<SoulFireTask<typeof AttackEntityTaskResultSchema>> {
    const {
      path,
      attackRange = 3,
      sprinting = false,
      maximumAttacks = 0,
      targetUnavailableTimeoutSeconds = 0,
      selectBestWeapon = true,
      weapon,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.start(
      AttackEntityTaskSchema,
      {
        target: entityReference(target),
        ...(path === undefined ? {} : { options: path }),
        attackRange,
        sprinting,
        maximumAttacks,
        targetUnavailableTimeoutSeconds,
        selectBestWeapon,
        ...(weapon === undefined ? {} : { weapon }),
        restoreSelectedSlot,
      },
      AttackEntityTaskResultSchema,
      taskOptions,
    );
  }

  public runAttackEntity(
    target: AttackEntityTarget,
    options: AttackEntityTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      path,
      attackRange = 3,
      sprinting = false,
      maximumAttacks = 0,
      targetUnavailableTimeoutSeconds = 0,
      selectBestWeapon = true,
      weapon,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.run(
      AttackEntityTaskSchema,
      {
        target: entityReference(target),
        ...(path === undefined ? {} : { options: path }),
        attackRange,
        sprinting,
        maximumAttacks,
        targetUnavailableTimeoutSeconds,
        selectBestWeapon,
        ...(weapon === undefined ? {} : { weapon }),
        restoreSelectedSlot,
      },
      taskOptions,
    );
  }

  public attackNearest(
    selector: MessageInitShape<typeof EntitySelectorSchema>,
    options: AttackNearestTaskOptions = {},
  ): Promise<SoulFireTask<typeof AttackNearestTaskResultSchema>> {
    const {
      radius = 32,
      path,
      attackRange = 3,
      sprinting = false,
      maximumAttacks = 0,
      maximumTargets = 1,
      noTargetTimeoutSeconds = 0,
      completeWhenNoTarget = true,
      selectBestWeapon = true,
      weapon,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.start(
      AttackNearestTaskSchema,
      {
        selector,
        radius,
        ...(path === undefined ? {} : { options: path }),
        attackRange,
        sprinting,
        maximumAttacks,
        maximumTargets,
        noTargetTimeoutSeconds,
        completeWhenNoTarget,
        selectBestWeapon,
        ...(weapon === undefined ? {} : { weapon }),
        restoreSelectedSlot,
      },
      AttackNearestTaskResultSchema,
      taskOptions,
    );
  }

  public runAttackNearest(
    selector: MessageInitShape<typeof EntitySelectorSchema>,
    options: AttackNearestTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      radius = 32,
      path,
      attackRange = 3,
      sprinting = false,
      maximumAttacks = 0,
      maximumTargets = 0,
      noTargetTimeoutSeconds = 0,
      completeWhenNoTarget = false,
      selectBestWeapon = true,
      weapon,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.run(
      AttackNearestTaskSchema,
      {
        selector,
        radius,
        ...(path === undefined ? {} : { options: path }),
        attackRange,
        sprinting,
        maximumAttacks,
        maximumTargets,
        noTargetTimeoutSeconds,
        completeWhenNoTarget,
        selectBestWeapon,
        ...(weapon === undefined ? {} : { weapon }),
        restoreSelectedSlot,
      },
      taskOptions,
    );
  }

  public rangedAttack(
    target: AttackEntityTarget,
    options: RangedAttackTaskOptions = {},
  ): Promise<SoulFireTask<typeof RangedAttackTaskResultSchema>> {
    const { input, taskOptions } = rangedAttackInput(target, options);
    return this.start(
      RangedAttackTaskSchema,
      input,
      RangedAttackTaskResultSchema,
      taskOptions,
    );
  }

  public runRangedAttack(
    target: AttackEntityTarget,
    options: RangedAttackTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const { input, taskOptions } = rangedAttackInput(target, options);
    return this.run(RangedAttackTaskSchema, input, taskOptions);
  }

  public flee(
    threats: MessageInitShape<typeof EntitySelectorSchema>,
    options: FleeTaskOptions = {},
  ): Promise<SoulFireTask<typeof FleeTaskResultSchema>> {
    const {
      triggerRadius = 8,
      safeDistance = 16,
      path,
      safeSeconds = 2,
      completeWhenSafe = true,
      maximumEscapes = 0,
      ...taskOptions
    } = options;
    return this.start(
      FleeTaskSchema,
      {
        threats,
        triggerRadius,
        safeDistance,
        ...(path === undefined ? {} : { options: path }),
        safeSeconds,
        completeWhenSafe,
        maximumEscapes,
      },
      FleeTaskResultSchema,
      taskOptions,
    );
  }

  public runFlee(
    threats: MessageInitShape<typeof EntitySelectorSchema>,
    options: FleeTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      triggerRadius = 8,
      safeDistance = 16,
      path,
      safeSeconds = 2,
      completeWhenSafe = false,
      maximumEscapes = 0,
      ...taskOptions
    } = options;
    return this.run(
      FleeTaskSchema,
      {
        threats,
        triggerRadius,
        safeDistance,
        ...(path === undefined ? {} : { options: path }),
        safeSeconds,
        completeWhenSafe,
        maximumEscapes,
      },
      taskOptions,
    );
  }

  public guard(
    position: MessageInitShape<typeof BlockPositionSchema>,
    threats: MessageInitShape<typeof EntitySelectorSchema>,
    options: GuardTaskOptions = {},
  ): Promise<SoulFireTask<typeof GuardTaskResultSchema>> {
    return this.startGuard(
      { case: "position", value: position },
      threats,
      true,
      options,
    );
  }

  public runGuard(
    position: MessageInitShape<typeof BlockPositionSchema>,
    threats: MessageInitShape<typeof EntitySelectorSchema>,
    options: GuardTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    return this.runGuardSubject(
      { case: "position", value: position },
      threats,
      false,
      options,
    );
  }

  public protect(
    entity: AttackEntityTarget,
    threats: MessageInitShape<typeof EntitySelectorSchema>,
    options: GuardTaskOptions = {},
  ): Promise<SoulFireTask<typeof GuardTaskResultSchema>> {
    return this.startGuard(
      { case: "entity", value: entityReference(entity) },
      threats,
      true,
      options,
    );
  }

  public runProtect(
    entity: AttackEntityTarget,
    threats: MessageInitShape<typeof EntitySelectorSchema>,
    options: GuardTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    return this.runGuardSubject(
      { case: "entity", value: entityReference(entity) },
      threats,
      false,
      options,
    );
  }

  private startGuard(
    subject: GuardSubject,
    threats: MessageInitShape<typeof EntitySelectorSchema>,
    completeWhenClearDefault: boolean,
    options: GuardTaskOptions,
  ): Promise<SoulFireTask<typeof GuardTaskResultSchema>> {
    const { input, taskOptions } = guardTaskInput(
      subject,
      threats,
      completeWhenClearDefault,
      options,
    );
    return this.start(
      GuardTaskSchema,
      input,
      GuardTaskResultSchema,
      taskOptions,
    );
  }

  private runGuardSubject(
    subject: GuardSubject,
    threats: MessageInitShape<typeof EntitySelectorSchema>,
    completeWhenClearDefault: boolean,
    options: GuardTaskOptions,
  ): AsyncIterable<BotTaskEvent> {
    const { input, taskOptions } = guardTaskInput(
      subject,
      threats,
      completeWhenClearDefault,
      options,
    );
    return this.run(GuardTaskSchema, input, taskOptions);
  }

  public sleep(
    options: SleepTaskOptions = {},
  ): Promise<SoulFireTask<typeof SleepTaskResultSchema>> {
    const {
      bed,
      searchRadius = 24,
      path,
      waitUntilPossible = false,
      retryIntervalTicks = 20,
      ...taskOptions
    } = options;
    return this.start(
      SleepTaskSchema,
      {
        ...(bed === undefined ? {} : { bed }),
        searchRadius,
        ...(path === undefined ? {} : { options: path }),
        waitUntilPossible,
        retryIntervalTicks,
      },
      SleepTaskResultSchema,
      taskOptions,
    );
  }

  public runSleep(
    options: SleepTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      bed,
      searchRadius = 24,
      path,
      waitUntilPossible = true,
      retryIntervalTicks = 20,
      ...taskOptions
    } = options;
    return this.run(
      SleepTaskSchema,
      {
        ...(bed === undefined ? {} : { bed }),
        searchRadius,
        ...(path === undefined ? {} : { options: path }),
        waitUntilPossible,
        retryIntervalTicks,
      },
      taskOptions,
    );
  }

  public fish(
    options: FishTaskOptions = {},
  ): Promise<SoulFireTask<typeof FishTaskResultSchema>> {
    const {
      maximumCatches = 1,
      rod,
      castTimeoutTicks = 100,
      biteTimeoutTicks = 12_000,
      completeWhenNoRod = true,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.start(
      FishTaskSchema,
      {
        maximumCatches,
        ...(rod === undefined ? {} : { rod }),
        castTimeoutTicks,
        biteTimeoutTicks,
        completeWhenNoRod,
        restoreSelectedSlot,
      },
      FishTaskResultSchema,
      taskOptions,
    );
  }

  public runFish(
    options: FishTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      maximumCatches = 0,
      rod,
      castTimeoutTicks = 100,
      biteTimeoutTicks = 12_000,
      completeWhenNoRod = false,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.run(
      FishTaskSchema,
      {
        maximumCatches,
        ...(rod === undefined ? {} : { rod }),
        castTimeoutTicks,
        biteTimeoutTicks,
        completeWhenNoRod,
        restoreSelectedSlot,
      },
      taskOptions,
    );
  }

  public farm(
    options: FarmTaskOptions = {},
  ): Promise<SoulFireTask<typeof FarmTaskResultSchema>> {
    const {
      cropIds = [],
      center,
      radius = 24,
      maximumHarvests = 1,
      replant = true,
      completeWhenNoMatureCrops = true,
      path,
      rescanIntervalTicks = 100,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.start(
      FarmTaskSchema,
      {
        cropIds: [...cropIds],
        ...(center === undefined ? {} : { center }),
        radius,
        maximumHarvests,
        replant,
        completeWhenNoMatureCrops,
        ...(path === undefined ? {} : { options: path }),
        rescanIntervalTicks,
        restoreSelectedSlot,
      },
      FarmTaskResultSchema,
      taskOptions,
    );
  }

  public runFarm(
    options: FarmTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      cropIds = [],
      center,
      radius = 24,
      maximumHarvests = 0,
      replant = true,
      completeWhenNoMatureCrops = false,
      path,
      rescanIntervalTicks = 100,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.run(
      FarmTaskSchema,
      {
        cropIds: [...cropIds],
        ...(center === undefined ? {} : { center }),
        radius,
        maximumHarvests,
        replant,
        completeWhenNoMatureCrops,
        ...(path === undefined ? {} : { options: path }),
        rescanIntervalTicks,
        restoreSelectedSlot,
      },
      taskOptions,
    );
  }

  public breed(
    options: BreedTaskOptions = {},
  ): Promise<SoulFireTask<typeof BreedTaskResultSchema>> {
    const {
      animals = {},
      food,
      center,
      radius = 24,
      maximumPairs = 1,
      completeWhenNoPair = true,
      completeWhenNoFood = true,
      path,
      rescanIntervalTicks = 100,
      breedingTimeoutTicks = 100,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.start(
      BreedTaskSchema,
      {
        animals,
        ...(food === undefined ? {} : { food }),
        ...(center === undefined ? {} : { center }),
        radius,
        maximumPairs,
        completeWhenNoPair,
        completeWhenNoFood,
        ...(path === undefined ? {} : { options: path }),
        rescanIntervalTicks,
        breedingTimeoutTicks,
        restoreSelectedSlot,
      },
      BreedTaskResultSchema,
      taskOptions,
    );
  }

  public runBreed(
    options: BreedTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      animals = {},
      food,
      center,
      radius = 24,
      maximumPairs = 0,
      completeWhenNoPair = false,
      completeWhenNoFood = false,
      path,
      rescanIntervalTicks = 100,
      breedingTimeoutTicks = 100,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.run(
      BreedTaskSchema,
      {
        animals,
        ...(food === undefined ? {} : { food }),
        ...(center === undefined ? {} : { center }),
        radius,
        maximumPairs,
        completeWhenNoPair,
        completeWhenNoFood,
        ...(path === undefined ? {} : { options: path }),
        rescanIntervalTicks,
        breedingTimeoutTicks,
        restoreSelectedSlot,
      },
      taskOptions,
    );
  }

  public explore(
    options: ExploreTaskOptions = {},
  ): Promise<SoulFireTask<typeof ExploreTaskResultSchema>> {
    const {
      origin,
      radius = 256,
      waypointSpacing = 64,
      maximumWaypoints = 1,
      path,
      returnToOrigin = false,
      purpose = "sdk-explore",
      ...taskOptions
    } = options;
    return this.start(
      ExploreTaskSchema,
      {
        ...(origin === undefined ? {} : { origin }),
        radius,
        waypointSpacing,
        maximumWaypoints,
        ...(path === undefined ? {} : { options: path }),
        returnToOrigin,
        purpose,
      },
      ExploreTaskResultSchema,
      taskOptions,
    );
  }

  public runExplore(
    options: ExploreTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      origin,
      radius = 256,
      waypointSpacing = 64,
      maximumWaypoints = 0,
      path,
      returnToOrigin = false,
      purpose = "sdk-explore",
      ...taskOptions
    } = options;
    return this.run(
      ExploreTaskSchema,
      {
        ...(origin === undefined ? {} : { origin }),
        radius,
        waypointSpacing,
        maximumWaypoints,
        ...(path === undefined ? {} : { options: path }),
        returnToOrigin,
        purpose,
      },
      taskOptions,
    );
  }

  public stash(
    container: MessageInitShape<typeof BlockPositionSchema>,
    operations: readonly ContainerTransferSpec[],
    options: ContainerTransferTaskOptions = {},
  ): Promise<SoulFireTask<typeof ContainerTransferTaskResultSchema>> {
    const { input, taskOptions } = containerTransferInput(
      ContainerTransferDirection.DEPOSIT,
      container,
      operations,
      options,
    );
    return this.start(
      ContainerTransferTaskSchema,
      input,
      ContainerTransferTaskResultSchema,
      taskOptions,
    );
  }

  public runStash(
    container: MessageInitShape<typeof BlockPositionSchema>,
    operations: readonly ContainerTransferSpec[],
    options: ContainerTransferTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const { input, taskOptions } = containerTransferInput(
      ContainerTransferDirection.DEPOSIT,
      container,
      operations,
      options,
    );
    return this.run(ContainerTransferTaskSchema, input, taskOptions);
  }

  public withdraw(
    container: MessageInitShape<typeof BlockPositionSchema>,
    operations: readonly ContainerTransferSpec[],
    options: ContainerTransferTaskOptions = {},
  ): Promise<SoulFireTask<typeof ContainerTransferTaskResultSchema>> {
    const { input, taskOptions } = containerTransferInput(
      ContainerTransferDirection.WITHDRAW,
      container,
      operations,
      options,
    );
    return this.start(
      ContainerTransferTaskSchema,
      input,
      ContainerTransferTaskResultSchema,
      taskOptions,
    );
  }

  public runWithdraw(
    container: MessageInitShape<typeof BlockPositionSchema>,
    operations: readonly ContainerTransferSpec[],
    options: ContainerTransferTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const { input, taskOptions } = containerTransferInput(
      ContainerTransferDirection.WITHDRAW,
      container,
      operations,
      options,
    );
    return this.run(ContainerTransferTaskSchema, input, taskOptions);
  }

  public maintainLoadout(
    container: MessageInitShape<typeof BlockPositionSchema>,
    requirements: readonly LoadoutRequirementSpec[],
    options: MaintainLoadoutTaskOptions = {},
  ): Promise<SoulFireTask<typeof MaintainLoadoutTaskResultSchema>> {
    const { input, taskOptions } = maintainLoadoutInput(
      container,
      requirements,
      options,
    );
    return this.start(
      MaintainLoadoutTaskSchema,
      input,
      MaintainLoadoutTaskResultSchema,
      taskOptions,
    );
  }

  public runMaintainLoadout(
    container: MessageInitShape<typeof BlockPositionSchema>,
    requirements: readonly LoadoutRequirementSpec[],
    options: MaintainLoadoutTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const { input, taskOptions } = maintainLoadoutInput(
      container,
      requirements,
      options,
    );
    return this.run(MaintainLoadoutTaskSchema, input, taskOptions);
  }

  public balanceLoadout(
    container: MessageInitShape<typeof BlockPositionSchema>,
    requirements: readonly LoadoutRequirementSpec[],
    options: Omit<
      MaintainLoadoutTaskOptions,
      "completeWhenSatisfied" | "maximumRebalances"
    > = {},
  ): Promise<SoulFireTask<typeof MaintainLoadoutTaskResultSchema>> {
    return this.maintainLoadout(container, requirements, {
      ...options,
      maximumRebalances: 1,
      completeWhenSatisfied: true,
    });
  }

  public autoEat(
    foodItemIds: readonly string[] = [],
    options: AutoEatTaskOptions = {},
  ): Promise<SoulFireTask<typeof AutoEatTaskResultSchema>> {
    const {
      foodLevel = 14,
      checkIntervalTicks = 20,
      maximumMeals = 0,
      completeWhenNoFood = false,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.start(
      AutoEatTaskSchema,
      {
        foodItemIds: [...foodItemIds],
        foodLevel,
        checkIntervalTicks,
        maximumMeals,
        completeWhenNoFood,
        restoreSelectedSlot,
      },
      AutoEatTaskResultSchema,
      taskOptions,
    );
  }

  public runAutoEat(
    foodItemIds: readonly string[] = [],
    options: AutoEatTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      foodLevel = 14,
      checkIntervalTicks = 20,
      maximumMeals = 0,
      completeWhenNoFood = false,
      restoreSelectedSlot = true,
      ...taskOptions
    } = options;
    return this.run(
      AutoEatTaskSchema,
      {
        foodItemIds: [...foodItemIds],
        foodLevel,
        checkIntervalTicks,
        maximumMeals,
        completeWhenNoFood,
        restoreSelectedSlot,
      },
      taskOptions,
    );
  }

  public autoRespawn(
    options: AutoRespawnTaskOptions = {},
  ): Promise<SoulFireTask<typeof AutoRespawnTaskResultSchema>> {
    const {
      respawnDelayTicks = 0,
      maximumRespawns = 0,
      ...taskOptions
    } = options;
    return this.start(
      AutoRespawnTaskSchema,
      { respawnDelayTicks, maximumRespawns },
      AutoRespawnTaskResultSchema,
      taskOptions,
    );
  }

  public runAutoRespawn(
    options: AutoRespawnTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      respawnDelayTicks = 0,
      maximumRespawns = 0,
      ...taskOptions
    } = options;
    return this.run(
      AutoRespawnTaskSchema,
      { respawnDelayTicks, maximumRespawns },
      taskOptions,
    );
  }

  public autoTotem(
    options: AutoTotemTaskOptions = {},
  ): Promise<SoulFireTask<typeof AutoTotemTaskResultSchema>> {
    const {
      checkIntervalTicks = 20,
      maximumEquips = 0,
      completeWhenNoTotem = false,
      replaceOccupiedOffhand = false,
      ...taskOptions
    } = options;
    return this.start(
      AutoTotemTaskSchema,
      {
        checkIntervalTicks,
        maximumEquips,
        completeWhenNoTotem,
        replaceOccupiedOffhand,
      },
      AutoTotemTaskResultSchema,
      taskOptions,
    );
  }

  public runAutoTotem(
    options: AutoTotemTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      checkIntervalTicks = 20,
      maximumEquips = 0,
      completeWhenNoTotem = false,
      replaceOccupiedOffhand = false,
      ...taskOptions
    } = options;
    return this.run(
      AutoTotemTaskSchema,
      {
        checkIntervalTicks,
        maximumEquips,
        completeWhenNoTotem,
        replaceOccupiedOffhand,
      },
      taskOptions,
    );
  }

  public autoArmor(
    options: AutoArmorTaskOptions = {},
  ): Promise<SoulFireTask<typeof AutoArmorTaskResultSchema>> {
    const {
      checkIntervalTicks = 20,
      maximumEquips = 0,
      completeWhenNoUpgrade = false,
      ...taskOptions
    } = options;
    return this.start(
      AutoArmorTaskSchema,
      { checkIntervalTicks, maximumEquips, completeWhenNoUpgrade },
      AutoArmorTaskResultSchema,
      taskOptions,
    );
  }

  public runAutoArmor(
    options: AutoArmorTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      checkIntervalTicks = 20,
      maximumEquips = 0,
      completeWhenNoUpgrade = false,
      ...taskOptions
    } = options;
    return this.run(
      AutoArmorTaskSchema,
      { checkIntervalTicks, maximumEquips, completeWhenNoUpgrade },
      taskOptions,
    );
  }

  public collectBlocks(
    blockIds: readonly string[],
    options: CollectBlocksTaskOptions = {},
  ): Promise<SoulFireTask<typeof CollectBlocksTaskResultSchema>> {
    const {
      tags = [],
      count = 1,
      searchRadius = 32,
      path,
      ...taskOptions
    } = options;
    return this.start(
      CollectBlocksTaskSchema,
      {
        blockIds: [...blockIds],
        tags: [...tags],
        count,
        searchRadius,
        ...(path === undefined ? {} : { options: path }),
      },
      CollectBlocksTaskResultSchema,
      taskOptions,
    );
  }

  public runCollectBlocks(
    blockIds: readonly string[],
    options: CollectBlocksTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      tags = [],
      count = 1,
      searchRadius = 32,
      path,
      ...taskOptions
    } = options;
    return this.run(
      CollectBlocksTaskSchema,
      {
        blockIds: [...blockIds],
        tags: [...tags],
        count,
        searchRadius,
        ...(path === undefined ? {} : { options: path }),
      },
      taskOptions,
    );
  }

  public excavate(
    from: MessageInitShape<typeof BlockPositionSchema>,
    to: MessageInitShape<typeof BlockPositionSchema>,
    options: ExcavateTaskOptions = {},
  ): Promise<SoulFireTask<typeof ExcavateTaskResultSchema>> {
    const {
      path,
      maximumBlocks = 0,
      ...taskOptions
    } = options;
    return this.start(
      ExcavateTaskSchema,
      {
        cornerA: from,
        cornerB: to,
        maximumBlocks,
        ...(path === undefined ? {} : { options: path }),
      },
      ExcavateTaskResultSchema,
      taskOptions,
    );
  }

  public runExcavate(
    from: MessageInitShape<typeof BlockPositionSchema>,
    to: MessageInitShape<typeof BlockPositionSchema>,
    options: ExcavateTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      path,
      maximumBlocks = 0,
      ...taskOptions
    } = options;
    return this.run(
      ExcavateTaskSchema,
      {
        cornerA: from,
        cornerB: to,
        maximumBlocks,
        ...(path === undefined ? {} : { options: path }),
      },
      taskOptions,
    );
  }

  public build(
    origin: MessageInitShape<typeof BlockPositionSchema>,
    blocks: readonly SchematicBlock[],
    options: BuildTaskOptions = {},
  ): Promise<SoulFireTask<typeof BuildTaskResultSchema>> {
    const { input, taskOptions } = buildInput(origin, blocks, options);
    return this.start(
      BuildTaskSchema,
      input,
      BuildTaskResultSchema,
      taskOptions,
    );
  }

  public runBuild(
    origin: MessageInitShape<typeof BlockPositionSchema>,
    blocks: readonly SchematicBlock[],
    options: BuildTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const { input, taskOptions } = buildInput(origin, blocks, options);
    return this.run(BuildTaskSchema, input, taskOptions);
  }

  public craft(
    recipeId: string,
    count = 1,
    options: CraftTaskOptions = {},
  ): Promise<SoulFireTask<typeof CraftTaskResultSchema>> {
    const {
      station,
      ...taskOptions
    } = options;
    return this.start(
      CraftTaskSchema,
      {
        recipeId,
        count,
        ...(station === undefined ? {} : { station }),
      },
      CraftTaskResultSchema,
      taskOptions,
    );
  }

  public runCraft(
    recipeId: string,
    count = 1,
    options: CraftTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      station,
      ...taskOptions
    } = options;
    return this.run(
      CraftTaskSchema,
      {
        recipeId,
        count,
        ...(station === undefined ? {} : { station }),
      },
      taskOptions,
    );
  }

  public smelt(
    input: MessageInitShape<typeof ItemSelectorSchema>,
    count = 1,
    options: SmeltTaskOptions = {},
  ): Promise<SoulFireTask<typeof SmeltTaskResultSchema>> {
    const {
      fuel,
      station,
      ...taskOptions
    } = options;
    return this.start(
      SmeltTaskSchema,
      {
        input,
        count,
        ...(fuel === undefined ? {} : { fuel }),
        ...(station === undefined ? {} : { station }),
      },
      SmeltTaskResultSchema,
      taskOptions,
    );
  }

  public runSmelt(
    input: MessageInitShape<typeof ItemSelectorSchema>,
    count = 1,
    options: SmeltTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      fuel,
      station,
      ...taskOptions
    } = options;
    return this.run(
      SmeltTaskSchema,
      {
        input,
        count,
        ...(fuel === undefined ? {} : { fuel }),
        ...(station === undefined ? {} : { station }),
      },
      taskOptions,
    );
  }

  public brew(
    input: MessageInitShape<typeof ItemSelectorSchema>,
    ingredient: MessageInitShape<typeof ItemSelectorSchema>,
    count = 1,
    options: BrewTaskOptions = {},
  ): Promise<SoulFireTask<typeof BrewTaskResultSchema>> {
    const {
      fuel,
      station,
      expectedResult,
      ...taskOptions
    } = options;
    return this.start(
      BrewTaskSchema,
      {
        input,
        ingredient,
        count,
        ...(fuel === undefined ? {} : { fuel }),
        ...(station === undefined ? {} : { station }),
        ...(expectedResult === undefined ? {} : { expectedResult }),
      },
      BrewTaskResultSchema,
      taskOptions,
    );
  }

  public runBrew(
    input: MessageInitShape<typeof ItemSelectorSchema>,
    ingredient: MessageInitShape<typeof ItemSelectorSchema>,
    count = 1,
    options: BrewTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      fuel,
      station,
      expectedResult,
      ...taskOptions
    } = options;
    return this.run(
      BrewTaskSchema,
      {
        input,
        ingredient,
        count,
        ...(fuel === undefined ? {} : { fuel }),
        ...(station === undefined ? {} : { station }),
        ...(expectedResult === undefined ? {} : { expectedResult }),
      },
      taskOptions,
    );
  }

  public villagerTrade(
    offerIndex: number,
    count = 1,
    options: VillagerTradeTaskOptions = {},
  ): Promise<SoulFireTask<typeof VillagerTradeTaskResultSchema>> {
    const {
      closeWhenDone = false,
      expectedResult,
      ...taskOptions
    } = options;
    return this.start(
      VillagerTradeTaskSchema,
      {
        offerIndex,
        count,
        closeWhenDone,
        ...(expectedResult === undefined ? {} : { expectedResult }),
      },
      VillagerTradeTaskResultSchema,
      taskOptions,
    );
  }

  public runVillagerTrade(
    offerIndex: number,
    count = 1,
    options: VillagerTradeTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    const {
      closeWhenDone = false,
      expectedResult,
      ...taskOptions
    } = options;
    return this.run(
      VillagerTradeTaskSchema,
      {
        offerIndex,
        count,
        closeWhenDone,
        ...(expectedResult === undefined ? {} : { expectedResult }),
      },
      taskOptions,
    );
  }

  public async get<Result extends DescMessage | undefined = undefined>(
    taskId: string,
    resultSchema?: Result,
    options?: CallOptions,
  ): Promise<SoulFireTask<Result>> {
    const task = await this.client.getBotTask({ taskId }, options);
    if (task.instanceId !== this.instanceId || task.botId !== this.botId) {
      throw new Error(
        `Task ${taskId} does not belong to bot ${this.botId}`,
      );
    }
    return new SoulFireTask(
      this.client,
      task,
      resultSchema as Result,
      this.callOptions,
    );
  }

  public async list(options: TaskListOptions = {}): Promise<BotTask[]> {
    const { call, ...request } = options;
    const tasks: BotTask[] = [];
    let pageToken = request.pageToken ?? "";
    do {
      const response = await this.client.listBotTasks(
        {
          ...request,
          instanceId: this.instanceId,
          botId: this.botId,
          pageToken,
        },
        call,
      );
      tasks.push(...response.tasks);
      pageToken = response.nextPageToken;
    } while (pageToken.length > 0);
    return tasks;
  }

  public watch(options?: {
    afterSequence?: bigint;
    includeSnapshot?: boolean;
    statuses?: readonly BotTaskStatus[];
    call?: CallOptions;
  }): AsyncIterable<BotTaskEvent> {
    return this.client.watchBotTasks(
      {
        instanceId: this.instanceId,
        botId: this.botId,
        ...(options?.afterSequence === undefined
          ? {}
          : { afterSequence: options.afterSequence }),
        includeSnapshot: options?.includeSnapshot ?? true,
        statuses: options?.statuses === undefined
          ? []
          : [...options.statuses],
      },
      options?.call,
    );
  }
}

function entityReference(target: AttackEntityTarget) {
  return typeof target === "number"
    ? { networkId: target }
    : {
        networkId: target.networkId,
        ...(target.connectionEpoch === undefined
            || target.connectionEpoch.length === 0
          ? {}
          : { connectionEpoch: target.connectionEpoch }),
        ...(target.uuid === undefined || target.uuid.length === 0
          ? {}
          : { uuid: target.uuid }),
      };
}

function guardTaskInput(
  subject: GuardSubject,
  threats: MessageInitShape<typeof EntitySelectorSchema>,
  completeWhenClearDefault: boolean,
  options: GuardTaskOptions,
): {
  input: MessageInitShape<typeof GuardTaskSchema>;
  taskOptions: TaskStartOptions;
} {
  const {
    guardRadius = 16,
    maximumPursuitDistance = 24,
    returnRadius = 3,
    path,
    attackRange = 3,
    sprinting = false,
    maximumAttacks = 0,
    maximumTargets = 0,
    completeWhenClear = completeWhenClearDefault,
    clearSeconds = 3,
    selectBestWeapon = true,
    weapon,
    restoreSelectedSlot = true,
    ...taskOptions
  } = options;
  return {
    input: {
      subject,
      threats,
      guardRadius,
      maximumPursuitDistance,
      returnRadius,
      ...(path === undefined ? {} : { options: path }),
      attackRange,
      sprinting,
      maximumAttacks,
      maximumTargets,
      completeWhenClear,
      clearSeconds,
      selectBestWeapon,
      ...(weapon === undefined ? {} : { weapon }),
      restoreSelectedSlot,
    },
    taskOptions,
  };
}

function rangedAttackInput(
  target: AttackEntityTarget,
  options: RangedAttackTaskOptions,
): {
  input: MessageInitShape<typeof RangedAttackTaskSchema>;
  taskOptions: TaskStartOptions;
} {
  const {
    path,
    minimumRange = 8,
    maximumRange = 24,
    maximumShots = 0,
    targetUnavailableTimeoutSeconds = 10,
    weapon,
    bowDrawTicks = 20,
    leadTarget = true,
    compensateGravity = true,
    strafe = true,
    restoreSelectedSlot = true,
    ...taskOptions
  } = options;
  return {
    input: {
      target: entityReference(target),
      ...(path === undefined ? {} : { options: path }),
      minimumRange,
      maximumRange,
      maximumShots,
      targetUnavailableTimeoutSeconds,
      ...(weapon === undefined ? {} : { weapon }),
      bowDrawTicks,
      leadTarget,
      compensateGravity,
      strafe,
      restoreSelectedSlot,
    },
    taskOptions,
  };
}

function buildInput(
  origin: MessageInitShape<typeof BlockPositionSchema>,
  blocks: readonly SchematicBlock[],
  options: BuildTaskOptions,
): {
  input: MessageInitShape<typeof BuildTaskSchema>;
  taskOptions: TaskStartOptions;
} {
  if (blocks.length === 0) {
    throw new RangeError("blocks must contain at least one placement");
  }
  const {
    rotation = BuildRotation.NONE,
    mirror = BuildMirror.NONE,
    substitutions = {},
    path,
    breakIncorrectBlocks = true,
    restoreSelectedSlot = true,
    partitionIndex = 0,
    partitionCount = 1,
    ...taskOptions
  } = options;
  if (!Number.isInteger(partitionCount) || partitionCount <= 0) {
    throw new RangeError("partitionCount must be a positive integer");
  }
  if (
    !Number.isInteger(partitionIndex)
    || partitionIndex < 0
    || partitionIndex >= partitionCount
  ) {
    throw new RangeError(
      "partitionIndex must be a non-negative integer smaller than partitionCount",
    );
  }
  return {
    input: {
      origin,
      blocks: blocks.map((block) => ({
        offset: block.offset,
        blockId: block.blockId,
        properties: { ...block.properties },
      })),
      rotation,
      mirror,
      substitutions: Object.entries(substitutions).map(
        ([sourceBlockId, replacementBlockIds]) => ({
          sourceBlockId,
          replacementBlockIds: [...replacementBlockIds],
        }),
      ),
      ...(path === undefined ? {} : { options: path }),
      breakIncorrectBlocks,
      restoreSelectedSlot,
      partitionIndex,
      partitionCount,
    },
    taskOptions,
  };
}

function containerTransferInput(
  direction: ContainerTransferDirection,
  container: MessageInitShape<typeof BlockPositionSchema>,
  operations: readonly ContainerTransferSpec[],
  options: ContainerTransferTaskOptions,
): {
  input: MessageInitShape<typeof ContainerTransferTaskSchema>;
  taskOptions: TaskStartOptions;
} {
  const {
    path,
    closeContainer = true,
    ...taskOptions
  } = options;
  return {
    input: {
      container,
      direction,
      operations: operations.map((operation) => ({
        selector: operation.selector,
        count: operation.count,
        allowPartial: operation.allowPartial ?? false,
      })),
      ...(path === undefined ? {} : { options: path }),
      closeContainer,
    },
    taskOptions,
  };
}

function maintainLoadoutInput(
  container: MessageInitShape<typeof BlockPositionSchema>,
  requirements: readonly LoadoutRequirementSpec[],
  options: MaintainLoadoutTaskOptions,
): {
  input: MessageInitShape<typeof MaintainLoadoutTaskSchema>;
  taskOptions: TaskStartOptions;
} {
  if (requirements.length === 0) {
    throw new RangeError("requirements must contain at least one entry");
  }
  for (const requirement of requirements) {
    if (
      requirement.minimumCount < 0
      || requirement.targetCount < requirement.minimumCount
      || requirement.maximumCount !== undefined
      && requirement.maximumCount > 0
      && requirement.maximumCount < requirement.targetCount
    ) {
      throw new RangeError(
        "Each requirement needs minimumCount <= targetCount <= maximumCount when maximumCount is set",
      );
    }
  }
  const {
    path,
    checkIntervalTicks = 100,
    maximumRebalances = 0,
    completeWhenSatisfied = false,
    closeContainer = true,
    ...taskOptions
  } = options;
  return {
    input: {
      container,
      requirements: requirements.map((requirement) => ({
        selector: requirement.selector,
        minimumCount: requirement.minimumCount,
        targetCount: requirement.targetCount,
        maximumCount: requirement.maximumCount ?? 0,
      })),
      ...(path === undefined ? {} : { options: path }),
      checkIntervalTicks,
      maximumRebalances,
      completeWhenSatisfied,
      closeContainer,
    },
    taskOptions,
  };
}

export function isTerminalTaskStatus(status: BotTaskStatus): boolean {
  return status === BotTaskStatus.COMPLETED
    || status === BotTaskStatus.CANCELLED
    || status === BotTaskStatus.FAILED
    || status === BotTaskStatus.TIMED_OUT;
}

export {
  BotTaskConflictPolicy,
  BotTaskDisconnectPolicy,
  BotTaskPriority,
  BotTaskReconnectPolicy,
  BotTaskStatus,
  BuildMirror,
  BuildRotation,
};
export type {
  BotTask,
  BotTaskEvent,
  GoToTaskResult,
};
