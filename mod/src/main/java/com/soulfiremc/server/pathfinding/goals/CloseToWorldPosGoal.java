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
import net.minecraft.world.phys.Vec3;

import java.util.List;

/// Goal to move the player's feet within an exact radius of a world position.
///
/// Unlike a block goal, this preserves fractional coordinates and radii. A
/// route node represents the block occupied by the player's feet, so its
/// physical position is the bottom center of that block.
public record CloseToWorldPosGoal(Vec3 goal, double maxRadius) implements GoalScorer {
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
    return distanceToPlayerPosition(current.node().blockPosition()) <= maxRadius;
  }

  private double distanceToPlayerPosition(SFVec3i blockPosition) {
    var deltaX = blockPosition.x + 0.5 - goal.x;
    var deltaY = blockPosition.y - goal.y;
    var deltaZ = blockPosition.z + 0.5 - goal.z;
    return Math.sqrt(
      deltaX * deltaX
        + deltaY * deltaY
        + deltaZ * deltaZ
    );
  }
}
