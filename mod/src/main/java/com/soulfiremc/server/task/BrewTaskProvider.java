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
import com.soulfiremc.grpc.generated.BrewTask;
import com.soulfiremc.grpc.generated.BrewTaskResult;
import com.soulfiremc.grpc.generated.ItemSelector;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.automation.AutomationInventory;
import com.soulfiremc.server.bot.ControlPriority;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.grpc.InventoryServiceImpl;
import com.soulfiremc.server.grpc.MinecraftDomainMapper;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.execution.PathExecutor;
import com.soulfiremc.server.pathfinding.goals.CloseToPosGoal;
import com.soulfiremc.server.pathfinding.graph.constraint.NoBlockBreakingConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.NoBlockPlacingConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraintImpl;
import io.grpc.Status;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.BrewingStandMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.PotionBrewing;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.function.Predicate;

/// Brews exact potion outputs in batches while keeping all container
/// interaction and progress tracking on the bot thread.
public final class BrewTaskProvider implements BotTaskProvider<BrewTask> {
  private static final int MAX_BOTTLES = 4_096;
  private static final int MAX_BATCH_SIZE = 3;
  private static final int MENU_TIMEOUT_TICKS = 100;
  private static final int BREW_TIMEOUT_TICKS = 1_200;
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY,
    ControlResource.CONTAINER
  );

  @Override
  public BrewTask inputPrototype() {
    return BrewTask.getDefaultInstance();
  }

  @Override
  public String summary(BrewTask input) {
    return "Brew " + Math.max(1, input.getCount()) + " bottle(s)";
  }

  @Override
  public Set<ControlResource> resources(BrewTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(BotTaskContext context, BrewTask input) {
    var count = input.getCount() <= 0 ? 1 : input.getCount();
    if (count > MAX_BOTTLES) {
      throw Status.INVALID_ARGUMENT
        .withDescription("count may not exceed " + MAX_BOTTLES)
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
    validateMaterials(context, input, count);

    BlockPos station = null;
    if (!(player.containerMenu instanceof BrewingStandMenu)) {
      if (!input.hasStation()) {
        throw Status.FAILED_PRECONDITION
          .withDescription(
            "station is required unless a brewing stand is already open"
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
            "Brewing station is in '%s', but the bot is in '%s'"
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

    var result = new CompletableFuture<BrewTaskResult>();
    return new BotTaskExecution(
      new BrewControl(context, input, count, station, result),
      result
    );
  }

  private static void validateMaterials(
    BotTaskContext context,
    BrewTask input,
    int count
  ) {
    var player = Objects.requireNonNull(context.bot().minecraft().player);
    var level = Objects.requireNonNull(context.bot().minecraft().level);
    var brewing = level.potionBrewing();
    var inventory = player.getInventory().getNonEquipmentItems();
    var inputCount = inventory.stream()
      .filter(stack -> InventoryServiceImpl.matches(stack, input.getInput()))
      .mapToInt(ItemStack::getCount)
      .sum();
    if (inputCount < count) {
      throw Status.FAILED_PRECONDITION
        .withDescription(
          "Only %d matching potion input(s) are available, but %d are required"
            .formatted(inputCount, count)
        )
        .asRuntimeException();
    }
    var ingredientCount = inventory.stream()
      .filter(stack -> InventoryServiceImpl.matches(
        stack,
        input.getIngredient()
      ))
      .filter(brewing::isIngredient)
      .mapToInt(ItemStack::getCount)
      .sum();
    var requiredIngredients = (count + MAX_BATCH_SIZE - 1) / MAX_BATCH_SIZE;
    if (ingredientCount < requiredIngredients) {
      throw Status.FAILED_PRECONDITION
        .withDescription(
          "Only %d matching brewing ingredient(s) are available, but %d are required"
            .formatted(ingredientCount, requiredIngredients)
        )
        .asRuntimeException();
    }
    var hasMix = inventory.stream()
      .filter(stack -> InventoryServiceImpl.matches(stack, input.getInput()))
      .anyMatch(potion -> inventory.stream()
        .filter(ingredient -> InventoryServiceImpl.matches(
          ingredient,
          input.getIngredient()
        ))
        .anyMatch(ingredient -> brewing.hasMix(potion, ingredient)));
    if (!hasMix) {
      throw Status.FAILED_PRECONDITION
        .withDescription(
          "No matching potion input and ingredient form a valid brewing mix"
        )
        .asRuntimeException();
    }

    var menuFuel = player.containerMenu instanceof BrewingStandMenu menu
      ? menu.getFuel()
      : 0;
    var inventoryFuel = inventory.stream()
      .filter(stack -> stack.is(Items.BLAZE_POWDER))
      .filter(stack -> !input.hasFuel()
        || InventoryServiceImpl.matches(stack, input.getFuel()))
      .findFirst();
    var stationFuel = player.containerMenu instanceof BrewingStandMenu menu
      ? menu.getSlot(4).getItem()
      : ItemStack.EMPTY;
    var stationFuelMatches = stationFuel.is(Items.BLAZE_POWDER)
      && (!input.hasFuel()
      || InventoryServiceImpl.matches(stationFuel, input.getFuel()));
    if (menuFuel <= 0 && inventoryFuel.isEmpty() && !stationFuelMatches) {
      throw Status.FAILED_PRECONDITION
        .withDescription("No matching blaze powder is available")
        .asRuntimeException();
    }
  }

  private static final class BrewControl implements ControlTask {
    private final BotTaskContext context;
    private final ItemSelector inputSelector;
    private final ItemSelector ingredientSelector;
    private final @Nullable ItemSelector fuelSelector;
    private final @Nullable ItemSelector expectedResultSelector;
    private final int targetCount;
    private final @Nullable BlockPos station;
    private final CompletableFuture<BrewTaskResult> result;
    private final List<ItemStack> outputs = new ArrayList<>();
    private final List<ItemStack> expectedOutputs = new ArrayList<>();
    private @Nullable PathExecutor activePath;
    private Stage stage;
    private int stageTicks;
    private int operationsCompleted;
    private int activeBatchSize;
    private int outputIndex;
    private ItemStack selectedIngredient = ItemStack.EMPTY;

    private BrewControl(
      BotTaskContext context,
      BrewTask input,
      int targetCount,
      @Nullable BlockPos station,
      CompletableFuture<BrewTaskResult> result
    ) {
      this.context = context;
      this.inputSelector = input.getInput();
      this.ingredientSelector = input.getIngredient();
      this.fuelSelector = input.hasFuel() ? input.getFuel() : null;
      this.expectedResultSelector = input.hasExpectedResult()
        ? input.getExpectedResult()
        : null;
      this.targetCount = targetCount;
      this.station = station;
      this.result = result;
      this.stage = station == null ? Stage.OPEN_MENU : Stage.NAVIGATE;
    }

    @Override
    public void tick() {
      if (result.isDone()) {
        return;
      }
      try {
        if (operationsCompleted >= targetCount) {
          complete();
          return;
        }
        switch (stage) {
          case NAVIGATE -> navigate();
          case OPEN_MENU -> openMenu();
          case VALIDATE_MENU -> validateMenu();
          case LOAD_BOTTLES -> loadBottles();
          case LOAD_INGREDIENT -> loadIngredient();
          case LOAD_FUEL -> loadFuel();
          case WAIT_FOR_OUTPUT -> waitForOutput();
          case TAKE_OUTPUT -> takeOutput();
          case DEPOSIT_OUTPUT -> depositOutput();
        }
      } catch (Throwable throwable) {
        result.completeExceptionally(throwable);
      }
    }

    private void navigate() {
      var stationPosition = Objects.requireNonNull(station);
      var player = requirePlayer();
      if (player.position().distanceToSqr(Vec3.atCenterOf(stationPosition)) <= 9) {
        transition(Stage.OPEN_MENU, "Opening brewing stand");
        return;
      }
      if (activePath == null) {
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
            ? "Planning route to brewing stand"
            : "Walking to brewing stand"
        ));
        return;
      }
      var path = activePath;
      activePath = null;
      try {
        path.completion().join();
        path.onStopped(ControlStopReason.COMPLETED, null);
        transition(Stage.OPEN_MENU, "Opening brewing stand");
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
      if (player.containerMenu instanceof BrewingStandMenu) {
        transition(Stage.VALIDATE_MENU, "Checking brewing stand");
        return;
      }
      var stationPosition = Objects.requireNonNull(station);
      var level = Objects.requireNonNull(context.bot().minecraft().level);
      var actual = BuiltInRegistries.BLOCK
        .getKey(level.getBlockState(stationPosition).getBlock())
        .toString();
      if (!actual.equals("minecraft:brewing_stand")) {
        throw Status.FAILED_PRECONDITION
          .withDescription(
            "Expected minecraft:brewing_stand at the station, found " + actual
          )
          .asRuntimeException();
      }
      if (stageTicks % 10 == 0) {
        Objects.requireNonNull(context.bot().minecraft().gameMode).useItemOn(
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
          .withDescription("Timed out opening the brewing stand")
          .asRuntimeException();
      }
    }

    private void validateMenu() {
      var menu = requireBrewingMenu();
      for (var index = 0; index <= 3; index++) {
        if (!menu.getSlot(index).getItem().isEmpty()) {
          throw Status.FAILED_PRECONDITION
            .withDescription(
              "Brewing stand bottle and ingredient slots must be empty"
            )
            .asRuntimeException();
        }
      }
      var existingFuel = menu.getSlot(4).getItem();
      if (!existingFuel.isEmpty()
        && (!existingFuel.is(Items.BLAZE_POWDER)
        || fuelSelector != null
        && !InventoryServiceImpl.matches(existingFuel, fuelSelector))) {
        throw Status.FAILED_PRECONDITION
          .withDescription(
            "Existing brewing stand fuel does not match the task fuel policy"
          )
          .asRuntimeException();
      }
      transition(Stage.LOAD_BOTTLES, "Loading potion bottles");
    }

    private void loadBottles() {
      var menu = requireBrewingMenu();
      var brewing = potionBrewing();
      var maximumBatchSize = Math.min(
        MAX_BATCH_SIZE,
        targetCount - operationsCompleted
      );
      expectedOutputs.clear();
      outputIndex = 0;

      var selection = playerSlots(menu)
        .mapToObj(slot -> menu.getSlot(slot).getItem().copy())
        .filter(stack -> InventoryServiceImpl.matches(
          stack,
          ingredientSelector
        ))
        .filter(brewing::isIngredient)
        .map(stack -> new BatchSelection(
          stack,
          findCompatibleInputs(menu, brewing, stack)
        ))
        .filter(candidate -> !candidate.inputs.isEmpty())
        .max(java.util.Comparator.comparingInt(
          candidate -> candidate.inputs.size()
        ))
        .orElseThrow(() -> Status.FAILED_PRECONDITION
          .withDescription("No compatible brewing mix remains")
          .asRuntimeException());
      selectedIngredient = selection.ingredient.copy();
      var inputs = selection.inputs;
      activeBatchSize = Math.min(maximumBatchSize, inputs.size());
      for (var index = 0; index < activeBatchSize; index++) {
        var selected = inputs.get(index);
        var expected = brewing.mix(selectedIngredient, selected.stack);
        if (expectedResultSelector != null
          && !InventoryServiceImpl.matches(
          expected,
          expectedResultSelector
        )) {
          throw Status.FAILED_PRECONDITION
            .withDescription(
              "Predicted brewing output does not match expected_result"
            )
            .asRuntimeException();
        }
        expectedOutputs.add(expected.copy());
        moveOne(menu, selected.slot, index);
      }
      transition(Stage.LOAD_INGREDIENT, "Loading brewing ingredient");
    }

    private List<SourceStack> findCompatibleInputs(
      BrewingStandMenu menu,
      PotionBrewing brewing,
      ItemStack ingredient
    ) {
      return playerSlots(menu)
        .mapToObj(slot -> new SourceStack(
          slot,
          menu.getSlot(slot).getItem().copy()
        ))
        .filter(source -> InventoryServiceImpl.matches(
          source.stack,
          inputSelector
        ))
        .filter(source -> brewing.hasMix(source.stack, ingredient))
        .filter(source -> expectedResultSelector == null
          || InventoryServiceImpl.matches(
          brewing.mix(ingredient, source.stack),
          expectedResultSelector
        ))
        .limit(MAX_BATCH_SIZE)
        .toList();
    }

    private void loadIngredient() {
      var menu = requireBrewingMenu();
      if (!menu.getSlot(3).getItem().isEmpty()) {
        transition(Stage.LOAD_FUEL, "Checking brewing fuel");
        return;
      }
      var brewing = potionBrewing();
      var source = playerSlots(menu)
        .filter(slot -> {
          var ingredient = menu.getSlot(slot).getItem();
          if (!InventoryServiceImpl.matches(
            ingredient,
            ingredientSelector
          ) || !brewing.isIngredient(ingredient)
            || !ItemStack.isSameItemSameComponents(
              ingredient,
              selectedIngredient
            )) {
            return false;
          }
          for (var bottle = 0; bottle < activeBatchSize; bottle++) {
            if (!brewing.hasMix(menu.getSlot(bottle).getItem(), ingredient)) {
              return false;
            }
          }
          return true;
        })
        .findFirst()
        .orElseThrow(() -> Status.FAILED_PRECONDITION
          .withDescription("No compatible brewing ingredient remains")
          .asRuntimeException());
      moveOne(menu, source, 3);
      transition(Stage.LOAD_FUEL, "Checking brewing fuel");
    }

    private void loadFuel() {
      var menu = requireBrewingMenu();
      if (menu.getFuel() > 0) {
        transition(Stage.WAIT_FOR_OUTPUT, "Brewing");
        return;
      }
      if (!menu.getSlot(4).getItem().isEmpty()) {
        transition(Stage.WAIT_FOR_OUTPUT, "Brewing");
        return;
      }
      var source = playerSlots(menu)
        .filter(slot -> {
          var stack = menu.getSlot(slot).getItem();
          return stack.is(Items.BLAZE_POWDER)
            && (fuelSelector == null
            || InventoryServiceImpl.matches(stack, fuelSelector));
        })
        .findFirst()
        .orElseThrow(() -> Status.FAILED_PRECONDITION
          .withDescription("No matching blaze powder remains")
          .asRuntimeException());
      moveOne(menu, source, 4);
      transition(Stage.WAIT_FOR_OUTPUT, "Brewing");
    }

    private void waitForOutput() {
      var menu = requireBrewingMenu();
      var complete = true;
      for (var index = 0; index < activeBatchSize; index++) {
        if (!ItemStack.isSameItemSameComponents(
          menu.getSlot(index).getItem(),
          expectedOutputs.get(index)
        )) {
          complete = false;
          break;
        }
      }
      if (complete) {
        transition(Stage.TAKE_OUTPUT, "Collecting brewed potions");
        return;
      }
      stageTicks++;
      if (stageTicks > BREW_TIMEOUT_TICKS) {
        throw Status.DEADLINE_EXCEEDED
          .withDescription("Timed out waiting for brewing output")
          .asRuntimeException();
      }
    }

    private void takeOutput() {
      var menu = requireBrewingMenu();
      var stack = menu.getSlot(outputIndex).getItem();
      if (!ItemStack.isSameItemSameComponents(
        stack,
        expectedOutputs.get(outputIndex)
      )) {
        throw Status.FAILED_PRECONDITION
          .withDescription("Brewing output changed before collection")
          .asRuntimeException();
      }
      outputs.add(stack.copy());
      Objects.requireNonNull(context.bot().minecraft().gameMode)
        .handleContainerInput(
          menu.containerId,
          outputIndex,
          0,
          ContainerInput.PICKUP,
          requirePlayer()
        );
      transition(Stage.DEPOSIT_OUTPUT, "Storing brewed potion");
    }

    private void depositOutput() {
      var menu = requireBrewingMenu();
      var carried = menu.getCarried();
      if (carried.isEmpty()) {
        outputIndex++;
        if (outputIndex < activeBatchSize) {
          transition(Stage.TAKE_OUTPUT, "Collecting brewed potion");
          return;
        }
        operationsCompleted += activeBatchSize;
        transition(
          operationsCompleted >= targetCount
            ? Stage.WAIT_FOR_OUTPUT
            : Stage.LOAD_BOTTLES,
          operationsCompleted >= targetCount
            ? "Brewing complete"
            : "Loading next potion batch"
        );
        return;
      }
      var target = playerSlots(menu)
        .filter(slot -> canDeposit(menu, slot, carried))
        .findFirst();
      if (target.isEmpty()) {
        throw Status.RESOURCE_EXHAUSTED
          .withDescription("Inventory has no room for brewed potion")
          .asRuntimeException();
      }
      Objects.requireNonNull(context.bot().minecraft().gameMode)
        .handleContainerInput(
          menu.containerId,
          target.getAsInt(),
          0,
          ContainerInput.PICKUP,
          requirePlayer()
        );
      stageTicks++;
      if (stageTicks > MENU_TIMEOUT_TICKS) {
        throw Status.DEADLINE_EXCEEDED
          .withDescription("Timed out storing brewed potion")
          .asRuntimeException();
      }
    }

    private void moveOne(
      BrewingStandMenu menu,
      int source,
      int destination
    ) {
      var player = requirePlayer();
      var gameMode = Objects.requireNonNull(
        context.bot().minecraft().gameMode
      );
      gameMode.handleContainerInput(
        menu.containerId,
        source,
        0,
        ContainerInput.PICKUP,
        player
      );
      gameMode.handleContainerInput(
        menu.containerId,
        destination,
        1,
        ContainerInput.PICKUP,
        player
      );
      if (!menu.getCarried().isEmpty()) {
        gameMode.handleContainerInput(
          menu.containerId,
          source,
          0,
          ContainerInput.PICKUP,
          player
        );
      }
    }

    private static java.util.stream.IntStream playerSlots(
      BrewingStandMenu menu
    ) {
      return AutomationInventory.playerInventorySlots(menu);
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

    private PotionBrewing potionBrewing() {
      return Objects.requireNonNull(context.bot().minecraft().level)
        .potionBrewing();
    }

    private BrewingStandMenu requireBrewingMenu() {
      var menu = requirePlayer().containerMenu;
      if (menu instanceof BrewingStandMenu brewingMenu) {
        return brewingMenu;
      }
      throw Status.FAILED_PRECONDITION
        .withDescription("The brewing stand menu was closed")
        .asRuntimeException();
    }

    private net.minecraft.client.player.LocalPlayer requirePlayer() {
      return Objects.requireNonNull(context.bot().minecraft().player);
    }

    private void transition(Stage next, String message) {
      stage = next;
      stageTicks = 0;
      context.reportProgress(progress(message));
    }

    private BotTaskProgress progress(String message) {
      return BotTaskProgress.newBuilder()
        .setMessage(message)
        .setCurrent(operationsCompleted)
        .setTotal(targetCount)
        .setFraction(Math.min(
          1.0,
          (double) operationsCompleted / targetCount
        ))
        .build();
    }

    private void complete() {
      result.complete(BrewTaskResult.newBuilder()
        .addAllOutputs(outputs.stream()
          .map(MinecraftDomainMapper::item)
          .toList())
        .build());
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
      return "Brew potions";
    }
  }

  private record SourceStack(int slot, ItemStack stack) {
  }

  private record BatchSelection(
    ItemStack ingredient,
    List<SourceStack> inputs
  ) {
  }

  private enum Stage {
    NAVIGATE,
    OPEN_MENU,
    VALIDATE_MENU,
    LOAD_BOTTLES,
    LOAD_INGREDIENT,
    LOAD_FUEL,
    WAIT_FOR_OUTPUT,
    TAKE_OUTPUT,
    DEPOSIT_OUTPUT
  }
}
