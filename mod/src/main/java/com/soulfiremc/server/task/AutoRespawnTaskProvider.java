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

import com.soulfiremc.grpc.generated.AutoRespawnCompletionReason;
import com.soulfiremc.grpc.generated.AutoRespawnTask;
import com.soulfiremc.grpc.generated.AutoRespawnTaskResult;
import com.soulfiremc.grpc.generated.BotTaskProgress;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.Set;
import java.util.concurrent.CompletableFuture;

/// Core task that observes death and requests respawn without blocking
/// unrelated bot controls.
public final class AutoRespawnTaskProvider
  implements BotTaskProvider<AutoRespawnTask> {
  private static final int MAX_RESPAWN_DELAY_TICKS = 20 * 60 * 10;
  // Death observation and respawn requests can coexist with other monitors.
  private static final Set<ControlResource> RESOURCES = Set.of();

  @Override
  public AutoRespawnTask inputPrototype() {
    return AutoRespawnTask.getDefaultInstance();
  }

  @Override
  public String summary(AutoRespawnTask input) {
    return input.getMaximumRespawns() == 0
      ? "Automatically respawn after death"
      : "Automatically respawn up to "
        + input.getMaximumRespawns() + " times";
  }

  @Override
  public Set<ControlResource> resources(AutoRespawnTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(
    BotTaskContext context,
    AutoRespawnTask input
  ) {
    var result = new CompletableFuture<AutoRespawnTaskResult>();
    var control = new AutoRespawnControl(
      context,
      Math.min(input.getRespawnDelayTicks(), MAX_RESPAWN_DELAY_TICKS),
      input.getMaximumRespawns(),
      result
    );
    return new BotTaskExecution(control, result);
  }

  private static final class AutoRespawnControl implements ControlTask {
    private final BotTaskContext context;
    private final int respawnDelayTicks;
    private final int maximumRespawns;
    private final CompletableFuture<AutoRespawnTaskResult> result;
    private int respawns;
    private int deathTicks;
    private int ticks;
    private boolean awaitingAlive;

    private AutoRespawnControl(
      BotTaskContext context,
      int respawnDelayTicks,
      int maximumRespawns,
      CompletableFuture<AutoRespawnTaskResult> result
    ) {
      this.context = context;
      this.respawnDelayTicks = respawnDelayTicks;
      this.maximumRespawns = maximumRespawns;
      this.result = result;
    }

    @Override
    public void tick() {
      if (result.isDone()) {
        return;
      }
      ticks++;
      var player = context.bot().minecraft().player;
      if (player == null) {
        return;
      }
      if (!player.isDeadOrDying()) {
        deathTicks = 0;
        awaitingAlive = false;
        if (ticks % 20 == 0) {
          report("Monitoring player health");
        }
        return;
      }
      if (awaitingAlive) {
        return;
      }

      deathTicks++;
      if (ticks % 20 == 0) {
        report(respawnDelayTicks == 0
          ? "Respawning"
          : "Waiting to respawn");
      }
      if (deathTicks < respawnDelayTicks) {
        return;
      }

      player.respawn();
      respawns++;
      awaitingAlive = true;
      deathTicks = 0;
      report("Respawn requested");
      if (maximumRespawns > 0 && respawns >= maximumRespawns) {
        result.complete(AutoRespawnTaskResult.newBuilder()
          .setReason(
            AutoRespawnCompletionReason
              .AUTO_RESPAWN_COMPLETION_REASON_RESPAWN_LIMIT_REACHED
          )
          .setRespawns(respawns)
          .build());
      }
    }

    private void report(String message) {
      var builder = BotTaskProgress.newBuilder()
        .setMessage(message)
        .setCurrent(respawns);
      if (maximumRespawns > 0) {
        builder
          .setTotal(maximumRespawns)
          .setFraction(Math.min(
            1.0,
            (double) respawns / maximumRespawns
          ));
      }
      context.reportProgress(builder.build());
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
    public void onStopped(
      ControlStopReason reason,
      @Nullable Throwable cause
    ) {
      if (reason != ControlStopReason.COMPLETED && !result.isDone()) {
        result.cancel(true);
      }
    }

    @Override
    public String description() {
      return "Auto respawn";
    }
  }
}
