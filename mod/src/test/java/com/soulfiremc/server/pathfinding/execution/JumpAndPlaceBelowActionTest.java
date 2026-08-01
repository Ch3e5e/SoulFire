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
package com.soulfiremc.server.pathfinding.execution;

import net.minecraft.world.phys.Vec3;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class JumpAndPlaceBelowActionTest {
  @Test
  void keepsJumpingUntilThePlayerClearsThePlacementCell() {
    assertTrue(JumpAndPlaceBelowAction.needsAdditionalJumpHeight(62.2, 62));
    assertTrue(JumpAndPlaceBelowAction.needsAdditionalJumpHeight(63.0, 62));
    assertFalse(JumpAndPlaceBelowAction.needsAdditionalJumpHeight(63.02, 62));
  }

  @Test
  void waitsForHorizontalDriftToStopBeforePillaring() {
    assertTrue(JumpAndPlaceBelowAction.isHorizontallyStable(
      new Vec3(0.02, 0.02, -0.01)
    ));
    assertFalse(JumpAndPlaceBelowAction.isHorizontallyStable(
      new Vec3(0.05, 0.02, 0.0)
    ));
  }

  @Test
  void centersThePlayerBeforeStartingAPillarJump() {
    var center = new Vec3(-5.5, 59, 23.5);

    assertTrue(JumpAndPlaceBelowAction.needsHorizontalCentering(
      new Vec3(-5.21, 59, 23.23),
      center
    ));
    assertFalse(JumpAndPlaceBelowAction.needsHorizontalCentering(
      new Vec3(-5.45, 59, 23.42),
      center
    ));
  }

  @Test
  void onlyKeepsTheViewLevelForFluidAscents() {
    assertTrue(JumpAndPlaceBelowAction
      .shouldKeepViewHorizontalWhileAscending(true));
    assertFalse(JumpAndPlaceBelowAction
      .shouldKeepViewHorizontalWhileAscending(false));
  }

  @Test
  void rejectsAPlacementWhosePredictionNeverSettles() {
    assertTrue(JumpAndPlaceBelowAction.placementWasRejected(
      false,
      true,
      true,
      false,
      40
    ));
  }
}
