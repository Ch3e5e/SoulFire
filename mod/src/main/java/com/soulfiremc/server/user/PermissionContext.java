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

import com.soulfiremc.grpc.generated.GlobalPermission;
import com.soulfiremc.grpc.generated.InstancePermission;
import com.soulfiremc.server.api.RegisteredPluginPermission;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public sealed interface PermissionContext permits PermissionContext.GlobalContext, PermissionContext.InstanceContext, PermissionContext.PluginContext {
  static GlobalContext global(GlobalPermission globalPermission) {
    return new GlobalContext(globalPermission);
  }

  static InstanceContext instance(InstancePermission instancePermission, UUID instanceId) {
    return new InstanceContext(instancePermission, instanceId);
  }

  static PluginContext plugin(
    RegisteredPluginPermission permission,
    Optional<UUID> instanceId,
    Optional<UUID> botId,
    Optional<UUID> taskId
  ) {
    return new PluginContext(permission, instanceId, botId, taskId);
  }

  record GlobalContext(GlobalPermission globalPermission) implements PermissionContext {
  }

  record InstanceContext(InstancePermission instancePermission, UUID instanceId) implements PermissionContext {
  }

  record PluginContext(
    RegisteredPluginPermission permission,
    Optional<UUID> instanceId,
    Optional<UUID> botId,
    Optional<UUID> taskId
  ) implements PermissionContext {
    public PluginContext {
      Objects.requireNonNull(permission, "permission");
      Objects.requireNonNull(instanceId, "instanceId");
      Objects.requireNonNull(botId, "botId");
      Objects.requireNonNull(taskId, "taskId");
    }
  }
}
