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

import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FurnaceBlock;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BuildTaskProviderTest {
  @Test
  void treatsUnspecifiedBlockPropertiesAsWildcards() {
    var westFacing = Blocks.FURNACE.defaultBlockState()
      .setValue(FurnaceBlock.FACING, Direction.WEST);

    assertTrue(BuildTaskProvider.matchesRequestedState(
      westFacing,
      Blocks.FURNACE,
      Blocks.FURNACE.defaultBlockState(),
      Set.of()
    ));
  }

  @Test
  void verifiesEveryExplicitlyRequestedBlockProperty() {
    var westFacing = Blocks.FURNACE.defaultBlockState()
      .setValue(FurnaceBlock.FACING, Direction.WEST);
    var northFacing = Blocks.FURNACE.defaultBlockState()
      .setValue(FurnaceBlock.FACING, Direction.NORTH);

    assertTrue(BuildTaskProvider.matchesRequestedState(
      westFacing,
      Blocks.FURNACE,
      westFacing,
      Set.of("facing")
    ));
    assertFalse(BuildTaskProvider.matchesRequestedState(
      westFacing,
      Blocks.FURNACE,
      northFacing,
      Set.of("facing")
    ));
  }

  @Test
  void rejectsDifferentBlocksEvenWithoutRequestedProperties() {
    assertFalse(BuildTaskProvider.matchesRequestedState(
      Blocks.BLAST_FURNACE.defaultBlockState(),
      Blocks.FURNACE,
      Blocks.FURNACE.defaultBlockState(),
      Set.of()
    ));
  }
}
