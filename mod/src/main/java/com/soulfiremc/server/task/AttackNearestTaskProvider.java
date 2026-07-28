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
import com.soulfiremc.grpc.generated.AttackNearestCompletionReason;
import com.soulfiremc.grpc.generated.AttackNearestTask;
import com.soulfiremc.grpc.generated.AttackNearestTaskResult;
import com.soulfiremc.grpc.generated.BotTaskProgress;
import com.soulfiremc.grpc.generated.EntityReference;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.bot.ControlPriority;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import io.grpc.Status;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/// Repeatedly acquires the nearest matching entity and delegates each fight
/// to the same managed combat implementation used by AttackEntityTask.
public final class AttackNearestTaskProvider
  implements BotTaskProvider<AttackNearestTask> {
  private static final float DEFAULT_RADIUS = 32;
  private static final float MAX_RADIUS = 128;
  private static final int MAX_NO_TARGET_TIMEOUT_SECONDS = 3_600;
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY
  );

  @Override
  public AttackNearestTask inputPrototype() {
    return AttackNearestTask.getDefaultInstance();
  }

  @Override
  public String summary(AttackNearestTask input) {
    return input.getMaximumTargets() == 0
      ? "Attack nearest matching entities"
      : "Attack up to " + input.getMaximumTargets() + " matching entities";
  }

  @Override
  public Set<ControlResource> resources(AttackNearestTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(
    BotTaskContext context,
    AttackNearestTask input
  ) throws Exception {
    BotTaskSupport.requireSafeEntitySelector(input.getSelector());
    var radius = normalizeRadius(input.getRadius());
    var timeoutSeconds = Math.min(
      input.getNoTargetTimeoutSeconds(),
      MAX_NO_TARGET_TIMEOUT_SECONDS
    );
    var result = new CompletableFuture<AttackNearestTaskResult>();
    var control = new AttackNearestControl(
      context,
      input,
      radius,
      timeoutSeconds * 20,
      result
    );
    return new BotTaskExecution(control, result);
  }

  private static float normalizeRadius(float radius) {
    if (!Float.isFinite(radius) || radius < 0) {
      throw Status.INVALID_ARGUMENT
        .withDescription("radius must be finite and non-negative")
        .asRuntimeException();
    }
    if (radius == 0) {
      return DEFAULT_RADIUS;
    }
    if (radius > MAX_RADIUS) {
      throw Status.INVALID_ARGUMENT
        .withDescription("radius must not exceed " + MAX_RADIUS)
        .asRuntimeException();
    }
    return radius;
  }

  private static final class AttackNearestControl implements ControlTask {
    private final BotTaskContext context;
    private final AttackNearestTask input;
    private final float radius;
    private final int noTargetTimeoutTicks;
    private final CompletableFuture<AttackNearestTaskResult> result;
    private final int originalSelectedSlot;
    private @Nullable BotTaskExecution activeFight;
    private int attacks;
    private int targetsDefeated;
    private int noTargetTicks;
    private int ticks;

    private AttackNearestControl(
      BotTaskContext context,
      AttackNearestTask input,
      float radius,
      int noTargetTimeoutTicks,
      CompletableFuture<AttackNearestTaskResult> result
    ) {
      this.context = context;
      this.input = input;
      this.radius = radius;
      this.noTargetTimeoutTicks = noTargetTimeoutTicks;
      this.result = result;
      this.originalSelectedSlot = Objects.requireNonNull(
        context.bot().minecraft().player
      ).getInventory().getSelectedSlot();
    }

    @Override
    public void tick() {
      if (result.isDone()) {
        return;
      }
      ticks++;
      try {
        if (activeFight != null) {
          tickFight();
          return;
        }
        var target = nearestTarget();
        if (target == null) {
          waitForTarget();
          return;
        }
        noTargetTicks = 0;
        startFight(target);
      } catch (Throwable throwable) {
        result.completeExceptionally(throwable);
      }
    }

    private @Nullable Entity nearestTarget() {
      var bot = context.bot();
      var player = Objects.requireNonNull(bot.minecraft().player);
      var origin = player.position();
      return BotTaskSupport.nearestMatchingEntity(
        bot,
        input.getSelector(),
        origin,
        radius,
        true
      );
    }

    private void waitForTarget() {
      noTargetTicks++;
      if (ticks % 20 == 0) {
        var progress = BotTaskProgress.newBuilder()
          .setMessage("Waiting for a matching attack target")
          .setCurrent(targetsDefeated);
        if (input.getMaximumTargets() > 0) {
          progress
            .setTotal(input.getMaximumTargets())
            .setFraction(Math.min(
              1.0,
              (double) targetsDefeated / input.getMaximumTargets()
            ));
        }
        context.reportProgress(progress.build());
      }
      if (input.getCompleteWhenNoTarget()
        || noTargetTimeoutTicks > 0
        && noTargetTicks >= noTargetTimeoutTicks) {
        complete(
          AttackNearestCompletionReason
            .ATTACK_NEAREST_COMPLETION_REASON_NO_TARGET
        );
      }
    }

    private void startFight(Entity target) throws Exception {
      var remainingAttacks = input.getMaximumAttacks() == 0
        ? 0
        : input.getMaximumAttacks() - attacks;
      if (input.getMaximumAttacks() > 0 && remainingAttacks <= 0) {
        complete(
          AttackNearestCompletionReason
            .ATTACK_NEAREST_COMPLETION_REASON_ATTACK_LIMIT_REACHED
        );
        return;
      }
      var fightInput = AttackEntityTask.newBuilder()
        .setTarget(EntityReference.newBuilder()
          .setConnectionEpoch(context.bot().connectionEpoch().toString())
          .setNetworkId(target.getId())
          .setUuid(target.getUUID().toString()))
        .setOptions(input.getOptions())
        .setAttackRange(input.getAttackRange())
        .setSprinting(input.getSprinting())
        .setMaximumAttacks(remainingAttacks)
        .setTargetUnavailableTimeoutSeconds(2)
        .setSelectBestWeapon(
          !input.hasSelectBestWeapon() || input.getSelectBestWeapon()
        )
        .setRestoreSelectedSlot(false);
      if (input.hasWeapon()) {
        fightInput.setWeapon(input.getWeapon());
      }
      var execution = new AttackEntityTaskProvider().start(
        context,
        fightInput.build()
      );
      activeFight = execution;
      execution.control().onStarted();
      context.reportProgress(BotTaskProgress.newBuilder()
        .setMessage(target instanceof Player
          ? "Attacking player " + target.getName().getString()
          : "Attacking " + target.getType().getDescription().getString())
        .setCurrent(targetsDefeated)
        .build());
    }

    private void tickFight() {
      var fight = Objects.requireNonNull(activeFight);
      if (!fight.result().isDone()) {
        fight.control().tick();
      }
      if (!fight.result().isDone()) {
        return;
      }
      activeFight = null;
      try {
        var fightResult = (AttackEntityTaskResult) fight.result().join();
        fight.control().onStopped(ControlStopReason.COMPLETED, null);
        attacks += fightResult.getAttacks();
        if (fightResult.getReason()
          == AttackEntityCompletionReason
          .ATTACK_ENTITY_COMPLETION_REASON_TARGET_DEFEATED) {
          targetsDefeated++;
          if (input.getMaximumTargets() > 0
            && targetsDefeated >= input.getMaximumTargets()) {
            complete(
              AttackNearestCompletionReason
                .ATTACK_NEAREST_COMPLETION_REASON_TARGET_LIMIT_REACHED
            );
            return;
          }
        }
        if (input.getMaximumAttacks() > 0
          && attacks >= input.getMaximumAttacks()) {
          complete(
            AttackNearestCompletionReason
              .ATTACK_NEAREST_COMPLETION_REASON_ATTACK_LIMIT_REACHED
          );
        }
      } catch (Throwable throwable) {
        var cause = throwable instanceof CompletionException
          && throwable.getCause() != null
          ? throwable.getCause()
          : throwable;
        fight.control().onStopped(ControlStopReason.FAILED, cause);
        if (throwable instanceof RuntimeException runtimeException) {
          throw runtimeException;
        }
        throw new CompletionException(
          "Managed attack failed",
          cause
        );
      }
    }

    private void complete(AttackNearestCompletionReason reason) {
      result.complete(AttackNearestTaskResult.newBuilder()
        .setFinalPosition(BotTaskSupport.position(context.bot()))
        .setReason(reason)
        .setAttacks(attacks)
        .setTargetsDefeated(targetsDefeated)
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
      if (activeFight != null) {
        activeFight.control().onSuspended();
      }
    }

    @Override
    public void onResumed() {
      if (activeFight != null) {
        activeFight.control().onResumed();
      }
    }

    @Override
    public void onStopped(
      ControlStopReason reason,
      @Nullable Throwable cause
    ) {
      var fight = activeFight;
      activeFight = null;
      if (fight != null) {
        fight.control().onStopped(reason, cause);
      }
      context.bot().controlState().resetAll();
      var player = context.bot().minecraft().player;
      if (input.getRestoreSelectedSlot() && player != null) {
        player.getInventory().setSelectedSlot(originalSelectedSlot);
      }
      if (reason != ControlStopReason.COMPLETED && !result.isDone()) {
        result.cancel(true);
      }
    }

    @Override
    public String description() {
      return "Attack nearest matching entity";
    }
  }
}
