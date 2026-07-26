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
  BotService,
  type BotListEntry,
  type BotStatus,
  type WatchBotStatusesResponse,
} from "./generated/soulfire/bot_pb.js";
import {
  BotEventFilterSchema,
  BotLiveService,
  type AttackEntityRequestSchema,
  type BotEvent,
  type DigBlockRequestSchema,
  type FindBlocksRequestSchema,
  type GetBlockRequestSchema,
  type GoToRequestSchema,
  type InteractEntityRequestSchema,
  type ListNearbyEntitiesRequestSchema,
  type PlaceBlockRequestSchema,
  type SwingArmRequestSchema,
  type UseItemRequestSchema,
} from "./generated/soulfire/bot_live_pb.js";
import { InstanceService } from "./generated/soulfire/instance_pb.js";
import {
  LoginService,
  type NextAuthFlowResponse,
} from "./generated/soulfire/login_pb.js";
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

type ScopedRequest<T extends DescMessage> = Omit<
  MessageInitShape<T>,
  "$typeName" | "botId" | "instanceId"
>;

const DEFAULT_EVENT_FILTER: MessageInitShape<typeof BotEventFilterSchema> = {
  includeChat: true,
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
  readonly #loginClient: Client<typeof LoginService>;
  #closeLocalServer: (() => Promise<void>) | undefined;
  #token: string | TokenProvider | undefined;
  public readonly localServer: LocalSoulFireServer | undefined;

  private constructor(
    options: SoulFireOptions,
    localServer?: {
      info: LocalSoulFireServer;
      close(): Promise<void>;
    },
  ) {
    this.#token = options.token;
    this.localServer = localServer?.info;
    this.#closeLocalServer = localServer?.close;

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
    this.#loginClient = createClient(LoginService, this.#transport);
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

  public service<T extends DescService>(service: T): Client<T> {
    return createClient(service, this.#transport);
  }

  public instance(instanceId: string): SoulFireInstance {
    return new SoulFireInstance(
      instanceId,
      createClient(BotService, this.#transport),
      createClient(BotLiveService, this.#transport),
      createClient(InstanceService, this.#transport),
    );
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
    const closeLocalServer = this.#closeLocalServer;
    this.#closeLocalServer = undefined;
    await closeLocalServer?.();
  }
}

export class SoulFireInstance {
  readonly #botClient: Client<typeof BotService>;
  readonly #botLiveClient: Client<typeof BotLiveService>;
  readonly #instanceClient: Client<typeof InstanceService>;

  public constructor(
    public readonly id: string,
    botClient: Client<typeof BotService>,
    botLiveClient: Client<typeof BotLiveService>,
    instanceClient: Client<typeof InstanceService>,
  ) {
    this.#botClient = botClient;
    this.#botLiveClient = botLiveClient;
    this.#instanceClient = instanceClient;
  }

  public bot(botId: string): SoulFireBot {
    return new SoulFireBot(
      this.id,
      botId,
      this.#botClient,
      this.#botLiveClient,
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
}

export class SoulFireBot {
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
    const response = await this.botClient.getBotInfo(
      { instanceId: this.instanceId, botId: this.id },
      options,
    );
    if (response.status === undefined) {
      throw new Error(`SoulFire did not return status for bot ${this.id}`);
    }
    return response.status;
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

  public sendChat(message: string, options?: CallOptions): Promise<void> {
    return this.liveClient
      .sendChat(
        {
          instanceId: this.instanceId,
          botId: this.id,
          message,
        },
        options,
      )
      .then(() => undefined);
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
      options,
    );
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
      options,
    );
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
      options,
    );
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
      options,
    );
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
      options,
    );
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
      options,
    );
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
      options,
    );
  }

  public stopPathfinding(options?: CallOptions): Promise<void> {
    return this.liveClient
      .stopPathfinding(
        {
          instanceId: this.instanceId,
          botId: this.id,
        },
        options,
      )
      .then(() => undefined);
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
