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

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/// Scope attached to an event published by a server plugin.
public record PluginEventTarget(
  Optional<UUID> instanceId,
  Optional<UUID> botId,
  Optional<UUID> taskId
) {
  public PluginEventTarget {
    Objects.requireNonNull(instanceId, "instanceId");
    Objects.requireNonNull(botId, "botId");
    Objects.requireNonNull(taskId, "taskId");
    if (botId.isPresent() && instanceId.isEmpty()) {
      throw new IllegalArgumentException("A bot-scoped plugin event requires an instance");
    }
    if (taskId.isPresent() && instanceId.isEmpty()) {
      throw new IllegalArgumentException("A task-scoped plugin event requires an instance");
    }
    if (botId.isPresent() && taskId.isPresent()) {
      throw new IllegalArgumentException("A plugin event cannot be both bot and task scoped");
    }
  }

  public static PluginEventTarget global() {
    return new PluginEventTarget(Optional.empty(), Optional.empty(), Optional.empty());
  }

  public static PluginEventTarget instance(UUID instanceId) {
    return new PluginEventTarget(Optional.of(instanceId), Optional.empty(), Optional.empty());
  }

  public static PluginEventTarget bot(UUID instanceId, UUID botId) {
    return new PluginEventTarget(Optional.of(instanceId), Optional.of(botId), Optional.empty());
  }

  public static PluginEventTarget task(UUID instanceId, UUID taskId) {
    return new PluginEventTarget(Optional.of(instanceId), Optional.empty(), Optional.of(taskId));
  }
}
