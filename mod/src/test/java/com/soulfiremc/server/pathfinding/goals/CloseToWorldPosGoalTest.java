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
import net.minecraft.world.phys.Vec3;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class CloseToWorldPosGoalTest {
  @Test
  void preservesFractionalRadius() {
    var goal = new CloseToWorldPosGoal(
      new Vec3(0.5, 64, 0.5),
      1.25
    );

    assertTrue(goal.isFinished(node(new SFVec3i(1, 64, 0))));
    assertFalse(goal.isFinished(node(new SFVec3i(2, 64, 0))));
  }

  @Test
  void measuresFromThePhysicalCenterAtNegativeCoordinates() {
    var goal = new CloseToWorldPosGoal(
      new Vec3(-67.05, 66.27, 160.13),
      1.5
    );

    assertTrue(goal.isFinished(node(new SFVec3i(-67, 65, 160))));
    assertFalse(goal.isFinished(node(new SFVec3i(-66, 65, 160))));
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
