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
package com.soulfiremc.server.pathfinding.graph.constraint;

import java.util.Optional;
import java.util.OptionalDouble;
import java.util.OptionalInt;

/// Overrides request-scoped planner costs without mutating persistent bot
/// settings.
public record ConfiguredPathConstraint(
  PathConstraint delegate,
  OptionalDouble configuredBreakBlockPenalty,
  OptionalDouble configuredPlaceBlockPenalty,
  OptionalInt configuredExpireTimeout,
  Optional<Boolean> configuredSprint
) implements DelegatePathConstraint {
  @Override
  public double breakBlockPenalty() {
    return configuredBreakBlockPenalty.orElseGet(delegate::breakBlockPenalty);
  }

  @Override
  public double placeBlockPenalty() {
    return configuredPlaceBlockPenalty.orElseGet(delegate::placeBlockPenalty);
  }

  @Override
  public int expireTimeout() {
    return configuredExpireTimeout.orElseGet(delegate::expireTimeout);
  }

  @Override
  public boolean sprint() {
    return configuredSprint.orElseGet(delegate::sprint);
  }
}
