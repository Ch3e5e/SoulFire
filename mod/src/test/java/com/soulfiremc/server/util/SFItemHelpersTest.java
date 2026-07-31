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
package com.soulfiremc.server.util;

import com.soulfiremc.test.utils.TestBootstrap;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponentMap;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class SFItemHelpersTest {
  @BeforeAll
  static void bootstrapMinecraft() {
    TestBootstrap.bootstrapForTest();
  }

  @Test
  void acceptsDisposableTerrainBlocks() {
    assertTrue(SFItemHelpers.isDisposableFullBlockItem(itemStack(Items.DIRT)));
    assertTrue(SFItemHelpers.isDisposableFullBlockItem(itemStack(Items.COBBLESTONE)));
    assertTrue(SFItemHelpers.isDisposableFullBlockItem(itemStack(Items.NETHERRACK)));
    assertTrue(SFItemHelpers.isDisposableFullBlockItem(itemStack(Items.END_STONE)));
  }

  @Test
  void preservesCraftingAndProgressionResources() {
    assertFalse(SFItemHelpers.isDisposableFullBlockItem(itemStack(Items.OAK_LOG)));
    assertFalse(SFItemHelpers.isDisposableFullBlockItem(itemStack(Items.OAK_PLANKS)));
    assertFalse(SFItemHelpers.isDisposableFullBlockItem(itemStack(Items.CRAFTING_TABLE)));
    assertFalse(SFItemHelpers.isDisposableFullBlockItem(itemStack(Items.FURNACE)));
    assertFalse(SFItemHelpers.isDisposableFullBlockItem(itemStack(Items.OBSIDIAN)));
    assertFalse(SFItemHelpers.isDisposableFullBlockItem(itemStack(Items.IRON_BLOCK)));
  }

  @Test
  void preservesProgressionWoodDuringPathBuilding() {
    assertTrue(SFItemHelpers.isPathBuildingBlockItem(
      itemStack(Items.COBBLESTONE)
    ));
    assertFalse(SFItemHelpers.isPathBuildingBlockItem(
      itemStack(Items.OAK_LOG)
    ));
    assertFalse(SFItemHelpers.isPathBuildingBlockItem(
      itemStack(Items.OAK_PLANKS)
    ));
    assertFalse(SFItemHelpers.isPathBuildingBlockItem(
      itemStack(Items.CRAFTING_TABLE)
    ));
    assertFalse(SFItemHelpers.isPathBuildingBlockItem(
      itemStack(Items.OBSIDIAN)
    ));
  }

  @Test
  void classifiesProjectedBlockDropsWithTheSamePlacementPolicy() {
    assertTrue(SFItemHelpers.isDisposableFullBlock(Blocks.COBBLESTONE));
    assertFalse(SFItemHelpers.isDisposableFullBlock(Blocks.OAK_LOG));
    assertFalse(SFItemHelpers.isPathBuildingBlock(Blocks.OAK_LOG));
    assertFalse(SFItemHelpers.isPathBuildingBlock(Blocks.OAK_PLANKS));
  }

  private static ItemStack itemStack(Item item) {
    return new ItemStack(Holder.direct(item, DataComponentMap.EMPTY), 1);
  }
}
