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

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class CloseToWorldXZGoalTest {
  @Test
  void ignoresHeightAndPreservesFractionalRadius() {
    var goal = new CloseToWorldXZGoal(154.05, 642.13, 4);

    assertTrue(goal.isFinished(node(new SFVec3i(154, -32, 643))));
    assertTrue(goal.isFinished(node(new SFVec3i(151, 200, 644))));
    assertFalse(goal.isFinished(node(new SFVec3i(150, 72, 646))));
  }

  @Test
  void measuresFromThePhysicalCenterAtNegativeCoordinates() {
    var goal = new CloseToWorldXZGoal(-67.05, 160.13, 1.5);

    assertTrue(goal.isFinished(node(new SFVec3i(-67, 0, 160))));
    assertFalse(goal.isFinished(node(new SFVec3i(-66, 0, 160))));
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
