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
package com.soulfiremc.server.pathfinding.execution;

import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.bot.ControlPriority;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.pathfinding.NodeState;
import com.soulfiremc.server.pathfinding.RouteFinder;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.goals.GoalScorer;
import com.soulfiremc.server.pathfinding.graph.MinecraftGraph;
import com.soulfiremc.server.pathfinding.graph.ProjectedInventory;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint;
import com.soulfiremc.server.util.SFBlockHelpers;
import com.soulfiremc.server.util.SFHelpers;
import com.soulfiremc.server.util.TimeUtil;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Queue;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

@Slf4j
public final class PathExecutor implements ControlTask {
  private static final Set<ControlResource> RESOURCES = Set.of(
    ControlResource.MOVEMENT,
    ControlResource.ROTATION,
    ControlResource.MAIN_HAND,
    ControlResource.INVENTORY
  );
  private static final int MAX_ERROR_DISTANCE = 20;
  private static final int MAX_CONSECUTIVE_STATIONARY_PARTIAL_ROUTES = 3;
  private static final int MAX_CONSECUTIVE_STALLED_ACTIONS = 5;
  private final Queue<WorldAction> worldActionQueue = new LinkedBlockingQueue<>();
  private final Set<SFVec3i> completedBlockBreaks = new HashSet<>();
  private final BotConnection connection;
  private final LiveRouteFinder findPath;
  private final CompletableFuture<Void> pathCompletionFuture;
  private final PartialRouteProgressGuard partialRouteProgressGuard =
    new PartialRouteProgressGuard(
      MAX_CONSECUTIVE_STATIONARY_PARTIAL_ROUTES
    );
  private final ActionStallGuard actionStallGuard =
    new ActionStallGuard(MAX_CONSECUTIVE_STALLED_ACTIONS);
  private volatile boolean awaitingPath;
  private int totalMovements;
  private int ticks;
  private int movementNumber = 1;

  @Override
  public Set<ControlResource> resources() {
    return RESOURCES;
  }

  private PathExecutor(
    BotConnection connection,
    LiveRouteFinder findPath,
    CompletableFuture<Void> pathCompletionFuture) {
    this.connection = connection;
    this.findPath = findPath;
    this.pathCompletionFuture = pathCompletionFuture;
  }

  private static List<WorldAction> repositionIfNeeded(List<WorldAction> actions, SFVec3i from, boolean requiresRepositioning, LiveRouteFinder findPath) {
    if (!requiresRepositioning) {
      return actions;
    }

    var repositionActions = new ArrayList<WorldAction>();
    repositionActions.add(new MovementAction(from, false, findPath.pathConstraint));
    repositionActions.addAll(actions);

    return repositionActions;
  }

  private static List<WorldAction> addRecalculate(List<WorldAction> actions) {
    var repositionActions = new ArrayList<>(actions);
    repositionActions.add(new RecalculatePathAction());

    return repositionActions;
  }

  public static CompletableFuture<Void> executePathfinding(BotConnection bot, GoalScorer goalScorer, PathConstraint pathConstraint) {
    var pathExecutor = createPathfinding(bot, goalScorer, pathConstraint);
    bot.botControl().replace(pathExecutor);
    return pathExecutor.completion();
  }

  public static PathExecutor createPathfinding(
    BotConnection bot,
    GoalScorer goalScorer,
    PathConstraint pathConstraint
  ) {
    var completion = new CompletableFuture<Void>();
    bot.shutdownHooks().add(() -> completion.cancel(true));
    return new PathExecutor(
      bot,
      new LiveRouteFinder(bot, goalScorer, pathConstraint),
      completion
    );
  }

  public static CompletableFuture<PlannedRoute> plan(
    BotConnection bot,
    GoalScorer goalScorer,
    PathConstraint pathConstraint
  ) {
    var finder = new LiveRouteFinder(bot, goalScorer, pathConstraint);
    return bot.scheduler().supplyAsync(finder::findPath);
  }

  public CompletableFuture<Void> completion() {
    return pathCompletionFuture;
  }

  public Progress progress() {
    return new Progress(awaitingPath, movementNumber, totalMovements);
  }

  public Set<SFVec3i> completedBlockBreaks() {
    return Set.copyOf(completedBlockBreaks);
  }

  public void completeEarly() {
    if (isDone()) {
      return;
    }

    awaitingPath = false;
    stopActiveBlockBreak();
    worldActionQueue.clear();
    connection.controlState().resetAll();
    pathCompletionFuture.complete(null);
  }

  @Override
  public void onStarted() {
    submitForPathCalculation(true);
  }

  @Override
  public ControlPriority priority() {
    return ControlPriority.HIGH;
  }

  @Override
  public String description() {
    return "PathExecutor";
  }

  @Override
  public boolean isDone() {
    return pathCompletionFuture.isDone();
  }

  public void submitForPathCalculation(boolean isInitial) {
    if (awaitingPath || isDone()) {
      return;
    }

    awaitingPath = true;
    stopActiveBlockBreak();
    worldActionQueue.clear();
    connection.controlState().resetAll();

    connection.scheduler().schedule(() -> {
      try {
        if (isDone()) {
          return;
        }

        if (!isInitial) {
          log.info("Waiting for one second for bot to finish falling...");
          TimeUtil.waitTime(1, TimeUnit.SECONDS);
          if (isDone()) {
            return;
          }
        }

        var routeSearchResult = findPath.findPath();
        if (isDone()) {
          return;
        }

        SFHelpers.mustSupply(() -> switch (routeSearchResult.routeSearchResult()) {
          case RouteFinder.FoundRouteResult foundRouteResult -> () -> {
            partialRouteProgressGuard.reset();
            var newActions = repositionIfNeeded(foundRouteResult.actions(), routeSearchResult.start(), isInitial, this.findPath);
            if (newActions.isEmpty()) {
              log.info("We're already at the goal!");
              awaitingPath = false;
              pathCompletionFuture.complete(null);
              return;
            }

            log.info("Found path with {} actions!", newActions.size());

            preparePath(newActions);
          };
          case RouteFinder.NoRouteFoundResult _ ->
            throw UnreachableGoalException.noRoute();
          case RouteFinder.PartialRouteResult partialRouteResult -> () -> {
            preparePartialPath(
              partialRouteResult.actions(),
              routeSearchResult.start(),
              isInitial
            );
          };
          case RouteFinder.SearchExpiredResult searchExpiredResult -> () -> {
            log.info(
              "Using the best partial route found before the search deadline"
            );
            preparePartialPath(
              searchExpiredResult.actions(),
              routeSearchResult.start(),
              isInitial
            );
          };
          case RouteFinder.SearchInterruptedResult _ -> throw new IllegalStateException("Route search was interrupted before finding a route!");
        });
      } catch (Throwable t) {
        log.error("Error while calculating path", t);
        awaitingPath = false;
        pathCompletionFuture.completeExceptionally(t);
      }
    });
  }

  private void preparePartialPath(
    List<WorldAction> actions,
    SFVec3i start,
    boolean isInitial
  ) {
    var routeEndpoint = actions.isEmpty()
      ? start
      : actions.getLast().targetPosition(connection);
    if (partialRouteProgressGuard.shouldAbort(routeEndpoint)) {
      awaitingPath = false;
      pathCompletionFuture.completeExceptionally(
        UnreachableGoalException.stalled(
          MAX_CONSECUTIVE_STATIONARY_PARTIAL_ROUTES
        )
      );
      return;
    }
    var newActions = addRecalculate(
      repositionIfNeeded(actions, start, isInitial, findPath)
    );
    log.info("Found path with {} actions!", newActions.size());
    preparePath(newActions);
  }

  public void preparePath(List<WorldAction> worldActions) {
    this.worldActionQueue.clear();
    this.worldActionQueue.addAll(worldActions);
    this.totalMovements = worldActions.size();
    this.ticks = 0;
    this.movementNumber = 1;
    this.awaitingPath = false;
  }

  @Override
  public void tick() {
    if (isDone()) {
      return;
    }

    if (awaitingPath || worldActionQueue.isEmpty()) {
      return;
    }

    var worldAction = worldActionQueue.peek();
    if (worldAction == null) {
      return;
    }

    if (worldAction instanceof RecalculatePathAction) {
      log.info("Recalculating path...");
      recalculatePath();
      return;
    }

    if (ticks > 0 && ticks >= worldAction.getAllowedTicks()) {
      var playerPosition = SFVec3i.fromInt(
        connection.minecraft().player.blockPosition()
      );
      if (actionStallGuard.shouldAbort(
        worldAction.toString(),
        playerPosition
      )) {
        pathCompletionFuture.completeExceptionally(
          UnreachableGoalException.stalledAction(
            MAX_CONSECUTIVE_STALLED_ACTIONS,
            worldAction.toString()
          )
        );
        return;
      }
      log.warn("Took too long to complete action: {}", worldAction);
      log.warn("Recalculating path...");
      recalculatePath();
      return;
    }

    if (SFVec3i.fromInt(connection.minecraft().player.blockPosition())
      .distance(worldAction.targetPosition(connection)) > MAX_ERROR_DISTANCE) {
      log.warn("More than {} blocks away from target, this must be a mistake!", MAX_ERROR_DISTANCE);
      log.warn("Recalculating path...");
      recalculatePath();
      return;
    }

    if (
      worldAction instanceof BlockBreakAction blockBreakAction
        && blockBreakAction.isRejected(connection)
    ) {
      pathCompletionFuture.completeExceptionally(
        new BlockBreakRejectedException(blockBreakAction.blockPosition())
      );
      return;
    }
    if (
      worldAction instanceof BlockPlaceAction blockPlaceAction
        && blockPlaceAction.isRejected(connection)
    ) {
      pathCompletionFuture.completeExceptionally(
        new BlockPlaceRejectedException(blockPlaceAction.blockPosition())
      );
      return;
    }
    if (
      worldAction
        instanceof JumpAndPlaceBelowAction jumpAndPlaceBelowAction
        && jumpAndPlaceBelowAction.isRejected(connection)
    ) {
      pathCompletionFuture.completeExceptionally(
        new BlockPlaceRejectedException(
          jumpAndPlaceBelowAction.blockPlacePosition()
        )
      );
      return;
    }

    if (worldAction.isCompleted(connection)) {
      if (
        worldAction instanceof BlockBreakAction blockBreakAction
          && blockBreakAction.breakAttempted()
      ) {
        completedBlockBreaks.add(blockBreakAction.blockPosition());
      }
      worldActionQueue.remove();
      log.info("Reached goal {}/{} in {} ticks!", movementNumber, totalMovements, ticks);
      movementNumber++;
      ticks = 0;

      // Directly use tick to execute next goal
      worldAction = worldActionQueue.peek();

      // If there are no more goals, stop
      if (worldAction == null) {
        log.info("Finished all goals!");
        connection.controlState().resetAll();
        pathCompletionFuture.complete(null);
        return;
      }

      if (worldAction instanceof RecalculatePathAction) {
        log.info("Recalculating path...");
        recalculatePath();
        return;
      }

      log.debug("Next goal: {}", worldAction);
    }

    ticks++;
    worldAction.tick(connection);
  }

  @Override
  public void onSuspended() {
    stopActiveBlockBreak();
    connection.controlState().resetAll();
  }

  @Override
  public void onResumed() {
    if (!isDone() && !awaitingPath) {
      log.info("Resuming path execution, recalculating path...");
      recalculatePath();
    }
  }

  @Override
  public void onStopped(ControlStopReason reason, Throwable cause) {
    if (reason != ControlStopReason.COMPLETED && !isDone()) {
      pathCompletionFuture.cancel(true);
    }

    awaitingPath = false;
    stopActiveBlockBreak();
    worldActionQueue.clear();
    connection.controlState().resetAll();
  }

  private void stopActiveBlockBreak() {
    if (
      worldActionQueue.peek() instanceof BlockBreakAction blockBreakAction
        && blockBreakAction.breakAttempted()
    ) {
      var gameMode = connection.minecraft().gameMode;
      if (gameMode != null) {
        gameMode.stopDestroyBlock();
      }
    }
  }

  public void recalculatePath() {
    submitForPathCalculation(false);
  }

  static final class PartialRouteProgressGuard {
    private final int maximumConsecutiveStationaryRoutes;
    private SFVec3i previousEndpoint;
    private int consecutiveStationaryRoutes;

    PartialRouteProgressGuard(int maximumConsecutiveStationaryRoutes) {
      if (maximumConsecutiveStationaryRoutes < 1) {
        throw new IllegalArgumentException(
          "maximumConsecutiveStationaryRoutes must be positive"
        );
      }
      this.maximumConsecutiveStationaryRoutes =
        maximumConsecutiveStationaryRoutes;
    }

    boolean shouldAbort(SFVec3i endpoint) {
      if (!Objects.equals(endpoint, previousEndpoint)) {
        previousEndpoint = endpoint;
        consecutiveStationaryRoutes = 1;
        return false;
      }
      consecutiveStationaryRoutes++;
      return consecutiveStationaryRoutes
        >= maximumConsecutiveStationaryRoutes;
    }

    void reset() {
      previousEndpoint = null;
      consecutiveStationaryRoutes = 0;
    }
  }

  private record LiveRouteFinder(
    BotConnection bot,
    GoalScorer goalScorer,
    PathConstraint pathConstraint
  ) {
    public PlannedRoute findPath() {
      var clientEntity = bot.minecraft().player;
      var level = Objects.requireNonNull(
        bot.minecraft().level,
        "Bot level is not available"
      );
      var inventory =
        new ProjectedInventory(clientEntity.getInventory(), clientEntity, pathConstraint);
      var start =
        SFVec3i.fromInt(clientEntity.blockPosition());
      var startBlockState = level.getBlockState(start.toBlockPos());
      if (SFBlockHelpers.isTopFullBlock(startBlockState)) {
        // If the player is inside a block, move them up
        start = start.add(0, 1, 0);
      }

      var routeFinder =
        new RouteFinder(new MinecraftGraph(level, inventory, pathConstraint), goalScorer, bot.scheduler());

      log.info("Starting calculations at: {}", start.formatXYZ());
      var routeSearchResultFuture = routeFinder.findRouteFuture(NodeState.forInfo(start, inventory));
      bot.shutdownHooks().add(() -> routeSearchResultFuture.cancel(true));
      var routeSearchResult = routeSearchResultFuture.join();
      log.info("Route search result: {}", routeSearchResult);

      return new PlannedRoute(routeSearchResult, start);
    }
  }

  public record PlannedRoute(
    RouteFinder.RouteSearchResult routeSearchResult,
    SFVec3i start
  ) {}

  public record Progress(boolean planning, int currentMovement, int totalMovements) {
  }

  static final class ActionStallGuard {
    private final int maximumConsecutiveStalls;
    private final Map<StalledAction, Integer> stalls = new HashMap<>();

    ActionStallGuard(int maximumConsecutiveStalls) {
      if (maximumConsecutiveStalls < 1) {
        throw new IllegalArgumentException(
          "maximumConsecutiveStalls must be positive"
        );
      }
      this.maximumConsecutiveStalls = maximumConsecutiveStalls;
    }

    boolean shouldAbort(String action, SFVec3i position) {
      var stalledAction = new StalledAction(action, position);
      var occurrences = stalls.merge(stalledAction, 1, Integer::sum);
      return occurrences >= maximumConsecutiveStalls;
    }

    private record StalledAction(String action, SFVec3i position) {}
  }
}
