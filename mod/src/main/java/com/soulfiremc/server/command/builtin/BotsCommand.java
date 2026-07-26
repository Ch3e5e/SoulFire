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
package com.soulfiremc.server.command.builtin;

import com.mojang.brigadier.Command;
import com.mojang.brigadier.CommandDispatcher;
import com.soulfiremc.grpc.generated.BotDesiredState;
import com.soulfiremc.server.command.CommandSourceStack;

import static com.soulfiremc.server.command.brigadier.BrigadierHelper.forEveryInstance;
import static com.soulfiremc.server.command.brigadier.BrigadierHelper.help;
import static com.soulfiremc.server.command.brigadier.BrigadierHelper.literal;

public final class BotsCommand {
  private BotsCommand() {
  }

  public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
    dispatcher.register(
      literal("bots")
        .then(literal("start")
          .executes(help(
            "Set every configured bot in the selected instances to running",
            context -> setDesiredState(context, BotDesiredState.BOT_DESIRED_STATE_RUNNING))))
        .then(literal("stop")
          .executes(help(
            "Set every configured bot in the selected instances to stopped",
            context -> setDesiredState(context, BotDesiredState.BOT_DESIRED_STATE_STOPPED)))));
  }

  private static int setDesiredState(
    com.mojang.brigadier.context.CommandContext<CommandSourceStack> context,
    BotDesiredState desiredState) {
    return forEveryInstance(context, instance -> {
      instance.botStateManager().setDesiredState(
        context.getSource().source(),
        instance.settingsSource().accounts().keySet(),
        desiredState);
      return Command.SINGLE_SUCCESS;
    });
  }
}
