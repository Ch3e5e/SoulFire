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

import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.soulfiremc.server.command.CommandSourceStack;

import java.util.List;

/// Registers Brigadier commands during the controlled plugin load phase.
public final class PluginCommandRegistry {
  private final PluginApiRegistry registry;
  private final PluginInfo owner;

  PluginCommandRegistry(PluginApiRegistry registry, PluginInfo owner) {
    this.registry = registry;
    this.owner = owner;
  }

  public PluginCommandRegistration register(
    LiteralArgumentBuilder<CommandSourceStack> command
  ) {
    return registry.registerCommand(owner, command);
  }

  public List<PluginCommandRegistration> commands() {
    return registry.commands(owner.id());
  }
}
