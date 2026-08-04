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
package com.soulfiremc.server.bot;

import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.protocol.game.ServerboundPlayerInputPacket;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Input;

import java.util.function.Supplier;

/// Runs an interaction with a temporary secondary-use state while keeping the
/// client and server copies of the player's sneaking state in sync.
public final class BotInteractionSupport {
  private BotInteractionSupport() {
  }

  public static <T> T withSneaking(
    LocalPlayer player,
    boolean sneaking,
    Supplier<T> interaction
  ) {
    var wasSneaking = player.isShiftKeyDown();
    var previousInput = player.input.keyPresses;
    setSneaking(player, previousInput, sneaking);
    try {
      return interaction.get();
    } finally {
      player.input.keyPresses = previousInput;
      player.setShiftKeyDown(wasSneaking);
      player.connection.send(new ServerboundPlayerInputPacket(previousInput));
    }
  }

  /// Continues a block interaction through the held item's general use path
  /// when the block-specific path passes, matching Minecraft's right-click
  /// dispatch order.
  public static InteractionResult withItemUseFallback(
    InteractionResult blockResult,
    Supplier<InteractionResult> useItem
  ) {
    if (
      blockResult instanceof InteractionResult.Success
        || blockResult instanceof InteractionResult.Fail
    ) {
      return blockResult;
    }
    return useItem.get();
  }

  private static void setSneaking(
    LocalPlayer player,
    Input input,
    boolean sneaking
  ) {
    var interactionInput = new Input(
      input.forward(),
      input.backward(),
      input.left(),
      input.right(),
      input.jump(),
      sneaking,
      input.sprint()
    );
    player.input.keyPresses = interactionInput;
    player.setShiftKeyDown(sneaking);
    player.connection.send(new ServerboundPlayerInputPacket(interactionInput));
  }
}
