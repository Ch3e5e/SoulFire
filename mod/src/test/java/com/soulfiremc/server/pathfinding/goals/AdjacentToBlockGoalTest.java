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
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class AdjacentToBlockGoalTest {
  private static final SFVec3i TARGET = new SFVec3i(10, 63, -4);
  private static final AdjacentToBlockGoal GOAL =
    new AdjacentToBlockGoal(TARGET);

  @Test
  void requiresLeavingTheBlocksSupportColumn() {
    assertFalse(GOAL.isFinished(node(new SFVec3i(10, 64, -4))));
    assertTrue(GOAL.isFinished(node(new SFVec3i(11, 64, -4))));
    assertTrue(GOAL.isFinished(node(new SFVec3i(9, 63, -3))));
  }

  @Test
  void rejectsPositionsOutsideInteractionHeight() {
    assertFalse(GOAL.isFinished(node(new SFVec3i(11, 65, -4))));
    assertFalse(GOAL.isFinished(node(new SFVec3i(11, 60, -4))));
  }

  @Test
  void retriesFromAnotherSideAfterAnUnusableApproach() {
    var blockedApproach = new SFVec3i(11, 64, -4);
    var goal = new AdjacentToBlockGoal(
      TARGET,
      Set.of(blockedApproach)
    );

    assertFalse(goal.isFinished(node(blockedApproach)));
    assertTrue(goal.isFinished(node(new SFVec3i(9, 64, -4))));
    assertEquals(
      1.0D,
      goal.computeScore(null, blockedApproach, List.of())
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
