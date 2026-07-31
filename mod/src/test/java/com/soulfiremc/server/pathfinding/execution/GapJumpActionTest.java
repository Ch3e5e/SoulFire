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

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GapJumpActionTest {
  @Test
  void waitsForSprintMomentumBeforeJumping() {
    assertFalse(GapJumpAction.shouldStartJump(1, 0));
    assertFalse(GapJumpAction.shouldStartJump(2, 0.07));
    assertTrue(GapJumpAction.shouldStartJump(2, 0.08));
  }

  @Test
  void eventuallyJumpsWhenTerrainPreventsNormalAcceleration() {
    assertFalse(GapJumpAction.shouldStartJump(2, 0));
    assertTrue(GapJumpAction.shouldStartJump(3, 0));
  }
}
