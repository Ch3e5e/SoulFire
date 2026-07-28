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

import com.soulfiremc.grpc.generated.PluginPermissionDefault;
import com.soulfiremc.grpc.generated.PluginPermissionDescriptor;
import com.soulfiremc.grpc.generated.PluginPermissionRisk;
import com.soulfiremc.grpc.generated.PluginPermissionScope;

import java.util.Objects;

/// A validated plugin permission with its globally unique ID.
public record RegisteredPluginPermission(
  String id,
  String pluginId,
  PluginPermission definition
) {
  public RegisteredPluginPermission {
    Objects.requireNonNull(id, "id");
    Objects.requireNonNull(pluginId, "pluginId");
    Objects.requireNonNull(definition, "definition");
  }

  public PluginPermissionDescriptor toProto() {
    return PluginPermissionDescriptor.newBuilder()
      .setId(id)
      .setPluginId(pluginId)
      .setScope(switch (definition.scope()) {
        case GLOBAL -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_GLOBAL;
        case INSTANCE -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_INSTANCE;
        case BOT -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_BOT;
        case TASK -> PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_TASK;
      })
      .setRisk(switch (definition.risk()) {
        case READ -> PluginPermissionRisk.PLUGIN_PERMISSION_RISK_READ;
        case CONTROL -> PluginPermissionRisk.PLUGIN_PERMISSION_RISK_CONTROL;
        case MUTATION -> PluginPermissionRisk.PLUGIN_PERMISSION_RISK_MUTATION;
        case DESTRUCTIVE -> PluginPermissionRisk.PLUGIN_PERMISSION_RISK_DESTRUCTIVE;
      })
      .setDisplayName(definition.displayName())
      .setDescription(definition.description())
      .setDefaultGrant(switch (definition.defaultGrant()) {
        case ADMIN_ONLY -> PluginPermissionDefault.PLUGIN_PERMISSION_DEFAULT_ADMIN_ONLY;
        case AUTHENTICATED -> PluginPermissionDefault.PLUGIN_PERMISSION_DEFAULT_AUTHENTICATED;
        case INSTANCE_OWNER -> PluginPermissionDefault.PLUGIN_PERMISSION_DEFAULT_INSTANCE_OWNER;
      })
      .build();
  }
}
