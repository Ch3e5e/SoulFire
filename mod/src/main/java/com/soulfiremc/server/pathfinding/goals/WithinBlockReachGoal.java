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
package com.soulfiremc.server.pathfinding.goals;

import com.soulfiremc.server.pathfinding.MinecraftRouteNode;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.execution.WorldAction;
import com.soulfiremc.server.pathfinding.graph.MinecraftGraph;

import java.util.List;
import java.util.Set;

/// Reaches any standable position within normal interaction range of a block.
///
/// The goal deliberately does not predict line of sight. The caller validates
/// the live raycast after path execution and can retry from another position.
public record WithinBlockReachGoal(
  SFVec3i block,
  Set<SFVec3i> excludedPositions
) implements GoalScorer {
  private static final double MAXIMUM_REACH = 4.5D;
  private static final double MAXIMUM_LATERAL_APPROACH_REACH = 3.5D;
  private static final double PLAYER_EYE_HEIGHT = 1.62D;

  public WithinBlockReachGoal {
    excludedPositions = Set.copyOf(excludedPositions);
  }

  public WithinBlockReachGoal(SFVec3i block) {
    this(block, Set.of());
  }

  @Override
  public double computeScore(
    MinecraftGraph graph,
    SFVec3i position,
    List<WorldAction> actions
  ) {
    var maximumReach = maximumApproachReach(block, position);
    return Math.max(
      0.0D,
      Math.sqrt(distanceToNearestFaceSquared(block, position))
        - maximumReach
    );
  }

  @Override
  public boolean isFinished(MinecraftRouteNode current) {
    var position = current.node().blockPosition();
    return !excludedPositions.contains(position)
      && isWithinReach(block, position);
  }

  public static boolean isWithinReach(
    SFVec3i block,
    SFVec3i playerFeet
  ) {
    if (
      block.y < playerFeet.y
        && block.x == playerFeet.x
        && block.z == playerFeet.z
    ) {
      return false;
    }
    var maximumReach = maximumApproachReach(block, playerFeet);
    return distanceToNearestFaceSquared(block, playerFeet)
      <= maximumReach * maximumReach;
  }

  private static double maximumApproachReach(
    SFVec3i block,
    SFVec3i playerFeet
  ) {
    return block.y > playerFeet.y
        && block.x == playerFeet.x
        && block.z == playerFeet.z
      ? MAXIMUM_REACH
      : MAXIMUM_LATERAL_APPROACH_REACH;
  }

  private static double distanceToNearestFaceSquared(
    SFVec3i block,
    SFVec3i playerFeet
  ) {
    var eyeX = playerFeet.x + 0.5D;
    var eyeY = playerFeet.y + PLAYER_EYE_HEIGHT;
    var eyeZ = playerFeet.z + 0.5D;
    var centerX = block.x + 0.5D;
    var centerY = block.y + 0.5D;
    var centerZ = block.z + 0.5D;
    return Math.min(
      Math.min(
        distanceSquared(eyeX, eyeY, eyeZ, block.x, centerY, centerZ),
        distanceSquared(
          eyeX,
          eyeY,
          eyeZ,
          block.x + 1.0D,
          centerY,
          centerZ
        )
      ),
      Math.min(
        Math.min(
          distanceSquared(eyeX, eyeY, eyeZ, centerX, block.y, centerZ),
          distanceSquared(
            eyeX,
            eyeY,
            eyeZ,
            centerX,
            block.y + 1.0D,
            centerZ
          )
        ),
        Math.min(
          distanceSquared(eyeX, eyeY, eyeZ, centerX, centerY, block.z),
          distanceSquared(
            eyeX,
            eyeY,
            eyeZ,
            centerX,
            centerY,
            block.z + 1.0D
          )
        )
      )
    );
  }

  private static double distanceSquared(
    double x1,
    double y1,
    double z1,
    double x2,
    double y2,
    double z2
  ) {
    var deltaX = x1 - x2;
    var deltaY = y1 - y2;
    var deltaZ = z1 - z2;
    return deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
  }
}
