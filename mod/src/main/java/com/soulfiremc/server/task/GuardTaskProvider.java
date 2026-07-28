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
import com.soulfiremc.grpc.generated.GoToTask;
import com.soulfiremc.grpc.generated.GuardCompletionReason;
import com.soulfiremc.grpc.generated.GuardTask;
import com.soulfiremc.grpc.generated.GuardTaskResult;
import com.soulfiremc.grpc.generated.PathfindGoal;
import com.soulfiremc.grpc.generated.WorldPosition;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.bot.ControlPriority;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import io.grpc.Status;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/// Defends a fixed position or live entity while enforcing a maximum pursuit
/// distance and returning to the protected subject between fights.
public final class GuardTaskProvider implements BotTaskProvider<GuardTask> {
  private static final float DEFAULT_GUARD_RADIUS = 16;
  private static final float DEFAULT_PURSUIT_DISTANCE = 24;
  private static final float DEFAULT_RETURN_RADIUS = 3;
  private static final float MAX_RADIUS = 128;
  private static final int DEFAULT_CLEAR_SECONDS = 3;
  private static final int MAX_CLEAR_SECONDS = 300;
  private static final int SUBJECT_UNAVAILABLE_TICKS = 200;
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY
  );

  @Override
  public GuardTask inputPrototype() {
    return GuardTask.getDefaultInstance();
  }

  @Override
  public String summary(GuardTask input) {
    return input.getSubjectCase() == GuardTask.SubjectCase.ENTITY
      ? "Protect entity " + input.getEntity().getNetworkId()
      : "Guard a position";
  }

  @Override
  public Set<ControlResource> resources(GuardTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(BotTaskContext context, GuardTask input) {
    if (input.getSubjectCase() == GuardTask.SubjectCase.SUBJECT_NOT_SET) {
      throw Status.INVALID_ARGUMENT
        .withDescription("position or entity subject is required")
        .asRuntimeException();
    }
    BotTaskSupport.requireSafeEntitySelector(input.getThreats());
    if (input.getSubjectCase() == GuardTask.SubjectCase.ENTITY) {
      BotTaskSupport.requireEntity(context.bot(), input.getEntity());
    } else {
      validateDimension(context, input);
    }
    var guardRadius = radius(
      input.getGuardRadius(),
      DEFAULT_GUARD_RADIUS,
      "guard_radius"
    );
    var pursuitDistance = radius(
      input.getMaximumPursuitDistance(),
      DEFAULT_PURSUIT_DISTANCE,
      "maximum_pursuit_distance"
    );
    var returnRadius = radius(
      input.getReturnRadius(),
      DEFAULT_RETURN_RADIUS,
      "return_radius"
    );
    if (pursuitDistance < guardRadius) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "maximum_pursuit_distance must be at least guard_radius"
        )
        .asRuntimeException();
    }
    if (returnRadius >= pursuitDistance) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "return_radius must be smaller than maximum_pursuit_distance"
        )
        .asRuntimeException();
    }
    var clearSeconds = input.getClearSeconds() == 0
      ? DEFAULT_CLEAR_SECONDS
      : Math.min(input.getClearSeconds(), MAX_CLEAR_SECONDS);
    var result = new CompletableFuture<GuardTaskResult>();
    return new BotTaskExecution(
      new GuardControl(
        context,
        input,
        guardRadius,
        pursuitDistance,
        returnRadius,
        clearSeconds * 20,
        result
      ),
      result
    );
  }

  private static void validateDimension(
    BotTaskContext context,
    GuardTask input
  ) {
    var requested = input.getPosition().getDimension();
    var level = Objects.requireNonNull(context.bot().minecraft().level);
    var actual = level.dimension().identifier().toString();
    if (!requested.isBlank() && !requested.equals(actual)) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "Guard position is in '%s', but the bot is in '%s'"
            .formatted(requested, actual)
        )
        .asRuntimeException();
    }
  }

  private static float radius(
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
    if (normalized > MAX_RADIUS) {
      throw Status.INVALID_ARGUMENT
        .withDescription(field + " must not exceed " + MAX_RADIUS)
        .asRuntimeException();
    }
    return normalized;
  }

  private static final class GuardControl implements ControlTask {
    private final BotTaskContext context;
    private final GuardTask input;
    private final float guardRadius;
    private final float pursuitDistance;
    private final float returnRadius;
    private final int clearTicksRequired;
    private final CompletableFuture<GuardTaskResult> result;
    private final int originalSelectedSlot;
    private @Nullable BotTaskExecution active;
    private @Nullable Entity activeTarget;
    private ActiveKind activeKind;
    private int attacks;
    private int targetsDefeated;
    private int clearTicks;
    private int subjectUnavailableTicks;
    private int ticks;

    private GuardControl(
      BotTaskContext context,
      GuardTask input,
      float guardRadius,
      float pursuitDistance,
      float returnRadius,
      int clearTicksRequired,
      CompletableFuture<GuardTaskResult> result
    ) {
      this.context = context;
      this.input = input;
      this.guardRadius = guardRadius;
      this.pursuitDistance = pursuitDistance;
      this.returnRadius = returnRadius;
      this.clearTicksRequired = clearTicksRequired;
      this.result = result;
      this.originalSelectedSlot = Objects.requireNonNull(
        context.bot().minecraft().player
      ).getInventory().getSelectedSlot();
      this.activeKind = ActiveKind.NONE;
    }

    @Override
    public void tick() {
      if (result.isDone()) {
        return;
      }
      ticks++;
      try {
        var anchor = anchor();
        if (anchor == null) {
          subjectUnavailable();
          return;
        }
        subjectUnavailableTicks = 0;
        if (active != null) {
          tickActive(anchor);
          return;
        }

        var protectedId = input.getSubjectCase() == GuardTask.SubjectCase.ENTITY
          ? input.getEntity().getNetworkId()
          : -1;
        var threat = BotTaskSupport.nearestMatchingEntity(
          context.bot(),
          input.getThreats(),
          anchor,
          guardRadius,
          true,
          entity -> entity.getId() != protectedId
        );
        if (threat != null) {
          clearTicks = 0;
          startFight(threat);
          return;
        }
        var player = Objects.requireNonNull(context.bot().minecraft().player);
        if (player.position().distanceTo(anchor) > returnRadius) {
          startReturn(anchor);
          return;
        }
        clearTicks++;
        if (ticks % 20 == 0) {
          context.reportProgress(progress(
            input.getCompleteWhenClear()
              ? "Confirming the guarded area is clear"
              : "Guarding for matching threats"
          ));
        }
        if (input.getCompleteWhenClear()
          && clearTicks >= clearTicksRequired) {
          complete(GuardCompletionReason.GUARD_COMPLETION_REASON_AREA_CLEAR);
        }
      } catch (Throwable throwable) {
        result.completeExceptionally(throwable);
      }
    }

    private void subjectUnavailable() {
      stopActive(ControlStopReason.CANCELLED, null);
      subjectUnavailableTicks++;
      if (ticks % 20 == 0) {
        context.reportProgress(BotTaskProgress.newBuilder()
          .setMessage("Waiting for the protected entity")
          .setCurrent(subjectUnavailableTicks)
          .setTotal(SUBJECT_UNAVAILABLE_TICKS)
          .setFraction(Math.min(
            1.0,
            (double) subjectUnavailableTicks / SUBJECT_UNAVAILABLE_TICKS
          ))
          .build());
      }
      if (subjectUnavailableTicks >= SUBJECT_UNAVAILABLE_TICKS) {
        complete(
          GuardCompletionReason
            .GUARD_COMPLETION_REASON_SUBJECT_UNAVAILABLE
        );
      }
    }

    private @Nullable Vec3 anchor() {
      if (input.getSubjectCase() == GuardTask.SubjectCase.POSITION) {
        var position = input.getPosition();
        return new Vec3(
          position.getX() + 0.5,
          position.getY(),
          position.getZ() + 0.5
        );
      }
      var subject = BotTaskSupport.findEntity(
        context.bot(),
        input.getEntity().getNetworkId()
      );
      if (subject == null
        || input.getEntity().hasUuid()
        && !input.getEntity().getUuid().equals(
          subject.getUUID().toString()
        )) {
        return null;
      }
      return subject.position();
    }

    private void startFight(Entity threat) throws Exception {
      var remainingAttacks = input.getMaximumAttacks() == 0
        ? 0
        : input.getMaximumAttacks() - attacks;
      if (input.getMaximumAttacks() > 0 && remainingAttacks <= 0) {
        complete(
          GuardCompletionReason
            .GUARD_COMPLETION_REASON_ATTACK_LIMIT_REACHED
        );
        return;
      }
      var fightInput = AttackEntityTask.newBuilder()
        .setTarget(EntityReference.newBuilder()
          .setConnectionEpoch(context.bot().connectionEpoch().toString())
          .setNetworkId(threat.getId())
          .setUuid(threat.getUUID().toString()))
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
      active = new AttackEntityTaskProvider().start(
        context,
        fightInput.build()
      );
      activeTarget = threat;
      activeKind = ActiveKind.FIGHT;
      active.control().onStarted();
      context.reportProgress(progress(
        "Defending against " + threat.getName().getString()
      ));
    }

    private void startReturn(Vec3 anchor) throws Exception {
      var goal = input.getSubjectCase() == GuardTask.SubjectCase.ENTITY
        ? PathfindGoal.newBuilder()
        .setEntity(PathfindGoal.EntityGoal.newBuilder()
          .setEntityId(input.getEntity().getNetworkId())
          .setConnectionEpoch(context.bot().connectionEpoch().toString())
          .setRadius(returnRadius))
        .build()
        : PathfindGoal.newBuilder()
        .setNear(PathfindGoal.NearGoal.newBuilder()
          .setPosition(WorldPosition.newBuilder()
            .setX(anchor.x)
            .setY(anchor.y)
            .setZ(anchor.z)
            .setDimension(Objects.requireNonNull(
              context.bot().minecraft().level
            ).dimension().identifier().toString()))
          .setRadius(returnRadius))
        .build();
      active = new GoToTaskProvider().start(
        context,
        GoToTask.newBuilder()
          .setGoal(goal)
          .setOptions(input.getOptions())
          .build()
      );
      activeTarget = null;
      activeKind = ActiveKind.RETURN;
      active.control().onStarted();
      context.reportProgress(progress("Returning to the guarded subject"));
    }

    private void tickActive(Vec3 anchor) {
      var execution = Objects.requireNonNull(active);
      if (activeKind == ActiveKind.FIGHT) {
        var player = Objects.requireNonNull(context.bot().minecraft().player);
        var target = activeTarget;
        if (player.position().distanceTo(anchor) > pursuitDistance
          || target != null
          && target.position().distanceTo(anchor) > pursuitDistance) {
          stopActive(ControlStopReason.CANCELLED, null);
          try {
            startReturn(anchor);
          } catch (Exception exception) {
            throw new CompletionException(exception);
          }
          return;
        }
      }
      if (!execution.result().isDone()) {
        execution.control().tick();
      }
      if (!execution.result().isDone()) {
        return;
      }
      active = null;
      activeTarget = null;
      var completedKind = activeKind;
      activeKind = ActiveKind.NONE;
      try {
        var value = execution.result().join();
        execution.control().onStopped(ControlStopReason.COMPLETED, null);
        if (completedKind == ActiveKind.FIGHT) {
          var fight = (AttackEntityTaskResult) value;
          attacks += fight.getAttacks();
          if (fight.getReason()
            == AttackEntityCompletionReason
            .ATTACK_ENTITY_COMPLETION_REASON_TARGET_DEFEATED) {
            targetsDefeated++;
          }
          if (input.getMaximumTargets() > 0
            && targetsDefeated >= input.getMaximumTargets()) {
            complete(
              GuardCompletionReason
                .GUARD_COMPLETION_REASON_TARGET_LIMIT_REACHED
            );
          } else if (input.getMaximumAttacks() > 0
            && attacks >= input.getMaximumAttacks()) {
            complete(
              GuardCompletionReason
                .GUARD_COMPLETION_REASON_ATTACK_LIMIT_REACHED
            );
          }
        }
      } catch (Throwable throwable) {
        var cause = throwable instanceof CompletionException
          && throwable.getCause() != null
          ? throwable.getCause()
          : throwable;
        execution.control().onStopped(ControlStopReason.FAILED, cause);
        throw new CompletionException("Guard child task failed", cause);
      }
    }

    private BotTaskProgress progress(String message) {
      var progress = BotTaskProgress.newBuilder()
        .setMessage(message)
        .setCurrent(targetsDefeated);
      if (input.getMaximumTargets() > 0) {
        progress
          .setTotal(input.getMaximumTargets())
          .setFraction(Math.min(
            1.0,
            (double) targetsDefeated / input.getMaximumTargets()
          ));
      }
      return progress.build();
    }

    private void complete(GuardCompletionReason reason) {
      result.complete(GuardTaskResult.newBuilder()
        .setFinalPosition(BotTaskSupport.position(context.bot()))
        .setReason(reason)
        .setAttacks(attacks)
        .setTargetsDefeated(targetsDefeated)
        .build());
    }

    private void stopActive(
      ControlStopReason reason,
      @Nullable Throwable cause
    ) {
      var execution = active;
      active = null;
      activeTarget = null;
      activeKind = ActiveKind.NONE;
      if (execution != null) {
        execution.control().onStopped(reason, cause);
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
      if (active != null) {
        active.control().onSuspended();
      }
    }

    @Override
    public void onResumed() {
      if (active != null) {
        active.control().onResumed();
      }
    }

    @Override
    public void onStopped(
      ControlStopReason reason,
      @Nullable Throwable cause
    ) {
      stopActive(reason, cause);
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
      return "Guard protected subject";
    }
  }

  private enum ActiveKind {
    NONE,
    FIGHT,
    RETURN
  }
}
