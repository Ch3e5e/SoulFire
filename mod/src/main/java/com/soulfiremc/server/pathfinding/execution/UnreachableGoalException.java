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

/// Indicates that pathfinding cannot make progress toward a goal.
public final class UnreachableGoalException extends IllegalStateException {
  private UnreachableGoalException(String message) {
    super(message);
  }

  public static UnreachableGoalException noRoute() {
    return new UnreachableGoalException("No route found to the goal!");
  }

  public static UnreachableGoalException stalled(int partialRouteCount) {
    return new UnreachableGoalException(
      "Pathfinding made no progress across "
        + partialRouteCount
        + " consecutive partial routes"
    );
  }

  public static UnreachableGoalException stalledAction(
    int actionCount,
    String action
  ) {
    return new UnreachableGoalException(
      "Pathfinding stalled on "
        + action
        + " across "
        + actionCount
        + " consecutive attempts"
    );
  }
}
