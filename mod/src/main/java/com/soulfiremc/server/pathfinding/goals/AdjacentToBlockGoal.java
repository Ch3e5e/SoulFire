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
import java.util.Set;

/// Reaches a safe standing position beside or directly below a block.
///
/// This lets a caller perform an interaction from the side after the route
/// completes. In particular, a block directly supporting the player can be
/// approached from an adjacent floor block before it is mined, while an
/// overhead block can be reached from directly below it.
public record AdjacentToBlockGoal(
  SFVec3i block,
  Set<SFVec3i> excludedPositions
) implements GoalScorer {
  private static final int MINIMUM_OVERHEAD_REACH = 2;
  private static final int MAXIMUM_OVERHEAD_REACH = 6;

  public AdjacentToBlockGoal {
    excludedPositions = Set.copyOf(excludedPositions);
  }

  public AdjacentToBlockGoal(SFVec3i block) {
    this(block, Set.of());
  }

  @Override
  public double computeScore(
    MinecraftGraph graph,
    SFVec3i position,
    List<WorldAction> actions
  ) {
    var closestDistance = Double.POSITIVE_INFINITY;
    for (
      var deltaY = MINIMUM_OVERHEAD_REACH;
      deltaY <= MAXIMUM_OVERHEAD_REACH;
      deltaY++
    ) {
      var candidate = block.add(0, -deltaY, 0);
      if (excludedPositions.contains(candidate)) {
        continue;
      }
      closestDistance = Math.min(
        closestDistance,
        position.distance(candidate)
      );
    }
    for (var x = -1; x <= 1; x++) {
      for (var z = -1; z <= 1; z++) {
        if (x == 0 && z == 0) {
          continue;
        }
        for (var y = -2; y <= 1; y++) {
          var candidate = block.add(x, y, z);
          if (excludedPositions.contains(candidate)) {
            continue;
          }
          closestDistance = Math.min(
            closestDistance,
            position.distance(candidate)
          );
        }
      }
    }
    return closestDistance;
  }

  @Override
  public boolean isFinished(MinecraftRouteNode current) {
    var position = current.node().blockPosition();
    return !excludedPositions.contains(position)
      && isAdjacentPosition(block, position);
  }

  public static boolean isAdjacentPosition(
    SFVec3i block,
    SFVec3i position
  ) {
    var deltaX = block.x - position.x;
    var deltaY = block.y - position.y;
    var deltaZ = block.z - position.z;
    var horizontalDistanceSquared =
      deltaX * deltaX + deltaZ * deltaZ;
    if (horizontalDistanceSquared == 0) {
      return deltaY >= MINIMUM_OVERHEAD_REACH
        && deltaY <= MAXIMUM_OVERHEAD_REACH;
    }
    return horizontalDistanceSquared >= 1
      && horizontalDistanceSquared <= 2
      && deltaY >= -1
      && deltaY <= 2;
  }
}
