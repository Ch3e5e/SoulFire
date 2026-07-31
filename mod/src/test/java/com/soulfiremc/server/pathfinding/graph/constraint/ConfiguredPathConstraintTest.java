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

import com.soulfiremc.test.utils.TestPathConstraint;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.OptionalDouble;
import java.util.OptionalInt;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class ConfiguredPathConstraintTest {
  @Test
  void overridesSprintWithoutChangingTheDefault() {
    assertTrue(configured(Optional.empty()).sprint());
    assertFalse(configured(Optional.of(false)).sprint());
    assertTrue(configured(Optional.of(true)).sprint());
  }

  private static ConfiguredPathConstraint configured(
    Optional<Boolean> sprint
  ) {
    return new ConfiguredPathConstraint(
      TestPathConstraint.INSTANCE,
      OptionalDouble.empty(),
      OptionalDouble.empty(),
      OptionalInt.empty(),
      sprint
    );
  }
}
