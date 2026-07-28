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

/// A registered protobuf event type and its publisher.
public final class PluginEventRegistration<E extends Message> {
  private final PluginApiRegistry registry;
  private final PluginInfo owner;
  private final String typeUrl;
  private final E prototype;
  private final List<RegisteredPluginPermission> permissions;

  PluginEventRegistration(
    PluginApiRegistry registry,
    PluginInfo owner,
    String typeUrl,
    E prototype,
    List<RegisteredPluginPermission> permissions
  ) {
    this.registry = registry;
    this.owner = owner;
    this.typeUrl = typeUrl;
    this.prototype = prototype;
    this.permissions = List.copyOf(permissions);
  }

  public PluginInfo owner() {
    return owner;
  }

  public String typeUrl() {
    return typeUrl;
  }

  public E prototype() {
    return prototype;
  }

  public List<RegisteredPluginPermission> permissions() {
    return permissions;
  }

  public long publish(PluginEventTarget target, E event) {
    return registry.publishEvent(this, target, event);
  }
}
