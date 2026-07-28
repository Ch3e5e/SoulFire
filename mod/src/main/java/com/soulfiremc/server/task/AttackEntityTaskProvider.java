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

import com.soulfiremc.grpc.generated.AttackEntityCompletionReason;
import com.soulfiremc.grpc.generated.AttackEntityTask;
import com.soulfiremc.grpc.generated.AttackEntityTaskResult;
import com.soulfiremc.grpc.generated.BotTaskProgress;
import com.soulfiremc.grpc.generated.EntityReference;
import com.soulfiremc.grpc.generated.ItemSelector;
import com.soulfiremc.grpc.generated.PathfindGoal;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.grpc.InventoryServiceImpl;
import com.soulfiremc.server.pathfinding.PathfindingSupport;
import com.soulfiremc.server.pathfinding.execution.PathExecutor;
import com.soulfiremc.server.util.SFItemHelpers;
import io.grpc.Status;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/// Core provider for chasing and attacking one entity until a terminal policy
/// is reached.
public final class AttackEntityTaskProvider
  implements BotTaskProvider<AttackEntityTask> {
  private static final int DEFAULT_UNAVAILABLE_TIMEOUT_SECONDS = 10;
  private static final int MAX_UNAVAILABLE_TIMEOUT_SECONDS = 3_600;
  private static final int MAX_CONSECUTIVE_PATH_FAILURES = 3;
  private static final float DEFAULT_ATTACK_RANGE = 3.0F;
  private static final float MAX_ATTACK_RANGE = 6.0F;
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY
  );

  @Override
  public AttackEntityTask inputPrototype() {
    return AttackEntityTask.getDefaultInstance();
  }

  @Override
  public String summary(AttackEntityTask input) {
    return "Attack entity " + input.getTarget().getNetworkId();
  }

  @Override
  public Set<ControlResource> resources(AttackEntityTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(
    BotTaskContext context,
    AttackEntityTask input
  ) {
    if (!input.hasTarget()) {
      throw Status.INVALID_ARGUMENT
        .withDescription("target is required")
        .asRuntimeException();
    }
    var target = input.getTarget();
    BotTaskSupport.requireEntity(context.bot(), target);
    var attackRange = normalizeAttackRange(input.getAttackRange());
    var goal = PathfindGoal.newBuilder()
      .setEntity(PathfindGoal.EntityGoal.newBuilder()
        .setEntityId(target.getNetworkId())
        .setConnectionEpoch(target.getConnectionEpoch())
        .setRadius(attackRange))
      .build();
    var resolved = PathfindingSupport.resolveGoal(context.bot(), goal);
    var constraint = PathfindingSupport.buildConstraint(
      context.bot(),
      input.getOptions()
    );
    var timeoutSeconds = input.getTargetUnavailableTimeoutSeconds() == 0
      ? DEFAULT_UNAVAILABLE_TIMEOUT_SECONDS
      : Math.min(
        input.getTargetUnavailableTimeoutSeconds(),
        MAX_UNAVAILABLE_TIMEOUT_SECONDS
      );
    var result = new CompletableFuture<AttackEntityTaskResult>();
    var control = new AttackControl(
      context,
      target,
      attackRange,
      input.getSprinting(),
      input.getMaximumAttacks(),
      timeoutSeconds * 20,
      !input.hasSelectBestWeapon() || input.getSelectBestWeapon(),
      input.hasWeapon() ? input.getWeapon() : null,
      input.getRestoreSelectedSlot(),
      resolved,
      constraint,
      result
    );
    return new BotTaskExecution(control, result);
  }

  private static float normalizeAttackRange(float value) {
    if (!Float.isFinite(value) || value < 0) {
      throw Status.INVALID_ARGUMENT
        .withDescription("attack_range must be finite and non-negative")
        .asRuntimeException();
    }
    if (value == 0) {
      return DEFAULT_ATTACK_RANGE;
    }
    if (value > MAX_ATTACK_RANGE) {
      throw Status.INVALID_ARGUMENT
        .withDescription("attack_range must not exceed 6 blocks")
        .asRuntimeException();
    }
    return value;
  }

  private static final class AttackControl implements ControlTask {
    private final BotTaskContext context;
    private final EntityReference target;
    private final float attackRange;
    private final boolean sprinting;
    private final int maximumAttacks;
    private final int unavailableTimeoutTicks;
    private final boolean selectBestWeapon;
    private final @Nullable ItemSelector weaponSelector;
    private final boolean restoreSelectedSlot;
    private final int originalSelectedSlot;
    private final PathfindingSupport.ResolvedGoal goal;
    private final com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint
      constraint;
    private final CompletableFuture<AttackEntityTaskResult> result;
    private @Nullable PathExecutor path;
    private int unavailableTicks;
    private int consecutivePathFailures;
    private int attacks;
    private int ticks;
    private boolean lastObservedAlive;

    private AttackControl(
      BotTaskContext context,
      EntityReference target,
      float attackRange,
      boolean sprinting,
      int maximumAttacks,
      int unavailableTimeoutTicks,
      boolean selectBestWeapon,
      @Nullable ItemSelector weaponSelector,
      boolean restoreSelectedSlot,
      PathfindingSupport.ResolvedGoal goal,
      com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint
        constraint,
      CompletableFuture<AttackEntityTaskResult> result
    ) {
      this.context = context;
      this.target = target;
      this.attackRange = attackRange;
      this.sprinting = sprinting;
      this.maximumAttacks = maximumAttacks;
      this.unavailableTimeoutTicks = unavailableTimeoutTicks;
      this.selectBestWeapon = selectBestWeapon;
      this.weaponSelector = weaponSelector;
      this.restoreSelectedSlot = restoreSelectedSlot;
      this.originalSelectedSlot = Objects.requireNonNull(
        context.bot().minecraft().player
      ).getInventory().getSelectedSlot();
      this.goal = goal;
      this.constraint = constraint;
      this.result = result;
    }

    @Override
    public void tick() {
      if (result.isDone()) {
        return;
      }
      ticks++;
      var bot = context.bot();
      var player = Objects.requireNonNull(
        bot.minecraft().player,
        "Bot player is not available"
      );
      var gameMode = Objects.requireNonNull(
        bot.minecraft().gameMode,
        "Bot game mode is not available"
      );
      var entity = BotTaskSupport.findEntity(bot, target.getNetworkId());
      if (entity == null
        || target.hasUuid()
        && !target.getUuid().equals(entity.getUUID().toString())) {
        stopPath(ControlStopReason.CANCELLED, null);
        unavailableTicks++;
        reportUnavailable();
        if (unavailableTicks >= unavailableTimeoutTicks) {
          complete(
            AttackEntityCompletionReason
              .ATTACK_ENTITY_COMPLETION_REASON_TARGET_UNAVAILABLE,
            lastObservedAlive
          );
        }
        return;
      }

      unavailableTicks = 0;
      lastObservedAlive = entity.isAlive();
      if (!lastObservedAlive) {
        stopPath(ControlStopReason.COMPLETED, null);
        complete(
          AttackEntityCompletionReason
            .ATTACK_ENTITY_COMPLETION_REASON_TARGET_DEFEATED,
          false
        );
        return;
      }

      var visiblePoint = entity.getEyePosition();
      var distance = visiblePoint.distanceTo(player.getEyePosition());
      if (ticks % 20 == 0) {
        context.reportProgress(BotTaskProgress.newBuilder()
          .setMessage(distance <= attackRange
            ? "Attacking entity"
            : "Chasing entity")
          .setCurrent(attacks)
          .build());
      }
      if (distance > attackRange) {
        continuePath();
        return;
      }

      consecutivePathFailures = 0;
      stopPath(ControlStopReason.CANCELLED, null);
      bot.controlState().resetAll();
      if (!ensureBestWeapon()) {
        return;
      }
      bot.rotationControl().lookAt(visiblePoint);
      if (player.getAttackStrengthScale(0) < 1.0F
        || !bot.rotationControl().isFacing(visiblePoint)) {
        return;
      }
      var wasSprinting = player.isSprinting();
      player.setSprinting(sprinting);
      try {
        gameMode.attack(player, entity);
        player.swing(InteractionHand.MAIN_HAND);
      } finally {
        player.setSprinting(wasSprinting);
      }
      attacks++;
      if (maximumAttacks > 0 && attacks >= maximumAttacks) {
        complete(
          AttackEntityCompletionReason
            .ATTACK_ENTITY_COMPLETION_REASON_ATTACK_LIMIT_REACHED,
          entity.isAlive()
        );
      }
    }

    private void continuePath() {
      if (path != null && path.completion().isDone()) {
        finishPath();
      }
      if (result.isDone()) {
        return;
      }
      if (path == null) {
        path = PathExecutor.createPathfinding(
          context.bot(),
          goal.scorer(),
          constraint
        );
        path.onStarted();
      }
      path.tick();
    }

    private void finishPath() {
      var completed = path;
      path = null;
      if (completed == null) {
        return;
      }
      try {
        completed.completion().join();
        completed.onStopped(ControlStopReason.COMPLETED, null);
        consecutivePathFailures = 0;
      } catch (CompletionException exception) {
        var cause = Objects.requireNonNullElse(
          exception.getCause(),
          exception
        );
        completed.onStopped(ControlStopReason.FAILED, cause);
        consecutivePathFailures++;
        if (consecutivePathFailures >= MAX_CONSECUTIVE_PATH_FAILURES) {
          result.completeExceptionally(new IllegalStateException(
            "Unable to reach the target entity after "
              + consecutivePathFailures + " path attempts",
            cause
          ));
        }
      }
    }

    private void reportUnavailable() {
      if (ticks % 20 != 0) {
        return;
      }
      context.reportProgress(BotTaskProgress.newBuilder()
        .setMessage("Waiting for target entity to become observable")
        .setCurrent(unavailableTicks)
        .setTotal(unavailableTimeoutTicks)
        .setFraction(Math.min(
          1.0,
          (double) unavailableTicks / unavailableTimeoutTicks
        ))
        .build());
    }

    private void complete(
      AttackEntityCompletionReason reason,
      boolean targetAlive
    ) {
      result.complete(AttackEntityTaskResult.newBuilder()
        .setFinalPosition(BotTaskSupport.position(context.bot()))
        .setReason(reason)
        .setAttacks(attacks)
        .setTargetAlive(targetAlive)
        .build());
    }

    private boolean ensureBestWeapon() {
      if (!selectBestWeapon) {
        return true;
      }
      var player = Objects.requireNonNull(context.bot().minecraft().player);
      var best = TaskInventorySupport.playerInventorySlots(
          player.inventoryMenu
        )
        .mapToObj(slot -> player.inventoryMenu.getSlot(slot).getItem())
        .filter(stack -> weaponSelector == null
          || InventoryServiceImpl.matches(stack, weaponSelector))
        .filter(stack -> SFItemHelpers.meleeWeaponStats(stack).isPresent())
        .max((left, right) -> Double.compare(
          weaponScore(left),
          weaponScore(right)
        ));
      if (best.isEmpty()) {
        if (weaponSelector != null) {
          throw Status.FAILED_PRECONDITION
            .withDescription("No matching melee weapon is available")
            .asRuntimeException();
        }
        return true;
      }
      var selected = best.orElseThrow().copy();
      return TaskInventorySupport.ensureHolding(
        context.bot(),
        stack -> ItemStack.isSameItemSameComponents(stack, selected)
      );
    }

    private static double weaponScore(ItemStack stack) {
      var base = SFItemHelpers.meleeWeaponStats(stack)
        .orElseThrow()
        .score();
      if (!stack.isDamageableItem()) {
        return base;
      }
      var remaining = stack.getMaxDamage() - stack.getDamageValue();
      return base + (double) remaining / stack.getMaxDamage();
    }

    private void stopPath(
      ControlStopReason reason,
      @Nullable Throwable cause
    ) {
      var active = path;
      path = null;
      if (active != null) {
        active.onStopped(reason, cause);
      }
    }

    @Override
    public boolean isDone() {
      return result.isDone();
    }

    @Override
    public Set<ControlResource> resources() {
      return RESOURCES;
    }

    @Override
    public void onSuspended() {
      if (path != null) {
        path.onSuspended();
      }
    }

    @Override
    public void onResumed() {
      if (path != null) {
        path.onResumed();
      }
    }

    @Override
    public void onStopped(
      ControlStopReason reason,
      @Nullable Throwable cause
    ) {
      stopPath(reason, cause);
      context.bot().controlState().resetAll();
      var player = context.bot().minecraft().player;
      if (restoreSelectedSlot && player != null) {
        player.getInventory().setSelectedSlot(originalSelectedSlot);
      }
      if (reason != ControlStopReason.COMPLETED && !result.isDone()) {
        result.cancel(true);
      }
    }

    @Override
    public String description() {
      return "Attack entity " + target.getNetworkId();
    }
  }
}
