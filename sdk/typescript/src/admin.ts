import type {
  DescMessage,
  MessageInitShape,
} from "@bufbuild/protobuf";
import {
  createClient,
  type CallOptions,
  type Client,
  type Transport,
} from "@connectrpc/connect";

import {
  ClientService,
  type ClientDataResponse,
} from "./generated/soulfire/client_pb.js";
import {
  CommandService,
  type CommandCompletionRequestSchema,
  type CommandCompletionResponse,
  type CommandRequestSchema,
  type CommandResponse,
} from "./generated/soulfire/command_pb.js";
import {
  DownloadService,
  type DownloadRequestSchema,
  type DownloadResponse,
} from "./generated/soulfire/download_pb.js";
import {
  InstanceService,
  type InstanceAuditLogResponse_AuditLogEntry,
} from "./generated/soulfire/instance_pb.js";
import {
  LogsService,
  type LogRequestSchema,
  type LogResponse,
  type LogString,
  type PreviousLogRequestSchema,
} from "./generated/soulfire/logs_pb.js";
import {
  MetricsService,
  type GetInstanceMetricsResponse,
  type GetServerMetricsResponse,
} from "./generated/soulfire/metrics_pb.js";
import {
  PluginStatsService,
  type PluginRuntimeStat,
} from "./generated/soulfire/plugin_stats_pb.js";
import {
  ScriptService,
  type ActivateScriptRequestSchema,
  type CreateScriptRequestSchema,
  type CreateScriptResponse,
  type DryRunScriptRequestSchema,
  type GetNodeTypesRequestSchema,
  type GetNodeTypesResponse,
  type GetRegistryDataRequestSchema,
  type GetRegistryDataResponse,
  type GetScriptResponse,
  type GetScriptStatusResponse,
  type ScriptEvent,
  type ScriptInfo,
  type ScriptLogEntry,
  type SubscribeScriptLogsRequestSchema,
  type UpdateScriptRequestSchema,
  type UpdateScriptResponse,
  type ValidateScriptRequestSchema,
  type ValidateScriptResponse,
} from "./generated/soulfire/script_pb.js";
import {
  ServerService,
  type ServerConfig,
  type ServerInfoResponse,
  type ServerUpdateConfigEntryRequestSchema,
} from "./generated/soulfire/server_pb.js";
import {
  UserService,
  type DeleteUserPluginPermissionGrantRequestSchema,
  type SetUserPluginPermissionGrantRequestSchema,
  type UpdateUserRequestSchema,
  type UserCreateRequestSchema,
  type UserInfoResponse,
  type UserListResponse_User,
  type UserPluginPermissionGrant,
} from "./generated/soulfire/user_pb.js";
import type { Timestamp } from "@bufbuild/protobuf/wkt";

type Input<T extends DescMessage> = Omit<MessageInitShape<T>, "$typeName">;
type InstanceInput<T extends DescMessage> = Omit<
  Input<T>,
  "instanceId"
>;
type UserInput<T extends DescMessage> = Omit<Input<T>, "userId">;

/**
 * High-level access to SoulFire's administrative control plane.
 *
 * Generated service clients remain available through `soulfire.service()` for
 * new or uncommon fields.
 */
export class SoulFireAdmin {
  readonly #client: Client<typeof ClientService>;
  readonly #server: Client<typeof ServerService>;
  readonly #users: Client<typeof UserService>;
  readonly #logs: Client<typeof LogsService>;
  readonly #metrics: Client<typeof MetricsService>;
  readonly #commands: Client<typeof CommandService>;
  readonly #downloads: Client<typeof DownloadService>;
  readonly #pluginStats: Client<typeof PluginStatsService>;
  readonly #scripts: Client<typeof ScriptService>;
  readonly #instances: Client<typeof InstanceService>;

  public constructor(transport: Transport) {
    this.#client = createClient(ClientService, transport);
    this.#server = createClient(ServerService, transport);
    this.#users = createClient(UserService, transport);
    this.#logs = createClient(LogsService, transport);
    this.#metrics = createClient(MetricsService, transport);
    this.#commands = createClient(CommandService, transport);
    this.#downloads = createClient(DownloadService, transport);
    this.#pluginStats = createClient(PluginStatsService, transport);
    this.#scripts = createClient(ScriptService, transport);
    this.#instances = createClient(InstanceService, transport);
  }

  public clientData(options?: CallOptions): Promise<ClientDataResponse> {
    return this.#client.getClientData({}, options);
  }

  public async generateWebDavToken(options?: CallOptions): Promise<string> {
    return (await this.#client.generateWebDAVToken({}, options)).token;
  }

  public async generateApiToken(options?: CallOptions): Promise<string> {
    return (await this.#client.generateAPIToken({}, options)).token;
  }

  public updateUsername(
    username: string,
    options?: CallOptions,
  ): Promise<void> {
    return this.#client.updateSelfUsername({ username }, options)
      .then(() => undefined);
  }

  public updateEmail(email: string, options?: CallOptions): Promise<void> {
    return this.#client.updateSelfEmail({ email }, options)
      .then(() => undefined);
  }

  public invalidateOwnSessions(options?: CallOptions): Promise<void> {
    return this.#client.invalidateSelfSessions({}, options)
      .then(() => undefined);
  }

  public serverInfo(options?: CallOptions): Promise<ServerInfoResponse> {
    return this.#server.getServerInfo({}, options);
  }

  public updateServerConfig(
    config: ServerConfig,
    options?: CallOptions,
  ): Promise<void> {
    return this.#server.updateServerConfig({ config }, options)
      .then(() => undefined);
  }

  public setServerConfigEntry(
    request: Input<typeof ServerUpdateConfigEntryRequestSchema>,
    options?: CallOptions,
  ): Promise<void> {
    return this.#server.updateServerConfigEntry(request, options)
      .then(() => undefined);
  }

  public async users(options?: CallOptions): Promise<UserListResponse_User[]> {
    return (await this.#users.listUsers({}, options)).users;
  }

  public user(userId: string, options?: CallOptions): Promise<UserInfoResponse> {
    return this.#users.getUserInfo({ id: userId }, options);
  }

  public async createUser(
    request: Input<typeof UserCreateRequestSchema>,
    options?: CallOptions,
  ): Promise<string> {
    return (await this.#users.createUser(request, options)).id;
  }

  public deleteUser(userId: string, options?: CallOptions): Promise<void> {
    return this.#users.deleteUser({ id: userId }, options)
      .then(() => undefined);
  }

  public updateUser(
    request: Input<typeof UpdateUserRequestSchema>,
    options?: CallOptions,
  ): Promise<void> {
    return this.#users.updateUser(request, options).then(() => undefined);
  }

  public invalidateUserSessions(
    userId: string,
    options?: CallOptions,
  ): Promise<void> {
    return this.#users.invalidateSessions({ id: userId }, options)
      .then(() => undefined);
  }

  public async generateUserApiToken(
    userId: string,
    options?: CallOptions,
  ): Promise<string> {
    return (await this.#users.generateUserAPIToken(
      { id: userId },
      options,
    )).token;
  }

  public async userPluginPermissionGrants(
    userId: string,
    options?: CallOptions,
  ): Promise<UserPluginPermissionGrant[]> {
    return (await this.#users.listUserPluginPermissionGrants(
      { userId },
      options,
    )).grants;
  }

  public setUserPluginPermissionGrant(
    userId: string,
    request: UserInput<typeof SetUserPluginPermissionGrantRequestSchema>,
    options?: CallOptions,
  ): Promise<UserPluginPermissionGrant> {
    return this.#users.setUserPluginPermissionGrant(
      { ...request, userId },
      options,
    );
  }

  public deleteUserPluginPermissionGrant(
    userId: string,
    request: UserInput<typeof DeleteUserPluginPermissionGrantRequestSchema>,
    options?: CallOptions,
  ): Promise<void> {
    return this.#users.deleteUserPluginPermissionGrant(
      { ...request, userId },
      options,
    ).then(() => undefined);
  }

  public async previousLogs(
    request: Input<typeof PreviousLogRequestSchema>,
    options?: CallOptions,
  ): Promise<LogString[]> {
    return (await this.#logs.getPrevious(request, options)).messages;
  }

  public logs(
    request: Input<typeof LogRequestSchema>,
    options?: CallOptions,
  ): AsyncIterable<LogResponse> {
    return this.#logs.subscribe(request, options);
  }

  public serverMetrics(
    since?: Timestamp,
    options?: CallOptions,
  ): Promise<GetServerMetricsResponse> {
    return this.#metrics.getServerMetrics(
      since === undefined ? {} : { since },
      options,
    );
  }

  public instanceMetrics(
    instanceId: string,
    since?: Timestamp,
    options?: CallOptions,
  ): Promise<GetInstanceMetricsResponse> {
    return this.#metrics.getInstanceMetrics(
      { instanceId, ...(since === undefined ? {} : { since }) },
      options,
    );
  }

  public executeCommand(
    request: Input<typeof CommandRequestSchema>,
    options?: CallOptions,
  ): Promise<CommandResponse> {
    return this.#commands.executeCommand(request, options);
  }

  public completeCommand(
    request: Input<typeof CommandCompletionRequestSchema>,
    options?: CallOptions,
  ): Promise<CommandCompletionResponse> {
    return this.#commands.tabCompleteCommand(request, options);
  }

  public download(
    request: Input<typeof DownloadRequestSchema>,
    options?: CallOptions,
  ): Promise<DownloadResponse> {
    return this.#downloads.download(request, options);
  }

  public async pluginStats(
    instanceId: string,
    options?: CallOptions,
  ): Promise<PluginRuntimeStat[]> {
    return (await this.#pluginStats.getInstancePluginStats(
      { instanceId },
      options,
    )).stats;
  }

  public async auditLog(
    instanceId: string,
    options?: CallOptions,
  ): Promise<InstanceAuditLogResponse_AuditLogEntry[]> {
    return (await this.#instances.getAuditLog(
      { id: instanceId },
      options,
    )).entry;
  }

  public async scripts(
    instanceId: string,
    options?: CallOptions,
  ): Promise<ScriptInfo[]> {
    return (await this.#scripts.listScripts({ instanceId }, options)).scripts;
  }

  public script(
    instanceId: string,
    scriptId: string,
    options?: CallOptions,
  ): Promise<GetScriptResponse> {
    return this.#scripts.getScript({ instanceId, scriptId }, options);
  }

  public createScript(
    instanceId: string,
    request: InstanceInput<typeof CreateScriptRequestSchema>,
    options?: CallOptions,
  ): Promise<CreateScriptResponse> {
    return this.#scripts.createScript({ ...request, instanceId }, options);
  }

  public updateScript(
    instanceId: string,
    request: InstanceInput<typeof UpdateScriptRequestSchema>,
    options?: CallOptions,
  ): Promise<UpdateScriptResponse> {
    return this.#scripts.updateScript({ ...request, instanceId }, options);
  }

  public deleteScript(
    instanceId: string,
    scriptId: string,
    options?: CallOptions,
  ): Promise<void> {
    return this.#scripts.deleteScript(
      { instanceId, scriptId },
      options,
    ).then(() => undefined);
  }

  public activateScript(
    instanceId: string,
    request: InstanceInput<typeof ActivateScriptRequestSchema>,
    options?: CallOptions,
  ): AsyncIterable<ScriptEvent> {
    return this.#scripts.activateScript(
      { ...request, instanceId },
      options,
    );
  }

  public deactivateScript(
    instanceId: string,
    scriptId: string,
    options?: CallOptions,
  ): Promise<void> {
    return this.#scripts.deactivateScript(
      { instanceId, scriptId },
      options,
    ).then(() => undefined);
  }

  public scriptStatus(
    instanceId: string,
    scriptId: string,
    options?: CallOptions,
  ): Promise<GetScriptStatusResponse> {
    return this.#scripts.getScriptStatus(
      { instanceId, scriptId },
      options,
    );
  }

  public scriptLogs(
    instanceId: string,
    request: InstanceInput<typeof SubscribeScriptLogsRequestSchema>,
    options?: CallOptions,
  ): AsyncIterable<ScriptLogEntry> {
    return this.#scripts.subscribeScriptLogs(
      { ...request, instanceId },
      options,
    );
  }

  public nodeTypes(
    request: Input<typeof GetNodeTypesRequestSchema> = {},
    options?: CallOptions,
  ): Promise<GetNodeTypesResponse> {
    return this.#scripts.getNodeTypes(request, options);
  }

  public scriptRegistryData(
    request: Input<typeof GetRegistryDataRequestSchema> = {},
    options?: CallOptions,
  ): Promise<GetRegistryDataResponse> {
    return this.#scripts.getRegistryData(request, options);
  }

  public validateScript(
    instanceId: string,
    request: InstanceInput<typeof ValidateScriptRequestSchema>,
    options?: CallOptions,
  ): Promise<ValidateScriptResponse> {
    return this.#scripts.validateScript({ ...request, instanceId }, options);
  }

  public dryRunScript(
    instanceId: string,
    request: InstanceInput<typeof DryRunScriptRequestSchema>,
    options?: CallOptions,
  ): AsyncIterable<ScriptEvent> {
    return this.#scripts.dryRunScript({ ...request, instanceId }, options);
  }
}
