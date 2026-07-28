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

/// Adds isolated observations or strategy work to SoulFire's team automation
/// coordinator.
public interface PluginAutomationExtension {
  /// Stable name within the owning plugin.
  String id();

  /// Higher-priority extensions run first.
  default int priority() {
    return 0;
  }

  default void onTick(PluginAutomationExtensionContext context) throws Exception {}

  default void onObservation(PluginAutomationExtensionContext context) throws Exception {}
}
