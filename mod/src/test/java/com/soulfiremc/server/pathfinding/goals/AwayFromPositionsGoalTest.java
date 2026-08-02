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
import com.soulfiremc.server.pathfinding.NodeState;
import com.soulfiremc.server.pathfinding.SFVec3i;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class AwayFromPositionsGoalTest {
  @Test
  void requiresSafeDistanceFromEveryOrigin() {
    var goal = new AwayFromPositionsGoal(
      List.of(new SFVec3i(0, 64, 0), new SFVec3i(30, 64, 0)),
      10
    );

    assertFalse(goal.isFinished(node(new SFVec3i(35, 64, 0))));
    assertTrue(goal.isFinished(node(new SFVec3i(15, 64, 20))));
  }

  @Test
  void scoresTheClosestUnsafeOrigin() {
    var goal = new AwayFromPositionsGoal(
      List.of(new SFVec3i(0, 64, 0), new SFVec3i(20, 64, 0)),
      10
    );

    assertEquals(
      5,
      goal.computeScore(null, new SFVec3i(5, 64, 0), List.of())
    );
    assertEquals(
      0,
      goal.computeScore(null, new SFVec3i(10, 64, 20), List.of())
    );
  }

  @Test
  void treatsNoObservableThreatsAsSafe() {
    var goal = new AwayFromPositionsGoal(List.of(), 10);

    assertTrue(goal.isFinished(node(new SFVec3i(0, 64, 0))));
    assertEquals(
      0,
      goal.computeScore(null, new SFVec3i(0, 64, 0), List.of())
    );
  }

  private static MinecraftRouteNode node(SFVec3i position) {
    return new MinecraftRouteNode(
      new NodeState(position, 0),
      List.of(),
      0,
      0,
      0
    );
  }
}
