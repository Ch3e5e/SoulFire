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

import com.soulfiremc.grpc.generated.BlockPosition;
import com.soulfiremc.grpc.generated.BotTaskProgress;
import com.soulfiremc.grpc.generated.ExploreCompletionReason;
import com.soulfiremc.grpc.generated.ExploreTask;
import com.soulfiremc.grpc.generated.ExploreTaskResult;
import com.soulfiremc.grpc.generated.WorldPosition;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.bot.ControlPriority;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.pathfinding.PathfindingSupport;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.execution.PathExecutor;
import com.soulfiremc.server.pathfinding.goals.CloseToPosGoal;
import com.soulfiremc.server.pathfinding.goals.XZGoal;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint;
import io.grpc.Status;
import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/// Visits a deterministic, fleet-coordinated set of frontier cells around a
/// fixed origin.
public final class ExploreTaskProvider
  implements BotTaskProvider<ExploreTask> {
  private static final int DEFAULT_RADIUS = 256;
  private static final int MAX_RADIUS = 4_096;
  private static final int DEFAULT_WAYPOINT_SPACING = 64;
  private static final int MIN_WAYPOINT_SPACING = 8;
  private static final int MAX_WAYPOINT_SPACING = 512;
  private static final int MAX_GRID_RADIUS = 32;
  private static final String DEFAULT_PURPOSE = "sdk-explore";
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY
  );

  @Override
  public ExploreTask inputPrototype() {
    return ExploreTask.getDefaultInstance();
  }

  @Override
  public String summary(ExploreTask input) {
    return input.getMaximumWaypoints() == 0
      ? "Explore frontier cells until cancelled"
      : "Explore up to " + input.getMaximumWaypoints() + " frontier cells";
  }

  @Override
  public Set<ControlResource> resources(ExploreTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(BotTaskContext context, ExploreTask input) {
    var radius = input.getRadius() == 0
      ? DEFAULT_RADIUS
      : requireRange(input.getRadius(), 1, MAX_RADIUS, "radius");
    var spacing = input.getWaypointSpacing() == 0
      ? DEFAULT_WAYPOINT_SPACING
      : requireRange(
        input.getWaypointSpacing(),
        MIN_WAYPOINT_SPACING,
        MAX_WAYPOINT_SPACING,
        "waypoint_spacing"
      );
    spacing = Math.min(spacing, radius);
    if ((int) Math.ceil((double) radius / spacing) > MAX_GRID_RADIUS) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "radius divided by waypoint_spacing must not exceed "
            + MAX_GRID_RADIUS
        )
        .asRuntimeException();
    }
    var player = Objects.requireNonNull(
      context.bot().minecraft().player,
      "Bot player is not available"
    );
    var level = Objects.requireNonNull(
      context.bot().minecraft().level,
      "Bot level is not available"
    );
    var origin = input.hasOrigin()
      ? validateOrigin(context, input.getOrigin())
      : player.position();
    var purpose = input.getPurpose().isBlank()
      ? DEFAULT_PURPOSE
      : input.getPurpose().strip();
    if (purpose.length() > 64) {
      throw Status.INVALID_ARGUMENT
        .withDescription("purpose must contain at most 64 characters")
        .asRuntimeException();
    }
    var offsets = frontierOffsets(radius, spacing);
    if (!offsets.isEmpty()) {
      Collections.rotate(
        offsets,
        Math.floorMod(
          context.bot().accountProfileId().hashCode(),
          offsets.size()
        )
      );
    }
    var result = new CompletableFuture<ExploreTaskResult>();
    return new BotTaskExecution(
      new ExploreControl(
        context,
        origin,
        level.dimension(),
        purpose,
        spacing,
        input.getMaximumWaypoints(),
        input.getReturnToOrigin(),
        offsets,
        PathfindingSupport.buildConstraint(
          context.bot(),
          input.getOptions()
        ),
        result
      ),
      result
    );
  }

  private static int requireRange(
    int value,
    int minimum,
    int maximum,
    String name
  ) {
    if (value < minimum || value > maximum) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "%s must be between %d and %d"
            .formatted(name, minimum, maximum)
        )
        .asRuntimeException();
    }
    return value;
  }

  private static Vec3 validateOrigin(
    BotTaskContext context,
    BlockPosition position
  ) {
    var level = Objects.requireNonNull(context.bot().minecraft().level);
    var actual = level.dimension().identifier().toString();
    if (
      !position.getDimension().isBlank()
        && !position.getDimension().equals(actual)
    ) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "Exploration origin is in '%s', but the bot is in '%s'"
            .formatted(position.getDimension(), actual)
        )
        .asRuntimeException();
    }
    return Vec3.atCenterOf(new BlockPos(
      position.getX(),
      position.getY(),
      position.getZ()
    ));
  }

  private static List<GridOffset> frontierOffsets(
    int radius,
    int spacing
  ) {
    var gridRadius = (int) Math.ceil((double) radius / spacing);
    var offsets = new ArrayList<GridOffset>();
    for (var ring = 1; ring <= gridRadius; ring++) {
      for (var x = -ring; x <= ring; x++) {
        addOffset(offsets, x, -ring, radius, spacing);
        addOffset(offsets, x, ring, radius, spacing);
      }
      for (var z = -ring + 1; z < ring; z++) {
        addOffset(offsets, -ring, z, radius, spacing);
        addOffset(offsets, ring, z, radius, spacing);
      }
    }
    return offsets;
  }

  private static void addOffset(
    List<GridOffset> offsets,
    int x,
    int z,
    int radius,
    int spacing
  ) {
    var offsetX = (long) x * spacing;
    var offsetZ = (long) z * spacing;
    if (
      offsetX * offsetX + offsetZ * offsetZ
        <= (long) radius * radius
    ) {
      offsets.add(new GridOffset(x, z));
    }
  }

  private static final class ExploreControl implements ControlTask {
    private final BotTaskContext context;
    private final Vec3 origin;
    private final net.minecraft.resources.ResourceKey<
      net.minecraft.world.level.Level> dimension;
    private final String purpose;
    private final int spacing;
    private final int maximumWaypoints;
    private final boolean returnToOrigin;
    private final List<GridOffset> offsets;
    private final PathConstraint constraint;
    private final CompletableFuture<ExploreTaskResult> result;
    private final Set<Integer> attemptedOffsets = new HashSet<>();
    private @Nullable PathExecutor path;
    private @Nullable Vec3 target;
    private Stage stage = Stage.SELECT_FRONTIER;
    private int waypointsVisited;
    private int failedRoutes;
    private int ticks;
    private double horizontalDistanceTraveled;
    private Vec3 previousPosition;

    private ExploreControl(
      BotTaskContext context,
      Vec3 origin,
      net.minecraft.resources.ResourceKey<
        net.minecraft.world.level.Level> dimension,
      String purpose,
      int spacing,
      int maximumWaypoints,
      boolean returnToOrigin,
      List<GridOffset> offsets,
      PathConstraint constraint,
      CompletableFuture<ExploreTaskResult> result
    ) {
      this.context = context;
      this.origin = origin;
      this.dimension = dimension;
      this.purpose = purpose;
      this.spacing = spacing;
      this.maximumWaypoints = maximumWaypoints;
      this.returnToOrigin = returnToOrigin;
      this.offsets = List.copyOf(offsets);
      this.constraint = constraint;
      this.result = result;
      this.previousPosition = Objects.requireNonNull(
        context.bot().minecraft().player
      ).position();
    }

    @Override
    public void tick() {
      if (result.isDone()) {
        return;
      }
      ticks++;
      try {
        switch (stage) {
          case SELECT_FRONTIER -> selectFrontier();
          case TRAVEL -> travel();
          case RETURN -> returnToOrigin();
        }
      } catch (Throwable throwable) {
        result.completeExceptionally(throwable);
      }
    }

    private void selectFrontier() {
      if (
        maximumWaypoints > 0
          && waypointsVisited >= maximumWaypoints
      ) {
        finishBoundedExploration();
        return;
      }
      for (var index = 0; index < offsets.size(); index++) {
        if (!attemptedOffsets.add(index)) {
          continue;
        }
        var offset = offsets.get(index);
        var candidate = new Vec3(
          origin.x + (double) offset.x() * spacing,
          origin.y,
          origin.z + (double) offset.z() * spacing
        );
        target = candidate;
        path = PathExecutor.createPathfinding(
          context.bot(),
          new XZGoal(
            (int) Math.floor(candidate.x),
            (int) Math.floor(candidate.z)
          ),
          constraint
        );
        path.onStarted();
        stage = Stage.TRAVEL;
        report("Traveling to exploration frontier");
        return;
      }
      complete(
        ExploreCompletionReason
          .EXPLORE_COMPLETION_REASON_AREA_EXHAUSTED
      );
    }

    private void travel() {
      var activePath = Objects.requireNonNull(path);
      if (!activePath.isDone()) {
        activePath.tick();
        report(activePath.progress().planning()
          ? "Planning route to exploration frontier"
          : "Exploring frontier");
        return;
      }
      path = null;
      try {
        activePath.completion().join();
        activePath.onStopped(ControlStopReason.COMPLETED, null);
        addTravelDistance();
        waypointsVisited++;
        target = null;
        stage = Stage.SELECT_FRONTIER;
        report("Exploration waypoint reached");
      } catch (CompletionException exception) {
        var cause = Objects.requireNonNullElse(
          exception.getCause(),
          exception
        );
        activePath.onStopped(ControlStopReason.FAILED, cause);
        failedRoutes++;
        target = null;
        stage = Stage.SELECT_FRONTIER;
        report("Exploration route failed; trying another frontier");
      }
    }

    private void finishBoundedExploration() {
      if (!returnToOrigin) {
        complete(
          ExploreCompletionReason
            .EXPLORE_COMPLETION_REASON_WAYPOINT_LIMIT_REACHED
        );
        return;
      }
      path = PathExecutor.createPathfinding(
        context.bot(),
        new CloseToPosGoal(SFVec3i.fromDouble(origin), 2),
        constraint
      );
      path.onStarted();
      target = origin;
      stage = Stage.RETURN;
      report("Returning to exploration origin");
    }

    private void returnToOrigin() {
      var activePath = Objects.requireNonNull(path);
      if (!activePath.isDone()) {
        activePath.tick();
        report(activePath.progress().planning()
          ? "Planning return route"
          : "Returning to exploration origin");
        return;
      }
      path = null;
      try {
        activePath.completion().join();
        activePath.onStopped(ControlStopReason.COMPLETED, null);
        addTravelDistance();
        complete(
          ExploreCompletionReason
            .EXPLORE_COMPLETION_REASON_RETURNED_TO_ORIGIN
        );
      } catch (CompletionException exception) {
        var cause = Objects.requireNonNullElse(
          exception.getCause(),
          exception
        );
        activePath.onStopped(ControlStopReason.FAILED, cause);
        result.completeExceptionally(cause);
      }
    }

    private void addTravelDistance() {
      var current = Objects.requireNonNull(
        context.bot().minecraft().player
      ).position();
      var dx = current.x - previousPosition.x;
      var dz = current.z - previousPosition.z;
      horizontalDistanceTraveled += Math.sqrt(dx * dx + dz * dz);
      previousPosition = current;
    }

    private void report(String message) {
      var builder = BotTaskProgress.newBuilder()
        .setMessage(message)
        .setCurrent(waypointsVisited);
      if (maximumWaypoints > 0) {
        builder
          .setTotal(maximumWaypoints)
          .setFraction(Math.min(
            1.0,
            (double) waypointsVisited / maximumWaypoints
          ));
      }
      context.reportProgress(builder.build());
    }

    private void complete(ExploreCompletionReason reason) {
      var player = context.bot().minecraft().player;
      var level = context.bot().minecraft().level;
      var builder = ExploreTaskResult.newBuilder()
        .setReason(reason)
        .setWaypointsVisited(waypointsVisited)
        .setFailedRoutes(failedRoutes)
        .setHorizontalDistanceTraveled(
          horizontalDistanceTraveled
        );
      if (player != null && level != null) {
        builder.setFinalPosition(WorldPosition.newBuilder()
          .setX(player.getX())
          .setY(player.getY())
          .setZ(player.getZ())
          .setDimension(level.dimension().identifier().toString()));
      }
      result.complete(builder.build());
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
      var activePath = path;
      path = null;
      if (activePath != null) {
        activePath.onStopped(reason, cause);
      }
      if (reason != ControlStopReason.COMPLETED && !result.isDone()) {
        result.cancel(true);
      }
    }

    @Override
    public String description() {
      return "Explore frontier";
    }
  }

  private record GridOffset(int x, int z) {
  }

  private enum Stage {
    SELECT_FRONTIER,
    TRAVEL,
    RETURN
  }
}
