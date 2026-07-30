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
package com.soulfiremc.server.task;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class AutoEatTaskProviderTest {
  @Test
  void permitsExplicitlyRequestedFoodWithNegativeEffects() {
    assertTrue(AutoEatTaskProvider.isPermittedFood(
      true,
      false,
      "minecraft:chicken",
      Set.of("minecraft:chicken")
    ));
    assertFalse(AutoEatTaskProvider.isPermittedFood(
      true,
      false,
      "minecraft:chicken",
      Set.of("minecraft:bread")
    ));
  }

  @Test
  void keepsUnsafeFoodOutOfAutomaticSelection() {
    assertFalse(AutoEatTaskProvider.isPermittedFood(
      true,
      false,
      "minecraft:chicken",
      Set.of()
    ));
    assertTrue(AutoEatTaskProvider.isPermittedFood(
      true,
      true,
      "minecraft:bread",
      Set.of()
    ));
  }
}
