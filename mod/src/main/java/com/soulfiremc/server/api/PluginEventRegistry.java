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

import com.google.protobuf.Message;

import java.util.List;

/// Registers typed events in the namespace of one plugin.
public final class PluginEventRegistry {
  private final PluginApiRegistry registry;
  private final PluginInfo owner;

  PluginEventRegistry(PluginApiRegistry registry, PluginInfo owner) {
    this.registry = registry;
    this.owner = owner;
  }

  public <E extends Message> PluginEventRegistration<E> register(
    E prototype,
    RegisteredPluginPermission... permissions
  ) {
    return registry.registerEvent(owner, prototype, List.of(permissions));
  }

  public List<PluginEventRegistration<?>> eventTypes() {
    return registry.eventTypes(owner.id());
  }
}
