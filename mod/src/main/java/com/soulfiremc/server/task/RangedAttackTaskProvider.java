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
import com.soulfiremc.grpc.generated.EntityReference;
import com.soulfiremc.grpc.generated.ItemSelector;
import com.soulfiremc.grpc.generated.PathfindGoal;
import com.soulfiremc.grpc.generated.RangedAttackCompletionReason;
import com.soulfiremc.grpc.generated.RangedAttackTask;
import com.soulfiremc.grpc.generated.RangedAttackTaskResult;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.automation.AutomationInventory;
import com.soulfiremc.server.bot.ControlPriority;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.grpc.InventoryServiceImpl;
import com.soulfiremc.server.pathfinding.PathfindingSupport;
import com.soulfiremc.server.pathfinding.execution.PathExecutor;
import com.soulfiremc.server.plugins.KillAura;
import io.grpc.Status;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.CrossbowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ProjectileWeaponItem;
import net.minecraft.world.phys.Vec3;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.Comparator;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/// Server-timed bow and crossbow combat with dynamic pathfinding, target
/// leading, and low-arc projectile compensation.
public final class RangedAttackTaskProvider
  implements BotTaskProvider<RangedAttackTask> {
  private static final float DEFAULT_MINIMUM_RANGE = 8;
  private static final float DEFAULT_MAXIMUM_RANGE = 24;
  private static final float MAXIMUM_ALLOWED_RANGE = 64;
  private static final int DEFAULT_UNAVAILABLE_TIMEOUT_SECONDS = 10;
  private static final int MAX_UNAVAILABLE_TIMEOUT_SECONDS = 3_600;
  private static final int DEFAULT_BOW_DRAW_TICKS = 20;
  private static final int MIN_BOW_DRAW_TICKS = 3;
  private static final int MAX_BOW_DRAW_TICKS = 20;
  private static final int MAX_CONSECUTIVE_PATH_FAILURES = 3;
  private static final double ARROW_GRAVITY = 0.05;
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY
  );

  @Override
  public RangedAttackTask inputPrototype() {
    return RangedAttackTask.getDefaultInstance();
  }

  @Override
  public String summary(RangedAttackTask input) {
    return "Ranged attack entity " + input.getTarget().getNetworkId();
  }

  @Override
  public Set<ControlResource> resources(RangedAttackTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(
    BotTaskContext context,
    RangedAttackTask input
  ) {
    if (!input.hasTarget()) {
      throw Status.INVALID_ARGUMENT
        .withDescription("target is required")
        .asRuntimeException();
    }
    BotTaskSupport.requireEntity(context.bot(), input.getTarget());
    var minimumRange = normalizeRange(
      input.getMinimumRange(),
      DEFAULT_MINIMUM_RANGE,
      "minimum_range"
    );
    var maximumRange = normalizeRange(
      input.getMaximumRange(),
      DEFAULT_MAXIMUM_RANGE,
      "maximum_range"
    );
    if (minimumRange >= maximumRange) {
      throw Status.INVALID_ARGUMENT
        .withDescription("minimum_range must be smaller than maximum_range")
        .asRuntimeException();
    }
    var bowDrawTicks = input.getBowDrawTicks() == 0
      ? DEFAULT_BOW_DRAW_TICKS
      : input.getBowDrawTicks();
    if (
      bowDrawTicks < MIN_BOW_DRAW_TICKS
        || bowDrawTicks > MAX_BOW_DRAW_TICKS
    ) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "bow_draw_ticks must be between %d and %d"
            .formatted(MIN_BOW_DRAW_TICKS, MAX_BOW_DRAW_TICKS)
        )
        .asRuntimeException();
    }
    var unavailableSeconds = input.getTargetUnavailableTimeoutSeconds() == 0
      ? DEFAULT_UNAVAILABLE_TIMEOUT_SECONDS
      : Math.min(
        input.getTargetUnavailableTimeoutSeconds(),
        MAX_UNAVAILABLE_TIMEOUT_SECONDS
      );
    var goal = PathfindGoal.newBuilder()
      .setEntity(PathfindGoal.EntityGoal.newBuilder()
        .setEntityId(input.getTarget().getNetworkId())
        .setConnectionEpoch(input.getTarget().getConnectionEpoch())
        .setRadius(Math.max(3, minimumRange * 0.75F)))
      .build();
    var result = new CompletableFuture<RangedAttackTaskResult>();
    return new BotTaskExecution(
      new RangedControl(
        context,
        input.getTarget(),
        minimumRange,
        maximumRange,
        input.getMaximumShots(),
        unavailableSeconds * 20,
        input.hasWeapon() ? input.getWeapon() : null,
        bowDrawTicks,
        input.getLeadTarget(),
        input.getCompensateGravity(),
        input.getStrafe(),
        input.getRestoreSelectedSlot(),
        PathfindingSupport.resolveGoal(context.bot(), goal),
        PathfindingSupport.buildConstraint(
          context.bot(),
          input.getOptions()
        ),
        result
      ),
      result
    );
  }

  private static float normalizeRange(
    float value,
    float defaultValue,
    String field
  ) {
    if (!Float.isFinite(value) || value < 0) {
      throw Status.INVALID_ARGUMENT
        .withDescription(field + " must be finite and non-negative")
        .asRuntimeException();
    }
    var normalized = value == 0 ? defaultValue : value;
    if (normalized > MAXIMUM_ALLOWED_RANGE) {
      throw Status.INVALID_ARGUMENT
        .withDescription(field + " must not exceed 64 blocks")
        .asRuntimeException();
    }
    return normalized;
  }

  private static final class RangedControl implements ControlTask {
    private final BotTaskContext context;
    private final EntityReference target;
    private final float minimumRange;
    private final float maximumRange;
    private final int maximumShots;
    private final int unavailableTimeoutTicks;
    private final @Nullable ItemSelector weaponSelector;
    private final int bowDrawTicks;
    private final boolean leadTarget;
    private final boolean compensateGravity;
    private final boolean strafe;
    private final boolean restoreSelectedSlot;
    private final int originalSelectedSlot;
    private final PathfindingSupport.ResolvedGoal goal;
    private final com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint
      constraint;
    private final CompletableFuture<RangedAttackTaskResult> result;
    private @Nullable PathExecutor path;
    private int unavailableTicks;
    private int consecutivePathFailures;
    private int shots;
    private int ticks;
    private int cooldownTicks;
    private boolean strafeRight;
    private boolean lastObservedAlive;

    private RangedControl(
      BotTaskContext context,
      EntityReference target,
      float minimumRange,
      float maximumRange,
      int maximumShots,
      int unavailableTimeoutTicks,
      @Nullable ItemSelector weaponSelector,
      int bowDrawTicks,
      boolean leadTarget,
      boolean compensateGravity,
      boolean strafe,
      boolean restoreSelectedSlot,
      PathfindingSupport.ResolvedGoal goal,
      com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint
        constraint,
      CompletableFuture<RangedAttackTaskResult> result
    ) {
      this.context = context;
      this.target = target;
      this.minimumRange = minimumRange;
      this.maximumRange = maximumRange;
      this.maximumShots = maximumShots;
      this.unavailableTimeoutTicks = unavailableTimeoutTicks;
      this.weaponSelector = weaponSelector;
      this.bowDrawTicks = bowDrawTicks;
      this.leadTarget = leadTarget;
      this.compensateGravity = compensateGravity;
      this.strafe = strafe;
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
      if (cooldownTicks > 0) {
        cooldownTicks--;
      }
      try {
        var entity = observedTarget();
        if (entity == null) {
          unavailable();
          return;
        }
        unavailableTicks = 0;
        lastObservedAlive = entity.isAlive();
        if (!lastObservedAlive) {
          complete(
            RangedAttackCompletionReason
              .RANGED_ATTACK_COMPLETION_REASON_TARGET_DEFEATED,
            false
          );
          return;
        }
        engage(entity);
      } catch (Throwable throwable) {
        result.completeExceptionally(throwable);
      }
    }

    private @Nullable Entity observedTarget() {
      var entity = BotTaskSupport.findEntity(
        context.bot(),
        target.getNetworkId()
      );
      if (
        entity == null
          || target.hasUuid()
          && !target.getUuid().equals(entity.getUUID().toString())
      ) {
        return null;
      }
      return entity;
    }

    private void unavailable() {
      stopUsingItem();
      stopPath(ControlStopReason.CANCELLED, null);
      unavailableTicks++;
      if (ticks % 20 == 0) {
        context.reportProgress(BotTaskProgress.newBuilder()
          .setMessage("Waiting for ranged target to become observable")
          .setCurrent(unavailableTicks)
          .setTotal(unavailableTimeoutTicks)
          .setFraction(Math.min(
            1,
            (double) unavailableTicks / unavailableTimeoutTicks
          ))
          .build());
      }
      if (unavailableTicks >= unavailableTimeoutTicks) {
        complete(
          RangedAttackCompletionReason
            .RANGED_ATTACK_COMPLETION_REASON_TARGET_UNAVAILABLE,
          lastObservedAlive
        );
      }
    }

    private void engage(Entity entity) {
      var bot = context.bot();
      var player = Objects.requireNonNull(bot.minecraft().player);
      var visiblePoint = KillAura.getEntityVisiblePoint(bot, entity);
      var targetPoint = visiblePoint == null
        ? entity.getEyePosition()
        : visiblePoint;
      var distance = targetPoint.distanceTo(player.getEyePosition());
      if (distance > maximumRange || visiblePoint == null) {
        stopUsingItem();
        continuePath();
        report("Closing to ranged attack distance", distance);
        return;
      }

      stopPath(ControlStopReason.CANCELLED, null);
      consecutivePathFailures = 0;
      if (distance < minimumRange) {
        stopUsingItem();
        bot.controlState().resetAll();
        bot.rotationControl().lookAt(targetPoint);
        bot.controlState().down(true);
        if (strafe) {
          setStrafe();
        }
        report("Creating ranged attack distance", distance);
        return;
      }

      bot.controlState().resetAll();
      if (strafe) {
        setStrafe();
      }
      var weapon = ensureWeapon();
      if (weapon == null) {
        complete(
          RangedAttackCompletionReason
            .RANGED_ATTACK_COMPLETION_REASON_NO_WEAPON,
          true
        );
        return;
      }
      if (player.getProjectile(weapon).isEmpty()) {
        stopUsingItem();
        complete(
          RangedAttackCompletionReason
            .RANGED_ATTACK_COMPLETION_REASON_NO_AMMUNITION,
          true
        );
        return;
      }
      var velocity = projectileVelocity(weapon);
      var aimPoint = aimPoint(
        player.getEyePosition(),
        targetPoint,
        entity,
        velocity
      );
      bot.rotationControl().lookAt(aimPoint);
      report("Aiming ranged weapon", distance);
      if (!bot.rotationControl().isFacing(aimPoint)) {
        return;
      }
      if (weapon.getItem() instanceof CrossbowItem) {
        tickCrossbow(weapon);
      } else {
        tickBow();
      }
    }

    private @Nullable ItemStack ensureWeapon() {
      var player = Objects.requireNonNull(context.bot().minecraft().player);
      var selected = AutomationInventory.playerInventorySlots(
          player.inventoryMenu
        )
        .mapToObj(slot -> player.inventoryMenu.getSlot(slot).getItem())
        .filter(stack -> stack.getItem() instanceof ProjectileWeaponItem)
        .filter(stack -> weaponSelector == null
          || InventoryServiceImpl.matches(stack, weaponSelector))
        .max(Comparator.comparingDouble(
          RangedControl::weaponScore
        ));
      if (selected.isEmpty()) {
        return null;
      }
      var expected = selected.orElseThrow().copy();
      if (!AutomationInventory.ensureHolding(
        context.bot(),
        stack -> ItemStack.isSameItemSameComponents(stack, expected)
      )) {
        return null;
      }
      return player.getMainHandItem();
    }

    private static double weaponScore(ItemStack stack) {
      var range = stack.getItem() instanceof ProjectileWeaponItem weapon
        ? weapon.getDefaultProjectileRange()
        : 0;
      if (!stack.isDamageableItem()) {
        return range;
      }
      return range + (double) (
        stack.getMaxDamage() - stack.getDamageValue()
      ) / stack.getMaxDamage();
    }

    private void tickBow() {
      var player = Objects.requireNonNull(context.bot().minecraft().player);
      var gameMode = Objects.requireNonNull(
        context.bot().minecraft().gameMode
      );
      if (!player.isUsingItem()) {
        if (cooldownTicks == 0) {
          gameMode.useItem(player, InteractionHand.MAIN_HAND);
        }
        return;
      }
      if (player.getTicksUsingItem() < bowDrawTicks) {
        return;
      }
      gameMode.releaseUsingItem(player);
      releasedShot();
    }

    private void tickCrossbow(ItemStack weapon) {
      var player = Objects.requireNonNull(context.bot().minecraft().player);
      var gameMode = Objects.requireNonNull(
        context.bot().minecraft().gameMode
      );
      if (CrossbowItem.isCharged(weapon)) {
        if (cooldownTicks == 0) {
          gameMode.useItem(player, InteractionHand.MAIN_HAND);
          releasedShot();
        }
        return;
      }
      if (!player.isUsingItem()) {
        gameMode.useItem(player, InteractionHand.MAIN_HAND);
        return;
      }
      if (
        player.getTicksUsingItem()
          >= CrossbowItem.getChargeDuration(weapon, player)
      ) {
        gameMode.releaseUsingItem(player);
      }
    }

    private void releasedShot() {
      shots++;
      cooldownTicks = 5;
      context.reportProgress(BotTaskProgress.newBuilder()
        .setMessage("Released ranged shot")
        .setCurrent(shots)
        .build());
      if (maximumShots > 0 && shots >= maximumShots) {
        complete(
          RangedAttackCompletionReason
            .RANGED_ATTACK_COMPLETION_REASON_SHOT_LIMIT_REACHED,
          true
        );
      }
    }

    private double projectileVelocity(ItemStack weapon) {
      if (weapon.getItem() instanceof CrossbowItem) {
        return 3.15;
      }
      var draw = bowDrawTicks / 20.0;
      var power = Math.min(1, (draw * draw + 2 * draw) / 3);
      return 3 * power;
    }

    private Vec3 aimPoint(
      Vec3 origin,
      Vec3 targetPoint,
      Entity entity,
      double velocity
    ) {
      var target = targetPoint;
      var horizontal = Math.hypot(
        target.x - origin.x,
        target.z - origin.z
      );
      if (leadTarget && horizontal > 0) {
        var flightTicks = horizontal / velocity;
        target = target.add(entity.getDeltaMovement().scale(flightTicks));
        horizontal = Math.hypot(
          target.x - origin.x,
          target.z - origin.z
        );
      }
      if (!compensateGravity || horizontal < 0.001) {
        return target;
      }
      var height = target.y - origin.y;
      var speedSquared = velocity * velocity;
      var discriminant = speedSquared * speedSquared
        - ARROW_GRAVITY * (
          ARROW_GRAVITY * horizontal * horizontal
            + 2 * height * speedSquared
        );
      if (discriminant < 0) {
        return target;
      }
      var angle = Math.atan(
        (speedSquared - Math.sqrt(discriminant))
          / (ARROW_GRAVITY * horizontal)
      );
      var directionX = (target.x - origin.x) / horizontal;
      var directionZ = (target.z - origin.z) / horizontal;
      return origin.add(
        directionX * horizontal,
        Math.tan(angle) * horizontal,
        directionZ * horizontal
      );
    }

    private void setStrafe() {
      if (ticks % 40 == 0) {
        strafeRight = !strafeRight;
      }
      if (strafeRight) {
        context.bot().controlState().right(true);
      } else {
        context.bot().controlState().left(true);
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
          throw new IllegalStateException(
            "Unable to find line of sight after "
              + consecutivePathFailures + " path attempts",
            cause
          );
        }
      }
    }

    private void report(String message, double distance) {
      if (ticks % 20 != 0) {
        return;
      }
      context.reportProgress(BotTaskProgress.newBuilder()
        .setMessage("%s at %.1f blocks".formatted(message, distance))
        .setCurrent(shots)
        .build());
    }

    private void complete(
      RangedAttackCompletionReason reason,
      boolean targetAlive
    ) {
      stopUsingItem();
      stopPath(ControlStopReason.COMPLETED, null);
      result.complete(RangedAttackTaskResult.newBuilder()
        .setFinalPosition(BotTaskSupport.position(context.bot()))
        .setReason(reason)
        .setShotsReleased(shots)
        .setTargetAlive(targetAlive)
        .build());
    }

    private void stopUsingItem() {
      var player = context.bot().minecraft().player;
      var gameMode = context.bot().minecraft().gameMode;
      if (player != null && gameMode != null && player.isUsingItem()) {
        gameMode.releaseUsingItem(player);
      }
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
    public ControlPriority priority() {
      return ControlPriority.HIGH;
    }

    @Override
    public Set<ControlResource> resources() {
      return RESOURCES;
    }

    @Override
    public void onSuspended() {
      stopUsingItem();
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
      stopUsingItem();
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
      return "Ranged attack entity " + target.getNetworkId();
    }
  }
}
