/*
 * SoulFire
 * Copyright (C) 2026  AlexProgrammerDE
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
package com.soulfiremc.server.api;

import com.soulfiremc.server.InstanceManager;
import com.soulfiremc.server.SoulFireServer;
import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.task.BotTaskManager;
import com.soulfiremc.server.user.PermissionContext;
import com.soulfiremc.server.user.SoulFireUser;
import io.grpc.Context;
import io.grpc.Metadata;
import io.grpc.Status;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/// Authenticated, permission-checked runtime context for a plugin RPC.
///
/// The context is installed before the generated gRPC handler runs and follows
/// asynchronous work through gRPC's context propagation. Plugin handlers can
/// resolve their declared scope without parsing headers or reaching into core
/// authentication internals.
public final class PluginCallContext {
  private static final Context.Key<PluginCallContext> KEY =
    Context.key("soulfire-plugin-call");

  private final SoulFireServer server;
  private final PluginRpcRegistration registration;
  private final String methodName;
  private final SoulFireUser user;
  private final Optional<UUID> instanceId;
  private final Optional<UUID> botId;
  private final Optional<UUID> taskId;
  private final List<RegisteredPluginPermission> permissions;
  private final Metadata requestMetadata;
  private final Context grpcContext;

  public PluginCallContext(
    SoulFireServer server,
    PluginRpcRegistration registration,
    String methodName,
    SoulFireUser user,
    Optional<UUID> instanceId,
    Optional<UUID> botId,
    Optional<UUID> taskId,
    List<RegisteredPluginPermission> permissions,
    Metadata requestMetadata,
    Context grpcContext
  ) {
    this.server = server;
    this.registration = registration;
    this.methodName = methodName;
    this.user = user;
    this.instanceId = instanceId;
    this.botId = botId;
    this.taskId = taskId;
    this.permissions = List.copyOf(permissions);
    this.requestMetadata = new Metadata();
    this.requestMetadata.merge(requestMetadata);
    this.grpcContext = grpcContext;
  }

  public static PluginCallContext current() {
    var context = KEY.get();
    if (context == null) {
      throw new IllegalStateException("No plugin RPC call is active on this context");
    }
    return context;
  }

  public static Optional<PluginCallContext> currentOptional() {
    return Optional.ofNullable(KEY.get());
  }

  public SoulFireServer server() {
    return server;
  }

  public PluginRpcRegistration registration() {
    return registration;
  }

  public PluginInfo plugin() {
    return registration.owner();
  }

  public String methodName() {
    return methodName;
  }

  public SoulFireUser user() {
    return user;
  }

  public Optional<UUID> instanceId() {
    return instanceId;
  }

  public Optional<UUID> botId() {
    return botId;
  }

  public Optional<UUID> taskId() {
    return taskId;
  }

  public List<RegisteredPluginPermission> permissions() {
    return permissions;
  }

  public Metadata requestMetadata() {
    var copy = new Metadata();
    copy.merge(requestMetadata);
    return copy;
  }

  public boolean isCancelled() {
    return grpcContext.isCancelled();
  }

  public Optional<InstanceManager> instance() {
    return instanceId.flatMap(server::getInstance);
  }

  public InstanceManager requireInstance() {
    return instance().orElseThrow(() ->
      Status.NOT_FOUND.withDescription("Plugin RPC instance was not found").asRuntimeException());
  }

  public Optional<BotConnection> bot() {
    if (botId.isEmpty()) {
      return Optional.empty();
    }
    return instance().flatMap(value -> value.getConnectedBots().stream()
      .filter(bot -> bot.accountProfileId().equals(botId.orElseThrow()))
      .findFirst());
  }

  public BotConnection requireBot() {
    return bot().orElseThrow(() ->
      Status.FAILED_PRECONDITION
        .withDescription("Plugin RPC bot is not connected")
        .asRuntimeException());
  }

  public BotTaskManager tasks() {
    return server.botTaskManager();
  }

  public void check(RegisteredPluginPermission permission) {
    user.hasPermissionOrThrow(PermissionContext.plugin(
      permission,
      instanceId,
      botId,
      taskId
    ));
  }

  public Context grpcContext() {
    return grpcContext;
  }

  public static Context install(Context parent, PluginCallContext callContext) {
    return parent.withValue(KEY, callContext);
  }
}
