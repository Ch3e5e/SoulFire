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

import java.util.List;

/// Registers failure-isolated extensions of the team automation coordinator.
public final class PluginAutomationRegistry {
  private final PluginApiRegistry registry;
  private final PluginInfo owner;

  PluginAutomationRegistry(PluginApiRegistry registry, PluginInfo owner) {
    this.registry = registry;
    this.owner = owner;
  }

  public PluginAutomationExtensionRegistration register(
    PluginAutomationExtension extension
  ) {
    return registry.registerAutomationExtension(owner, extension);
  }

  public List<PluginAutomationExtensionRegistration> extensions() {
    return registry.automationExtensions(owner.id());
  }
}
