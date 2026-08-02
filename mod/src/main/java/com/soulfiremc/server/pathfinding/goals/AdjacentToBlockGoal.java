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

import java.util.HashSet;
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
  Set<SFVec3i> excludedPositions,
  Set<SFVec3i> interactionPositions
) implements GoalScorer {
  private static final int MINIMUM_OVERHEAD_REACH = 2;
  private static final int MAXIMUM_OVERHEAD_REACH = 6;

  public AdjacentToBlockGoal {
    excludedPositions = Set.copyOf(excludedPositions);
    interactionPositions = Set.copyOf(interactionPositions);
  }

  public AdjacentToBlockGoal(
    SFVec3i block,
    Set<SFVec3i> excludedPositions
  ) {
    this(block, excludedPositions, interactionPositions(block));
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
    return interactionPositions.stream()
      .filter(candidate -> !excludedPositions.contains(candidate))
      .mapToDouble(position::distance)
      .min()
      .orElse(Double.POSITIVE_INFINITY);
  }

  @Override
  public boolean isFinished(MinecraftRouteNode current) {
    var position = current.node().blockPosition();
    return !excludedPositions.contains(position)
      && interactionPositions.contains(position);
  }

  public static boolean isAdjacentPosition(
    SFVec3i block,
    SFVec3i position
  ) {
    return interactionPositions(block).contains(position);
  }

  public static Set<SFVec3i> interactionPositions(SFVec3i block) {
    var positions = new HashSet<SFVec3i>();
    for (
      var deltaY = MINIMUM_OVERHEAD_REACH;
      deltaY <= MAXIMUM_OVERHEAD_REACH;
      deltaY++
    ) {
      positions.add(block.add(0, -deltaY, 0));
    }
    for (var x = -1; x <= 1; x++) {
      for (var z = -1; z <= 1; z++) {
        if (x == 0 && z == 0) {
          continue;
        }
        for (var y = -2; y <= 1; y++) {
          positions.add(block.add(x, y, z));
        }
      }
    }
    return Set.copyOf(positions);
  }
}
