import type {
  DescMessage,
  DescService,
  MessageInitShape,
} from "@bufbuild/protobuf";
import {
  createClient,
  type CallOptions,
  type Client,
  type Interceptor,
  type Transport,
} from "@connectrpc/connect";
import {
  createGrpcWebTransport,
  type GrpcWebTransportOptions,
} from "@connectrpc/connect-web";

import {
  BotDesiredState,
  BotRuntimeState,
  BotService,
  ClickType,
  type BotGetDialogResponse,
  type BotInfoResponse,
  type BotInventoryStateResponse,
  type BotListEntry,
  type BotLiveState,
  type BotRenderPovResponse,
  type BotSetMovementStateRequestSchema,
  type BotStatus,
  type WatchBotStatusesResponse,
} from "./generated/soulfire/bot_pb.js";
import {
  BotActionStatus,
  BotEventFilterSchema,
  BotLiveService,
  type AttackEntityRequestSchema,
  type BotActionResult,
  type BotControlLease,
  type BotEvent,
  type DigBlockRequestSchema,
  type FindBlocksRequestSchema,
  type GetBlockRequestSchema,
  type GoToRequestSchema,
  type InteractEntityRequestSchema,
  type ListNearbyEntitiesRequestSchema,
  type PlaceBlockRequestSchema,
  type ReleaseItemRequestSchema,
  type RespawnRequestSchema,
  type SwingArmRequestSchema,
  type UseItemRequestSchema,
} from "./generated/soulfire/bot_live_pb.js";
import type {
  MinecraftAccountProto,
  ProxyProto,
} from "./generated/soulfire/common_pb.js";
import {
  InstanceService,
  type InstanceInfo,
  type InstanceListResponse_Instance,
  type InstanceUpdateConfigEntryRequestSchema,
  type InstanceUpdateMetaRequestSchema,
} from "./generated/soulfire/instance_pb.js";
import {
  LoginService,
  type NextAuthFlowResponse,
} from "./generated/soulfire/login_pb.js";
import {
  MCAuthService,
  type CredentialsAuthRequestSchema,
  type DeviceCodeAuthRequestSchema,
  type RefreshRequestSchema,
} from "./generated/soulfire/mc-auth_pb.js";
import type {
  LocalSoulFireServer,
  SoulFireInstallOptions,
} from "./install-types.js";

export type TokenProvider = () =>
  | Promise<string | undefined>
  | string
  | undefined;

export interface SoulFireOptions {
  baseUrl: string;
  token?: string | TokenProvider;
  defaultTimeoutMs?: number;
  fetch?: GrpcWebTransportOptions["fetch"];
  interceptors?: Interceptor[];
}

export interface BotSelection {
  botIds?: readonly string[];
  count?: number;
}

interface LocalServerController {
  readonly info: LocalSoulFireServer;
  close(): Promise<void>;
  isRunning(): boolean;
  logs(): readonly string[];
  restart(): Promise<void>;
  stop(): Promise<void>;
}

type ScopedRequest<T extends DescMessage> = Omit<
  MessageInitShape<T>,
  "$typeName" | "botId" | "instanceId"
>;

type InstanceScopedRequest<T extends DescMessage> = Omit<
  MessageInitShape<T>,
  "$typeName" | "id" | "instanceId"
>;

export type BotMovement = ScopedRequest<typeof BotSetMovementStateRequestSchema>;

export class SoulFireActionError extends Error {
  public constructor(public readonly result: BotActionResult) {
    super(result.error ?? `Bot action ${result.actionId} did not complete`);
    this.name = "SoulFireActionError";
  }
}

const DEFAULT_EVENT_FILTER: MessageInitShape<typeof BotEventFilterSchema> = {
  includeChat: true,
  includeDamage: true,
  includeInventory: true,
  includeLifecycle: true,
  includeStateDeltas: true,
};

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized.length === 0) {
    throw new TypeError("SoulFire baseUrl must not be empty");
  }
  return normalized;
}

export class SoulFire {
  readonly #transport: Transport;
  readonly #instanceClient: Client<typeof InstanceService>;
  readonly #loginClient: Client<typeof LoginService>;
  readonly #mcAuthClient: Client<typeof MCAuthService>;
  #localServer: LocalServerController | undefined;
  #token: string | TokenProvider | undefined;

  private constructor(
    options: SoulFireOptions,
    localServer?: LocalServerController,
  ) {
    this.#token = options.token;
    this.#localServer = localServer;

    const authInterceptor: Interceptor = (next) => async (request) => {
      const token =
        typeof this.#token === "function"
          ? await this.#token()
          : this.#token;
      if (token) {
        request.header.set("Authorization", `Bearer ${token}`);
      }
      return next(request);
    };

    const transportOptions: GrpcWebTransportOptions = {
      baseUrl: normalizeBaseUrl(options.baseUrl),
      interceptors: [authInterceptor, ...(options.interceptors ?? [])],
      useBinaryFormat: true,
    };
    if (options.defaultTimeoutMs !== undefined) {
      transportOptions.defaultTimeoutMs = options.defaultTimeoutMs;
    }
    if (options.fetch !== undefined) {
      transportOptions.fetch = options.fetch;
    }

    this.#transport = createGrpcWebTransport(transportOptions);
    this.#instanceClient = createClient(InstanceService, this.#transport);
    this.#loginClient = createClient(LoginService, this.#transport);
    this.#mcAuthClient = createClient(MCAuthService, this.#transport);
  }

  public static connect(options: SoulFireOptions): SoulFire {
    return new SoulFire(options);
  }

  public static async install(
    options: SoulFireInstallOptions = {},
  ): Promise<SoulFire> {
    const { installLocalServer } = await import("./local-server.js");
    const localServer = await installLocalServer(options);
    const connectionOptions: SoulFireOptions = {
      baseUrl: localServer.info.baseUrl,
      token: localServer.token,
    };
    if (options.defaultTimeoutMs !== undefined) {
      connectionOptions.defaultTimeoutMs = options.defaultTimeoutMs;
    }
    if (options.fetch !== undefined) {
      connectionOptions.fetch = options.fetch;
    }
    if (options.interceptors !== undefined) {
      connectionOptions.interceptors = options.interceptors;
    }
    try {
      return new SoulFire(connectionOptions, localServer);
    } catch (error) {
      await localServer.close();
      throw error;
    }
  }

  public setToken(token: string | TokenProvider | undefined): void {
    this.#token = token;
  }

  public get localServer(): LocalSoulFireServer | undefined {
    return this.#localServer?.info;
  }

  public get localServerLogs(): readonly string[] {
    return this.#localServer?.logs() ?? [];
  }

  public get isLocalServerRunning(): boolean {
    return this.#localServer?.isRunning() ?? false;
  }

  public async restartLocalServer(): Promise<void> {
    await this.#requireLocalServer().restart();
  }

  public async stopLocalServer(): Promise<void> {
    await this.#requireLocalServer().stop();
  }

  public service<T extends DescService>(service: T): Client<T> {
    return createClient(service, this.#transport);
  }

  public instance(instanceId: string): SoulFireInstance {
    return new SoulFireInstance(
      instanceId,
      createClient(BotService, this.#transport),
      createClient(BotLiveService, this.#transport),
      this.#instanceClient,
      this.#mcAuthClient,
    );
  }

  public async instances(
    options?: CallOptions,
  ): Promise<InstanceListResponse_Instance[]> {
    const response = await this.#instanceClient.listInstances({}, options);
    return response.instances;
  }

  public async createInstance(
    friendlyName: string,
    options?: CallOptions,
  ): Promise<SoulFireInstance> {
    const response = await this.#instanceClient.createInstance(
      { friendlyName },
      options,
    );
    return this.instance(response.id);
  }

  public beginLogin(
    email: string,
    options?: CallOptions,
  ): Promise<NextAuthFlowResponse> {
    return this.#loginClient.login({ email }, options);
  }

  public async completeLogin(
    authFlowToken: string,
    code: string,
    options?: CallOptions,
  ): Promise<NextAuthFlowResponse> {
    const response = await this.#loginClient.emailCode(
      { authFlowToken, code },
      options,
    );
    if (response.next.case === "success") {
      this.setToken(response.next.value.token);
    }
    return response;
  }

  public async close(): Promise<void> {
    const localServer = this.#localServer;
    this.#localServer = undefined;
    await localServer?.close();
  }

  #requireLocalServer(): LocalServerController {
    if (this.#localServer === undefined) {
      throw new Error("This client does not manage a local SoulFire server");
    }
    return this.#localServer;
  }
}

export class SoulFireInstance {
  readonly #botClient: Client<typeof BotService>;
  readonly #botLiveClient: Client<typeof BotLiveService>;
  readonly #instanceClient: Client<typeof InstanceService>;
  readonly #mcAuthClient: Client<typeof MCAuthService> | undefined;

  public constructor(
    public readonly id: string,
    botClient: Client<typeof BotService>,
    botLiveClient: Client<typeof BotLiveService>,
    instanceClient: Client<typeof InstanceService>,
    mcAuthClient?: Client<typeof MCAuthService>,
  ) {
    this.#botClient = botClient;
    this.#botLiveClient = botLiveClient;
    this.#instanceClient = instanceClient;
    this.#mcAuthClient = mcAuthClient;
  }

  public bot(botId: string): SoulFireBot {
    return new SoulFireBot(
      this.id,
      botId,
      this.#botClient,
      this.#botLiveClient,
    );
  }

  public async info(options?: CallOptions): Promise<InstanceInfo> {
    const response = await this.#instanceClient.getInstanceInfo(
      { id: this.id },
      options,
    );
    if (response.result.case !== "info") {
      throw new Error(`SoulFire did not return instance ${this.id}`);
    }
    return response.result.value;
  }

  public delete(options?: CallOptions): Promise<void> {
    return this.#instanceClient
      .deleteInstance({ id: this.id }, options)
      .then(() => undefined);
  }

  public updateMetadata(
    request: InstanceScopedRequest<typeof InstanceUpdateMetaRequestSchema>,
    options?: CallOptions,
  ): Promise<void> {
    return this.#instanceClient
      .updateInstanceMeta({ ...request, id: this.id }, options)
      .then(() => undefined);
  }

  public setConfigEntry(
    request: InstanceScopedRequest<
      typeof InstanceUpdateConfigEntryRequestSchema
    >,
    options?: CallOptions,
  ): Promise<void> {
    return this.#instanceClient
      .updateInstanceConfigEntry({ ...request, id: this.id }, options)
      .then(() => undefined);
  }

  public addAccounts(
    accounts: readonly MinecraftAccountProto[],
    options?: CallOptions,
  ): Promise<void> {
    return this.#instanceClient
      .addInstanceAccountsBatch(
        { id: this.id, accounts: [...accounts] },
        options,
      )
      .then(() => undefined);
  }

  public removeAccounts(
    profileIds: readonly string[],
    options?: CallOptions,
  ): Promise<void> {
    return this.#instanceClient
      .removeInstanceAccountsBatch(
        { id: this.id, profileIds: [...new Set(profileIds)] },
        options,
      )
      .then(() => undefined);
  }

  public addProxies(
    proxies: readonly ProxyProto[],
    options?: CallOptions,
  ): Promise<void> {
    return this.#instanceClient
      .addInstanceProxiesBatch(
        { id: this.id, proxies: [...proxies] },
        options,
      )
      .then(() => undefined);
  }

  public removeProxies(
    addresses: readonly string[],
    options?: CallOptions,
  ): Promise<void> {
    return this.#instanceClient
      .removeInstanceProxiesBatch(
        { id: this.id, addresses: [...new Set(addresses)] },
        options,
      )
      .then(() => undefined);
  }

  public loginCredentials(
    request: InstanceScopedRequest<typeof CredentialsAuthRequestSchema>,
    options?: CallOptions,
  ) {
    return this.#requireMcAuthClient().loginCredentials(
      { ...request, instanceId: this.id },
      options,
    );
  }

  public loginDeviceCode(
    request: InstanceScopedRequest<typeof DeviceCodeAuthRequestSchema>,
    options?: CallOptions,
  ) {
    return this.#requireMcAuthClient().loginDeviceCode(
      { ...request, instanceId: this.id },
      options,
    );
  }

  public refreshAccount(
    request: InstanceScopedRequest<typeof RefreshRequestSchema>,
    options?: CallOptions,
  ) {
    return this.#requireMcAuthClient().refresh(
      { ...request, instanceId: this.id },
      options,
    );
  }

  public async bots(options?: CallOptions): Promise<BotListEntry[]> {
    const response = await this.#botClient.getBotList(
      { instanceId: this.id },
      options,
    );
    return response.bots;
  }

  public watchBotStatuses(
    options?: CallOptions,
  ): AsyncIterable<WatchBotStatusesResponse> {
    return this.#botClient.watchBotStatuses(
      { instanceId: this.id },
      options,
    );
  }

  public async start(
    selection?: BotSelection,
    options?: CallOptions,
  ): Promise<BotStatus[]> {
    const botIds = await this.#selectBotIds(
      selection,
      (bot) => bot.status?.desiredState !== BotDesiredState.RUNNING,
      options,
    );
    if (botIds.length === 0) {
      return [];
    }
    const response = await this.#botClient.setBotsDesiredState(
      {
        instanceId: this.id,
        botIds,
        desiredState: BotDesiredState.RUNNING,
      },
      options,
    );
    return response.bots;
  }

  public async stop(
    selection?: BotSelection,
    options?: CallOptions,
  ): Promise<BotStatus[]> {
    const botIds = await this.#selectBotIds(
      selection,
      (bot) => bot.status?.desiredState === BotDesiredState.RUNNING,
      options,
    );
    if (botIds.length === 0) {
      return [];
    }
    const response = await this.#botClient.setBotsDesiredState(
      {
        instanceId: this.id,
        botIds,
        desiredState: BotDesiredState.STOPPED,
      },
      options,
    );
    return response.bots;
  }

  public async restart(
    selection?: BotSelection,
    options?: CallOptions,
  ): Promise<BotStatus[]> {
    const botIds = await this.#selectBotIds(
      selection,
      (bot) => bot.status?.desiredState === BotDesiredState.RUNNING,
      options,
    );
    if (botIds.length === 0) {
      return [];
    }
    const response = await this.#botClient.restartBots(
      { instanceId: this.id, botIds },
      options,
    );
    return response.bots;
  }

  async #selectBotIds(
    selection: BotSelection | undefined,
    countFilter: (bot: BotListEntry) => boolean,
    options: CallOptions | undefined,
  ): Promise<string[]> {
    if (selection?.botIds !== undefined && selection.count !== undefined) {
      throw new TypeError("Use either botIds or count, not both");
    }
    if (selection?.botIds !== undefined) {
      return [...new Set(selection.botIds)];
    }

    const bots = await this.bots(options);
    const candidates = bots.filter(countFilter);
    if (selection?.count === undefined) {
      return candidates.map((bot) => bot.profileId);
    }

    const count = normalizeCount(selection.count);
    if (count === 0) {
      return [];
    }
    if (await this.#shuffleAccountsEnabled(options)) {
      shuffle(candidates);
    }
    return candidates.slice(0, count).map((bot) => bot.profileId);
  }

  async #shuffleAccountsEnabled(options?: CallOptions): Promise<boolean> {
    const response = await this.#instanceClient.getInstanceInfo(
      { id: this.id },
      options,
    );
    if (response.result.case !== "info") {
      return false;
    }
    const accountSettings = response.result.value.config?.settings.find(
      (namespace) => namespace.namespace === "account",
    );
    const shuffleSetting = accountSettings?.entries.find(
      (entry) => entry.key === "shuffle-accounts",
    );
    return shuffleSetting?.value?.kind.case === "boolValue"
      && shuffleSetting.value.kind.value;
  }

  #requireMcAuthClient(): Client<typeof MCAuthService> {
    if (this.#mcAuthClient === undefined) {
      throw new Error("Minecraft authentication is unavailable");
    }
    return this.#mcAuthClient;
  }
}

export class SoulFireBot {
  #controlToken: string | undefined;

  public constructor(
    public readonly instanceId: string,
    public readonly id: string,
    private readonly botClient: Client<typeof BotService>,
    private readonly liveClient: Client<typeof BotLiveService>,
  ) {}

  public async start(options?: CallOptions): Promise<BotStatus> {
    const response = await this.botClient.setBotsDesiredState(
      {
        instanceId: this.instanceId,
        botIds: [this.id],
        desiredState: BotDesiredState.RUNNING,
      },
      options,
    );
    return requiredBotStatus(response.bots, this.id);
  }

  public async stop(options?: CallOptions): Promise<BotStatus> {
    const response = await this.botClient.setBotsDesiredState(
      {
        instanceId: this.instanceId,
        botIds: [this.id],
        desiredState: BotDesiredState.STOPPED,
      },
      options,
    );
    return requiredBotStatus(response.bots, this.id);
  }

  public async restart(options?: CallOptions): Promise<BotStatus> {
    const response = await this.botClient.restartBots(
      { instanceId: this.instanceId, botIds: [this.id] },
      options,
    );
    return requiredBotStatus(response.bots, this.id);
  }

  public async status(options?: CallOptions): Promise<BotStatus> {
    const response = await this.info(options);
    if (response.status === undefined) {
      throw new Error(`SoulFire did not return status for bot ${this.id}`);
    }
    return response.status;
  }

  public info(options?: CallOptions): Promise<BotInfoResponse> {
    return this.botClient.getBotInfo(
      { instanceId: this.instanceId, botId: this.id },
      options,
    );
  }

  public async liveState(options?: CallOptions): Promise<BotLiveState> {
    const response = await this.info(options);
    if (response.liveState === undefined) {
      throw new Error(`Bot ${this.id} is not online`);
    }
    return response.liveState;
  }

  public async waitForOnline(options?: {
    call?: CallOptions;
    signal?: AbortSignal;
  }): Promise<BotStatus> {
    const current = await this.status(options?.call);
    if (current.runtimeState === BotRuntimeState.RUNNING) {
      return current;
    }
    const callOptions = options?.signal === undefined
      ? options?.call
      : { ...options.call, signal: options.signal };
    for await (const event of this.events(undefined, callOptions)) {
      if (
        event.event.case === "status"
        && event.event.value.runtimeState === BotRuntimeState.RUNNING
      ) {
        return event.event.value;
      }
    }
    throw new Error(`Bot ${this.id} event stream ended before it came online`);
  }

  public events(
    filter: MessageInitShape<typeof BotEventFilterSchema> =
      DEFAULT_EVENT_FILTER,
    options?: CallOptions,
  ): AsyncIterable<BotEvent> {
    return this.liveClient.watchBotEvents(
      {
        instanceId: this.instanceId,
        botId: this.id,
        filter,
      },
      options,
    );
  }

  public async sendChat(
    message: string,
    options?: CallOptions,
  ): Promise<BotActionResult> {
    const response = await this.liveClient.sendChat(
      {
        instanceId: this.instanceId,
        botId: this.id,
        message,
      },
      this.#actionOptions(options),
    );
    return requireCompletedAction(response.result);
  }

  public getBlock(
    request: ScopedRequest<typeof GetBlockRequestSchema>,
    options?: CallOptions,
  ) {
    return this.liveClient.getBlock(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      options,
    );
  }

  public findBlocks(
    request: ScopedRequest<typeof FindBlocksRequestSchema>,
    options?: CallOptions,
  ) {
    return this.liveClient.findBlocks(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      options,
    );
  }

  public listNearbyEntities(
    request: ScopedRequest<typeof ListNearbyEntitiesRequestSchema>,
    options?: CallOptions,
  ) {
    return this.liveClient.listNearbyEntities(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      options,
    );
  }

  public digBlock(
    request: ScopedRequest<typeof DigBlockRequestSchema>,
    options?: CallOptions,
  ) {
    return this.liveClient.digBlock(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      this.#actionOptions(options),
    ).then((response) => requireCompletedAction(response.result));
  }

  public placeBlock(
    request: ScopedRequest<typeof PlaceBlockRequestSchema>,
    options?: CallOptions,
  ) {
    return this.liveClient.placeBlock(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      this.#actionOptions(options),
    ).then((response) => requireCompletedAction(response.result));
  }

  public useItem(
    request: ScopedRequest<typeof UseItemRequestSchema>,
    options?: CallOptions,
  ) {
    return this.liveClient.useItem(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      this.#actionOptions(options),
    ).then((response) => requireCompletedAction(response.result));
  }

  public releaseItem(
    request: ScopedRequest<typeof ReleaseItemRequestSchema> = {},
    options?: CallOptions,
  ) {
    return this.liveClient.releaseItem(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      this.#actionOptions(options),
    ).then((response) => requireCompletedAction(response.result));
  }

  public attackEntity(
    request: ScopedRequest<typeof AttackEntityRequestSchema>,
    options?: CallOptions,
  ) {
    return this.liveClient.attackEntity(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      this.#actionOptions(options),
    ).then((response) => requireCompletedAction(response.result));
  }

  public interactEntity(
    request: ScopedRequest<typeof InteractEntityRequestSchema>,
    options?: CallOptions,
  ) {
    return this.liveClient.interactEntity(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      this.#actionOptions(options),
    ).then((response) => requireCompletedAction(response.result));
  }

  public swingArm(
    request: ScopedRequest<typeof SwingArmRequestSchema>,
    options?: CallOptions,
  ) {
    return this.liveClient.swingArm(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      this.#actionOptions(options),
    ).then((response) => requireCompletedAction(response.result));
  }

  public respawn(
    request: ScopedRequest<typeof RespawnRequestSchema> = {},
    options?: CallOptions,
  ) {
    return this.liveClient.respawn(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      this.#actionOptions(options),
    ).then((response) => requireCompletedAction(response.result));
  }

  public goTo(
    request: ScopedRequest<typeof GoToRequestSchema>,
    options?: CallOptions,
  ) {
    return this.liveClient.goTo(
      {
        ...request,
        instanceId: this.instanceId,
        botId: this.id,
      },
      this.#actionOptions(options),
    );
  }

  public stopPathfinding(options?: CallOptions): Promise<void> {
    return this.liveClient
      .stopPathfinding(
        {
          instanceId: this.instanceId,
          botId: this.id,
        },
        this.#actionOptions(options),
      )
      .then(() => undefined);
  }

  public inventory(options?: CallOptions): Promise<BotInventoryStateResponse> {
    return this.botClient.getInventoryState(
      { instanceId: this.instanceId, botId: this.id },
      options,
    );
  }

  public async clickInventory(
    slot: number,
    clickType: ClickType = ClickType.LEFT_CLICK,
    hotbarSlot = 0,
    options?: CallOptions,
  ): Promise<void> {
    const response = await this.botClient.clickInventorySlot(
      {
        instanceId: this.instanceId,
        botId: this.id,
        slot,
        clickType,
        hotbarSlot,
      },
      this.#actionOptions(options),
    );
    requireSuccess(response, "Inventory click failed");
  }

  public transferInventorySlot(
    slot: number,
    options?: CallOptions,
  ): Promise<void> {
    return this.clickInventory(
      slot,
      ClickType.SHIFT_LEFT_CLICK,
      0,
      options,
    );
  }

  public dropInventorySlot(
    slot: number,
    all = true,
    options?: CallOptions,
  ): Promise<void> {
    return this.clickInventory(
      slot,
      all ? ClickType.DROP_ALL : ClickType.DROP_ONE,
      0,
      options,
    );
  }

  public async moveInventoryStack(
    fromSlot: number,
    toSlot: number,
    options?: CallOptions,
  ): Promise<void> {
    await this.clickInventory(fromSlot, ClickType.LEFT_CLICK, 0, options);
    await this.clickInventory(toSlot, ClickType.LEFT_CLICK, 0, options);
    const state = await this.inventory(options);
    if (state.carriedItem !== undefined && state.carriedItem.count > 0) {
      await this.clickInventory(fromSlot, ClickType.LEFT_CLICK, 0, options);
    }
  }

  public async selectHotbar(
    slot: number,
    options?: CallOptions,
  ): Promise<void> {
    const response = await this.botClient.setHotbarSlot(
      { instanceId: this.instanceId, botId: this.id, slot },
      this.#actionOptions(options),
    );
    requireSuccess(response, "Selecting a hotbar slot failed");
  }

  public async setMovement(
    movement: BotMovement,
    options?: CallOptions,
  ): Promise<void> {
    const response = await this.botClient.setMovementState(
      {
        ...movement,
        instanceId: this.instanceId,
        botId: this.id,
      },
      this.#actionOptions(options),
    );
    requireSuccess(response, "Updating movement failed");
  }

  public async resetMovement(options?: CallOptions): Promise<void> {
    const response = await this.botClient.resetMovement(
      { instanceId: this.instanceId, botId: this.id },
      this.#actionOptions(options),
    );
    requireSuccess(response, "Resetting movement failed");
  }

  public async look(
    yaw: number,
    pitch: number,
    options?: CallOptions,
  ): Promise<void> {
    const response = await this.botClient.setRotation(
      { instanceId: this.instanceId, botId: this.id, yaw, pitch },
      this.#actionOptions(options),
    );
    requireSuccess(response, "Updating rotation failed");
  }

  public async openInventory(options?: CallOptions): Promise<void> {
    const response = await this.botClient.openInventory(
      { instanceId: this.instanceId, botId: this.id },
      this.#actionOptions(options),
    );
    requireSuccess(response, "Opening inventory failed");
  }

  public async closeContainer(options?: CallOptions): Promise<void> {
    const response = await this.botClient.closeContainer(
      { instanceId: this.instanceId, botId: this.id },
      this.#actionOptions(options),
    );
    requireSuccess(response, "Closing container failed");
  }

  public dialog(options?: CallOptions): Promise<BotGetDialogResponse> {
    return this.botClient.getDialog(
      { instanceId: this.instanceId, botId: this.id },
      options,
    );
  }

  public renderPov(
    request: {
      width?: number;
      height?: number;
      maxDistance?: number;
      fov?: number;
    } = {},
    options?: CallOptions,
  ): Promise<BotRenderPovResponse> {
    return this.botClient.renderBotPov(
      {
        instanceId: this.instanceId,
        botId: this.id,
        width: request.width ?? 0,
        height: request.height ?? 0,
        ...(request.maxDistance === undefined
          ? {}
          : { maxDistance: request.maxDistance }),
        ...(request.fov === undefined ? {} : { fov: request.fov }),
      },
      options,
    );
  }

  public async acquireControl(
    ttlSeconds = 30,
    options?: CallOptions,
  ): Promise<SoulFireBotControlLease> {
    if (this.#controlToken !== undefined) {
      throw new Error(`Bot ${this.id} control is already leased by this client`);
    }
    const response = await this.liveClient.acquireBotControl(
      {
        instanceId: this.instanceId,
        botId: this.id,
        ttlSeconds,
      },
      options,
    );
    if (response.lease === undefined) {
      throw new Error("SoulFire did not return the acquired control lease");
    }
    this.#controlToken = response.lease.token;
    return new SoulFireBotControlLease(this, response.lease);
  }

  async renewControl(
    lease: BotControlLease,
    ttlSeconds: number,
    options?: CallOptions,
  ): Promise<BotControlLease> {
    const response = await this.liveClient.renewBotControl(
      {
        instanceId: this.instanceId,
        botId: this.id,
        token: lease.token,
        ttlSeconds,
      },
      options,
    );
    if (response.lease === undefined) {
      throw new Error("SoulFire did not return the renewed control lease");
    }
    this.#controlToken = response.lease.token;
    return response.lease;
  }

  async releaseControl(
    lease: BotControlLease,
    options?: CallOptions,
  ): Promise<void> {
    await this.liveClient.releaseBotControl(
      {
        instanceId: this.instanceId,
        botId: this.id,
        token: lease.token,
      },
      options,
    );
    if (this.#controlToken === lease.token) {
      this.#controlToken = undefined;
    }
  }

  #actionOptions(options?: CallOptions): CallOptions | undefined {
    if (this.#controlToken === undefined) {
      return options;
    }
    const headers = new Headers(options?.headers);
    headers.set("X-SoulFire-Control-Token", this.#controlToken);
    return { ...options, headers };
  }
}

export class SoulFireBotControlLease {
  #lease: BotControlLease | undefined;

  public constructor(
    private readonly bot: SoulFireBot,
    lease: BotControlLease,
  ) {
    this.#lease = lease;
  }

  public get value(): BotControlLease {
    if (this.#lease === undefined) {
      throw new Error("The bot control lease has been released");
    }
    return this.#lease;
  }

  public async renew(
    ttlSeconds = 30,
    options?: CallOptions,
  ): Promise<BotControlLease> {
    const lease = await this.bot.renewControl(
      this.value,
      ttlSeconds,
      options,
    );
    this.#lease = lease;
    return lease;
  }

  public async release(options?: CallOptions): Promise<void> {
    const lease = this.#lease;
    if (lease === undefined) {
      return;
    }
    await this.bot.releaseControl(lease, options);
    this.#lease = undefined;
  }
}

function normalizeCount(count: number): number {
  if (!Number.isFinite(count)) {
    throw new TypeError("Bot count must be a finite number");
  }
  return Math.max(0, Math.floor(count));
}

function shuffle<T>(values: T[]): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const selectedIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[selectedIndex]] = [
      values[selectedIndex] as T,
      values[index] as T,
    ];
  }
}

function requiredBotStatus(
  statuses: readonly BotStatus[],
  botId: string,
): BotStatus {
  const status = statuses.find((candidate) => candidate.profileId === botId);
  if (status === undefined) {
    throw new Error(`SoulFire did not return status for bot ${botId}`);
  }
  return status;
}

function requireCompletedAction(
  result: BotActionResult | undefined,
): BotActionResult {
  if (result === undefined) {
    throw new Error("SoulFire did not return a bot action result");
  }
  if (result.status !== BotActionStatus.COMPLETED) {
    throw new SoulFireActionError(result);
  }
  return result;
}

function requireSuccess(
  response: { success: boolean; error?: string | undefined },
  fallback: string,
): void {
  if (!response.success) {
    throw new Error(response.error ?? fallback);
  }
}
