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

import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.cost.Costs;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint;
import com.soulfiremc.server.util.BlockItems;
import com.soulfiremc.server.util.SFInventoryHelpers;
import com.soulfiremc.server.util.SFItemHelpers;
import lombok.extern.slf4j.Slf4j;
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;

import java.util.Optional;

@Slf4j
public final class ItemPlaceHelper {
  private ItemPlaceHelper() {
  }

  public static Optional<InteractionHand> placeBestBlockInHand(
    BotConnection connection,
    PathConstraint pathConstraint
  ) {
    var player = connection.minecraft().player;
    var playerInventory = player.inventoryMenu;

    var bestItem = selectBestPathBuildingItem(
      playerInventory.slots.stream().map(slot -> slot.getItem()).toList(),
      pathConstraint
    );
    if (bestItem.isEmpty()) {
      return Optional.empty();
    }

    var selectedItem = bestItem.orElseThrow();
    var slot = SFInventoryHelpers.findMatchingSlotForAction(player.getInventory(), playerInventory,
        candidate -> candidate.getItem() == selectedItem)
      .orElseThrow(() -> new IllegalStateException("Failed to find item stack to use"));
    if (slot == InventoryMenu.SHIELD_SLOT) {
      return Optional.of(InteractionHand.OFF_HAND);
    }
    placeInHand(connection.minecraft().gameMode, player, slot);
    return Optional.of(InteractionHand.MAIN_HAND);
  }

  static Optional<Item> selectBestPathBuildingItem(
    Iterable<ItemStack> items,
    PathConstraint pathConstraint
  ) {
    Item bestItem = null;
    var bestPriority = Integer.MAX_VALUE;
    var bestDestroyTime = 0F;
    for (var slotItemStack : items) {
      if (
        slotItemStack.isEmpty()
          || !pathConstraint.isPlaceable(slotItemStack)
      ) {
        continue;
      }

      var slotItem = slotItemStack.getItem();
      var blockType = BlockItems.getBlock(slotItem);
      if (blockType.isEmpty()) {
        continue;
      }

      var destroyTime = blockType.get().defaultDestroyTime();
      var priority = SFItemHelpers.isDisposableFullBlockItem(slotItemStack)
        ? 0
        : 1;
      if (
        bestItem == null
          || priority < bestPriority
          || (
            priority == bestPriority
              && destroyTime < bestDestroyTime
          )
      ) {
        bestItem = slotItem;
        bestPriority = priority;
        bestDestroyTime = destroyTime;
      }
    }

    return Optional.ofNullable(bestItem);
  }

  public static boolean placeBestToolInHand(BotConnection connection, SFVec3i blockPosition) {
    var player = connection.minecraft().player;
    var playerInventory = player.inventoryMenu;
    var level = connection.minecraft().level;

    ItemStack bestItemStack = null;
    var bestCost = Integer.MAX_VALUE;
    var sawEmpty = false;
    for (var slot : playerInventory.slots) {
      var slotItem = slot.getItem();
      if (slotItem.isEmpty()) {
        if (sawEmpty) {
          continue;
        }

        sawEmpty = true;
      }

      var optionalBlock = level.getBlockState(blockPosition.toBlockPos());
      if (optionalBlock.getBlock() == Blocks.VOID_AIR) {
        throw new IllegalStateException("Block at %s is not loaded".formatted(blockPosition));
      }

      var cost =
        Costs.getRequiredMiningTicks(player, slotItem, optionalBlock)
          .ticks();

      if (cost < bestCost || (slotItem.isEmpty() && cost == bestCost)) {
        bestCost = cost;
        bestItemStack = slotItem;
      }
    }

    // Our hand is the best tool
    if (bestItemStack == null) {
      return true;
    }

    var finalBestItemStack = bestItemStack;
    placeInHand(connection.minecraft().gameMode, player,
      SFInventoryHelpers.findMatchingSlotForAction(player.getInventory(), playerInventory,
          slot -> ItemStack.isSameItemSameComponents(slot, finalBestItemStack))
        .orElseThrow(() -> new IllegalStateException("Failed to find item stack to use")));
    return true;
  }

  private static void placeInHand(MultiPlayerGameMode gameMode, LocalPlayer player, int slot) {
    if (player.hasContainerOpen()) {
      log.debug("Closing foreign container before selecting a pathfinding item");
      player.closeContainer();
    }

    if (SFInventoryHelpers.getSelectedSlot(player.getInventory()) == slot) {
      return;
    } else if (SFInventoryHelpers.isSelectableHotbarSlot(slot)) {
      player.getInventory().setSelectedSlot(SFInventoryHelpers.toHotbarIndex(slot));
    } else {
      player.sendOpenInventory();
      gameMode.handleContainerInput(
        player.inventoryMenu.containerId,
        slot,
        player.getInventory().getSelectedSlot(),
        ContainerInput.SWAP,
        player
      );
      player.closeContainer();
    }
  }
}
