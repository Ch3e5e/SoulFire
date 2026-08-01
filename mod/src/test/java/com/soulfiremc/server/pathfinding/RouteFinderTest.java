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

import com.soulfiremc.server.pathfinding.execution.RecalculatePathAction;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class RouteFinderTest {
  @Test
  void emptyPartialRoutesDoNotCancelSiblingSearches() {
    assertFalse(RouteFinder.isActionableResult(
      new RouteFinder.PartialRouteResult(List.of())
    ));
    assertFalse(RouteFinder.isActionableResult(
      new RouteFinder.SearchExpiredResult(List.of())
    ));
  }

  @Test
  void routesWithProgressCanCancelSiblingSearches() {
    var progress = new RecalculatePathAction();

    assertTrue(RouteFinder.isActionableResult(
      new RouteFinder.PartialRouteResult(
        List.of(progress)
      )
    ));
    assertTrue(RouteFinder.isActionableResult(
      new RouteFinder.SearchExpiredResult(List.of(progress))
    ));
    assertTrue(RouteFinder.isActionableResult(
      new RouteFinder.FoundRouteResult(List.of())
    ));
  }

  @Test
  void partialRoutesPreferEfficientChunkBoundariesOverLongDetours() {
    var efficientBoundary = new MinecraftRouteNode(
      new NodeState(new SFVec3i(1, 64, 0), 0),
      List.of(),
      1,
      99,
      100
    );
    var closerAfterDetour = new MinecraftRouteNode(
      new NodeState(new SFVec3i(10, 64, 0), 0),
      List.of(),
      80,
      90,
      170
    );

    assertTrue(RouteFinder.comparePartialRouteCandidates(
      efficientBoundary,
      closerAfterDetour
    ) < 0);
    assertTrue(RouteFinder.comparePartialRouteCandidates(
      closerAfterDetour,
      efficientBoundary
    ) > 0);
  }
}
