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

import com.soulfiremc.grpc.generated.AutoEatCompletionReason;
import com.soulfiremc.grpc.generated.AutoEatTask;
import com.soulfiremc.grpc.generated.AutoEatTaskResult;
import com.soulfiremc.grpc.generated.BotTaskProgress;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.bot.CompletableControlTask;
import com.soulfiremc.server.bot.ControlPriority;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.util.SFInventoryHelpers;
import com.soulfiremc.server.util.SFItemHelpers;
import io.grpc.Status;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.InventoryMenu;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.ArrayList;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/// Core resource-aware automatic eating provider.
public final class AutoEatTaskProvider
  implements BotTaskProvider<AutoEatTask> {
  private static final int DEFAULT_FOOD_LEVEL = 14;
  private static final int DEFAULT_CHECK_INTERVAL_TICKS = 20;
  private static final int MAX_CHECK_INTERVAL_TICKS = 1_200;
  private static final int MAX_FAILED_MEAL_ATTEMPTS = 3;
  private static final long CONSUMPTION_CONFIRMATION_GRACE_MILLIS = 1_000L;
  // Monitoring does not own a mutable bot resource. Each meal claims only
  // the hand and inventory resources it needs while it is being consumed.
  private static final Set<ControlResource> TASK_RESOURCES = Set.of();
  private static final Set<ControlResource> EAT_RESOURCES = Set.of(
    ControlResource.MAIN_HAND,
    ControlResource.OFF_HAND,
    ControlResource.INVENTORY,
    ControlResource.CONTAINER
  );

  @Override
  public AutoEatTask inputPrototype() {
    return AutoEatTask.getDefaultInstance();
  }

  @Override
  public String summary(AutoEatTask input) {
    return input.getMaximumMeals() == 0
      ? "Automatically eat when hungry"
      : "Eat up to " + input.getMaximumMeals() + " meals when hungry";
  }

  @Override
  public Set<ControlResource> resources(AutoEatTask input) {
    return TASK_RESOURCES;
  }

  @Override
  public BotTaskExecution start(
    BotTaskContext context,
    AutoEatTask input
  ) {
    var foodLevel = input.getFoodLevel() == 0
      ? DEFAULT_FOOD_LEVEL
      : Math.min(input.getFoodLevel(), 20);
    var interval = input.getCheckIntervalTicks() == 0
      ? DEFAULT_CHECK_INTERVAL_TICKS
      : Math.min(
        input.getCheckIntervalTicks(),
        MAX_CHECK_INTERVAL_TICKS
      );
    var result = new CompletableFuture<AutoEatTaskResult>();
    var control = new AutoEatControl(
      context,
      Set.copyOf(input.getFoodItemIdsList()),
      foodLevel,
      interval,
      input.getMaximumMeals(),
      input.getCompleteWhenNoFood(),
      input.getRestoreSelectedSlot(),
      result
    );
    return new BotTaskExecution(control, result);
  }

  private static final class AutoEatControl implements ControlTask {
    private final BotTaskContext context;
    private final Set<String> foodItemIds;
    private final int foodLevel;
    private final int checkIntervalTicks;
    private final int maximumMeals;
    private final boolean completeWhenNoFood;
    private final boolean restoreSelectedSlot;
    private final CompletableFuture<AutoEatTaskResult> result;
    private @Nullable CompletableControlTask activeMeal;
    private int mealsEaten;
    private int failedMealAttempts;
    private int ticks;

    private AutoEatControl(
      BotTaskContext context,
      Set<String> foodItemIds,
      int foodLevel,
      int checkIntervalTicks,
      int maximumMeals,
      boolean completeWhenNoFood,
      boolean restoreSelectedSlot,
      CompletableFuture<AutoEatTaskResult> result
    ) {
      this.context = context;
      this.foodItemIds = foodItemIds;
      this.foodLevel = foodLevel;
      this.checkIntervalTicks = checkIntervalTicks;
      this.maximumMeals = maximumMeals;
      this.completeWhenNoFood = completeWhenNoFood;
      this.restoreSelectedSlot = restoreSelectedSlot;
      this.result = result;
    }

    @Override
    public void tick() {
      if (result.isDone()) {
        return;
      }
      ticks++;
      if (finishActiveMeal()) {
        return;
      }
      if (activeMeal != null || ticks % checkIntervalTicks != 0) {
        return;
      }

      var bot = context.bot();
      var player = bot.minecraft().player;
      var gameMode = bot.minecraft().gameMode;
      if (player == null || gameMode == null) {
        return;
      }
      if (player.isDeadOrDying()) {
        return;
      }
      var currentFood = player.getFoodData().getFoodLevel();
      context.reportProgress(BotTaskProgress.newBuilder()
        .setMessage(currentFood <= foodLevel
          ? "Looking for food"
          : "Monitoring hunger")
        .setCurrent(mealsEaten)
        .build());
      if (currentFood > foodLevel) {
        if (maximumMeals > 0) {
          complete(
            AutoEatCompletionReason
              .AUTO_EAT_COMPLETION_REASON_FOOD_LEVEL_REACHED
          );
        }
        return;
      }
      if (player.hasContainerOpen()) {
        return;
      }

      var menu = player.inventoryMenu;
      var slot = SFInventoryHelpers.findMatchingSlotForAction(
        player.getInventory(),
        menu,
        stack -> SFItemHelpers.isGoodEdibleFood(stack)
          && (foodItemIds.isEmpty()
          || foodItemIds.contains(stack.typeHolder().getRegisteredName()))
      );
      if (slot.isEmpty()) {
        if (completeWhenNoFood) {
          complete(AutoEatCompletionReason.AUTO_EAT_COMPLETION_REASON_NO_FOOD);
        }
        return;
      }

      var meal = new CompletableControlTask(createMeal(
        context,
        slot.getAsInt(),
        restoreSelectedSlot
      ));
      if (bot.botControl().submit(meal)) {
        activeMeal = meal;
      }
    }

    private boolean finishActiveMeal() {
      var meal = activeMeal;
      if (meal == null || !meal.completion().isDone()) {
        return false;
      }
      activeMeal = null;
      if (meal.completion().isCompletedExceptionally()) {
        failedMealAttempts++;
        if (failedMealAttempts >= MAX_FAILED_MEAL_ATTEMPTS) {
          result.completeExceptionally(
            Status.FAILED_PRECONDITION
              .withDescription(
                "Food use completed without a confirmed meal"
              )
              .asRuntimeException()
          );
        }
        return true;
      }
      if (meal.completion().join() == ControlStopReason.COMPLETED) {
        failedMealAttempts = 0;
        mealsEaten++;
        if (maximumMeals > 0 && mealsEaten >= maximumMeals) {
          complete(
            AutoEatCompletionReason
              .AUTO_EAT_COMPLETION_REASON_MEAL_LIMIT_REACHED
          );
          return true;
        }
      }
      return false;
    }

    private void complete(AutoEatCompletionReason reason) {
      var player = context.bot().minecraft().player;
      result.complete(AutoEatTaskResult.newBuilder()
        .setReason(reason)
        .setMealsEaten(mealsEaten)
        .setFinalFoodLevel(player == null
          ? 0
          : player.getFoodData().getFoodLevel())
        .build());
    }

    @Override
    public boolean isDone() {
      return result.isDone();
    }

    @Override
    public Set<ControlResource> resources() {
      return TASK_RESOURCES;
    }

    @Override
    public void onStopped(
      ControlStopReason reason,
      @Nullable Throwable cause
    ) {
      var meal = activeMeal;
      activeMeal = null;
      if (meal != null) {
        context.bot().botControl().cancel(meal);
      }
      if (reason != ControlStopReason.COMPLETED && !result.isDone()) {
        result.cancel(true);
      }
    }

    @Override
    public String description() {
      return "Auto eat";
    }
  }

  private static ControlTask createMeal(
    BotTaskContext context,
    int slot,
    boolean restoreSelectedSlot
  ) {
    var bot = context.bot();
    var player = bot.minecraft().player;
    var gameMode = bot.minecraft().gameMode;
    if (player == null || gameMode == null) {
      return ControlTask.once("Auto eat unavailable", EAT_RESOURCES, () -> {
        throw new IllegalStateException("Bot player or game mode is unavailable");
      });
    }
    var originalHotbar = player.getInventory().getSelectedSlot();
    var stack = player.inventoryMenu.getSlot(slot).getItem();
    var initialFoodLevel = player.getFoodData().getFoodLevel();
    var consumable = stack.get(DataComponents.CONSUMABLE);
    var consumeMillis = consumable == null
      ? 2_000L
      : Math.max(250L, Math.round(consumable.consumeSeconds() * 1_000));
    var steps = new ArrayList<ControlTask.Step>();
    var swappedFromInventory = false;
    var selectedDifferentHotbar = false;
    InteractionHand hand;
    if (slot == SFInventoryHelpers.getSelectedSlot(player.getInventory())) {
      hand = InteractionHand.MAIN_HAND;
    } else if (slot == InventoryMenu.SHIELD_SLOT) {
      hand = InteractionHand.OFF_HAND;
    } else if (SFInventoryHelpers.isSelectableHotbarSlot(slot)) {
      hand = InteractionHand.MAIN_HAND;
      selectedDifferentHotbar = true;
      steps.add(ControlTask.action(() ->
        player.getInventory().setSelectedSlot(
          SFInventoryHelpers.toHotbarIndex(slot)
        )));
      steps.add(ControlTask.waitMillis(50L));
    } else {
      hand = InteractionHand.MAIN_HAND;
      swappedFromInventory = true;
      steps.add(ControlTask.action(player::sendOpenInventory));
      steps.add(ControlTask.action(() -> click(context, slot)));
      steps.add(ControlTask.waitMillis(50L));
      steps.add(ControlTask.action(() ->
        click(
          context,
          SFInventoryHelpers.getSelectedSlot(player.getInventory())
        )));
      steps.add(ControlTask.waitMillis(50L));
      steps.add(ControlTask.action(() -> {
        if (!player.inventoryMenu.getCarried().isEmpty()) {
          click(context, slot);
        }
      }));
      steps.add(ControlTask.waitMillis(50L));
      steps.add(ControlTask.action(player::closeContainer));
      steps.add(ControlTask.waitMillis(50L));
    }
    steps.add(ControlTask.action(() ->
      bot.minecraft().options.keyUse.setDown(true)));
    steps.add(ControlTask.action(() -> {
      if (!(gameMode.useItem(player, hand) instanceof InteractionResult.Success)) {
        throw new IllegalStateException(
          "The selected meal could not be used"
        );
      }
    }));
    steps.add(ControlTask.waitMillis(
      consumeMillis + CONSUMPTION_CONFIRMATION_GRACE_MILLIS
    ));
    steps.add(ControlTask.action(() -> {
      if (
        bot.minecraft().player != player
          || player.isDeadOrDying()
          || player.getFoodData().getFoodLevel() <= initialFoodLevel
      ) {
        if (player.isUsingItem()) {
          gameMode.releaseUsingItem(player);
        }
        throw new IllegalStateException(
          player.isDeadOrDying() || bot.minecraft().player != player
            ? "Player died or respawned before the meal was confirmed"
            : "Food level did not increase after using the selected meal"
        );
      }
    }));
    if (restoreSelectedSlot && swappedFromInventory) {
      steps.add(ControlTask.action(player::sendOpenInventory));
      steps.add(ControlTask.action(() -> click(context, slot)));
      steps.add(ControlTask.waitMillis(50L));
      steps.add(ControlTask.action(() ->
        click(
          context,
          SFInventoryHelpers.getSelectedSlot(player.getInventory())
        )));
      steps.add(ControlTask.waitMillis(50L));
      steps.add(ControlTask.action(() -> {
        if (!player.inventoryMenu.getCarried().isEmpty()) {
          click(context, slot);
        }
      }));
      steps.add(ControlTask.waitMillis(50L));
      steps.add(ControlTask.action(player::closeContainer));
    } else if (restoreSelectedSlot && selectedDifferentHotbar) {
      steps.add(ControlTask.action(() ->
        player.getInventory().setSelectedSlot(originalHotbar)));
    }
    return new HeldUseControlTask(
      bot,
      ControlTask.sequence(
        "SDK auto eat meal",
        ControlPriority.HIGH,
        EAT_RESOURCES,
        steps
      )
    );
  }

  private static final class HeldUseControlTask implements ControlTask {
    private final BotConnection bot;
    private final ControlTask delegate;
    private boolean cleanedUp;

    private HeldUseControlTask(
      BotConnection bot,
      ControlTask delegate
    ) {
      this.bot = bot;
      this.delegate = delegate;
    }

    @Override
    public void tick() {
      try {
        delegate.tick();
      } catch (RuntimeException | Error cause) {
        cleanUp();
        throw cause;
      }
      if (delegate.isDone()) {
        cleanUp();
      }
    }

    @Override
    public boolean isDone() {
      return delegate.isDone();
    }

    @Override
    public ControlPriority priority() {
      return delegate.priority();
    }

    @Override
    public Set<ControlResource> resources() {
      return delegate.resources();
    }

    @Override
    public void onStopped(
      ControlStopReason reason,
      @Nullable Throwable cause
    ) {
      try {
        delegate.onStopped(reason, cause);
      } finally {
        cleanUp();
      }
    }

    @Override
    public @Nullable String description() {
      return delegate.description();
    }

    private void cleanUp() {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      bot.minecraft().options.keyUse.setDown(false);
      var player = bot.minecraft().player;
      var gameMode = bot.minecraft().gameMode;
      if (player != null && gameMode != null && player.isUsingItem()) {
        gameMode.releaseUsingItem(player);
      }
    }
  }

  private static void click(BotTaskContext context, int slot) {
    var player = context.bot().minecraft().player;
    var gameMode = context.bot().minecraft().gameMode;
    if (player == null || gameMode == null) {
      throw new IllegalStateException("Bot player or game mode is unavailable");
    }
    gameMode.handleContainerInput(
      player.inventoryMenu.containerId,
      slot,
      0,
      ContainerInput.PICKUP,
      player
    );
  }
}
