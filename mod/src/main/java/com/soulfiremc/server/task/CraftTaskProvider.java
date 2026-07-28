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

import com.soulfiremc.grpc.generated.BotTaskProgress;
import com.soulfiremc.grpc.generated.CraftTask;
import com.soulfiremc.grpc.generated.CraftTaskResult;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.bot.ControlPriority;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.grpc.MinecraftDomainMapper;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.execution.PathExecutor;
import com.soulfiremc.server.pathfinding.goals.CloseToPosGoal;
import com.soulfiremc.server.pathfinding.graph.constraint.NoBlockBreakingConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.NoBlockPlacingConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraintImpl;
import com.soulfiremc.server.recipe.RecipeSupport;
import io.grpc.Status;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.CraftingMenu;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.crafting.display.RecipeDisplayEntry;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/// Executes ordinary shaped and shapeless recipes through the recipe book.
public final class CraftTaskProvider implements BotTaskProvider<CraftTask> {
  private static final int MAX_CRAFT_OPERATIONS = 4_096;
  private static final int MENU_TIMEOUT_TICKS = 100;
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY,
    ControlResource.CONTAINER
  );

  @Override
  public CraftTask inputPrototype() {
    return CraftTask.getDefaultInstance();
  }

  @Override
  public String summary(CraftTask input) {
    return "Craft " + Math.max(1, input.getCount())
      + " operation(s) of " + input.getRecipeId();
  }

  @Override
  public Set<ControlResource> resources(CraftTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(BotTaskContext context, CraftTask input) {
    if (input.getRecipeId().isBlank()) {
      throw Status.INVALID_ARGUMENT
        .withDescription("recipe_id is required")
        .asRuntimeException();
    }
    var count = input.getCount() <= 0 ? 1 : input.getCount();
    if (count > MAX_CRAFT_OPERATIONS) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "count may not exceed " + MAX_CRAFT_OPERATIONS
        )
        .asRuntimeException();
    }
    var entry = RecipeSupport.find(context.bot(), input.getRecipeId());
    if (!RecipeSupport.isCraftingRecipe(entry)) {
      throw Status.FAILED_PRECONDITION
        .withDescription(
          "CraftTask supports shaped and shapeless crafting recipes"
        )
        .asRuntimeException();
    }
    if (entry.craftingRequirements().isEmpty()) {
      throw Status.FAILED_PRECONDITION
        .withDescription(
          "This special recipe cannot be executed from fixed ingredients"
        )
        .asRuntimeException();
    }
    var player = Objects.requireNonNull(
      context.bot().minecraft().player,
      "Bot player is not available"
    );
    if (!player.containerMenu.getCarried().isEmpty()) {
      throw Status.FAILED_PRECONDITION
        .withDescription(
          "The bot must not be carrying an item on the inventory cursor"
        )
        .asRuntimeException();
    }

    var inventoryRecipe = RecipeSupport.canCraftInInventory(entry);
    BlockPos station = null;
    if (!inventoryRecipe && !(player.containerMenu instanceof CraftingMenu)) {
      if (!input.hasStation()) {
        throw Status.FAILED_PRECONDITION
          .withDescription(
            "station is required for a crafting-table recipe unless a crafting table is already open"
          )
          .asRuntimeException();
      }
      var requested = input.getStation();
      var level = Objects.requireNonNull(
        context.bot().minecraft().level,
        "Bot level is not available"
      );
      var currentDimension = level.dimension().identifier().toString();
      if (!requested.getDimension().isBlank()
        && !requested.getDimension().equals(currentDimension)) {
        throw Status.INVALID_ARGUMENT
          .withDescription(
            "Crafting station is in '%s', but the bot is in '%s'"
              .formatted(requested.getDimension(), currentDimension)
          )
          .asRuntimeException();
      }
      station = new BlockPos(
        requested.getX(),
        requested.getY(),
        requested.getZ()
      );
    }

    var result = new CompletableFuture<CraftTaskResult>();
    var control = new CraftControl(
      context,
      entry,
      RecipeSupport.result(context.bot(), entry),
      count,
      inventoryRecipe,
      station,
      result
    );
    return new BotTaskExecution(control, result);
  }

  private static final class CraftControl implements ControlTask {
    private final BotTaskContext context;
    private final RecipeDisplayEntry recipe;
    private final ItemStack output;
    private final int targetCount;
    private final boolean inventoryRecipe;
    private final @Nullable BlockPos station;
    private final CompletableFuture<CraftTaskResult> result;
    private @Nullable PathExecutor activePath;
    private Stage stage;
    private int stageTicks;
    private int crafted;

    private CraftControl(
      BotTaskContext context,
      RecipeDisplayEntry recipe,
      ItemStack output,
      int targetCount,
      boolean inventoryRecipe,
      @Nullable BlockPos station,
      CompletableFuture<CraftTaskResult> result
    ) {
      this.context = context;
      this.recipe = recipe;
      this.output = output;
      this.targetCount = targetCount;
      this.inventoryRecipe = inventoryRecipe;
      this.station = station;
      this.result = result;
      this.stage = inventoryRecipe || station == null
        ? Stage.OPEN_MENU
        : Stage.NAVIGATE;
    }

    @Override
    public void tick() {
      if (result.isDone()) {
        return;
      }
      try {
        if (crafted >= targetCount) {
          complete();
          return;
        }
        switch (stage) {
          case NAVIGATE -> navigate();
          case OPEN_MENU -> openMenu();
          case PLACE_RECIPE -> placeRecipe();
          case WAIT_FOR_RESULT -> waitForResult();
          case TAKE_RESULT -> takeResult();
          case DEPOSIT_RESULT -> depositResult();
        }
      } catch (Throwable throwable) {
        fail(throwable);
      }
    }

    private void navigate() {
      var stationPosition = Objects.requireNonNull(station);
      var player = requirePlayer();
      if (player.position().distanceToSqr(Vec3.atCenterOf(stationPosition)) <= 9) {
        transition(Stage.OPEN_MENU, "Opening crafting table");
        return;
      }
      if (activePath == null) {
        context.reportProgress(progress("Planning route to crafting table"));
        var constraint = new NoBlockBreakingConstraint(
          new NoBlockPlacingConstraint(
            new PathConstraintImpl(context.bot())
          )
        );
        activePath = PathExecutor.createPathfinding(
          context.bot(),
          new CloseToPosGoal(SFVec3i.fromInt(stationPosition), 3),
          constraint
        );
        activePath.onStarted();
      }
      if (!activePath.isDone()) {
        activePath.tick();
        context.reportProgress(progress(
          activePath.progress().planning()
            ? "Planning route to crafting table"
            : "Walking to crafting table"
        ));
        return;
      }
      var path = activePath;
      activePath = null;
      try {
        path.completion().join();
        path.onStopped(ControlStopReason.COMPLETED, null);
        transition(Stage.OPEN_MENU, "Opening crafting table");
      } catch (CompletionException exception) {
        var cause = exception.getCause() == null
          ? exception
          : exception.getCause();
        path.onStopped(ControlStopReason.FAILED, cause);
        throw exception;
      }
    }

    private void openMenu() {
      var player = requirePlayer();
      if (inventoryRecipe) {
        if (!(player.containerMenu instanceof InventoryMenu)) {
          player.closeContainer();
        }
        player.sendOpenInventory();
        transition(Stage.PLACE_RECIPE, "Preparing recipe");
        return;
      }
      if (player.containerMenu instanceof CraftingMenu) {
        transition(Stage.PLACE_RECIPE, "Preparing recipe");
        return;
      }
      var stationPosition = Objects.requireNonNull(station);
      var level = Objects.requireNonNull(
        context.bot().minecraft().level,
        "Bot level is not available"
      );
      var expectedStation = RecipeSupport.requiredStation(
        context.bot(),
        recipe
      );
      var actualStation = BuiltInRegistries.BLOCK
        .getKey(level.getBlockState(stationPosition).getBlock())
        .toString();
      if (!expectedStation.equals(actualStation)) {
        throw Status.FAILED_PRECONDITION
          .withDescription(
            "Expected %s at the crafting station, found %s"
              .formatted(expectedStation, actualStation)
          )
          .asRuntimeException();
      }
      if (stageTicks % 10 == 0) {
        var gameMode = Objects.requireNonNull(
          context.bot().minecraft().gameMode,
          "Bot game mode is not available"
        );
        gameMode.useItemOn(
          player,
          InteractionHand.MAIN_HAND,
          new BlockHitResult(
            Vec3.atCenterOf(stationPosition),
            Direction.UP,
            stationPosition,
            false
          )
        );
      }
      stageTicks++;
      if (stageTicks > MENU_TIMEOUT_TICKS) {
        throw Status.DEADLINE_EXCEEDED
          .withDescription("Timed out opening the crafting table")
          .asRuntimeException();
      }
    }

    private void placeRecipe() {
      var player = requirePlayer();
      var menu = requireCraftingMenu(player.containerMenu);
      if (!menu.getCarried().isEmpty()) {
        transition(Stage.DEPOSIT_RESULT, "Storing crafted result");
        return;
      }
      var gameMode = Objects.requireNonNull(
        context.bot().minecraft().gameMode,
        "Bot game mode is not available"
      );
      gameMode.handlePlaceRecipe(menu.containerId, recipe.id(), false);
      transition(Stage.WAIT_FOR_RESULT, "Placing recipe ingredients");
    }

    private void waitForResult() {
      var menu = requireCraftingMenu(requirePlayer().containerMenu);
      var resultStack = menu.getSlot(0).getItem();
      if (!resultStack.isEmpty()) {
        if (!ItemStack.isSameItemSameComponents(resultStack, output)) {
          throw Status.FAILED_PRECONDITION
            .withDescription(
              "The crafting result does not match the selected recipe"
            )
            .asRuntimeException();
        }
        transition(Stage.TAKE_RESULT, "Taking crafted result");
        return;
      }
      stageTicks++;
      if (stageTicks > MENU_TIMEOUT_TICKS) {
        throw Status.FAILED_PRECONDITION
          .withDescription(
            "Recipe result did not appear; ingredients may be missing"
          )
          .asRuntimeException();
      }
    }

    private void takeResult() {
      var player = requirePlayer();
      var menu = requireCraftingMenu(player.containerMenu);
      var gameMode = Objects.requireNonNull(
        context.bot().minecraft().gameMode,
        "Bot game mode is not available"
      );
      gameMode.handleContainerInput(
        menu.containerId,
        0,
        0,
        ContainerInput.PICKUP,
        player
      );
      transition(Stage.DEPOSIT_RESULT, "Storing crafted result");
    }

    private void depositResult() {
      var player = requirePlayer();
      var menu = requireCraftingMenu(player.containerMenu);
      var carried = menu.getCarried();
      if (carried.isEmpty()) {
        crafted++;
        transition(Stage.PLACE_RECIPE, "Preparing next craft");
        return;
      }
      var target = TaskInventorySupport.playerInventorySlots(menu)
        .filter(slot -> canDeposit(menu, slot, carried))
        .findFirst();
      if (target.isEmpty()) {
        throw Status.RESOURCE_EXHAUSTED
          .withDescription("Inventory has no room for the crafted result")
          .asRuntimeException();
      }
      var gameMode = Objects.requireNonNull(
        context.bot().minecraft().gameMode,
        "Bot game mode is not available"
      );
      gameMode.handleContainerInput(
        menu.containerId,
        target.getAsInt(),
        0,
        ContainerInput.PICKUP,
        player
      );
      stageTicks++;
      if (stageTicks > MENU_TIMEOUT_TICKS) {
        throw Status.DEADLINE_EXCEEDED
          .withDescription("Timed out storing the crafted result")
          .asRuntimeException();
      }
    }

    private static boolean canDeposit(
      AbstractContainerMenu menu,
      int slotIndex,
      ItemStack carried
    ) {
      var slot = menu.getSlot(slotIndex);
      if (!slot.mayPlace(carried)) {
        return false;
      }
      var existing = slot.getItem();
      return existing.isEmpty()
        || ItemStack.isSameItemSameComponents(existing, carried)
        && existing.getCount() < Math.min(
        existing.getMaxStackSize(),
        slot.getMaxStackSize(existing)
      );
    }

    private AbstractContainerMenu requireCraftingMenu(
      AbstractContainerMenu menu
    ) {
      if (inventoryRecipe && menu instanceof InventoryMenu) {
        return menu;
      }
      if (!inventoryRecipe && menu instanceof CraftingMenu) {
        return menu;
      }
      throw Status.FAILED_PRECONDITION
        .withDescription("The required crafting menu was closed")
        .asRuntimeException();
    }

    private net.minecraft.client.player.LocalPlayer requirePlayer() {
      return Objects.requireNonNull(
        context.bot().minecraft().player,
        "Bot player is not available"
      );
    }

    private void transition(Stage next, String message) {
      stage = next;
      stageTicks = 0;
      context.reportProgress(progress(message));
    }

    private BotTaskProgress progress(String message) {
      return BotTaskProgress.newBuilder()
        .setMessage(message)
        .setCurrent(crafted)
        .setTotal(targetCount)
        .setFraction(Math.min(1.0, (double) crafted / targetCount))
        .build();
    }

    private void complete() {
      result.complete(CraftTaskResult.newBuilder()
        .setResult(MinecraftDomainMapper.item(output))
        .setCrafted(crafted)
        .build());
    }

    private void fail(Throwable throwable) {
      result.completeExceptionally(throwable);
    }

    @Override
    public boolean isDone() {
      return result.isDone();
    }

    @Override
    public ControlPriority priority() {
      return ControlPriority.HIGH;
    }

    @Override
    public Set<ControlResource> resources() {
      return RESOURCES;
    }

    @Override
    public void onSuspended() {
      if (activePath != null) {
        activePath.onSuspended();
      }
    }

    @Override
    public void onResumed() {
      if (activePath != null) {
        activePath.onResumed();
      }
    }

    @Override
    public void onStopped(
      ControlStopReason reason,
      @Nullable Throwable cause
    ) {
      var path = activePath;
      activePath = null;
      if (path != null) {
        path.onStopped(reason, cause);
      }
      var player = context.bot().minecraft().player;
      if (player != null && !(player.containerMenu instanceof InventoryMenu)) {
        player.closeContainer();
      }
      if (reason != ControlStopReason.COMPLETED && !result.isDone()) {
        result.cancel(true);
      }
    }

    @Override
    public String description() {
      return "Craft recipe";
    }
  }

  private enum Stage {
    NAVIGATE,
    OPEN_MENU,
    PLACE_RECIPE,
    WAIT_FOR_RESULT,
    TAKE_RESULT,
    DEPOSIT_RESULT
  }
}
