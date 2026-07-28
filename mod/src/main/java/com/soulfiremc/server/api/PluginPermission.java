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

/// Declares a permission owned by a server plugin.
public record PluginPermission(
  String name,
  Scope scope,
  Risk risk,
  String displayName,
  String description,
  DefaultGrant defaultGrant
) {
  public PluginPermission {
    Objects.requireNonNull(name, "name");
    Objects.requireNonNull(scope, "scope");
    Objects.requireNonNull(risk, "risk");
    Objects.requireNonNull(displayName, "displayName");
    Objects.requireNonNull(description, "description");
    Objects.requireNonNull(defaultGrant, "defaultGrant");
  }

  public static PluginPermission global(
    String name,
    String displayName,
    String description,
    Risk risk
  ) {
    return new PluginPermission(name, Scope.GLOBAL, risk, displayName, description, DefaultGrant.ADMIN_ONLY);
  }

  public static PluginPermission instance(
    String name,
    String displayName,
    String description,
    Risk risk
  ) {
    return new PluginPermission(name, Scope.INSTANCE, risk, displayName, description, DefaultGrant.INSTANCE_OWNER);
  }

  public static PluginPermission bot(
    String name,
    String displayName,
    String description,
    Risk risk
  ) {
    return new PluginPermission(name, Scope.BOT, risk, displayName, description, DefaultGrant.INSTANCE_OWNER);
  }

  public static PluginPermission task(
    String name,
    String displayName,
    String description,
    Risk risk
  ) {
    return new PluginPermission(name, Scope.TASK, risk, displayName, description, DefaultGrant.INSTANCE_OWNER);
  }

  public enum Scope {
    GLOBAL,
    INSTANCE,
    BOT,
    TASK
  }

  public enum Risk {
    READ,
    CONTROL,
    MUTATION,
    DESTRUCTIVE
  }

  public enum DefaultGrant {
    ADMIN_ONLY,
    AUTHENTICATED,
    INSTANCE_OWNER
  }
}
