/*
 * SoulFire
 * Copyright (C) 2024  AlexProgrammerDE
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
package com.soulfiremc.server.pathfinding.goals;

import com.soulfiremc.server.pathfinding.MinecraftRouteNode;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.execution.WorldAction;
import com.soulfiremc.server.pathfinding.graph.MinecraftGraph;

import java.util.List;

/**
 * Goal to get close to a specific position.
 *
 * @param goal      the goal position to get close to
 * @param maxRadius the maximum radius to be close to the goal
 */
public record CloseToPosGoal(SFVec3i goal, int maxRadius) implements GoalScorer {
  @Override
  public double computeScore(MinecraftGraph graph, SFVec3i blockPosition, List<WorldAction> actions) {
    return blockPosition.distance(goal);
  }

  @Override
  public boolean isFinished(MinecraftRouteNode current) {
    return current.node().blockPosition().distance(goal) <= maxRadius;
  }
}
