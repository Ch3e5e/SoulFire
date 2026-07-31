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
package com.soulfiremc.server.grpc;

import com.soulfiremc.grpc.generated.*;
import com.soulfiremc.server.SoulFireServer;
import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.bot.BotThreadExecution;
import com.soulfiremc.server.pathfinding.PathfindingSupport;
import com.soulfiremc.server.pathfinding.RouteFinder;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.execution.BlockBreakAction;
import com.soulfiremc.server.pathfinding.execution.BlockPlaceAction;
import com.soulfiremc.server.pathfinding.execution.GapJumpAction;
import com.soulfiremc.server.pathfinding.execution.InteractBlockAction;
import com.soulfiremc.server.pathfinding.execution.JumpAndPlaceBelowAction;
import com.soulfiremc.server.pathfinding.execution.MovementAction;
import com.soulfiremc.server.pathfinding.execution.PathExecutor;
import com.soulfiremc.server.pathfinding.execution.RecalculatePathAction;
import com.soulfiremc.server.pathfinding.execution.WorldAction;
import com.soulfiremc.server.user.PermissionContext;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;

import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CompletionException;

/// Read-only route planning and path diagnostics.
public final class PathfinderServiceImpl
  extends PathfinderServiceGrpc.PathfinderServiceImplBase {
  private final SoulFireServer server;

  public PathfinderServiceImpl(SoulFireServer server) {
    this.server = server;
  }

  @Override
  public void planPath(
    PlanPathRequest request,
    StreamObserver<PlanPathResponse> responseObserver
  ) {
    try {
      var bot = requireBot(request);
      var setup = BotThreadExecution.call(bot, () -> {
        var level = Objects.requireNonNull(
          bot.minecraft().level,
          "Bot level is not available"
        );
        return new PlanningSetup(
          PathfindingSupport.resolveGoal(bot, request.getGoal()).scorer(),
          PathfindingSupport.buildConstraint(bot, request.getOptions()),
          level.dimension().identifier().toString()
        );
      });
      PathExecutor.plan(bot, setup.goal, setup.constraint)
        .whenComplete((route, error) -> {
          if (error != null) {
            responseObserver.onError(toGrpcError(error));
            return;
          }
          try {
            responseObserver.onNext(PlanPathResponse.newBuilder()
              .setPlan(toProto(
                setup.dimension,
                route,
                request.getIncludeDescriptions()
              ))
              .build());
            responseObserver.onCompleted();
          } catch (Throwable throwable) {
            responseObserver.onError(toGrpcError(throwable));
          }
        });
    } catch (Throwable throwable) {
      responseObserver.onError(toGrpcError(throwable));
    }
  }

  private BotConnection requireBot(PlanPathRequest request) {
    var instanceId = parseUuid(request.getInstanceId(), "instance_id");
    var botId = parseUuid(request.getBotId(), "bot_id");
    ServerRPCConstants.USER_CONTEXT_KEY.get().hasPermissionOrThrow(
      PermissionContext.instance(InstancePermission.READ_BOT_INFO, instanceId)
    );
    var instance = server.getInstance(instanceId)
      .orElseThrow(() -> Status.NOT_FOUND
        .withDescription("Instance not found: " + instanceId)
        .asRuntimeException());
    var bot = instance.botConnections().get(botId);
    if (bot == null || bot.isDisconnected()) {
      throw Status.FAILED_PRECONDITION
        .withDescription("Bot must be online to plan a path")
        .asRuntimeException();
    }
    return bot;
  }

  private static PathPlan toProto(
    String dimension,
    PathExecutor.PlannedRoute route,
    boolean includeDescriptions
  ) {
    var result = route.routeSearchResult();
    var builder = PathPlan.newBuilder()
      .setStatus(status(result))
      .setStart(position(route.start(), dimension));
    var actions = actions(result);
    long maximumTicks = 0;
    for (var index = 0; index < actions.size(); index++) {
      var action = actions.get(index);
      var ticks = Math.max(0, action.getAllowedTicks());
      maximumTicks = Math.addExact(maximumTicks, ticks);
      var target = target(action, route.start());
      var step = PathStep.newBuilder()
        .setIndex(index)
        .setKind(kind(action))
        .setPosition(position(target, dimension))
        .setMaximumTicks(ticks);
      if (includeDescriptions) {
        step.setDescription(action.toString());
      }
      builder.addSteps(step);
      switch (action) {
        case BlockBreakAction breakAction ->
          builder.addBlocksToBreak(position(
            breakAction.blockPosition(),
            dimension
          ));
        case BlockPlaceAction placeAction ->
          builder.addBlocksToPlace(position(
            placeAction.blockPosition(),
            dimension
          ));
        case JumpAndPlaceBelowAction jumpAndPlace ->
          builder.addBlocksToPlace(position(
            jumpAndPlace.blockPlacePosition(),
            dimension
          ));
        default -> {
        }
      }
    }
    builder.setMaximumTicks(maximumTicks);
    switch (result) {
      case RouteFinder.PartialRouteResult _ ->
        builder.setPartialReason("The route reached the edge of loaded world data");
      case RouteFinder.NoRouteFoundResult _ ->
        builder.setPartialReason("No route could reach the goal");
      case RouteFinder.SearchExpiredResult _ ->
        builder.setPartialReason("The configured path search timeout expired");
      case RouteFinder.SearchInterruptedResult _ ->
        builder.setPartialReason("The path search was interrupted");
      default -> {
      }
    }
    return builder.build();
  }

  private static List<WorldAction> actions(
    RouteFinder.RouteSearchResult result
  ) {
    return switch (result) {
      case RouteFinder.FoundRouteResult found -> found.actions();
      case RouteFinder.PartialRouteResult partial -> partial.actions();
      case RouteFinder.SearchExpiredResult expired -> expired.actions();
      default -> List.of();
    };
  }

  private static PathPlanStatus status(RouteFinder.RouteSearchResult result) {
    return switch (result) {
      case RouteFinder.FoundRouteResult _ ->
        PathPlanStatus.PATH_PLAN_STATUS_COMPLETE;
      case RouteFinder.PartialRouteResult _ ->
        PathPlanStatus.PATH_PLAN_STATUS_PARTIAL;
      case RouteFinder.NoRouteFoundResult _ ->
        PathPlanStatus.PATH_PLAN_STATUS_UNREACHABLE;
      case RouteFinder.SearchExpiredResult _ ->
        PathPlanStatus.PATH_PLAN_STATUS_SEARCH_EXPIRED;
      case RouteFinder.SearchInterruptedResult _ ->
        PathPlanStatus.PATH_PLAN_STATUS_CANCELLED;
    };
  }

  private static PathStepKind kind(WorldAction action) {
    return switch (action) {
      case MovementAction _ -> PathStepKind.PATH_STEP_KIND_MOVE;
      case BlockBreakAction _ -> PathStepKind.PATH_STEP_KIND_BREAK_BLOCK;
      case BlockPlaceAction _ -> PathStepKind.PATH_STEP_KIND_PLACE_BLOCK;
      case JumpAndPlaceBelowAction _, GapJumpAction _ ->
        PathStepKind.PATH_STEP_KIND_JUMP;
      case InteractBlockAction _ -> PathStepKind.PATH_STEP_KIND_INTERACT;
      case RecalculatePathAction _ ->
        PathStepKind.PATH_STEP_KIND_RECALCULATE;
    };
  }

  private static SFVec3i target(
    WorldAction action,
    SFVec3i fallback
  ) {
    return switch (action) {
      case MovementAction movement -> movement.blockPosition();
      case BlockBreakAction breakAction -> breakAction.blockPosition();
      case BlockPlaceAction placeAction -> placeAction.blockPosition();
      case JumpAndPlaceBelowAction jumpAndPlace ->
        jumpAndPlace.blockPlacePosition().add(0, 1, 0);
      case GapJumpAction gapJump -> gapJump.blockPosition();
      case InteractBlockAction interact -> interact.blockPosition();
      case RecalculatePathAction _ -> fallback;
    };
  }

  private static BlockPosition position(SFVec3i position, String dimension) {
    return BlockPosition.newBuilder()
      .setX(position.x)
      .setY(position.y)
      .setZ(position.z)
      .setDimension(dimension)
      .build();
  }

  private static UUID parseUuid(String value, String field) {
    try {
      return UUID.fromString(value);
    } catch (IllegalArgumentException exception) {
      throw Status.INVALID_ARGUMENT
        .withDescription(field + " must be a UUID")
        .withCause(exception)
        .asRuntimeException();
    }
  }

  private static StatusRuntimeException toGrpcError(Throwable throwable) {
    var cause = throwable;
    while (cause instanceof CompletionException && cause.getCause() != null) {
      cause = cause.getCause();
    }
    if (cause instanceof StatusRuntimeException status) {
      return status;
    }
    return Status.INTERNAL
      .withDescription(Objects.requireNonNullElse(
        cause.getMessage(),
        cause.getClass().getSimpleName()
      ))
      .withCause(cause)
      .asRuntimeException();
  }

  private record PlanningSetup(
    com.soulfiremc.server.pathfinding.goals.GoalScorer goal,
    com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint constraint,
    String dimension
  ) {}
}
