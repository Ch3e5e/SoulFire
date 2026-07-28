import {
  createFileRegistry,
  fromBinary,
  fromJson,
  toJson,
  type DescMessage,
  type DescMethod,
  type DescService,
  type JsonValue,
  type Message,
  type MessageInitShape,
  type MessageShape,
  type Registry,
} from "@bufbuild/protobuf";
import {
  FileDescriptorSetSchema,
} from "@bufbuild/protobuf/wkt";
import {
  createClient,
  type CallOptions,
  type Client,
  type Transport,
} from "@connectrpc/connect";

import {
  PluginApiEventKind,
  PluginApiService,
  type PluginEvent,
  type PluginApiDescriptor,
  type PluginApiEvent,
} from "./generated/soulfire/plugin_api_pb.js";
import type {
  SoulFireTask,
  SoulFireTasks,
  TaskStartOptions,
} from "./tasks.js";

export interface WatchPluginEventOptions {
  readonly pluginIds?: readonly string[];
  readonly typeUrls?: readonly string[];
  readonly instanceId?: string;
  readonly botId?: string;
  readonly taskId?: string;
  readonly afterSequence?: bigint;
  readonly call?: CallOptions;
}

export interface TypedPluginEvent<T extends DescMessage> {
  readonly event: PluginEvent;
  readonly value?: MessageShape<T>;
}

export interface ReflectivePluginEvent {
  readonly event: PluginEvent;
  readonly message?: ReflectiveMessage;
}

export interface SoulFirePluginModule<T> {
  readonly pluginId: string;
  readonly isCompatible?: (descriptor: PluginApiDescriptor) => boolean;
  create(
    catalog: PluginCatalog,
    descriptor: PluginApiDescriptor,
  ): T;
}

export class SoulFirePluginNotFoundError extends Error {
  public constructor(public readonly pluginId: string) {
    super(`SoulFire plugin is not installed: ${pluginId}`);
    this.name = "SoulFirePluginNotFoundError";
  }
}

export class SoulFirePluginCompatibilityError extends Error {
  public constructor(
    public readonly pluginId: string,
    message: string,
  ) {
    super(message);
    this.name = "SoulFirePluginCompatibilityError";
  }
}

export class SoulFirePluginDescriptorError extends Error {
  public constructor(
    public readonly pluginId: string,
    message: string,
  ) {
    super(message);
    this.name = "SoulFirePluginDescriptorError";
  }
}

export interface ReflectiveMessage {
  readonly typeName: string;
  readonly value: Message;
  readonly json: JsonValue;
}

export class ReflectivePlugin {
  public constructor(
    public readonly descriptor: PluginApiDescriptor,
    private readonly registry: Registry,
    private readonly transport: Transport,
  ) {}

  public async call(
    serviceName: string,
    methodName: string,
    input: JsonValue,
    options?: CallOptions,
  ): Promise<ReflectiveMessage> {
    const method = this.#method(serviceName, methodName);
    if (method.methodKind !== "unary") {
      throw new SoulFirePluginDescriptorError(
        this.descriptor.pluginId,
        `${serviceName}/${methodName} is not a unary RPC`,
      );
    }
    const client = createClient(method.parent, this.transport);
    const invoke = client[method.localName] as unknown as (
      request: Message,
      options?: CallOptions,
    ) => Promise<Message>;
    const response = await invoke(
      fromJson(method.input, input, { registry: this.registry }),
      options,
    );
    return reflectiveMessage(method.output, response, this.registry);
  }

  public stream(
    serviceName: string,
    methodName: string,
    input: JsonValue,
    options?: CallOptions,
  ): AsyncIterable<ReflectiveMessage> {
    const method = this.#method(serviceName, methodName);
    if (method.methodKind !== "server_streaming") {
      throw new SoulFirePluginDescriptorError(
        this.descriptor.pluginId,
        `${serviceName}/${methodName} is not a server-streaming RPC`,
      );
    }
    const client = createClient(method.parent, this.transport);
    const invoke = client[method.localName] as unknown as (
      request: Message,
      options?: CallOptions,
    ) => AsyncIterable<Message>;
    const values = invoke(
      fromJson(method.input, input, { registry: this.registry }),
      options,
    );
    return mapReflectiveStream(values, method.output, this.registry);
  }

  /**
   * Watches events published by this plugin and decodes their payloads from
   * the plugin's downloaded descriptor set.
   */
  public events(
    options: Omit<WatchPluginEventOptions, "pluginIds"> = {},
  ): AsyncIterable<ReflectivePluginEvent> {
    const client = createClient(PluginApiService, this.transport);
    const { call, typeUrls = [], ...request } = options;
    return mapReflectiveEvents(
      client.watchPluginEvents(
        {
          ...request,
          pluginIds: [this.descriptor.pluginId],
          typeUrls: unique(typeUrls),
        },
        call,
      ),
      this.registry,
      this.descriptor.pluginId,
    );
  }

  /**
   * Starts a plugin-defined task using its downloaded request and result
   * descriptors. Generated companion SDKs expose a statically typed method
   * for the same operation.
   */
  public startTask(
    tasks: SoulFireTasks,
    inputTypeUrl: string,
    input: JsonValue,
    options: TaskStartOptions = {},
  ): Promise<SoulFireTask<DescMessage>> {
    const task = this.descriptor.taskTypes.find(
      (candidate) => candidate.inputTypeUrl === inputTypeUrl,
    );
    if (task === undefined) {
      throw new SoulFirePluginCompatibilityError(
        this.descriptor.pluginId,
        `Plugin ${this.descriptor.pluginId} does not expose task ${inputTypeUrl}`,
      );
    }
    const inputSchema = this.#message(task.inputTypeUrl);
    const resultSchema = this.#message(task.resultTypeUrl);
    const value = fromJson(inputSchema, input, { registry: this.registry });
    return tasks.start(
      inputSchema,
      value as MessageInitShape<typeof inputSchema>,
      resultSchema,
      options,
    );
  }

  #message(typeUrl: string): DescMessage {
    const typeName = typeUrl.includes("/")
      ? typeUrl.slice(typeUrl.lastIndexOf("/") + 1)
      : typeUrl;
    const message = this.registry.getMessage(typeName);
    if (message === undefined) {
      throw new SoulFirePluginDescriptorError(
        this.descriptor.pluginId,
        `Plugin descriptor does not contain message ${typeName}`,
      );
    }
    return message;
  }

  #method(serviceName: string, methodName: string): DescMethod {
    const service = this.registry.getService(serviceName);
    if (service === undefined) {
      throw new SoulFirePluginDescriptorError(
        this.descriptor.pluginId,
        `Plugin ${this.descriptor.pluginId} does not describe service ${serviceName}`,
      );
    }
    if (
      !this.descriptor.services.some(
        (candidate) => candidate.fullName === serviceName,
      )
    ) {
      throw new SoulFirePluginCompatibilityError(
        this.descriptor.pluginId,
        `Plugin ${this.descriptor.pluginId} does not expose ${serviceName}`,
      );
    }
    const method = service.methods.find(
      (candidate) =>
        candidate.name === methodName || candidate.localName === methodName,
    );
    if (method === undefined) {
      throw new SoulFirePluginDescriptorError(
        this.descriptor.pluginId,
        `Service ${serviceName} does not describe method ${methodName}`,
      );
    }
    return method;
  }
}

export class PluginCatalog {
  readonly #client: Client<typeof PluginApiService>;
  readonly #transport: Transport;
  #plugins: Map<string, PluginApiDescriptor>;
  #revision: bigint;
  readonly #reflective = new Map<string, {
    readonly hash: string;
    readonly plugin: ReflectivePlugin;
  }>();

  public constructor(
    transport: Transport,
    plugins: readonly PluginApiDescriptor[] = [],
    revision = 0n,
  ) {
    this.#transport = transport;
    this.#client = createClient(PluginApiService, transport);
    this.#plugins = indexPlugins(plugins);
    this.#revision = revision;
  }

  public get revision(): bigint {
    return this.#revision;
  }

  public all(): readonly PluginApiDescriptor[] {
    return [...this.#plugins.values()];
  }

  public get(pluginId: string): PluginApiDescriptor | undefined {
    return this.#plugins.get(pluginId);
  }

  public requireDescriptor(pluginId: string): PluginApiDescriptor {
    const descriptor = this.get(pluginId);
    if (descriptor === undefined) {
      throw new SoulFirePluginNotFoundError(pluginId);
    }
    return descriptor;
  }

  public require<T>(module: SoulFirePluginModule<T>): T {
    const descriptor = this.requireDescriptor(module.pluginId);
    if (
      module.isCompatible !== undefined
      && !module.isCompatible(descriptor)
    ) {
      throw new SoulFirePluginCompatibilityError(
        module.pluginId,
        `Installed plugin ${module.pluginId} ${descriptor.pluginVersion} is incompatible with its SDK module`,
      );
    }
    return module.create(this, descriptor);
  }

  public service<T extends DescService>(
    pluginId: string,
    service: T,
  ): Client<T> {
    const descriptor = this.requireDescriptor(pluginId);
    if (
      !descriptor.services.some(
        (registered) => registered.fullName === service.typeName,
      )
    ) {
      throw new SoulFirePluginCompatibilityError(
        pluginId,
        `Plugin ${pluginId} does not expose ${service.typeName}`,
      );
    }
    return createClient(service, this.#transport);
  }

  public async refresh(
    options?: CallOptions,
  ): Promise<readonly PluginApiDescriptor[]> {
    const response = await this.#client.listPluginApis({}, options);
    this.#replace(response.plugins, response.revision);
    return this.all();
  }

  public async descriptorSet(
    pluginId: string,
    options?: CallOptions,
  ): Promise<Uint8Array> {
    const descriptor = this.requireDescriptor(pluginId);
    const response = await this.#client.getPluginDescriptorSet(
      {
        pluginId,
        expectedSha256: descriptor.descriptorSha256,
      },
      options,
    );
    const actualHash = await sha256(response.descriptorSet);
    if (actualHash !== response.descriptorSha256.toLowerCase()) {
      throw new SoulFirePluginDescriptorError(
        pluginId,
        `Descriptor hash mismatch for plugin ${pluginId}`,
      );
    }
    return response.descriptorSet;
  }

  public async reflective(
    pluginId: string,
    options?: CallOptions,
  ): Promise<ReflectivePlugin> {
    const descriptor = this.requireDescriptor(pluginId);
    const cached = this.#reflective.get(pluginId);
    if (cached?.hash === descriptor.descriptorSha256) {
      return cached.plugin;
    }
    const bytes = await this.descriptorSet(pluginId, options);
    const descriptorSet = fromBinary(FileDescriptorSetSchema, bytes);
    const registry = createFileRegistry(descriptorSet);
    const plugin = new ReflectivePlugin(
      descriptor,
      registry,
      this.#transport,
    );
    this.#reflective.set(pluginId, {
      hash: descriptor.descriptorSha256,
      plugin,
    });
    return plugin;
  }

  public async *watch(
    options?: CallOptions,
  ): AsyncIterable<PluginApiEvent> {
    for await (
      const event of this.#client.watchPluginApis(
        { afterRevision: this.#revision },
        options,
      )
    ) {
      if (event.kind === PluginApiEventKind.SNAPSHOT) {
        this.#replace(event.plugins, event.revision);
      } else if (event.plugin !== undefined) {
        this.#plugins.set(event.plugin.pluginId, event.plugin);
        this.#revision = event.revision;
      } else if (event.removedPluginId !== undefined) {
        this.#plugins.delete(event.removedPluginId);
        this.#revision = event.revision;
      }
      yield event;
    }
  }

  /**
   * Watches the normalized event stream published by installed plugins.
   *
   * The initial READY envelope reports whether the requested sequence could
   * be resumed. Plugin events are live and are not retained by the server.
   */
  public events(
    options: WatchPluginEventOptions = {},
  ): AsyncIterable<PluginEvent> {
    const {
      pluginIds = [],
      typeUrls = [],
      call,
      ...request
    } = options;
    return this.#client.watchPluginEvents(
      {
        ...request,
        pluginIds: unique(pluginIds),
        typeUrls: unique(typeUrls),
      },
      call,
    );
  }

  /**
   * Watches one advertised event type and decodes each DATA payload.
   */
  public typedEvents<T extends DescMessage>(
    pluginId: string,
    schema: T,
    options: Omit<WatchPluginEventOptions, "pluginIds" | "typeUrls"> = {},
  ): AsyncIterable<TypedPluginEvent<T>> {
    const typeUrl = typeUrlFor(schema);
    const descriptor = this.requireDescriptor(pluginId);
    const eventTypeUrls = new Set([
      ...descriptor.eventTypeUrls,
      ...descriptor.eventTypes.map((event) => event.typeUrl),
    ]);
    if (!eventTypeUrls.has(typeUrl)) {
      throw new SoulFirePluginCompatibilityError(
        pluginId,
        `Plugin ${pluginId} does not publish ${typeUrl}`,
      );
    }
    return mapTypedEvents(
      this.events({
        ...options,
        pluginIds: [pluginId],
        typeUrls: [typeUrl],
      }),
      schema,
      pluginId,
    );
  }

  #replace(
    plugins: readonly PluginApiDescriptor[],
    revision: bigint,
  ): void {
    this.#plugins = indexPlugins(plugins);
    this.#revision = revision;
    this.#reflective.clear();
  }
}

function indexPlugins(
  plugins: readonly PluginApiDescriptor[],
): Map<string, PluginApiDescriptor> {
  return new Map(plugins.map((plugin) => [plugin.pluginId, plugin]));
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(value).buffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function reflectiveMessage(
  descriptor: DescMessage,
  value: Message,
  registry: Registry,
): ReflectiveMessage {
  return {
    typeName: descriptor.typeName,
    value,
    json: toJson(descriptor, value, { registry }),
  };
}

async function* mapReflectiveStream(
  values: AsyncIterable<Message>,
  descriptor: DescMessage,
  registry: Registry,
): AsyncIterable<ReflectiveMessage> {
  for await (const value of values) {
    yield reflectiveMessage(descriptor, value, registry);
  }
}

async function* mapTypedEvents<T extends DescMessage>(
  events: AsyncIterable<PluginEvent>,
  schema: T,
  pluginId: string,
): AsyncIterable<TypedPluginEvent<T>> {
  const expectedTypeUrl = typeUrlFor(schema);
  for await (const event of events) {
    if (event.payload === undefined) {
      yield { event };
      continue;
    }
    if (event.typeUrl !== expectedTypeUrl || event.payload.typeUrl !== expectedTypeUrl) {
      throw new SoulFirePluginDescriptorError(
        pluginId,
        `Expected ${expectedTypeUrl}, received ${event.typeUrl ?? event.payload.typeUrl}`,
      );
    }
    yield {
      event,
      value: fromBinary(schema, event.payload.value),
    };
  }
}

async function* mapReflectiveEvents(
  events: AsyncIterable<PluginEvent>,
  registry: Registry,
  pluginId: string,
): AsyncIterable<ReflectivePluginEvent> {
  for await (const event of events) {
    if (event.payload === undefined) {
      yield { event };
      continue;
    }
    const typeUrl = event.typeUrl ?? event.payload.typeUrl;
    const typeName = typeNameFromUrl(typeUrl);
    const schema = registry.getMessage(typeName);
    if (schema === undefined) {
      throw new SoulFirePluginDescriptorError(
        pluginId,
        `Plugin descriptor does not contain event type ${typeName}`,
      );
    }
    const value = fromBinary(schema, event.payload.value);
    yield {
      event,
      message: reflectiveMessage(schema, value, registry),
    };
  }
}

function typeUrlFor(schema: DescMessage): string {
  return `type.googleapis.com/${schema.typeName}`;
}

function typeNameFromUrl(typeUrl: string): string {
  const separator = typeUrl.lastIndexOf("/");
  const typeName = separator === -1 ? typeUrl : typeUrl.slice(separator + 1);
  if (typeName.length === 0) {
    throw new Error(`Invalid protobuf type URL: ${typeUrl}`);
  }
  return typeName;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
