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

/// Goal to get at least `minRadius` away from every origin.
/// An empty origin list is already safe.
public record AwayFromPositionsGoal(
  List<SFVec3i> origins,
  int minRadius
) implements GoalScorer {
  public AwayFromPositionsGoal {
    origins = List.copyOf(origins);
  }

  @Override
  public double computeScore(
    MinecraftGraph graph,
    SFVec3i blockPosition,
    List<WorldAction> actions
  ) {
    return origins.stream()
      .mapToDouble(origin -> Math.max(
        0,
        minRadius - blockPosition.distance(origin)
      ))
      .max()
      .orElse(0);
  }

  @Override
  public boolean isFinished(MinecraftRouteNode current) {
    return origins.stream().allMatch(origin ->
      current.node().blockPosition().distance(origin) >= minRadius
    );
  }
}
