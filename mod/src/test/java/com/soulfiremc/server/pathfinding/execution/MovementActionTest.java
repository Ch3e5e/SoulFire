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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class MovementActionTest {
  @Test
  void movementInputTargetsWorldDirectionsIndependentlyOfViewYaw() {
    var origin = Vec3.ZERO;

    assertInput(true, false, false, false,
      MovementAction.movementInputFor(origin, 0.0F, new Vec3(0.0, 0.0, 1.0)));
    assertInput(false, true, false, false,
      MovementAction.movementInputFor(origin, 0.0F, new Vec3(0.0, 0.0, -1.0)));
    assertInput(false, false, true, false,
      MovementAction.movementInputFor(origin, 0.0F, new Vec3(1.0, 0.0, 0.0)));
    assertInput(false, false, false, true,
      MovementAction.movementInputFor(origin, 0.0F, new Vec3(-1.0, 0.0, 0.0)));

    assertInput(false, false, false, true,
      MovementAction.movementInputFor(origin, -90.0F, new Vec3(0.0, 0.0, 1.0)));
  }

  @Test
  void movementInputUsesDiagonalControlsAndStopsAtTheTarget() {
    var origin = Vec3.ZERO;

    assertInput(true, false, true, false,
      MovementAction.movementInputFor(origin, 0.0F, new Vec3(1.0, 0.0, 1.0)));
    assertInput(false, true, false, true,
      MovementAction.movementInputFor(origin, 0.0F, new Vec3(-1.0, 0.0, -1.0)));
    assertInput(false, false, false, false,
      MovementAction.movementInputFor(origin, 135.0F, origin));
  }

  @Test
  void horizontalTargetDistanceIgnoresHeightDuringARequiredDrop() {
    var currentPosition = new Vec3(4.5, 12.0, -2.5);

    assertEquals(
      0.0,
      MovementAction.horizontalDistance(
        currentPosition,
        new Vec3(4.5, 8.0, -2.5)
      )
    );
    assertEquals(
      5.0,
      MovementAction.horizontalDistance(
        currentPosition,
        new Vec3(7.5, 20.0, 1.5)
      )
    );
  }

  @Test
  void doesNotCompleteAVerticalStepWhilePassingThroughItInMidair() {
    assertFalse(MovementAction.hasReachedTargetHeight(
      66.0,
      66.0,
      false
    ));
    assertTrue(MovementAction.hasReachedTargetHeight(
      66.0,
      66.0,
      true
    ));
    assertFalse(MovementAction.hasReachedTargetHeight(
      65.5,
      66.0,
      true
    ));
  }

  private static void assertInput(
    boolean forward,
    boolean backward,
    boolean left,
    boolean right,
    MovementAction.MovementInput input
  ) {
    assertEquals(forward, input.forward());
    assertEquals(backward, input.backward());
    assertEquals(left, input.left());
    assertEquals(right, input.right());
  }
}
