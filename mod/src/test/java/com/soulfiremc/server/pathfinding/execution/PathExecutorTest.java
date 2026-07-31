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

import com.soulfiremc.server.pathfinding.SFVec3i;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class PathExecutorTest {
  @Test
  void abortsOnlyAfterConsecutivePartialRoutesReachTheSameEndpoint() {
    var guard = new PathExecutor.PartialRouteProgressGuard(3);
    var firstEndpoint = new SFVec3i(4, 62, -8);
    var secondEndpoint = firstEndpoint.add(1, 0, 0);

    assertFalse(guard.shouldAbort(firstEndpoint));
    assertFalse(guard.shouldAbort(firstEndpoint));
    assertTrue(guard.shouldAbort(firstEndpoint));

    assertFalse(guard.shouldAbort(secondEndpoint));
    assertFalse(guard.shouldAbort(secondEndpoint));
    guard.reset();
    assertFalse(guard.shouldAbort(secondEndpoint));
  }

  @Test
  void abortsARepeatedTimedOutActionThatDoesNotMoveThePlayer() {
    var guard = new PathExecutor.ActionStallGuard(3);
    var position = new SFVec3i(4, 62, -8);

    assertFalse(guard.shouldAbort("pillar", position));
    assertFalse(guard.shouldAbort("reposition", position.add(1, 0, 0)));
    assertFalse(guard.shouldAbort("pillar", position));
    assertTrue(guard.shouldAbort("pillar", position));

    assertFalse(guard.shouldAbort("pillar", position.add(0, 1, 0)));
    assertFalse(guard.shouldAbort("walk", position.add(0, 1, 0)));
  }
}
