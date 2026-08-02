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

final class WithinBlockReachGoalTest {
  private static final SFVec3i TARGET = new SFVec3i(10, 64, -4);

  @Test
  void acceptsAnyStandablePositionWithinHandReach() {
    var goal = new WithinBlockReachGoal(TARGET);
    var position = TARGET.add(3, 0, 0);

    assertTrue(goal.isFinished(node(position)));
    assertEquals(0.0D, goal.computeScore(null, position, List.of()));
  }

  @Test
  void acceptsAReachablePositionBelowAnOverheadBlock() {
    var target = TARGET.add(0, 6, 0);

    assertTrue(new WithinBlockReachGoal(target).isFinished(node(TARGET)));
  }

  @Test
  void doesNotRouteOntoABlockDirectlyAboveTheTarget() {
    var position = TARGET.add(0, 1, 0);

    assertFalse(new WithinBlockReachGoal(TARGET).isFinished(node(position)));
  }

  @Test
  void acceptsAReachableLowerBlockOutsideTheSupportColumn() {
    var position = TARGET.add(1, 2, 0);

    assertTrue(new WithinBlockReachGoal(TARGET).isFinished(node(position)));
  }

  @Test
  void measuresReachToAFaceInsteadOfTheBlockBoundingBox() {
    var position = TARGET.add(5, 0, 0);

    assertFalse(new WithinBlockReachGoal(TARGET).isFinished(node(position)));
  }

  @Test
  void leavesPositioningMarginForALateralRaycast() {
    var position = TARGET.add(4, 0, 0);

    assertFalse(new WithinBlockReachGoal(TARGET).isFinished(node(position)));
  }

  @Test
  void retriesFromAnotherPositionAfterARejectedApproach() {
    var rejected = TARGET.add(3, 0, 0);
    var goal = new WithinBlockReachGoal(TARGET, Set.of(rejected));

    assertFalse(goal.isFinished(node(rejected)));
    assertTrue(goal.isFinished(node(TARGET.add(-3, 0, 0))));
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
