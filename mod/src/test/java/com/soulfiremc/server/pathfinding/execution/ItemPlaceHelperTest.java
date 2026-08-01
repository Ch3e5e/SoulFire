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

import com.soulfiremc.test.utils.TestBootstrap;
import com.soulfiremc.test.utils.TestPathConstraint;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponentMap;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class ItemPlaceHelperTest {
  private static ItemStack itemStack(Item item) {
    return new ItemStack(Holder.direct(item, DataComponentMap.EMPTY), 1);
  }

  @BeforeAll
  static void bootstrapMinecraft() {
    TestBootstrap.bootstrapForTest();
  }

  @Test
  void reportsWhenNoPathBuildingBlockIsAvailableYet() {
    var selected = ItemPlaceHelper.selectBestPathBuildingItem(
      List.of(itemStack(Items.OAK_STAIRS)),
      TestPathConstraint.INSTANCE
    );

    assertTrue(selected.isEmpty());
  }

  @Test
  void selectsADisposablePathBuildingBlockWhenItArrives() {
    var selected = ItemPlaceHelper.selectBestPathBuildingItem(
      List.of(
        itemStack(Items.OAK_STAIRS),
        itemStack(Items.COBBLESTONE)
      ),
      TestPathConstraint.INSTANCE
    );

    assertEquals(Items.COBBLESTONE, selected.orElseThrow());
  }
}
