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
package com.soulfiremc.server.user;

import com.soulfiremc.grpc.generated.PluginPermissionScope;
import com.soulfiremc.server.api.PluginPermission;

import java.util.Optional;
import java.util.UUID;

/// Normalizes dynamic permission targets for storage and evaluation.
public final class PluginPermissionGrantScope {
  private PluginPermissionGrantScope() {}

  public static Key fromContext(PermissionContext.PluginContext context) {
    return switch (context.permission().definition().scope()) {
      case GLOBAL -> new Key("GLOBAL", "");
      case INSTANCE -> new Key("INSTANCE", required(context.instanceId(), "instance").toString());
      case BOT -> new Key("BOT", required(context.botId(), "bot").toString());
      case TASK -> new Key("TASK", required(context.taskId(), "task").toString());
    };
  }

  public static Key fromRequest(
    PluginPermissionScope scope,
    Optional<String> resourceId
  ) {
    return switch (scope) {
      case PLUGIN_PERMISSION_SCOPE_GLOBAL -> {
        if (resourceId.isPresent() && !resourceId.orElseThrow().isBlank()) {
          throw new IllegalArgumentException("Global plugin permissions cannot have a resource ID");
        }
        yield new Key("GLOBAL", "");
      }
      case PLUGIN_PERMISSION_SCOPE_INSTANCE ->
        new Key("INSTANCE", parseResourceId(resourceId, "instance"));
      case PLUGIN_PERMISSION_SCOPE_BOT ->
        new Key("BOT", parseResourceId(resourceId, "bot"));
      case PLUGIN_PERMISSION_SCOPE_TASK ->
        new Key("TASK", parseResourceId(resourceId, "task"));
      case PLUGIN_PERMISSION_SCOPE_UNSPECIFIED, UNRECOGNIZED ->
        throw new IllegalArgumentException("A concrete plugin permission scope is required");
    };
  }

  public static PluginPermissionScope toProto(String scope) {
    return switch (scope) {
      case "GLOBAL" -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_GLOBAL;
      case "INSTANCE" -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_INSTANCE;
      case "BOT" -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_BOT;
      case "TASK" -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_TASK;
      default -> throw new IllegalStateException("Unknown persisted plugin permission scope: " + scope);
    };
  }

  public static PluginPermissionScope toProto(PluginPermission.Scope scope) {
    return switch (scope) {
      case GLOBAL -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_GLOBAL;
      case INSTANCE -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_INSTANCE;
      case BOT -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_BOT;
      case TASK -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_TASK;
    };
  }

  private static UUID required(Optional<UUID> value, String kind) {
    return value.orElseThrow(() ->
      new IllegalStateException("Plugin permission requires a %s target".formatted(kind)));
  }

  private static String parseResourceId(Optional<String> resourceId, String kind) {
    var value = resourceId
      .filter(candidate -> !candidate.isBlank())
      .orElseThrow(() -> new IllegalArgumentException(
        "%s plugin permissions require a resource ID".formatted(kind)));
    return UUID.fromString(value).toString();
  }

  public record Key(String scope, String resourceId) {}
}
