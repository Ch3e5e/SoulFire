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
package com.soulfiremc.server.pathfinding.graph.constraint;

import com.soulfiremc.server.pathfinding.execution.GapJumpAction;
import com.soulfiremc.server.pathfinding.graph.GraphInstructions;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.level.BlockGetter;
import org.jspecify.annotations.Nullable;

import java.util.OptionalInt;

public record AvoidFluidConstraint(
  PathConstraint delegate,
  BlockGetter level,
  OptionalInt submergedStartY
) implements DelegatePathConstraint {
  public static AvoidFluidConstraint forPlayer(
    PathConstraint delegate,
    BlockGetter level,
    @Nullable LocalPlayer player
  ) {
    var submergedStartY = player != null
      && (player.isInWater() || player.isInLava())
      ? OptionalInt.of(player.blockPosition().getY())
      : OptionalInt.empty();
    return new AvoidFluidConstraint(delegate, level, submergedStartY);
  }

  @Override
  public boolean allowsInstruction(GraphInstructions instruction) {
    if (!delegate.allowsInstruction(instruction)) {
      return false;
    }
    if (instruction.actions().stream().anyMatch(GapJumpAction.class::isInstance)) {
      return false;
    }
    return isDryDestination(level, instruction)
      || isAscendingFluidEscape(instruction, submergedStartY);
  }

  static boolean isDryDestination(
    BlockGetter level,
    GraphInstructions instruction
  ) {
    var feet = instruction.blockPosition().toBlockPos();
    return level.getFluidState(feet).isEmpty()
      && level.getFluidState(feet.above()).isEmpty();
  }

  static boolean isAscendingFluidEscape(
    GraphInstructions instruction,
    OptionalInt submergedStartY
  ) {
    return submergedStartY.isPresent()
      && instruction.blockPosition().y > submergedStartY.getAsInt();
  }
}
