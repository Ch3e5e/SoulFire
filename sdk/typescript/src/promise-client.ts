import type {
  DescMessage,
  DescService,
  MessageInitShape,
} from "@bufbuild/protobuf";
import type { CallOptions, Client } from "@connectrpc/connect";
import {
  Cause,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Scope,
  Stream,
} from "effect";

import {
  SoulFire as KernelSoulFire,
  SoulFireBot as KernelSoulFireBot,
  SoulFireBotControlLease as KernelSoulFireBotControlLease,
  SoulFireInstance as KernelSoulFireInstance,
  type SoulFireOptions,
  type TokenProvider,
} from "./client.js";
import type {
  CapabilitySet,
  ServerMetadata,
} from "./connection.js";
import {
  EffectPluginCatalog,
  SoulFire as EffectSoulFire,
  SoulFireExtensionTypeId,
  type EffectBotSession,
  type EffectSoulFireBot,
  type EffectSoulFireBotControlLease,
  type EffectSoulFireAutomation,
  type EffectSoulFireCamera,
  type EffectSoulFireAdmin,
  type EffectSoulFireFleet,
  type EffectSoulFireFleetTaskGroup,
  type EffectSoulFireChat,
  type EffectSoulFireContainer,
  type EffectSoulFireInventory,
  type EffectSoulFireInstance,
  type EffectSoulFirePathfinder,
  type EffectSoulFireProtocol,
  type EffectSoulFireRecipes,
  type EffectSoulFireRegistry,
  type EffectReflectivePlugin,
  type EffectSoulFireTask,
  type EffectSoulFireTasks,
  type EffectSoulFireWorld,
  type SoulFireExtension,
  type SoulFirePluginModule,
  SoulFireClient as EffectSoulFireClient,
} from "./effect-client.js";
import type {
  InstanceListResponse_Instance,
} from "./generated/soulfire/instance_pb.js";
import type {
  PluginApiDescriptor,
  PluginApiEvent,
  PluginEvent,
} from "./generated/soulfire/plugin_api_pb.js";
import type {
  NextAuthFlowResponse,
} from "./generated/soulfire/login_pb.js";
import type { SdkIdentity } from "./generated/soulfire/sdk_pb.js";
import type { LocalSoulFireServer } from "./install-types.js";
import { BotSession as KernelBotSession } from "./session.js";
import {
  SoulFireTask as KernelSoulFireTask,
  SoulFireTasks as KernelSoulFireTasks,
} from "./tasks.js";
import { SoulFireChat as KernelSoulFireChat } from "./chat.js";
import {
  SoulFireContainer as KernelSoulFireContainer,
  SoulFireInventory as KernelSoulFireInventory,
} from "./inventory.js";
import { SoulFireRecipes as KernelSoulFireRecipes } from "./recipes.js";
import { SoulFireRegistry as KernelSoulFireRegistry } from "./registry.js";
import { SoulFireWorld as KernelSoulFireWorld } from "./world.js";
import { SoulFirePathfinder as KernelSoulFirePathfinder } from "./pathfinding.js";
import { SoulFireProtocol as KernelSoulFireProtocol } from "./protocol.js";
import { SoulFireAutomation as KernelSoulFireAutomation } from "./automation.js";
import { SoulFireCamera as KernelSoulFireCamera } from "./camera.js";
import { SoulFireAdmin as KernelSoulFireAdmin } from "./admin.js";
import {
  SoulFireFleet as KernelSoulFireFleet,
  SoulFireFleetTaskGroup as KernelSoulFireFleetTaskGroup,
  type FleetBot,
  type FleetSelector,
  type FleetTaskStartOptions,
} from "./fleet.js";
import {
  ReflectivePlugin as KernelReflectivePlugin,
  type TypedPluginEvent,
  type WatchPluginEventOptions,
} from "./plugins.js";

type PromiseValue<A> =
  A extends EffectSoulFireInstance ? SoulFireInstance
    : A extends EffectSoulFireFleetTaskGroup<infer Result>
      ? SoulFireFleetTaskGroup<Result>
      : A extends EffectSoulFireFleet ? SoulFireFleet
    : A extends EffectSoulFireBot ? SoulFireBot
      : A extends EffectSoulFireBotControlLease ? SoulFireBotControlLease
        : A extends EffectBotSession ? BotSession
          : A extends EffectSoulFireChat ? SoulFireChat
            : A extends EffectSoulFireInventory ? SoulFireInventory
              : A extends EffectSoulFireContainer ? SoulFireContainer
              : A extends EffectSoulFireRecipes ? SoulFireRecipes
                : A extends EffectSoulFireRegistry ? SoulFireRegistry
                  : A extends EffectSoulFireWorld ? SoulFireWorld
                    : A extends EffectSoulFirePathfinder ? SoulFirePathfinder
                      : A extends EffectSoulFireProtocol ? SoulFireProtocol
                        : A extends EffectSoulFireAutomation
                          ? SoulFireAutomation
                          : A extends EffectSoulFireCamera
                            ? SoulFireCamera
                            : A extends EffectSoulFireAdmin
                              ? SoulFireAdmin
                    : A extends EffectReflectivePlugin ? ReflectivePlugin
          : A extends EffectSoulFireTasks ? SoulFireTasks
            : A extends EffectSoulFireTask<infer Result>
              ? SoulFireTask<Result>
          : A extends EffectPluginCatalog ? PluginCatalog
            : A extends SoulFireExtension ? PromiseApi<A>
              : A;

type PromiseApi<T extends object> = {
  readonly [K in keyof T]:
    T[K] extends (...args: infer Args) => Effect.Effect<
        infer Value,
        unknown,
        never
      >
        ? (...args: Args) => Promise<PromiseValue<Value>>
        : T[K] extends (...args: infer Args) => Stream.Stream<
          infer Value,
          unknown
        >
          ? (...args: Args) => AsyncIterable<Value>
          : T[K] extends (...args: infer Args) => infer Value
            ? (...args: Args) => PromiseValue<Value>
            : PromiseValue<T[K]>;
};

export type SoulFireInstance = PromiseApi<EffectSoulFireInstance>;
export type SoulFireBot = PromiseApi<EffectSoulFireBot>;
export type SoulFireBotControlLease =
  PromiseApi<EffectSoulFireBotControlLease>;
export type BotSession = PromiseApi<EffectBotSession>;
export type SoulFireChat = PromiseApi<EffectSoulFireChat>;
export type SoulFireInventory = PromiseApi<
  Omit<EffectSoulFireInventory, "openScoped">
>;
export type SoulFireContainer = PromiseApi<EffectSoulFireContainer>;
export type SoulFireRecipes = PromiseApi<EffectSoulFireRecipes>;
export type SoulFireRegistry = PromiseApi<EffectSoulFireRegistry>;
export type SoulFireWorld = PromiseApi<EffectSoulFireWorld>;
export type SoulFirePathfinder = PromiseApi<EffectSoulFirePathfinder>;
export type SoulFireProtocol = PromiseApi<EffectSoulFireProtocol>;
export type SoulFireAutomation = PromiseApi<EffectSoulFireAutomation>;
export type SoulFireCamera = PromiseApi<EffectSoulFireCamera>;
export type SoulFireAdmin = PromiseApi<EffectSoulFireAdmin>;
export type SoulFireFleet =
  & Omit<PromiseApi<EffectSoulFireFleet>, "startTasks">
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
    ): Promise<SoulFireFleetTaskGroup<Result>>;
  };
export type SoulFireFleetTaskGroup<
  Result extends import("@bufbuild/protobuf").DescMessage | undefined =
    undefined,
> = PromiseApi<EffectSoulFireFleetTaskGroup<Result>>;
export type ReflectivePlugin = PromiseApi<EffectReflectivePlugin>;
export type SoulFireTasks = PromiseApi<EffectSoulFireTasks>;
export type SoulFireTask<Result extends import("@bufbuild/protobuf").DescMessage
  | undefined = undefined> = PromiseApi<EffectSoulFireTask<Result>>;

export interface PluginCatalog {
  readonly revision: bigint;
  all(): readonly PluginApiDescriptor[];
  get(pluginId: string): PluginApiDescriptor | undefined;
  requireDescriptor(pluginId: string): Promise<PluginApiDescriptor>;
  require<T extends SoulFireExtension>(
    module: SoulFirePluginModule<T>,
  ): Promise<PromiseApi<T>>;
  service<T extends DescService>(
    pluginId: string,
    service: T,
  ): Promise<Client<T>>;
  refresh(options?: CallOptions): Promise<readonly PluginApiDescriptor[]>;
  descriptorSet(
    pluginId: string,
    options?: CallOptions,
  ): Promise<Uint8Array>;
  reflective(
    pluginId: string,
    options?: CallOptions,
  ): Promise<ReflectivePlugin>;
  watch(options?: CallOptions): AsyncIterable<PluginApiEvent>;
  events(options?: WatchPluginEventOptions): AsyncIterable<PluginEvent>;
  typedEvents<T extends DescMessage>(
    pluginId: string,
    schema: T,
    options?: Omit<WatchPluginEventOptions, "pluginIds" | "typeUrls">,
  ): AsyncIterable<TypedPluginEvent<T>>;
}

type Runtime = ManagedRuntime.ManagedRuntime<never, never>;

export class SoulFire implements AsyncDisposable {
  readonly #runtime: Runtime;
  readonly #scope: Scope.CloseableScope;
  readonly #effect: EffectSoulFireClient;
  readonly #wrappers = new WeakMap<object, object>();
  #closed = false;

  private constructor(
    runtime: Runtime,
    scope: Scope.CloseableScope,
    effect: EffectSoulFireClient,
  ) {
    this.#runtime = runtime;
    this.#scope = scope;
    this.#effect = effect;
  }

  public static connect(options: SoulFireOptions): Promise<SoulFire> {
    return this.#open(EffectSoulFire.connect(options));
  }

  public static async unauthenticated(
    options: SoulFireOptions,
  ): Promise<SoulFire> {
    const runtime = ManagedRuntime.make(Layer.empty);
    const scope = await runtime.runPromise(Scope.make());
    const client = new EffectSoulFireClient(
      KernelSoulFire.unauthenticated(options),
    );
    await runtime.runPromise(Scope.addFinalizer(scope, client.close()));
    return new SoulFire(runtime, scope, client);
  }

  /** @internal Used by runtime-specific entry points. */
  public static fromEffect(
    acquire: Effect.Effect<
      EffectSoulFireClient,
      unknown,
      Scope.Scope
    >,
  ): Promise<SoulFire> {
    return this.#open(acquire);
  }

  static async #open(
    acquire: Effect.Effect<
      EffectSoulFireClient,
      unknown,
      Scope.Scope
    >,
  ): Promise<SoulFire> {
    const runtime = ManagedRuntime.make(Layer.empty);
    const scope = await runtime.runPromise(Scope.make());
    try {
      const client = await runPromiseUnwrapped(
        runtime,
        Effect.provideService(acquire, Scope.Scope, scope),
      );
      return new SoulFire(runtime, scope, client);
    } catch (error) {
      await runtime.runPromise(Scope.close(scope, Exit.void));
      await runtime.dispose();
      throw error;
    }
  }

  public get server(): ServerMetadata {
    return this.#effect.server;
  }

  public get identity(): Readonly<SdkIdentity> {
    return this.#effect.identity;
  }

  public get capabilities(): CapabilitySet {
    return this.#effect.capabilities;
  }

  public get limits(): ReadonlyMap<string, bigint> {
    return this.#effect.limits;
  }

  public get plugins(): PluginCatalog {
    return this.#wrap(this.#effect.plugins, "plugins");
  }

  public get admin(): SoulFireAdmin {
    return this.#wrap(this.#effect.admin, "admin");
  }

  public get localServer(): LocalSoulFireServer | undefined {
    return this.#effect.localServer;
  }

  public get localServerLogs(): readonly string[] {
    return this.#effect.promise.localServerLogs;
  }

  public get isLocalServerRunning(): boolean {
    return this.#effect.promise.isLocalServerRunning;
  }

  public setToken(token: string | TokenProvider | undefined): void {
    this.#effect.promise.setToken(token);
  }

  public service<T extends DescService>(service: T): Client<T> {
    return this.#effect.service(service);
  }

  public instance(instanceId: string): SoulFireInstance {
    return this.#wrap(
      this.#effect.instance(instanceId),
      `instance.${instanceId}`,
    );
  }

  public instances(
    options?: CallOptions,
  ): Promise<InstanceListResponse_Instance[]> {
    return this.#run(this.#effect.instances(options));
  }

  public async createInstance(
    friendlyName: string,
    options?: CallOptions,
  ): Promise<SoulFireInstance> {
    const instance = await this.#run(
      this.#effect.createInstance(friendlyName, options),
    );
    return this.#wrap(instance, `instance.${instance.id}`);
  }

  public beginLogin(
    email: string,
    options?: CallOptions,
  ): Promise<NextAuthFlowResponse> {
    return this.#run(this.#effect.beginLogin(email, options));
  }

  public completeLogin(
    authFlowToken: string,
    code: string,
    options?: CallOptions,
  ): Promise<NextAuthFlowResponse> {
    return this.#run(
      this.#effect.completeLogin(authFlowToken, code, options),
    );
  }

  public restartLocalServer(): Promise<void> {
    return this.#run(this.#effect.restartLocalServer());
  }

  public stopLocalServer(): Promise<void> {
    return this.#run(this.#effect.stopLocalServer());
  }

  public async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    await this.#runtime.runPromise(Scope.close(this.#scope, Exit.void));
    await this.#runtime.dispose();
  }

  public [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  #run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
    if (this.#closed) {
      return Promise.reject(new Error("SoulFire client is closed"));
    }
    return runPromiseUnwrapped(this.#runtime, effect);
  }

  #wrap<T extends object>(value: T, operation: string): PromiseValue<T> {
    const existing = this.#wrappers.get(value);
    if (existing !== undefined) {
      return existing as PromiseValue<T>;
    }
    const proxy = new Proxy(value, {
      get: (target, property, receiver) => {
        const member = Reflect.get(target, property, target) as unknown;
        if (typeof member !== "function") {
          return this.#wrapUnknown(member, `${operation}.${String(property)}`);
        }
        return (...args: readonly unknown[]) => {
          const result = Reflect.apply(member, target, args) as unknown;
          if (isStream(result)) {
            return Stream.toAsyncIterable(result);
          }
          if (Effect.isEffect(result)) {
            return this.#run(
              result as Effect.Effect<unknown, unknown, never>,
            ).then((resolved) =>
              this.#wrapUnknown(
                resolved,
                `${operation}.${String(property)}`,
              )
            );
          }
          return this.#wrapUnknown(
            result,
            `${operation}.${String(property)}`,
          );
        };
      },
    });
    this.#wrappers.set(value, proxy);
    return proxy as PromiseValue<T>;
  }

  #wrapUnknown(value: unknown, operation: string): unknown {
    if (
      value instanceof KernelSoulFireInstance
      || value instanceof KernelSoulFireFleet
      || value instanceof KernelSoulFireFleetTaskGroup
      || value instanceof KernelSoulFireBot
      || value instanceof KernelSoulFireBotControlLease
      || value instanceof KernelBotSession
      || value instanceof KernelSoulFireChat
      || value instanceof KernelSoulFireInventory
      || value instanceof KernelSoulFireContainer
      || value instanceof KernelSoulFireRecipes
      || value instanceof KernelSoulFireRegistry
      || value instanceof KernelSoulFireWorld
      || value instanceof KernelSoulFirePathfinder
      || value instanceof KernelSoulFireProtocol
      || value instanceof KernelSoulFireAutomation
      || value instanceof KernelSoulFireCamera
      || value instanceof KernelSoulFireAdmin
      || value instanceof KernelReflectivePlugin
      || value instanceof KernelSoulFireTasks
      || value instanceof KernelSoulFireTask
      || value instanceof EffectPluginCatalog
      || (
        typeof value === "object"
        && value !== null
        && SoulFireExtensionTypeId in value
      )
    ) {
      return this.#wrap(value, operation);
    }
    return value;
  }
}

async function runPromiseUnwrapped<A>(
  runtime: Runtime,
  effect: Effect.Effect<A, unknown>,
): Promise<A> {
  const exit = await runtime.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) {
    throw failure.value;
  }
  throw Cause.squash(exit.cause);
}

function isStream(
  value: unknown,
): value is Stream.Stream<unknown, unknown, never> {
  return (
    typeof value === "object"
    && value !== null
    && Stream.StreamTypeId in value
  );
}
