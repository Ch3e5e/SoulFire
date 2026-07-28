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

import com.google.protobuf.Descriptors;
import io.grpc.ServerServiceDefinition;

import java.util.List;
import java.util.Map;

/// A validated gRPC service owned by a plugin.
public record PluginRpcRegistration(
  PluginInfo owner,
  ServerServiceDefinition service,
  Descriptors.ServiceDescriptor descriptor,
  Map<String, List<RegisteredPluginPermission>> methodPermissions
) {
  public PluginRpcRegistration {
    methodPermissions = methodPermissions.entrySet().stream()
      .collect(java.util.stream.Collectors.toUnmodifiableMap(
        Map.Entry::getKey,
        entry -> List.copyOf(entry.getValue())
      ));
  }
}
