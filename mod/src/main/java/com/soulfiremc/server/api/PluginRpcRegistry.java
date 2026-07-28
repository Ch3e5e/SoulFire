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

import io.grpc.BindableService;

import java.util.List;

/// Registers protobuf gRPC services in the namespace of one plugin.
public final class PluginRpcRegistry {
  private final PluginApiRegistry registry;
  private final PluginInfo owner;

  PluginRpcRegistry(PluginApiRegistry registry, PluginInfo owner) {
    this.registry = registry;
    this.owner = owner;
  }

  public PluginRpcRegistration register(BindableService service) {
    return registry.registerRpc(owner, service);
  }

  public List<PluginRpcRegistration> services() {
    return registry.rpcServices(owner.id());
  }
}
