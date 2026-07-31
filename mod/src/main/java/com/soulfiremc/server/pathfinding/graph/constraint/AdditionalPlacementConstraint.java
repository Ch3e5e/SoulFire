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

import com.soulfiremc.server.util.SFItemHelpers;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;

import java.util.Set;

/// Allows an explicit, request-scoped set of protected block items to be used
/// after the ordinary disposable path-building blocks.
public record AdditionalPlacementConstraint(
  PathConstraint delegate,
  Set<Item> additionalItems
) implements DelegatePathConstraint {
  @Override
  public boolean isPlaceable(ItemStack item) {
    return delegate.isPlaceable(item)
      || (
        additionalItems.contains(item.getItem())
          && SFItemHelpers.isSafeFullBlockItem(item)
      );
  }

  @Override
  public boolean isPlaceableBlockDrop(BlockState blockState) {
    var item = blockState.getBlock().asItem();
    return delegate.isPlaceableBlockDrop(blockState)
      || (
        additionalItems.contains(item)
          && SFItemHelpers.isSafeFullBlock(blockState.getBlock())
      );
  }
}
