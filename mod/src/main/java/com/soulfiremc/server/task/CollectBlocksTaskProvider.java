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
import com.soulfiremc.grpc.generated.CollectBlocksCompletionReason;
import com.soulfiremc.grpc.generated.CollectBlocksTask;
import com.soulfiremc.grpc.generated.CollectBlocksTaskResult;
import com.soulfiremc.grpc.generated.WorldPosition;
import com.soulfiremc.server.api.BotTaskExecution;
import com.soulfiremc.server.api.BotTaskProvider;
import com.soulfiremc.server.bot.ControlPriority;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.execution.BlockBreakRejectedException;
import com.soulfiremc.server.pathfinding.execution.PathExecutor;
import com.soulfiremc.server.pathfinding.execution.UnreachableGoalException;
import com.soulfiremc.server.pathfinding.goals.BreakBlockPosGoal;
import com.soulfiremc.server.pathfinding.goals.CompositeGoal;
import com.soulfiremc.server.pathfinding.graph.constraint.BlockBreakBlacklistConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.NoBlockPlacingConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraintImpl;
import io.grpc.Status;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.block.state.BlockState;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.stream.Collectors;

/// Durable block collection provider backed by repeated live path searches.
public final class CollectBlocksTaskProvider
  implements BotTaskProvider<CollectBlocksTask> {
  private static final int DEFAULT_SEARCH_RADIUS = 32;
  private static final int MAX_SEARCH_RADIUS = 64;
  private static final int MAX_CANDIDATES = 256;
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY
  );

  @Override
  public CollectBlocksTask inputPrototype() {
    return CollectBlocksTask.getDefaultInstance();
  }

  @Override
  public String summary(CollectBlocksTask input) {
    return "Collect " + Math.max(1, input.getCount()) + " matching blocks";
  }

  @Override
  public Set<ControlResource> resources(CollectBlocksTask input) {
    return RESOURCES;
  }

  @Override
  public BotTaskExecution start(
    BotTaskContext context,
    CollectBlocksTask input
  ) {
    if (input.getBlockIdsList().isEmpty() && input.getTagsList().isEmpty()) {
      throw Status.INVALID_ARGUMENT
        .withDescription("block_ids or tags must contain at least one selector")
        .asRuntimeException();
    }
    var count = Math.max(1, input.getCount());
    var radius = input.getSearchRadius() == 0
      ? DEFAULT_SEARCH_RADIUS
      : Math.min(input.getSearchRadius(), MAX_SEARCH_RADIUS);
    var result = new CompletableFuture<CollectBlocksTaskResult>();
    var control = new CollectBlocksControl(
      context,
      normalize(input.getBlockIdsList()),
      normalize(input.getTagsList()),
      count,
      radius,
      input.getOptions().getAllowPlacing(),
      result
    );
    return new BotTaskExecution(control, result);
  }

  private static Set<String> normalize(List<String> values) {
    return values.stream()
      .map(value -> value.indexOf(':') < 0
        ? "minecraft:" + value
        : value)
      .collect(Collectors.toUnmodifiableSet());
  }

  private static final class CollectBlocksControl implements ControlTask {
    private final BotTaskContext context;
    private final Set<String> blockIds;
    private final Set<String> tags;
    private final int targetCount;
    private final int searchRadius;
    private final boolean allowPlacing;
    private final CompletableFuture<CollectBlocksTaskResult> result;
    private final Set<SFVec3i> rejectedTargets = new HashSet<>();
    private @Nullable PathExecutor activePath;
    private Set<SFVec3i> activeTargets = Set.of();
    private int blocksBroken;

    private CollectBlocksControl(
      BotTaskContext context,
      Set<String> blockIds,
      Set<String> tags,
      int targetCount,
      int searchRadius,
      boolean allowPlacing,
      CompletableFuture<CollectBlocksTaskResult> result
    ) {
      this.context = context;
      this.blockIds = blockIds;
      this.tags = tags;
      this.targetCount = targetCount;
      this.searchRadius = searchRadius;
      this.allowPlacing = allowPlacing;
      this.result = result;
    }

    @Override
    public void tick() {
      if (result.isDone()) {
        return;
      }
      if (activePath != null) {
        tickActivePath();
        return;
      }
      if (blocksBroken >= targetCount) {
        complete(
          CollectBlocksCompletionReason
            .COLLECT_BLOCKS_COMPLETION_REASON_TARGET_REACHED
        );
        return;
      }

      var candidates = findCandidates();
      if (candidates.isEmpty()) {
        complete(
          rejectedTargets.isEmpty()
            ? CollectBlocksCompletionReason
              .COLLECT_BLOCKS_COMPLETION_REASON_NO_MATCHING_BLOCKS
            : CollectBlocksCompletionReason
              .COLLECT_BLOCKS_COMPLETION_REASON_NO_REACHABLE_BLOCKS
        );
        return;
      }
      context.reportProgress(progress("Planning route to matching block"));
      PathConstraint constraint = new PathConstraintImpl(context.bot());
      if (!rejectedTargets.isEmpty()) {
        constraint = new BlockBreakBlacklistConstraint(
          constraint,
          rejectedTargets
        );
      }
      if (!allowPlacing) {
        constraint = new NoBlockPlacingConstraint(constraint);
      }
      activeTargets = Set.copyOf(candidates);
      activePath = PathExecutor.createPathfinding(
        context.bot(),
        new CompositeGoal(candidates.stream()
          .map(BreakBlockPosGoal::new)
          .collect(Collectors.toUnmodifiableSet())),
        constraint
      );
      activePath.onStarted();
    }

    private void tickActivePath() {
      var path = activePath;
      if (path == null) {
        return;
      }
      if (!path.isDone()) {
        path.tick();
        var confirmedBreaks = confirmedBreaks(path);
        var remaining = targetCount - blocksBroken;
        if (confirmedBreaks >= remaining) {
          blocksBroken = targetCount;
          activeTargets = Set.of();
          activePath = null;
          path.completeEarly();
          complete(
            CollectBlocksCompletionReason
              .COLLECT_BLOCKS_COMPLETION_REASON_TARGET_REACHED
          );
          return;
        }
        var pathProgress = path.progress();
        context.reportProgress(progress(pathProgress.planning()
          ? "Planning collection route"
          : "Mining matching block"));
        return;
      }
      activePath = null;
      try {
        path.completion().join();
        path.onStopped(ControlStopReason.COMPLETED, null);
        var confirmedBreaks = confirmedBreaks(path);
        activeTargets = Set.of();
        if (confirmedBreaks == 0) {
          context.reportProgress(progress(
            "Route completed without mining a matching block"
          ));
          return;
        }
        blocksBroken += (int) Math.min(
          confirmedBreaks,
          targetCount - blocksBroken
        );
        context.reportProgress(progress("Matching block mined"));
      } catch (CompletionException exception) {
        blocksBroken += (int) Math.min(
          confirmedBreaks(path),
          targetCount - blocksBroken
        );
        activeTargets = Set.of();
        if (blocksBroken >= targetCount) {
          complete(
            CollectBlocksCompletionReason
              .COLLECT_BLOCKS_COMPLETION_REASON_TARGET_REACHED
          );
          return;
        }
        var cause = exception.getCause() == null
          ? exception
          : exception.getCause();
        path.onStopped(ControlStopReason.FAILED, cause);
        if (cause instanceof UnreachableGoalException) {
          complete(
            CollectBlocksCompletionReason
              .COLLECT_BLOCKS_COMPLETION_REASON_NO_REACHABLE_BLOCKS
          );
          return;
        }
        if (
          cause instanceof BlockBreakRejectedException rejection
        ) {
          rejectedTargets.add(rejection.blockPosition());
          context.reportProgress(progress(
            "Skipping a matching block rejected by the server"
          ));
          return;
        }
        result.completeExceptionally(cause);
      }
    }

    private long confirmedBreaks(PathExecutor path) {
      return path.completedBlockBreaks().stream()
        .filter(activeTargets::contains)
        .count();
    }

    private List<SFVec3i> findCandidates() {
      var bot = context.bot();
      var player = bot.minecraft().player;
      var level = bot.minecraft().level;
      if (player == null || level == null) {
        return List.of();
      }
      var origin = player.blockPosition();
      var radiusSquared = searchRadius * searchRadius;
      var minimumY = Math.max(level.getMinY(), origin.getY() - searchRadius);
      var maximumY = Math.min(level.getMaxY(), origin.getY() + searchRadius);
      var candidates = new HashSet<SFVec3i>();
      for (var x = -searchRadius; x <= searchRadius; x++) {
        for (var z = -searchRadius; z <= searchRadius; z++) {
          if (x * x + z * z > radiusSquared) {
            continue;
          }
          for (var y = minimumY; y <= maximumY; y++) {
            var offsetY = y - origin.getY();
            if (x * x + offsetY * offsetY + z * z > radiusSquared) {
              continue;
            }
            var position = origin.offset(x, offsetY, z);
            if (!level.hasChunkAt(position)) {
              continue;
            }
            var state = level.getBlockState(position);
            if (matches(position, state)) {
              candidates.add(SFVec3i.fromInt(position));
            }
          }
        }
      }
      return candidates.stream()
        .sorted(Comparator.comparingDouble(position ->
          position.toBlockPos().distSqr(origin)))
        .limit(MAX_CANDIDATES)
        .toList();
    }

    private boolean matches(BlockPos position, BlockState state) {
      if (rejectedTargets.contains(SFVec3i.fromInt(position))) {
        return false;
      }
      var blockId = BuiltInRegistries.BLOCK
        .getKey(state.getBlock())
        .toString();
      if (!blockIds.isEmpty() && !blockIds.contains(blockId)) {
        return false;
      }
      for (var tag : tags) {
        if (!state.is(TagKey.create(
          Registries.BLOCK,
          Identifier.parse(tag)
        ))) {
          return false;
        }
      }
      return !state.isAir()
        && state.getDestroySpeed(
        context.bot().minecraft().level,
        position
      ) >= 0;
    }

    private BotTaskProgress progress(String message) {
      return BotTaskProgress.newBuilder()
        .setMessage(message)
        .setCurrent(blocksBroken)
        .setTotal(targetCount)
        .setFraction(Math.min(
          1.0,
          (double) blocksBroken / targetCount
        ))
        .build();
    }

    private void complete(CollectBlocksCompletionReason reason) {
      var player = context.bot().minecraft().player;
      var level = context.bot().minecraft().level;
      var builder = CollectBlocksTaskResult.newBuilder()
        .setReason(reason)
        .setBlocksBroken(blocksBroken);
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
      activeTargets = Set.of();
      if (path != null) {
        path.onStopped(reason, cause);
      }
      if (reason != ControlStopReason.COMPLETED && !result.isDone()) {
        result.cancel(true);
      }
    }

    @Override
    public String description() {
      return "Collect blocks";
    }
  }
}
