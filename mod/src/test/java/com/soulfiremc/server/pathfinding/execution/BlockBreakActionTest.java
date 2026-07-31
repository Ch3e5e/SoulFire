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

final class BlockBreakActionTest {
  @Test
  void maintainsTheStartingHeightWhileMiningInFluid() {
    assertTrue(BlockBreakAction.shouldMaintainFluidHeight(
      true,
      61.8,
      62.0
    ));
    assertTrue(BlockBreakAction.shouldMaintainFluidHeight(
      true,
      62.0,
      62.0
    ));
    assertFalse(BlockBreakAction.shouldMaintainFluidHeight(
      true,
      62.1,
      62.0
    ));
  }

  @Test
  void doesNotJumpWhileMiningOutsideFluid() {
    assertFalse(BlockBreakAction.shouldMaintainFluidHeight(
      false,
      61.8,
      62.0
    ));
  }
}
