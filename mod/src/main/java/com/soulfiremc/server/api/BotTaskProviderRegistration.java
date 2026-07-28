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
import java.util.Objects;

/// Immutable registration for one plugin-defined task request type.
public record BotTaskProviderRegistration<I extends Message, R extends Message>(
  PluginInfo owner,
  String typeUrl,
  String resultTypeUrl,
  java.util.Optional<String> progressTypeUrl,
  PluginBotTaskProvider<I, R> provider,
  List<RegisteredPluginPermission> permissions
) {
  public BotTaskProviderRegistration {
    Objects.requireNonNull(owner, "owner");
    Objects.requireNonNull(typeUrl, "typeUrl");
    Objects.requireNonNull(resultTypeUrl, "resultTypeUrl");
    Objects.requireNonNull(progressTypeUrl, "progressTypeUrl");
    Objects.requireNonNull(provider, "provider");
    permissions = List.copyOf(permissions);
  }
}
