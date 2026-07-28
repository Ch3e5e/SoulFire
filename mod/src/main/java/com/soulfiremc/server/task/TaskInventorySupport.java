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

import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.util.SFInventoryHelpers;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.AbstractFurnaceMenu;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.CraftingMenu;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.item.ItemStack;

import java.util.OptionalInt;
import java.util.function.Predicate;
import java.util.stream.IntStream;

final class TaskInventorySupport {
  private TaskInventorySupport() {
  }

  static OptionalInt findInventorySlot(
    BotConnection bot,
    Predicate<ItemStack> selector
  ) {
    var player = bot.minecraft().player;
    if (player == null) {
      return OptionalInt.empty();
    }

    return SFInventoryHelpers.findMatchingSlotForAction(
      player.getInventory(),
      player.inventoryMenu,
      selector
    );
  }

  static boolean ensureHolding(
    BotConnection bot,
    Predicate<ItemStack> selector
  ) {
    var player = bot.minecraft().player;
    var gameMode = bot.minecraft().gameMode;
    if (player == null || gameMode == null) {
      return false;
    }
    if (selector.test(player.getMainHandItem())) {
      return true;
    }

    var slot = SFInventoryHelpers.findMatchingSlotForAction(
      player.getInventory(),
      player.inventoryMenu,
      selector
    );
    if (slot.isEmpty()) {
      return false;
    }

    var inventorySlot = slot.getAsInt();
    if (SFInventoryHelpers.isSelectableHotbarSlot(inventorySlot)) {
      player.getInventory().setSelectedSlot(
        SFInventoryHelpers.toHotbarIndex(inventorySlot)
      );
      return true;
    }
    if (player.hasContainerOpen()) {
      return false;
    }

    player.sendOpenInventory();
    gameMode.handleContainerInput(
      player.inventoryMenu.containerId,
      inventorySlot,
      0,
      ContainerInput.PICKUP,
      player
    );
    gameMode.handleContainerInput(
      player.inventoryMenu.containerId,
      SFInventoryHelpers.getSelectedSlot(player.getInventory()),
      0,
      ContainerInput.PICKUP,
      player
    );
    if (!player.inventoryMenu.getCarried().isEmpty()) {
      gameMode.handleContainerInput(
        player.inventoryMenu.containerId,
        inventorySlot,
        0,
        ContainerInput.PICKUP,
        player
      );
    }
    player.closeContainer();
    return selector.test(player.getMainHandItem());
  }

  static IntStream playerInventorySlots(AbstractContainerMenu menu) {
    var layout = menuLayout(menu);
    var main = IntStream.range(
      layout.playerInventoryStart(),
      Math.min(layout.hotbarStart(), menu.slots.size())
    );
    var hotbar = IntStream.range(
      layout.hotbarStart(),
      Math.min(layout.hotbarStart() + 9, menu.slots.size())
    );
    if (
      layout.offhandSlot() >= 0
        && layout.offhandSlot() < menu.slots.size()
    ) {
      return IntStream.concat(
        IntStream.concat(hotbar, main),
        IntStream.of(layout.offhandSlot())
      );
    }
    return IntStream.concat(hotbar, main);
  }

  private static MenuLayout menuLayout(AbstractContainerMenu menu) {
    if (menu instanceof InventoryMenu) {
      return new MenuLayout(9, 36, 45);
    }
    if (menu instanceof ChestMenu chestMenu) {
      var containerSize = chestMenu.getRowCount() * 9;
      return new MenuLayout(containerSize, containerSize + 27, -1);
    }
    if (menu instanceof AbstractFurnaceMenu) {
      return new MenuLayout(3, 30, -1);
    }
    if (menu instanceof CraftingMenu) {
      return new MenuLayout(10, 37, -1);
    }

    var containerSlots = Math.max(0, menu.slots.size() - 36);
    return new MenuLayout(
      containerSlots,
      Math.max(containerSlots, menu.slots.size() - 9),
      -1
    );
  }

  private record MenuLayout(
    int playerInventoryStart,
    int hotbarStart,
    int offhandSlot
  ) {
  }
}
