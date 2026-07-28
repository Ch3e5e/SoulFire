import type {
  DescMessage,
  MessageInitShape,
  MessageShape,
} from "@bufbuild/protobuf";
import type { Value } from "@bufbuild/protobuf/wkt";
import type { CallOptions } from "@connectrpc/connect";

import type {
  BotConnectionPhase,
  BotDesiredState,
  BotListEntry,
  BotRuntimeState,
  BotStatus,
} from "./generated/soulfire/bot_pb.js";
import type {
  MinecraftAccountProto,
  MinecraftAccountProto_AccountTypeProto,
} from "./generated/soulfire/common_pb.js";
import type { BotTask, BotTaskEvent } from "./generated/soulfire/task_pb.js";
import type {
  SoulFireBot,
  SoulFireInstance,
} from "./client.js";
import type { CapabilitySet } from "./connection.js";
import type {
  SoulFireTask,
  TaskStartOptions,
} from "./tasks.js";

export interface FleetPoint {
  x: number;
  y: number;
  z: number;
  dimension?: string;
}

export interface FleetMetadataSelector {
  namespace: string;
  key: string;
  exists?: boolean;
  equals?: unknown;
}

export interface FleetSelector {
  botIds?: readonly string[];
  accountNames?: readonly string[];
  accountTypes?: readonly MinecraftAccountProto_AccountTypeProto[];
  online?: boolean;
  desiredStates?: readonly BotDesiredState[];
  runtimeStates?: readonly BotRuntimeState[];
  connectionPhases?: readonly BotConnectionPhase[];
  dimensions?: readonly string[];
  minimumHealth?: number;
  maximumHealth?: number;
  minimumFoodLevel?: number;
  maximumPingMs?: number;
  near?: FleetPoint & { radius: number };
  metadata?: readonly FleetMetadataSelector[];
  requiredCapabilities?: readonly string[];
  predicate?: (
    bot: FleetBot,
  ) => boolean | Promise<boolean>;
  orderBy?:
    | "configured"
    | "name"
    | "health"
    | "distance"
    | "random"
    | ((left: FleetBot, right: FleetBot) => number);
  limit?: number;
}

export interface FleetBot {
  readonly id: string;
  readonly entry: Readonly<BotListEntry>;
  readonly account?: Readonly<MinecraftAccountProto>;
  readonly metadata: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
}

export interface FleetDistributionOptions {
  strategy?: "round-robin" | "contiguous";
  maximumItemsPerBot?: number;
  requireAll?: boolean;
  call?: CallOptions;
}

export interface FleetAssignment<Item> {
  readonly bot: FleetBot;
  readonly items: readonly Item[];
}

export interface FleetTaskStartFailure {
  readonly bot: FleetBot;
  readonly error: unknown;
}

export interface FleetTaskMember<
  Result extends DescMessage | undefined = undefined,
> {
  readonly bot: FleetBot;
  readonly task: SoulFireTask<Result>;
}

export interface FleetTaskEvent {
  readonly bot: FleetBot;
  readonly event: BotTaskEvent;
}

export type FleetTaskResultValue<
  Result extends DescMessage | undefined,
> = Result extends DescMessage ? MessageShape<Result> : BotTask;

export type FleetTaskOutcome<
  Result extends DescMessage | undefined,
> =
  | {
    readonly status: "fulfilled";
    readonly bot: FleetBot;
    readonly value: FleetTaskResultValue<Result>;
  }
  | {
    readonly status: "rejected";
    readonly bot: FleetBot;
    readonly error: unknown;
  };

export interface FleetTaskReport<
  Result extends DescMessage | undefined,
> {
  readonly outcomes: readonly FleetTaskOutcome<Result>[];
  readonly fulfilled: readonly Extract<
    FleetTaskOutcome<Result>,
    { status: "fulfilled" }
  >[];
  readonly rejected: readonly Extract<
    FleetTaskOutcome<Result>,
    { status: "rejected" }
  >[];
}

export interface FleetTaskStartOptions extends TaskStartOptions {
  concurrency?: number;
  signal?: AbortSignal;
}

export class FleetTaskGroupError<
  Result extends DescMessage | undefined,
> extends Error {
  public constructor(public readonly report: FleetTaskReport<Result>) {
    super(
      `${report.rejected.length} of ${report.outcomes.length} fleet tasks failed`,
    );
    this.name = "FleetTaskGroupError";
  }
}

export class SoulFireFleetTaskGroup<
  Result extends DescMessage | undefined = undefined,
> {
  public constructor(
    private readonly members: readonly FleetTaskMember<Result>[],
    public readonly startFailures: readonly FleetTaskStartFailure[],
  ) {}

  public get size(): number {
    return this.members.length + this.startFailures.length;
  }

  public get botIds(): readonly string[] {
    return this.members.map(({ bot }) => bot.id);
  }

  public get taskIds(): readonly string[] {
    return this.members.map(({ task }) => task.id);
  }

  public task(botId: string): SoulFireTask<Result> | undefined {
    return this.members.find(({ bot }) => bot.id === botId)?.task;
  }

  public async *events(options?: {
    afterRevision?: bigint;
    call?: CallOptions;
  }): AsyncIterable<FleetTaskEvent> {
    const controller = new AbortController();
    const callSignal = options?.call?.signal;
    const signal = callSignal === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, callSignal]);
    const iterators = this.members.map(({ task }) =>
      task.events({
        ...(options?.afterRevision === undefined
          ? {}
          : { afterRevision: options.afterRevision }),
        call: { ...options?.call, signal },
      })[Symbol.asyncIterator]()
    );
    const pending = new Map<
      number,
      Promise<{
        index: number;
        result: IteratorResult<BotTaskEvent>;
      }>
    >();
    const requestNext = (index: number): void => {
      pending.set(
        index,
        iterators[index]!.next().then((result) => ({ index, result })),
      );
    };
    iterators.forEach((_iterator, index) => requestNext(index));

    try {
      while (pending.size > 0) {
        const { index, result } = await Promise.race(pending.values());
        if (result.done) {
          pending.delete(index);
          continue;
        }
        requestNext(index);
        yield {
          bot: this.members[index]!.bot,
          event: result.value,
        };
      }
    } finally {
      controller.abort();
      await Promise.allSettled(
        iterators.map((iterator) => iterator.return?.()),
      );
    }
  }

  public async results(options?: {
    call?: CallOptions;
  }): Promise<FleetTaskReport<Result>> {
    const outcomes: FleetTaskOutcome<Result>[] = this.startFailures.map(
      ({ bot, error }) => ({ status: "rejected", bot, error }),
    );
    const settled = await Promise.allSettled(
      this.members.map(({ task }) => task.result(options)),
    );
    settled.forEach((result, index) => {
      const member = this.members[index]!;
      outcomes.push(
        result.status === "fulfilled"
          ? {
            status: "fulfilled",
            bot: member.bot,
            value: result.value as FleetTaskResultValue<Result>,
          }
          : {
            status: "rejected",
            bot: member.bot,
            error: result.reason,
          },
      );
    });
    return taskReport(outcomes);
  }

  public async requireResults(options?: {
    call?: CallOptions;
  }): Promise<
    readonly Extract<
      FleetTaskOutcome<Result>,
      { status: "fulfilled" }
    >[]
  > {
    const report = await this.results(options);
    if (report.rejected.length > 0) {
      throw new FleetTaskGroupError(report);
    }
    return report.fulfilled;
  }

  public async cancel(
    reason = "",
    options?: {
      call?: CallOptions;
      concurrency?: number;
    },
  ): Promise<FleetTaskReport<undefined>> {
    const settled = await mapConcurrentSettled(
      this.members,
      options?.concurrency,
      undefined,
      ({ task }) => task.cancel(reason, options?.call),
    );
    const outcomes: FleetTaskOutcome<undefined>[] = settled.map(
      (result, index) => {
        const member = this.members[index]!;
        return result.status === "fulfilled"
          ? {
            status: "fulfilled",
            bot: member.bot,
            value: result.value,
          }
          : {
            status: "rejected",
            bot: member.bot,
            error: result.reason,
          };
      },
    );
    return taskReport(outcomes);
  }
}

export class SoulFireFleet {
  public constructor(
    private readonly instance: SoulFireInstance,
    private readonly capabilities?: CapabilitySet,
  ) {}

  public async select(
    selector: FleetSelector = {},
    options?: CallOptions,
  ): Promise<readonly FleetBot[]> {
    for (const capability of selector.requiredCapabilities ?? []) {
      if (this.capabilities === undefined) {
        throw new Error(
          "Fleet capability selection requires a negotiated SoulFire connection",
        );
      }
      this.capabilities.require(capability);
    }

    const [entries, info] = await Promise.all([
      this.instance.bots(options),
      this.instance.info(options),
    ]);
    const accounts = new Map(
      (info.config?.accounts ?? []).map((account) => [
        account.profileId,
        account,
      ]),
    );
    let bots = entries.map((entry) => {
      const account = accounts.get(entry.profileId);
      return {
        id: entry.profileId,
        entry,
        ...(account === undefined ? {} : { account }),
        metadata: metadataRecord(account?.persistentMetadata ?? []),
      } satisfies FleetBot;
    });
    bots = bots.filter((bot) => matchesSelector(bot, selector));

    if (selector.predicate !== undefined) {
      const decisions = await Promise.all(
        bots.map((bot) => selector.predicate!(bot)),
      );
      bots = bots.filter((_bot, index) => decisions[index]);
    }

    orderBots(bots, selector);
    if (selector.limit !== undefined) {
      const limit = normalizeNonNegativeInteger(selector.limit, "limit");
      bots = bots.slice(0, limit);
    }
    return bots;
  }

  public async start(
    selector: FleetSelector = {},
    options?: CallOptions,
  ): Promise<BotStatus[]> {
    return this.instance.start(
      { botIds: await this.ids(selector, options) },
      options,
    );
  }

  public async stop(
    selector: FleetSelector = {},
    options?: CallOptions,
  ): Promise<BotStatus[]> {
    return this.instance.stop(
      { botIds: await this.ids(selector, options) },
      options,
    );
  }

  public async restart(
    selector: FleetSelector = {},
    options?: CallOptions,
  ): Promise<BotStatus[]> {
    return this.instance.restart(
      { botIds: await this.ids(selector, options) },
      options,
    );
  }

  public async startTasks<
    Input extends DescMessage,
    Result extends DescMessage | undefined = undefined,
  >(
    selector: FleetSelector,
    inputSchema: Input,
    input:
      | MessageInitShape<Input>
      | ((
        bot: FleetBot,
        index: number,
        total: number,
      ) => MessageInitShape<Input> | Promise<MessageInitShape<Input>>),
    resultSchema?: Result,
    options: FleetTaskStartOptions = {},
  ): Promise<SoulFireFleetTaskGroup<Result>> {
    const {
      concurrency,
      signal,
      ...taskOptions
    } = options;
    signal?.throwIfAborted();
    const bots = await this.select(selector, taskOptions.call);
    const settled = await mapConcurrentSettled(
      bots,
      concurrency,
      signal,
      async (descriptor, index) => {
        const taskInput = typeof input === "function"
          ? await input(descriptor, index, bots.length)
          : input;
        return this.instance
          .bot(descriptor.id)
          .tasks
          .start(inputSchema, taskInput, resultSchema, taskOptions);
      },
    );
    const members: FleetTaskMember<Result>[] = [];
    const failures: FleetTaskStartFailure[] = [];
    settled.forEach((result, index) => {
      const bot = bots[index]!;
      if (result.status === "fulfilled") {
        members.push({ bot, task: result.value });
      } else {
        failures.push({ bot, error: result.reason });
      }
    });

    if (signal?.aborted) {
      await Promise.allSettled(
        members.map(({ task }) => task.cancel("fleet task start aborted")),
      );
      signal.throwIfAborted();
    }
    return new SoulFireFleetTaskGroup(members, failures);
  }

  public async distribute<Item>(
    items: readonly Item[],
    selector: FleetSelector = {},
    options: FleetDistributionOptions = {},
  ): Promise<readonly FleetAssignment<Item>[]> {
    const bots = await this.select(selector, options.call);
    if (items.length > 0 && bots.length === 0) {
      throw new Error("No bots matched the fleet selector");
    }
    const maximumItems = options.maximumItemsPerBot === undefined
      ? Number.POSITIVE_INFINITY
      : normalizeNonNegativeInteger(
        options.maximumItemsPerBot,
        "maximumItemsPerBot",
      );
    const buckets = bots.map(() => [] as Item[]);

    if ((options.strategy ?? "round-robin") === "contiguous") {
      let offset = 0;
      for (let index = 0; index < bots.length; index++) {
        const remainingBots = bots.length - index;
        const remainingItems = items.length - offset;
        const size = Math.min(
          maximumItems,
          Math.ceil(remainingItems / remainingBots),
        );
        buckets[index]!.push(...items.slice(offset, offset + size));
        offset += size;
      }
    } else {
      let botIndex = 0;
      for (const item of items) {
        while (
          botIndex < bots.length
          && buckets[botIndex]!.length >= maximumItems
        ) {
          botIndex++;
        }
        if (botIndex >= bots.length) {
          break;
        }
        buckets[botIndex]!.push(item);
        botIndex = (botIndex + 1) % bots.length;
      }
    }

    const assigned = buckets.reduce(
      (total, bucket) => total + bucket.length,
      0,
    );
    if ((options.requireAll ?? true) && assigned !== items.length) {
      throw new RangeError(
        `Fleet capacity ${assigned} is smaller than ${items.length} items`,
      );
    }
    return bots.map((bot, index) => ({
      bot,
      items: buckets[index]!,
    }));
  }

  private async ids(
    selector: FleetSelector,
    options?: CallOptions,
  ): Promise<string[]> {
    return (await this.select(selector, options)).map(({ id }) => id);
  }
}

function matchesSelector(bot: FleetBot, selector: FleetSelector): boolean {
  const { entry, account } = bot;
  const live = entry.liveState;
  if (!includes(selector.botIds, bot.id)) {
    return false;
  }
  if (
    selector.accountNames !== undefined
    && !selector.accountNames.some(
      (name) => name.localeCompare(
        entry.accountName ?? account?.lastKnownName ?? "",
        undefined,
        { sensitivity: "accent" },
      ) === 0,
    )
  ) {
    return false;
  }
  if (
    selector.accountTypes !== undefined
    && (account === undefined || !selector.accountTypes.includes(account.type))
  ) {
    return false;
  }
  if (selector.online !== undefined && entry.isOnline !== selector.online) {
    return false;
  }
  if (!includes(selector.desiredStates, entry.status?.desiredState)) {
    return false;
  }
  if (!includes(selector.runtimeStates, entry.status?.runtimeState)) {
    return false;
  }
  if (!includes(selector.connectionPhases, entry.connectionPhase)) {
    return false;
  }
  if (!includes(selector.dimensions, live?.dimension)) {
    return false;
  }
  if (
    selector.minimumHealth !== undefined
    && (live === undefined || live.health < selector.minimumHealth)
  ) {
    return false;
  }
  if (
    selector.maximumHealth !== undefined
    && (live === undefined || live.health > selector.maximumHealth)
  ) {
    return false;
  }
  if (
    selector.minimumFoodLevel !== undefined
    && (live === undefined || live.foodLevel < selector.minimumFoodLevel)
  ) {
    return false;
  }
  if (
    selector.maximumPingMs !== undefined
    && (entry.pingMs === undefined || entry.pingMs > selector.maximumPingMs)
  ) {
    return false;
  }
  if (selector.near !== undefined) {
    if (
      live === undefined
      || (
        selector.near.dimension !== undefined
        && live.dimension !== selector.near.dimension
      )
      || distanceSquared(live, selector.near)
        > selector.near.radius * selector.near.radius
    ) {
      return false;
    }
  }
  return (selector.metadata ?? []).every((condition) =>
    matchesMetadata(bot, condition)
  );
}

function matchesMetadata(
  bot: FleetBot,
  condition: FleetMetadataSelector,
): boolean {
  const namespace = bot.metadata[condition.namespace];
  const present = namespace !== undefined
    && Object.hasOwn(namespace, condition.key);
  if (condition.exists !== undefined && present !== condition.exists) {
    return false;
  }
  if ("equals" in condition) {
    return present && deepEqual(namespace?.[condition.key], condition.equals);
  }
  return condition.exists === false || present;
}

function orderBots(bots: FleetBot[], selector: FleetSelector): void {
  const order = selector.orderBy ?? "configured";
  if (order === "configured") {
    return;
  }
  if (order === "random") {
    for (let index = bots.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [bots[index], bots[other]] = [bots[other]!, bots[index]!];
    }
    return;
  }
  if (typeof order === "function") {
    bots.sort(order);
    return;
  }
  bots.sort((left, right) => {
    switch (order) {
      case "name":
        return (
          left.entry.accountName
          ?? left.account?.lastKnownName
          ?? ""
        ).localeCompare(
          right.entry.accountName
          ?? right.account?.lastKnownName
          ?? "",
        );
      case "health":
        return (
          right.entry.liveState?.health ?? Number.NEGATIVE_INFINITY
        ) - (
          left.entry.liveState?.health ?? Number.NEGATIVE_INFINITY
        );
      case "distance":
        if (selector.near === undefined) {
          throw new TypeError("orderBy distance requires a near selector");
        }
        return distanceSquared(
          left.entry.liveState,
          selector.near,
        ) - distanceSquared(right.entry.liveState, selector.near);
    }
  });
}

function metadataRecord(
  namespaces: readonly MinecraftAccountProto["persistentMetadata"][number][],
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  return Object.fromEntries(
    namespaces.map((namespace) => [
      namespace.namespace,
      Object.fromEntries(
        namespace.entries.map((entry) => [
          entry.key,
          valueToUnknown(entry.value),
        ]),
      ),
    ]),
  );
}

function valueToUnknown(value: Value | undefined): unknown {
  if (value === undefined) {
    return undefined;
  }
  switch (value.kind.case) {
    case "nullValue":
      return null;
    case "numberValue":
    case "stringValue":
    case "boolValue":
      return value.kind.value;
    case "structValue":
      return Object.fromEntries(
        Object.entries(value.kind.value.fields).map(([key, child]) => [
          key,
          valueToUnknown(child),
        ]),
      );
    case "listValue":
      return value.kind.value.values.map(valueToUnknown);
    case undefined:
      return undefined;
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => deepEqual(value, right[index]));
  }
  if (
    typeof left === "object"
    && left !== null
    && typeof right === "object"
    && right !== null
    && !Array.isArray(left)
    && !Array.isArray(right)
  ) {
    const leftEntries = Object.entries(left);
    const rightRecord = right as Record<string, unknown>;
    return leftEntries.length === Object.keys(rightRecord).length
      && leftEntries.every(([key, value]) =>
        Object.hasOwn(rightRecord, key)
        && deepEqual(value, rightRecord[key])
      );
  }
  return false;
}

function includes<T>(
  values: readonly T[] | undefined,
  value: T | undefined,
): boolean {
  return values === undefined
    || (value !== undefined && values.includes(value));
}

function distanceSquared(
  point: { x: number; y: number; z: number } | undefined,
  target: FleetPoint,
): number {
  if (point === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const dx = point.x - target.x;
  const dy = point.y - target.y;
  const dz = point.z - target.z;
  return dx * dx + dy * dy + dz * dz;
}

function normalizeNonNegativeInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
  return Math.floor(value);
}

async function mapConcurrentSettled<Item, Result>(
  items: readonly Item[],
  requestedConcurrency: number | undefined,
  signal: AbortSignal | undefined,
  operation: (item: Item, index: number) => Promise<Result>,
): Promise<PromiseSettledResult<Result>[]> {
  if (items.length === 0) {
    return [];
  }
  const concurrency = requestedConcurrency === undefined
    ? Math.min(items.length, 8)
    : Math.max(
      1,
      Math.min(
        items.length,
        normalizeNonNegativeInteger(requestedConcurrency, "concurrency"),
      ),
    );
  const results = new Array<PromiseSettledResult<Result>>(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        try {
          signal?.throwIfAborted();
          results[index] = {
            status: "fulfilled",
            value: await operation(items[index]!, index),
          };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    }),
  );
  return results;
}

function taskReport<Result extends DescMessage | undefined>(
  outcomes: readonly FleetTaskOutcome<Result>[],
): FleetTaskReport<Result> {
  return {
    outcomes,
    fulfilled: outcomes.filter(
      (outcome): outcome is Extract<
        FleetTaskOutcome<Result>,
        { status: "fulfilled" }
      > => outcome.status === "fulfilled",
    ),
    rejected: outcomes.filter(
      (outcome): outcome is Extract<
        FleetTaskOutcome<Result>,
        { status: "rejected" }
      > => outcome.status === "rejected",
    ),
  };
}
