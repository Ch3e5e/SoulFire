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
import com.soulfiremc.grpc.generated.FleeCompletionReason;
import com.soulfiremc.grpc.generated.FleeTask;
import com.soulfiremc.grpc.generated.FleeTaskResult;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.bot.ControlPriority;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.goals.AwayFromPositionsGoal;
import com.soulfiremc.server.pathfinding.goals.DynamicGoalScorer;
import io.grpc.Status;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/// Monitors a typed threat selector and runs dynamic away-from-entity paths
/// until the bot has remained safe for the configured period.
public final class FleeTaskProvider implements BotTaskProvider<FleeTask> {
  private static final float DEFAULT_TRIGGER_RADIUS = 8;
  private static final float DEFAULT_SAFE_DISTANCE = 16;
  private static final float MAX_RADIUS = 128;
  private static final int DEFAULT_SAFE_SECONDS = 2;
  private static final int MAX_SAFE_SECONDS = 300;
  private static final int MAX_CONSECUTIVE_FAILURES = 3;
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY
  );

  @Override
  public FleeTask inputPrototype() {
    return FleeTask.getDefaultInstance();
  }

  @Override
  public String summary(FleeTask input) {
    return input.getMaximumEscapes() == 0
      ? "Flee from matching threats"
      : "Complete up to " + input.getMaximumEscapes() + " escape(s)";
  }

  @Override
  public Set<ControlResource> resources(FleeTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(BotTaskContext context, FleeTask input) {
    BotTaskSupport.requireSafeEntitySelector(input.getThreats());
    var triggerRadius = radius(
      input.getTriggerRadius(),
      DEFAULT_TRIGGER_RADIUS,
      "trigger_radius"
    );
    var safeDistance = radius(
      input.getSafeDistance(),
      DEFAULT_SAFE_DISTANCE,
      "safe_distance"
    );
    if (safeDistance <= triggerRadius) {
      throw Status.INVALID_ARGUMENT
        .withDescription("safe_distance must be greater than trigger_radius")
        .asRuntimeException();
    }
    var safeSeconds = input.getSafeSeconds() == 0
      ? DEFAULT_SAFE_SECONDS
      : Math.min(input.getSafeSeconds(), MAX_SAFE_SECONDS);
    var result = new CompletableFuture<FleeTaskResult>();
    return new BotTaskExecution(
      new FleeControl(
        context,
        input,
        triggerRadius,
        safeDistance,
        safeSeconds * 20,
        result
      ),
      result
    );
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

  private static final class FleeControl implements ControlTask {
    private final BotTaskContext context;
    private final FleeTask input;
    private final float triggerRadius;
    private final float safeDistance;
    private final int safeTicksRequired;
    private final CompletableFuture<FleeTaskResult> result;
    private @Nullable BotTaskExecution activeEscape;
    private int safeTicks;
    private int escapes;
    private int consecutiveFailures;
    private int ticks;

    private FleeControl(
      BotTaskContext context,
      FleeTask input,
      float triggerRadius,
      float safeDistance,
      int safeTicksRequired,
      CompletableFuture<FleeTaskResult> result
    ) {
      this.context = context;
      this.input = input;
      this.triggerRadius = triggerRadius;
      this.safeDistance = safeDistance;
      this.safeTicksRequired = safeTicksRequired;
      this.result = result;
    }

    @Override
    public void tick() {
      if (result.isDone()) {
        return;
      }
      ticks++;
      try {
        if (activeEscape != null) {
          tickEscape();
          return;
        }
        var bot = context.bot();
        var player = Objects.requireNonNull(bot.minecraft().player);
        var threat = BotTaskSupport.nearestMatchingEntity(
          bot,
          input.getThreats(),
          player.position(),
          triggerRadius,
          true
        );
        if (threat == null) {
          safeTicks++;
          if (ticks % 20 == 0) {
            context.reportProgress(BotTaskProgress.newBuilder()
              .setMessage(input.getCompleteWhenSafe()
                ? "Confirming the area is safe"
                : "Monitoring for threats")
              .setCurrent(escapes)
              .build());
          }
          if (input.getCompleteWhenSafe()
            && safeTicks >= safeTicksRequired) {
            complete(FleeCompletionReason.FLEE_COMPLETION_REASON_SAFE);
          }
          return;
        }
        safeTicks = 0;
        var escape = GoToTaskProvider.start(
          context,
          groupEscapeGoal(),
          input.getOptions()
        );
        activeEscape = escape;
        escape.control().onStarted();
        context.reportProgress(BotTaskProgress.newBuilder()
          .setMessage("Escaping from " + threat.getName().getString())
          .setCurrent(escapes)
          .build());
      } catch (Throwable throwable) {
        result.completeExceptionally(throwable);
      }
    }

    private void tickEscape() {
      var escape = Objects.requireNonNull(activeEscape);
      if (!escape.result().isDone()) {
        escape.control().tick();
      }
      if (!escape.result().isDone()) {
        return;
      }
      activeEscape = null;
      try {
        escape.result().join();
        escape.control().onStopped(ControlStopReason.COMPLETED, null);
        consecutiveFailures = 0;
        escapes++;
        safeTicks = 0;
        if (input.getMaximumEscapes() > 0
          && escapes >= input.getMaximumEscapes()) {
          complete(
            FleeCompletionReason
              .FLEE_COMPLETION_REASON_ESCAPE_LIMIT_REACHED
          );
        }
      } catch (Throwable throwable) {
        var cause = throwable instanceof CompletionException
          && throwable.getCause() != null
          ? throwable.getCause()
          : throwable;
        escape.control().onStopped(ControlStopReason.FAILED, cause);
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw new CompletionException(
            "Unable to escape after "
              + consecutiveFailures + " path attempts",
            cause
          );
        }
      }
    }

    private DynamicGoalScorer groupEscapeGoal() {
      return new DynamicGoalScorer() {
        private long observedGameTime = Long.MIN_VALUE;
        private AwayFromPositionsGoal goal = new AwayFromPositionsGoal(
          List.of(),
          1
        );

        @Override
        public synchronized AwayFromPositionsGoal create() {
          var minecraft = context.bot().minecraft();
          var level = minecraft.level;
          var gameTime = level == null ? Long.MIN_VALUE : level.getGameTime();
          if (gameTime == observedGameTime) {
            return goal;
          }
          observedGameTime = gameTime;
          var currentPlayer = minecraft.player;
          if (currentPlayer == null) {
            goal = new AwayFromPositionsGoal(List.of(), 1);
            return goal;
          }
          var origins = BotTaskSupport.matchingEntities(
              context.bot(),
              input.getThreats(),
              currentPlayer.position(),
              safeDistance,
              true
            ).stream()
            .map(entity -> SFVec3i.fromDouble(entity.position()))
            .toList();
          goal = new AwayFromPositionsGoal(
            origins,
            Math.max(1, Math.round(safeDistance))
          );
          return goal;
        }
      };
    }

    private void complete(FleeCompletionReason reason) {
      result.complete(FleeTaskResult.newBuilder()
        .setFinalPosition(BotTaskSupport.position(context.bot()))
        .setReason(reason)
        .setEscapes(escapes)
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
      if (activeEscape != null) {
        activeEscape.control().onSuspended();
      }
    }

    @Override
    public void onResumed() {
      if (activeEscape != null) {
        activeEscape.control().onResumed();
      }
    }

    @Override
    public void onStopped(
      ControlStopReason reason,
      @Nullable Throwable cause
    ) {
      var escape = activeEscape;
      activeEscape = null;
      if (escape != null) {
        escape.control().onStopped(reason, cause);
      }
      context.bot().controlState().resetAll();
      if (reason != ControlStopReason.COMPLETED && !result.isDone()) {
        result.cancel(true);
      }
    }

    @Override
    public String description() {
      return "Flee from matching threats";
    }
  }
}
