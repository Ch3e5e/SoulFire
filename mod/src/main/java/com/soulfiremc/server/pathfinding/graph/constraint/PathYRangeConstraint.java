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

import com.soulfiremc.server.pathfinding.graph.GraphInstructions;

import java.util.OptionalInt;

/// Restricts the player's feet elevation for every generated path step.
public record PathYRangeConstraint(
  PathConstraint delegate,
  OptionalInt minimumY,
  OptionalInt maximumY
) implements DelegatePathConstraint {
  public PathYRangeConstraint {
    if (
      minimumY.isPresent()
        && maximumY.isPresent()
        && minimumY.getAsInt() > maximumY.getAsInt()
    ) {
      throw new IllegalArgumentException(
        "minimumY must be less than or equal to maximumY"
      );
    }
  }

  @Override
  public boolean allowsInstruction(GraphInstructions instruction) {
    if (!delegate.allowsInstruction(instruction)) {
      return false;
    }
    var y = instruction.blockPosition().y;
    return (minimumY.isEmpty() || y >= minimumY.getAsInt())
      && (maximumY.isEmpty() || y <= maximumY.getAsInt());
  }
}
