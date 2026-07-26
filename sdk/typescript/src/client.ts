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
      createClient(BotLiveService, this.#transport),
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
  readonly #botLiveClient: Client<typeof BotLiveService>;

  public constructor(
    public readonly id: string,
    botLiveClient: Client<typeof BotLiveService>,
  ) {
    this.#botLiveClient = botLiveClient;
  }

  public bot(botId: string): SoulFireBot {
    return new SoulFireBot(this.id, botId, this.#botLiveClient);
  }
}

export class SoulFireBot {
  public constructor(
    public readonly instanceId: string,
    public readonly id: string,
    private readonly liveClient: Client<typeof BotLiveService>,
  ) {}

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
