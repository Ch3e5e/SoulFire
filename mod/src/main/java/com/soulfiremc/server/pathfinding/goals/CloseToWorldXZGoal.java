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
package com.soulfiremc.server.pathfinding.goals;

import com.soulfiremc.server.pathfinding.MinecraftRouteNode;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.execution.WorldAction;
import com.soulfiremc.server.pathfinding.graph.MinecraftGraph;

import java.util.List;

/// Goal to move the player's feet within a horizontal radius of a world
/// position while allowing the pathfinder to choose any Y level.
public record CloseToWorldXZGoal(
  double x,
  double z,
  double maxRadius
) implements GoalScorer {
  public CloseToWorldXZGoal {
    if (!Double.isFinite(x) || !Double.isFinite(z)) {
      throw new IllegalArgumentException("XZ goal coordinates must be finite");
    }
    if (!Double.isFinite(maxRadius) || maxRadius <= 0) {
      throw new IllegalArgumentException(
        "XZ goal radius must be finite and positive"
      );
    }
  }

  @Override
  public double computeScore(
    MinecraftGraph graph,
    SFVec3i blockPosition,
    List<WorldAction> actions
  ) {
    return distanceToPlayerPosition(blockPosition);
  }

  @Override
  public boolean isFinished(MinecraftRouteNode current) {
    return distanceToPlayerPosition(current.node().blockPosition())
      <= maxRadius;
  }

  private double distanceToPlayerPosition(SFVec3i blockPosition) {
    return Math.hypot(blockPosition.x + 0.5 - x, blockPosition.z + 0.5 - z);
  }
}
