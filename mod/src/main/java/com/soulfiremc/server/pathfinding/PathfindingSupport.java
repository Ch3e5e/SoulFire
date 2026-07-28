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
package com.soulfiremc.server.pathfinding;

import com.soulfiremc.grpc.generated.PathfindGoal;
import com.soulfiremc.grpc.generated.PathfindOptions;
import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.pathfinding.goals.AwayFromPosGoal;
import com.soulfiremc.server.pathfinding.goals.BreakBlockPosGoal;
import com.soulfiremc.server.pathfinding.goals.CloseToPosGoal;
import com.soulfiremc.server.pathfinding.goals.CompositeGoal;
import com.soulfiremc.server.pathfinding.goals.DynamicGoalScorer;
import com.soulfiremc.server.pathfinding.goals.GoalScorer;
import com.soulfiremc.server.pathfinding.goals.PlaceBlockGoal;
import com.soulfiremc.server.pathfinding.goals.PosGoal;
import com.soulfiremc.server.pathfinding.goals.XZGoal;
import com.soulfiremc.server.pathfinding.goals.YGoal;
import com.soulfiremc.server.pathfinding.graph.constraint.ConfiguredPathConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.NoBlockBreakingConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.NoBlockPlacingConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraintImpl;
import io.grpc.Status;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

import java.util.OptionalDouble;
import java.util.OptionalInt;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.StreamSupport;

/// Shared validation and resolution for pathfinding RPCs and durable tasks.
public final class PathfindingSupport {
  private static final int MAX_COMPOSITE_DEPTH = 16;
  private static final int MAX_COMPOSITE_GOALS = 64;

  private PathfindingSupport() {
  }

  public static ResolvedGoal resolveGoal(BotConnection bot, PathfindGoal goal) {
    return resolveGoal(bot, goal, 0);
  }

  private static ResolvedGoal resolveGoal(
    BotConnection bot,
    PathfindGoal goal,
    int depth
  ) {
    if (depth > MAX_COMPOSITE_DEPTH) {
      throw Status.INVALID_ARGUMENT
        .withDescription("Pathfinding goals may be nested at most 16 levels")
        .asRuntimeException();
    }
    var currentDimension = currentDimension(bot);
    return switch (goal.getGoalCase()) {
      case BLOCK -> {
        var block = goal.getBlock();
        validateDimension(currentDimension, block.getPosition().getDimension());
        var position = block.getPosition();
        var vector = SFVec3i.from(position.getX(), position.getY(), position.getZ());
        var radius = Math.max(1, Math.round(block.getRadius()));
        var scorer = block.getRadius() <= 0
          ? (GoalScorer) new PosGoal(vector)
          : new CloseToPosGoal(vector, radius);
        yield new ResolvedGoal(
          scorer,
          _ -> Vec3.atCenterOf(vector.toBlockPos())
        );
      }
      case NEAR -> {
        var near = goal.getNear();
        validateDimension(currentDimension, near.getPosition().getDimension());
        var position = near.getPosition();
        var target = new Vec3(position.getX(), position.getY(), position.getZ());
        var radius = Math.max(1, Math.round(near.getRadius()));
        yield new ResolvedGoal(
          new CloseToPosGoal(SFVec3i.fromDouble(target), radius),
          _ -> target
        );
      }
      case ENTITY -> {
        var entityGoal = goal.getEntity();
        validateConnectionEpoch(
          bot,
          entityGoal.hasConnectionEpoch()
            ? entityGoal.getConnectionEpoch()
            : ""
        );
        var level = bot.minecraft().level;
        if (level == null) {
          throw Status.FAILED_PRECONDITION
            .withDescription("Level is not loaded")
            .asRuntimeException();
        }
        var entityId = entityGoal.getEntityId();
        var entity = findEntityById(level, entityId);
        if (entity == null) {
          throw Status.NOT_FOUND
            .withDescription("Entity '%d' is not observable".formatted(entityId))
            .asRuntimeException();
        }
        var initialPosition = entity.position();
        var radius = Math.max(1, Math.round(entityGoal.getRadius()));
        DynamicGoalScorer scorer = () -> {
          var liveLevel = bot.minecraft().level;
          var current = liveLevel == null ? null : findEntityById(liveLevel, entityId);
          var position = current == null ? initialPosition : current.position();
          return new CloseToPosGoal(SFVec3i.fromDouble(position), radius);
        };
        yield new ResolvedGoal(
          scorer,
          connection -> {
            var liveLevel = connection.minecraft().level;
            var current = liveLevel == null ? null : findEntityById(liveLevel, entityId);
            return current == null ? initialPosition : current.position();
          }
        );
      }
      case XZ -> {
        var xz = goal.getXz();
        validateDimension(currentDimension, xz.getDimension());
        var scorer = new XZGoal((int) Math.round(xz.getX()), (int) Math.round(xz.getZ()));
        yield new ResolvedGoal(
          scorer,
          connection -> {
            var player = connection.minecraft().player;
            return new Vec3(xz.getX(), player == null ? 0.0 : player.getY(), xz.getZ());
          }
        );
      }
      case Y -> {
        var y = goal.getY();
        validateDimension(currentDimension, y.getDimension());
        yield new ResolvedGoal(
          new YGoal(y.getY()),
          connection -> {
            var player = connection.minecraft().player;
            return new Vec3(
              player == null ? 0.0 : player.getX(),
              y.getY(),
              player == null ? 0.0 : player.getZ()
            );
          }
        );
      }
      case BREAK_BLOCK -> {
        var position = goal.getBreakBlock().getPosition();
        validateDimension(currentDimension, position.getDimension());
        var vector = SFVec3i.from(position.getX(), position.getY(), position.getZ());
        yield new ResolvedGoal(
          new BreakBlockPosGoal(vector),
          _ -> Vec3.atCenterOf(vector.toBlockPos())
        );
      }
      case PLACE_BLOCK -> {
        var position = goal.getPlaceBlock().getPosition();
        validateDimension(currentDimension, position.getDimension());
        var vector = SFVec3i.from(position.getX(), position.getY(), position.getZ());
        yield new ResolvedGoal(
          new PlaceBlockGoal(vector),
          _ -> Vec3.atCenterOf(vector.toBlockPos())
        );
      }
      case AWAY_FROM_POSITION -> {
        var away = goal.getAwayFromPosition();
        validateDimension(currentDimension, away.getPosition().getDimension());
        requirePositiveRadius(away.getRadius(), "away_from_position.radius");
        var position = away.getPosition();
        var origin = new Vec3(position.getX(), position.getY(), position.getZ());
        yield new ResolvedGoal(
          new AwayFromPosGoal(
            SFVec3i.fromDouble(origin),
            Math.max(1, Math.round(away.getRadius()))
          ),
          _ -> origin
        );
      }
      case AWAY_FROM_ENTITY -> {
        var away = goal.getAwayFromEntity();
        validateConnectionEpoch(
          bot,
          away.hasConnectionEpoch() ? away.getConnectionEpoch() : ""
        );
        requirePositiveRadius(away.getRadius(), "away_from_entity.radius");
        var level = bot.minecraft().level;
        if (level == null) {
          throw Status.FAILED_PRECONDITION
            .withDescription("Level is not loaded")
            .asRuntimeException();
        }
        var entity = findEntityById(level, away.getEntityId());
        if (entity == null) {
          throw Status.NOT_FOUND
            .withDescription(
              "Entity '%d' is not observable".formatted(away.getEntityId())
            )
            .asRuntimeException();
        }
        var initialPosition = entity.position();
        var radius = Math.max(1, Math.round(away.getRadius()));
        DynamicGoalScorer scorer = () -> {
          var liveLevel = bot.minecraft().level;
          var current = liveLevel == null
            ? null
            : findEntityById(liveLevel, away.getEntityId());
          var position = current == null ? initialPosition : current.position();
          return new AwayFromPosGoal(SFVec3i.fromDouble(position), radius);
        };
        yield new ResolvedGoal(
          scorer,
          connection -> {
            var liveLevel = connection.minecraft().level;
            var current = liveLevel == null
              ? null
              : findEntityById(liveLevel, away.getEntityId());
            return current == null ? initialPosition : current.position();
          }
        );
      }
      case ANY -> {
        var goals = goal.getAny().getGoalsList();
        if (goals.isEmpty()) {
          throw Status.INVALID_ARGUMENT
            .withDescription("any.goals must contain at least one goal")
            .asRuntimeException();
        }
        if (goals.size() > MAX_COMPOSITE_GOALS) {
          throw Status.INVALID_ARGUMENT
            .withDescription("any.goals may contain at most 64 goals")
            .asRuntimeException();
        }
        var resolved = goals.stream()
          .map(value -> resolveGoal(bot, value, depth + 1))
          .toList();
        yield new ResolvedGoal(
          new CompositeGoal(resolved.stream()
            .map(ResolvedGoal::scorer)
            .collect(java.util.stream.Collectors.toUnmodifiableSet())),
          connection -> closestPosition(connection, resolved)
        );
      }
      case GOAL_NOT_SET -> throw Status.INVALID_ARGUMENT
        .withDescription("goal must be set")
        .asRuntimeException();
    };
  }

  public static PathConstraint buildConstraint(
    BotConnection bot,
    PathfindOptions options
  ) {
    PathConstraint constraint = new PathConstraintImpl(bot);
    if (!options.getAllowMining()) {
      constraint = new NoBlockBreakingConstraint(constraint);
    }
    if (!options.getAllowPlacing()) {
      constraint = new NoBlockPlacingConstraint(constraint);
    }
    if (options.hasBreakBlockPenalty()
      || options.hasPlaceBlockPenalty()
      || options.getSearchTimeoutSeconds() > 0) {
      var breakPenalty = optionalPenalty(
        options.hasBreakBlockPenalty(),
        options.getBreakBlockPenalty(),
        "break_block_penalty"
      );
      var placePenalty = optionalPenalty(
        options.hasPlaceBlockPenalty(),
        options.getPlaceBlockPenalty(),
        "place_block_penalty"
      );
      var searchTimeout = options.getSearchTimeoutSeconds() == 0
        ? OptionalInt.empty()
        : OptionalInt.of(Math.toIntExact(Math.min(
          options.getSearchTimeoutSeconds(),
          3_600
        )));
      constraint = new ConfiguredPathConstraint(
        constraint,
        breakPenalty,
        placePenalty,
        searchTimeout
      );
    }
    return constraint;
  }

  private static Vec3 closestPosition(
    BotConnection bot,
    java.util.List<ResolvedGoal> goals
  ) {
    var player = bot.minecraft().player;
    if (player == null) {
      return goals.getFirst().position().apply(bot);
    }
    return goals.stream()
      .map(goal -> goal.position().apply(bot))
      .min(java.util.Comparator.comparingDouble(player.position()::distanceTo))
      .orElseGet(() -> player.position());
  }

  private static OptionalDouble optionalPenalty(
    boolean present,
    double value,
    String field
  ) {
    if (!present) {
      return OptionalDouble.empty();
    }
    if (!Double.isFinite(value) || value < 0) {
      throw Status.INVALID_ARGUMENT
        .withDescription(field + " must be finite and non-negative")
        .asRuntimeException();
    }
    return OptionalDouble.of(value);
  }

  private static void requirePositiveRadius(float radius, String field) {
    if (!Float.isFinite(radius) || radius <= 0) {
      throw Status.INVALID_ARGUMENT
        .withDescription(field + " must be finite and greater than zero")
        .asRuntimeException();
    }
  }

  private static void validateConnectionEpoch(
    BotConnection bot,
    String requested
  ) {
    if (!requested.isBlank()
      && !bot.connectionEpoch().toString().equals(requested)) {
      throw Status.FAILED_PRECONDITION
        .withDescription("Entity reference belongs to a previous connection")
        .asRuntimeException();
    }
  }

  private static String currentDimension(BotConnection bot) {
    var level = bot.minecraft().level;
    if (level == null) {
      throw Status.FAILED_PRECONDITION
        .withDescription("Level is not loaded")
        .asRuntimeException();
    }
    return level.dimension().identifier().toString();
  }

  private static void validateDimension(String current, String requested) {
    if (!requested.isBlank() && !current.equals(requested)) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "Cross-dimension pathfinding is not supported: bot is in '%s', goal is in '%s'"
            .formatted(current, requested)
        )
        .asRuntimeException();
    }
  }

  private static Entity findEntityById(ClientLevel level, int id) {
    return StreamSupport.stream(level.entitiesForRendering().spliterator(), false)
      .filter(entity -> entity.getId() == id)
      .findFirst()
      .orElse(null);
  }

  public record ResolvedGoal(
    GoalScorer scorer,
    Function<BotConnection, Vec3> position
  ) {
  }
}
