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
package com.soulfiremc.server.pathfinding.graph.constraint;

import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.graph.GraphInstructions;
import com.soulfiremc.server.pathfinding.graph.actions.movement.ActionDirection;
import com.soulfiremc.test.utils.TestPathConstraint;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.OptionalInt;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class PathYRangeConstraintTest {
  @Test
  void appliesInclusiveElevationBounds() {
    var constraint = new PathYRangeConstraint(
      TestPathConstraint.INSTANCE,
      OptionalInt.of(63),
      OptionalInt.of(70)
    );

    assertFalse(constraint.allowsInstruction(instruction(62)));
    assertTrue(constraint.allowsInstruction(instruction(63)));
    assertTrue(constraint.allowsInstruction(instruction(70)));
    assertFalse(constraint.allowsInstruction(instruction(71)));
  }

  @Test
  void permitsOpenEndedRanges() {
    var minimumOnly = new PathYRangeConstraint(
      TestPathConstraint.INSTANCE,
      OptionalInt.of(63),
      OptionalInt.empty()
    );
    var maximumOnly = new PathYRangeConstraint(
      TestPathConstraint.INSTANCE,
      OptionalInt.empty(),
      OptionalInt.of(70)
    );

    assertTrue(minimumOnly.allowsInstruction(instruction(100)));
    assertTrue(maximumOnly.allowsInstruction(instruction(-20)));
  }

  @Test
  void rejectsAnInvertedRange() {
    assertThrows(IllegalArgumentException.class, () ->
      new PathYRangeConstraint(
        TestPathConstraint.INSTANCE,
        OptionalInt.of(71),
        OptionalInt.of(70)
      )
    );
  }

  private static GraphInstructions instruction(int y) {
    return new GraphInstructions(
      SFVec3i.from(0, y, 0),
      0,
      false,
      ActionDirection.NORTH,
      1,
      List.of()
    );
  }
}
