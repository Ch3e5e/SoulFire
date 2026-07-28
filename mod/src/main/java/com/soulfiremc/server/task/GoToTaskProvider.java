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
import com.soulfiremc.grpc.generated.GoToTask;
import com.soulfiremc.grpc.generated.GoToTaskResult;
import com.soulfiremc.grpc.generated.WorldPosition;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.pathfinding.PathfindingSupport;
import com.soulfiremc.server.pathfinding.execution.PathExecutor;

import java.util.Set;
import java.util.concurrent.TimeUnit;

/// Core provider for durable pathfinding tasks.
public final class GoToTaskProvider implements BotTaskProvider<GoToTask> {
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY
  );

  @Override
  public GoToTask inputPrototype() {
    return GoToTask.getDefaultInstance();
  }

  @Override
  public String summary(GoToTask input) {
    return "Pathfind to " + input.getGoal().getGoalCase().name().toLowerCase();
  }

  @Override
  public Set<ControlResource> resources(GoToTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(BotTaskContext context, GoToTask input) {
    var resolved = PathfindingSupport.resolveGoal(context.bot(), input.getGoal());
    var constraint = PathfindingSupport.buildConstraint(context.bot(), input.getOptions());
    var executor = PathExecutor.createPathfinding(
      context.bot(),
      resolved.scorer(),
      constraint
    );
    var result = executor.completion().thenApply(_ -> {
      var player = context.bot().minecraft().player;
      var level = context.bot().minecraft().level;
      if (player == null || level == null) {
        return GoToTaskResult.getDefaultInstance();
      }
      return GoToTaskResult.newBuilder()
        .setFinalPosition(WorldPosition.newBuilder()
          .setX(player.getX())
          .setY(player.getY())
          .setZ(player.getZ())
          .setDimension(level.dimension().identifier().toString()))
        .build();
    });
    scheduleProgress(context, executor);
    return new BotTaskExecution(executor, result);
  }

  private static void scheduleProgress(
    BotTaskContext context,
    PathExecutor executor
  ) {
    context.server().scheduler().schedule(new Runnable() {
      @Override
      public void run() {
        if (executor.completion().isDone()) {
          return;
        }
        var progress = executor.progress();
        var builder = BotTaskProgress.newBuilder()
          .setMessage(progress.planning() ? "Planning route" : "Following route")
          .setCurrent(Math.max(0, progress.currentMovement()));
        if (progress.totalMovements() > 0) {
          builder
            .setTotal(progress.totalMovements())
            .setFraction(Math.min(
              1.0,
              (double) progress.currentMovement() / progress.totalMovements()
            ));
        }
        context.reportProgress(builder.build());
        context.server().scheduler().schedule(this, 500, TimeUnit.MILLISECONDS);
      }
    }, 500, TimeUnit.MILLISECONDS);
  }
}
