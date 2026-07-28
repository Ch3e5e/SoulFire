import type {
  DescMessage,
  DescService,
  MessageInitShape,
} from "@bufbuild/protobuf";
import * as HttpClient from "@effect/platform/HttpClient";
import {
  Code,
  ConnectError,
  type CallOptions,
  type Client,
} from "@connectrpc/connect";
import {
  Context,
  Data,
  Effect,
  Layer,
  Stream,
  type Cause,
  type Scope,
} from "effect";

import {
  SoulFire as PromiseSoulFire,
  SoulFireBot as PromiseSoulFireBot,
  SoulFireBotControlLease as PromiseSoulFireBotControlLease,
  SoulFireInstance as PromiseSoulFireInstance,
  type SoulFireOptions,
} from "./client.js";
import type {
  CapabilitySet,
  ServerMetadata,
} from "./connection.js";
import type {
  InstanceListResponse_Instance,
} from "./generated/soulfire/instance_pb.js";
import type {
  NextAuthFlowResponse,
} from "./generated/soulfire/login_pb.js";
import type {
  PluginApiDescriptor,
  PluginApiEvent,
  PluginEvent,
} from "./generated/soulfire/plugin_api_pb.js";
import type { SdkIdentity } from "./generated/soulfire/sdk_pb.js";
import type { LocalSoulFireServer } from "./install-types.js";
import {
  ReflectivePlugin as PromiseReflectivePlugin,
  type PluginCatalog,
  type TypedPluginEvent,
  type WatchPluginEventOptions,
} from "./plugins.js";
import { BotSession as PromiseBotSession } from "./session.js";
import {
  SoulFireTask as PromiseSoulFireTask,
  SoulFireTaskError as PromiseSoulFireTaskError,
  SoulFireTasks as PromiseSoulFireTasks,
} from "./tasks.js";
import { SoulFireChat as PromiseSoulFireChat } from "./chat.js";
import {
  SoulFireContainer as PromiseSoulFireContainer,
  SoulFireInventory as PromiseSoulFireInventory,
} from "./inventory.js";
import { SoulFireRecipes as PromiseSoulFireRecipes } from "./recipes.js";
import { SoulFireRegistry as PromiseSoulFireRegistry } from "./registry.js";
import { SoulFireWorld as PromiseSoulFireWorld } from "./world.js";
import { SoulFirePathfinder as PromiseSoulFirePathfinder } from "./pathfinding.js";
import { SoulFireProtocol as PromiseSoulFireProtocol } from "./protocol.js";
import { SoulFireAutomation as PromiseSoulFireAutomation } from "./automation.js";
import { SoulFireCamera as PromiseSoulFireCamera } from "./camera.js";
import { SoulFireAdmin as PromiseSoulFireAdmin } from "./admin.js";
import {
  SoulFireFleet as PromiseSoulFireFleet,
  SoulFireFleetTaskGroup as PromiseSoulFireFleetTaskGroup,
  type FleetBot,
  type FleetSelector,
  type FleetTaskStartOptions,
} from "./fleet.js";
import { makeEffectHttpClientFetch } from "./platform.js";

type TaggedErrorConstructor<Tag extends string, Fields> = new (
  args: Fields,
) => Cause.YieldableError & {
  readonly _tag: Tag;
} & Readonly<Fields>;

interface SoulFireConnectionErrorFields {
  readonly cause: unknown;
}

const SoulFireConnectionErrorBase: TaggedErrorConstructor<
  "SoulFireConnectionError",
  SoulFireConnectionErrorFields
> = Data.TaggedError(
  "SoulFireConnectionError",
)<SoulFireConnectionErrorFields>;

export class SoulFireConnectionError extends SoulFireConnectionErrorBase {}

interface SoulFireRpcErrorFields {
  readonly operation: string;
  readonly cause: unknown;
  readonly code?: Code;
  readonly requestId?: string;
  readonly retryable: boolean;
}

const SoulFireRpcErrorBase: TaggedErrorConstructor<
  "SoulFireRpcError",
  SoulFireRpcErrorFields
> = Data.TaggedError(
  "SoulFireRpcError",
)<SoulFireRpcErrorFields>;

export class SoulFireRpcError extends SoulFireRpcErrorBase {}

interface SoulFireTaskFailedFields {
  readonly task: PromiseSoulFireTaskError["task"];
  readonly cause: PromiseSoulFireTaskError;
}

const SoulFireTaskFailedBase: TaggedErrorConstructor<
  "SoulFireTaskFailed",
  SoulFireTaskFailedFields
> = Data.TaggedError(
  "SoulFireTaskFailed",
)<SoulFireTaskFailedFields>;

export class SoulFireTaskFailed extends SoulFireTaskFailedBase {}

interface SoulFirePluginErrorFields {
  readonly pluginId: string;
  readonly cause: unknown;
}

const SoulFirePluginErrorBase: TaggedErrorConstructor<
  "SoulFirePluginError",
  SoulFirePluginErrorFields
> = Data.TaggedError(
  "SoulFirePluginError",
)<SoulFirePluginErrorFields>;

export class SoulFirePluginError extends SoulFirePluginErrorBase {}

export class EffectPluginCatalog {
  public constructor(private readonly promise: PluginCatalog) {}

  public get revision(): bigint {
    return this.promise.revision;
  }

  public all(): readonly PluginApiDescriptor[] {
    return this.promise.all();
  }

  public get(pluginId: string): PluginApiDescriptor | undefined {
    return this.promise.get(pluginId);
  }

  public requireDescriptor(
    pluginId: string,
  ): Effect.Effect<PluginApiDescriptor, SoulFirePluginError> {
    return Effect.try({
      try: () => this.promise.requireDescriptor(pluginId),
      catch: (cause) => new SoulFirePluginError({ pluginId, cause }),
    });
  }

  public require<T extends SoulFireExtension>(
    module: SoulFirePluginModule<T>,
  ): Effect.Effect<T, SoulFirePluginError> {
    return Effect.try({
      try: () => {
        const descriptor = this.promise.requireDescriptor(module.pluginId);
        if (
          module.isCompatible !== undefined
          && !module.isCompatible(descriptor)
        ) {
          throw new Error(
            `Installed plugin ${module.pluginId} ${descriptor.pluginVersion} is incompatible with its SDK module`,
          );
        }
        return module.create(this, descriptor);
      },
      catch: (cause) =>
        new SoulFirePluginError({ pluginId: module.pluginId, cause }),
    });
  }

  public service<T extends DescService>(
    pluginId: string,
    service: T,
  ): Effect.Effect<Client<T>, SoulFirePluginError> {
    return Effect.try({
      try: () => this.promise.service(pluginId, service),
      catch: (cause) => new SoulFirePluginError({ pluginId, cause }),
    });
  }

  public refresh(
    options?: CallOptions,
  ): Effect.Effect<readonly PluginApiDescriptor[], SoulFirePluginError> {
    return Effect.tryPromise({
      try: () => this.promise.refresh(options),
      catch: (cause) =>
        new SoulFirePluginError({ pluginId: "<catalog>", cause }),
    });
  }

  public descriptorSet(
    pluginId: string,
    options?: CallOptions,
  ): Effect.Effect<Uint8Array, SoulFirePluginError> {
    return Effect.tryPromise({
      try: () => this.promise.descriptorSet(pluginId, options),
      catch: (cause) => new SoulFirePluginError({ pluginId, cause }),
    });
  }

  public reflective(
    pluginId: string,
    options?: CallOptions,
  ): Effect.Effect<EffectReflectivePlugin, SoulFirePluginError> {
    return Effect.tryPromise({
      try: () => this.promise.reflective(pluginId, options),
      catch: (cause) => new SoulFirePluginError({ pluginId, cause }),
    }).pipe(
      Effect.map((plugin) =>
        wrapEffectValue(plugin, `plugins.${pluginId}`)
      ),
    );
  }

  public watch(options?: CallOptions): Stream.Stream<
    PluginApiEvent,
    SoulFirePluginError
  > {
    return Stream.fromAsyncIterable(
      this.promise.watch(options),
      (cause) =>
        new SoulFirePluginError({ pluginId: "<catalog>", cause }),
    );
  }

  public events(
    options: WatchPluginEventOptions = {},
  ): Stream.Stream<PluginEvent, SoulFirePluginError> {
    return Stream.fromAsyncIterable(
      this.promise.events(options),
      (cause) =>
        new SoulFirePluginError({ pluginId: "<catalog>", cause }),
    );
  }

  public typedEvents<T extends DescMessage>(
    pluginId: string,
    schema: T,
    options: Omit<WatchPluginEventOptions, "pluginIds" | "typeUrls"> = {},
  ): Stream.Stream<TypedPluginEvent<T>, SoulFirePluginError> {
    return Stream.unwrap(
      Effect.try({
        try: () => this.promise.typedEvents(pluginId, schema, options),
        catch: (cause) => new SoulFirePluginError({ pluginId, cause }),
      }).pipe(
        Effect.map((events) =>
          Stream.fromAsyncIterable(
            events,
            (cause) => new SoulFirePluginError({ pluginId, cause }),
          )
        ),
      ),
    );
  }
}

export const SoulFireExtensionTypeId: unique symbol = Symbol.for(
  "@soulfiremc/sdk/SoulFireExtension",
);

export interface SoulFireExtension {
  readonly [SoulFireExtensionTypeId]: true;
}

export interface SoulFirePluginModule<T extends SoulFireExtension> {
  readonly pluginId: string;
  readonly isCompatible?: (descriptor: PluginApiDescriptor) => boolean;
  readonly create: (
    catalog: EffectPluginCatalog,
    descriptor: PluginApiDescriptor,
  ) => T;
}

/**
 * Defines an Effect-first SDK companion for a server plugin while preserving
 * exact inference for the extension returned by `install`.
 */
export function defineSoulFirePlugin<T extends SoulFireExtension>(
  module: SoulFirePluginModule<T>,
): SoulFirePluginModule<T> {
  if (module.pluginId.trim().length === 0) {
    throw new TypeError("SoulFire plugin modules require a non-empty pluginId");
  }
  return Object.freeze(module);
}

type EffectValue<A> =
  A extends PromiseSoulFireInstance ? EffectSoulFireInstance
    : A extends PromiseSoulFireFleetTaskGroup<infer Result>
      ? EffectSoulFireFleetTaskGroup<Result>
      : A extends PromiseSoulFireFleet ? EffectSoulFireFleet
    : A extends PromiseSoulFireBot ? EffectSoulFireBot
      : A extends PromiseSoulFireBotControlLease
        ? EffectSoulFireBotControlLease
          : A extends PromiseBotSession ? EffectBotSession
            : A extends PromiseSoulFireChat ? EffectSoulFireChat
              : A extends PromiseSoulFireInventory ? EffectSoulFireInventory
                : A extends PromiseSoulFireContainer
                  ? EffectSoulFireContainer
                : A extends PromiseSoulFireRecipes ? EffectSoulFireRecipes
                  : A extends PromiseSoulFireRegistry ? EffectSoulFireRegistry
                    : A extends PromiseSoulFireWorld ? EffectSoulFireWorld
                      : A extends PromiseSoulFirePathfinder
                        ? EffectSoulFirePathfinder
                        : A extends PromiseSoulFireProtocol
                          ? EffectSoulFireProtocol
                          : A extends PromiseSoulFireAutomation
                            ? EffectSoulFireAutomation
                            : A extends PromiseSoulFireCamera
                              ? EffectSoulFireCamera
                              : A extends PromiseSoulFireAdmin
                                ? EffectSoulFireAdmin
                      : A extends PromiseReflectivePlugin
                        ? EffectReflectivePlugin
          : A extends PromiseSoulFireTasks ? EffectSoulFireTasks
            : A extends PromiseSoulFireTask<infer Result>
              ? EffectSoulFireTask<Result>
          : A;

type EffectApi<
  T extends object,
  Error = SoulFireRpcError,
> = {
  readonly [K in keyof T]:
    T[K] extends (...args: infer Args) => AsyncIterable<infer Value>
      ? (...args: Args) => Stream.Stream<Value, SoulFireRpcError>
      : T[K] extends (...args: infer Args) => Promise<infer Value>
        ? (...args: Args) => Effect.Effect<
          EffectValue<Value>,
          Error
        >
        : T[K] extends (...args: infer Args) => infer Value
          ? (...args: Args) => EffectValue<Value>
          : EffectValue<T[K]>;
};

export type EffectSoulFireInstance = EffectApi<PromiseSoulFireInstance>;
export type EffectSoulFireBot =
  EffectApi<PromiseSoulFireBot>
  & {
    acquireControlScoped(
      ...args: Parameters<PromiseSoulFireBot["acquireControl"]>
    ): Effect.Effect<
      EffectSoulFireBotControlLease,
      SoulFireRpcError,
      Scope.Scope
    >;
  };
export type EffectSoulFireBotControlLease =
  EffectApi<PromiseSoulFireBotControlLease>;
export type EffectBotSession = EffectApi<PromiseBotSession>;
export type EffectSoulFireChat = EffectApi<PromiseSoulFireChat>;
export type EffectSoulFireContainer = EffectApi<PromiseSoulFireContainer>;
export type EffectSoulFireInventory =
  EffectApi<PromiseSoulFireInventory>
  & {
    openScoped(
      ...args: Parameters<PromiseSoulFireInventory["open"]>
    ): Effect.Effect<
      EffectSoulFireContainer,
      SoulFireRpcError,
      Scope.Scope
    >;
  };
export type EffectSoulFireRecipes = EffectApi<PromiseSoulFireRecipes>;
export type EffectSoulFireRegistry = EffectApi<PromiseSoulFireRegistry>;
export type EffectSoulFireWorld = EffectApi<PromiseSoulFireWorld>;
export type EffectSoulFirePathfinder = EffectApi<
  PromiseSoulFirePathfinder,
  SoulFireRpcError | SoulFireTaskFailed
>;
export type EffectSoulFireProtocol = EffectApi<PromiseSoulFireProtocol>;
export type EffectSoulFireAutomation = EffectApi<PromiseSoulFireAutomation>;
export type EffectSoulFireCamera = EffectApi<PromiseSoulFireCamera>;
export type EffectSoulFireAdmin = EffectApi<PromiseSoulFireAdmin>;
export type EffectSoulFireFleet =
  & Omit<EffectApi<PromiseSoulFireFleet>, "startTasks">
  & {
    startTasks<
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
      options?: FleetTaskStartOptions,
    ): Effect.Effect<
      EffectSoulFireFleetTaskGroup<Result>,
      SoulFireRpcError | SoulFireTaskFailed
    >;
  };
export type EffectSoulFireFleetTaskGroup<
  Result extends DescMessage | undefined = undefined,
> = EffectApi<PromiseSoulFireFleetTaskGroup<Result>>;
export type EffectReflectivePlugin = EffectApi<PromiseReflectivePlugin>;
export type EffectSoulFireTasks = EffectApi<
  PromiseSoulFireTasks,
  SoulFireRpcError | SoulFireTaskFailed
>;
export type EffectSoulFireTask<
  Result extends DescMessage | undefined = undefined,
> = EffectApi<
  PromiseSoulFireTask<Result>,
  SoulFireRpcError | SoulFireTaskFailed
>;

export class SoulFireClient {
  public constructor(public readonly promise: PromiseSoulFire) {}

  public get server(): ServerMetadata {
    return this.promise.server;
  }

  public get identity(): Readonly<SdkIdentity> {
    return this.promise.identity;
  }

  public get capabilities(): CapabilitySet {
    return this.promise.capabilities;
  }

  public get limits(): ReadonlyMap<string, bigint> {
    return this.promise.limits;
  }

  public get plugins(): EffectPluginCatalog {
    return new EffectPluginCatalog(this.promise.plugins);
  }

  public get admin(): EffectSoulFireAdmin {
    return wrapEffectValue(this.promise.admin, "admin");
  }

  public get localServer(): LocalSoulFireServer | undefined {
    return this.promise.localServer;
  }

  public service<T extends DescService>(service: T): Client<T> {
    return this.promise.service(service);
  }

  public instance(instanceId: string): EffectSoulFireInstance {
    return wrapEffectValue(
      this.promise.instance(instanceId),
      `instance.${instanceId}`,
    );
  }

  public instances(
    options?: CallOptions,
  ): Effect.Effect<InstanceListResponse_Instance[], SoulFireRpcError> {
    return rpc("instances", () => this.promise.instances(options));
  }

  public createInstance(
    friendlyName: string,
    options?: CallOptions,
  ): Effect.Effect<EffectSoulFireInstance, SoulFireRpcError> {
    return rpc(
      "createInstance",
      () => this.promise.createInstance(friendlyName, options),
    ).pipe(
      Effect.map((instance) =>
        wrapEffectValue(instance, `instance.${instance.id}`)
      ),
    );
  }

  public beginLogin(
    email: string,
    options?: CallOptions,
  ): Effect.Effect<NextAuthFlowResponse, SoulFireRpcError> {
    return rpc("beginLogin", () => this.promise.beginLogin(email, options));
  }

  public completeLogin(
    authFlowToken: string,
    code: string,
    options?: CallOptions,
  ): Effect.Effect<NextAuthFlowResponse, SoulFireRpcError> {
    return rpc(
      "completeLogin",
      () => this.promise.completeLogin(authFlowToken, code, options),
    );
  }

  public restartLocalServer(): Effect.Effect<void, SoulFireRpcError> {
    return rpc(
      "restartLocalServer",
      () => this.promise.restartLocalServer(),
    );
  }

  public stopLocalServer(): Effect.Effect<void, SoulFireRpcError> {
    return rpc("stopLocalServer", () => this.promise.stopLocalServer());
  }

  public close(): Effect.Effect<void, never> {
    return Effect.promise(() => this.promise.close()).pipe(Effect.orDie);
  }
}

const SoulFireServiceBase: Context.TagClass<
  SoulFireService,
  "@soulfiremc/sdk/SoulFireService",
  SoulFireClient
> = Context.Tag(
  "@soulfiremc/sdk/SoulFireService",
)<SoulFireService, SoulFireClient>();

export class SoulFireService extends SoulFireServiceBase {}

export interface SoulFireApi {
  connect(
    options: SoulFireOptions,
  ): Effect.Effect<
    SoulFireClient,
    SoulFireConnectionError,
    Scope.Scope
  >;
  connectWithHttpClient(
    options: SoulFireOptions,
  ): Effect.Effect<
    SoulFireClient,
    SoulFireConnectionError,
    Scope.Scope | HttpClient.HttpClient
  >;
  layer(
    options: SoulFireOptions,
  ): Layer.Layer<SoulFireService, SoulFireConnectionError>;
  layerWithHttpClient(
    options: SoulFireOptions,
  ): Layer.Layer<
    SoulFireService,
    SoulFireConnectionError,
    HttpClient.HttpClient
  >;
}

export const SoulFire: SoulFireApi = {
  connect(
    options: SoulFireOptions,
  ): Effect.Effect<
    SoulFireClient,
    SoulFireConnectionError,
    Scope.Scope
  > {
    return Effect.acquireRelease(
      Effect.tryPromise({
        try: async () =>
          new SoulFireClient(await PromiseSoulFire.connect(options)),
        catch: (cause) => new SoulFireConnectionError({ cause }),
      }),
      (client) => client.close(),
    );
  },

  connectWithHttpClient(
    options: SoulFireOptions,
  ): Effect.Effect<
    SoulFireClient,
    SoulFireConnectionError,
    Scope.Scope | HttpClient.HttpClient
  > {
    return Effect.flatMap(
      HttpClient.HttpClient,
      (client) =>
        this.connect({
          ...options,
          fetch: makeEffectHttpClientFetch(client),
        }),
    );
  },

  layer(options: SoulFireOptions): Layer.Layer<
    SoulFireService,
    SoulFireConnectionError
  > {
    return Layer.scoped(SoulFireService, this.connect(options));
  },

  layerWithHttpClient(options: SoulFireOptions): Layer.Layer<
    SoulFireService,
    SoulFireConnectionError,
    HttpClient.HttpClient
  > {
    return Layer.scoped(
      SoulFireService,
      this.connectWithHttpClient(options),
    );
  },
};

function rpc<T>(
  operation: string,
  call: () => Promise<T>,
): Effect.Effect<T, SoulFireRpcError> {
  return Effect.tryPromise({
    try: call,
    catch: (cause) => rpcError(operation, cause),
  });
}

function taskRpc<T>(
  operation: string,
  call: () => Promise<T>,
): Effect.Effect<T, SoulFireRpcError | SoulFireTaskFailed> {
  return Effect.tryPromise({
    try: call,
    catch: (cause) =>
      cause instanceof PromiseSoulFireTaskError
        ? new SoulFireTaskFailed({ task: cause.task, cause })
        : rpcError(operation, cause),
  });
}

const effectWrappers = new WeakMap<object, object>();
const streamMethods = new Set([
  "events",
  "goTo",
  "loginCredentials",
  "loginDeviceCode",
  "packets",
  "run",
  "runGoTo",
  "stream",
  "watch",
  "watchBotStatuses",
]);
const taskStreamMethods = new Set([
  "events",
  "run",
  "runAttackEntity",
  "runAttackNearest",
  "runAutoArmor",
  "runAutoEat",
  "runAutoRespawn",
  "runAutoTotem",
  "runBrew",
  "runBuild",
  "runBreed",
  "runCollectBlocks",
  "runCraft",
  "runExplore",
  "runExcavate",
  "runFarm",
  "runFish",
  "runFollowEntity",
  "runFlee",
  "runGuard",
  "runMaintainLoadout",
  "runGoTo",
  "runProtect",
  "runRangedAttack",
  "runSleep",
  "runSmelt",
  "runStash",
  "runVillagerTrade",
  "runWithdraw",
  "watch",
]);
const pathfinderStreamMethods = new Set(["run", "runFollow"]);
const cameraStreamMethods = new Set(["frames"]);
const adminStreamMethods = new Set([
  "activateScript",
  "dryRunScript",
  "logs",
  "scriptLogs",
]);
const wrappedSyncMethods = new Set(["bot", "task"]);

function isStreamMethod(target: object, method: string): boolean {
  if (target instanceof PromiseSoulFireTasks) {
    return taskStreamMethods.has(method);
  }
  if (target instanceof PromiseSoulFirePathfinder) {
    return pathfinderStreamMethods.has(method);
  }
  if (target instanceof PromiseSoulFireCamera) {
    return cameraStreamMethods.has(method);
  }
  if (target instanceof PromiseSoulFireAdmin) {
    return adminStreamMethods.has(method);
  }
  return streamMethods.has(method);
}

function wrapEffectValue<T extends object>(
  value: T,
  operation: string,
): EffectValue<T> {
  const existing = effectWrappers.get(value);
  if (existing !== undefined) {
    return existing as EffectValue<T>;
  }
  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      if (
        target instanceof PromiseSoulFireInventory
        && property === "openScoped"
      ) {
        return (
          ...args: Parameters<PromiseSoulFireInventory["open"]>
        ) =>
          Effect.acquireRelease(
            rpc(
              `${operation}.open`,
              () => target.open(...args),
            ),
            (container) =>
              rpc(
                `${operation}.close`,
                () => container.close(),
              ).pipe(
                Effect.asVoid,
                Effect.catchAll(() => Effect.void),
              ),
          ).pipe(
            Effect.map((container) =>
              wrapEffectValue(
                container,
                `${operation}.container`,
              )
            ),
          );
      }
      if (
        target instanceof PromiseSoulFireBot
        && property === "acquireControlScoped"
      ) {
        return (
          ...args: Parameters<PromiseSoulFireBot["acquireControl"]>
        ) =>
          Effect.acquireRelease(
            rpc(
              `${operation}.acquireControl`,
              () => target.acquireControl(...args),
            ),
            (lease) =>
              rpc(
                `${operation}.releaseControl`,
                () => lease.release(),
              ).pipe(
                Effect.asVoid,
                Effect.catchAll(() => Effect.void),
              ),
          ).pipe(
            Effect.map((lease) =>
              wrapEffectValue(
                lease,
                `${operation}.controlLease`,
              )
            ),
          );
      }
      const member = Reflect.get(target, property, target) as unknown;
      if (typeof member !== "function") {
        return wrapUnknown(
          member,
          `${operation}.${String(property)}`,
        );
      }
      const method = String(property);
      if (isStreamMethod(target, method)) {
        return (...args: readonly unknown[]) =>
          Stream.unwrap(
            Effect.try({
              try: () => Reflect.apply(member, target, args) as AsyncIterable<unknown>,
              catch: (cause) => rpcError(`${operation}.${method}`, cause),
            }).pipe(
              Effect.map((source) =>
                Stream.fromAsyncIterable(
                  source,
                  (cause) => rpcError(`${operation}.${method}`, cause),
                )
              ),
            ),
          );
      }
      if (wrappedSyncMethods.has(method)) {
        return (...args: readonly unknown[]) => {
          const identifier = typeof args[0] === "string"
            ? `.${args[0]}`
            : "";
          return wrapUnknown(
            Reflect.apply(member, target, args),
            `${operation}.${method}${identifier}`,
          );
        };
      }
      return (...args: readonly unknown[]) =>
        taskRpc(
          `${operation}.${method}`,
          async () =>
            wrapUnknown(
              await Reflect.apply(member, target, args) as unknown,
              `${operation}.${method}`,
            ),
        );
    },
  });
  effectWrappers.set(value, proxy);
  return proxy as EffectValue<T>;
}

function rpcError(operation: string, cause: unknown): SoulFireRpcError {
  if (!(cause instanceof ConnectError)) {
    return new SoulFireRpcError({
      operation,
      cause,
      retryable: false,
    });
  }
  const requestId =
    cause.metadata.get("x-soulfire-request-id")
    ?? cause.metadata.get("x-request-id")
    ?? undefined;
  return new SoulFireRpcError({
    operation,
    cause,
    code: cause.code,
    retryable: isRetryableCode(cause.code),
    ...(requestId === undefined ? {} : { requestId }),
  });
}

function isRetryableCode(code: Code): boolean {
  return (
    code === Code.Aborted
    || code === Code.DeadlineExceeded
    || code === Code.ResourceExhausted
    || code === Code.Unavailable
  );
}

function wrapUnknown(value: unknown, operation: string): unknown {
  if (
    value instanceof PromiseSoulFireInstance
    || value instanceof PromiseSoulFireFleet
    || value instanceof PromiseSoulFireFleetTaskGroup
    || value instanceof PromiseSoulFireBot
    || value instanceof PromiseSoulFireBotControlLease
    || value instanceof PromiseBotSession
    || value instanceof PromiseSoulFireChat
    || value instanceof PromiseSoulFireInventory
    || value instanceof PromiseSoulFireContainer
    || value instanceof PromiseSoulFireRecipes
    || value instanceof PromiseSoulFireRegistry
    || value instanceof PromiseSoulFireWorld
    || value instanceof PromiseSoulFirePathfinder
    || value instanceof PromiseSoulFireProtocol
    || value instanceof PromiseSoulFireAutomation
    || value instanceof PromiseSoulFireCamera
    || value instanceof PromiseSoulFireAdmin
    || value instanceof PromiseReflectivePlugin
    || value instanceof PromiseSoulFireTasks
    || value instanceof PromiseSoulFireTask
  ) {
    return wrapEffectValue(value, operation);
  }
  return value;
}
