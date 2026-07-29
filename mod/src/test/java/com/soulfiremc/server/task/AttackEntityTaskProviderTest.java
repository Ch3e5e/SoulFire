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

import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

final class AttackEntityTaskProviderTest {
  @Test
  void approachesCloserThanTheRequestedAttackRange() {
    assertEquals(1.0F, AttackEntityTaskProvider.pathfindingApproachRange(3.0F));
    assertEquals(4.0F, AttackEntityTaskProvider.pathfindingApproachRange(6.0F));
    assertEquals(1.0F, AttackEntityTaskProvider.pathfindingApproachRange(1.5F));
  }

  @Test
  void measuresReachFromTheNearestPointOnTheEntity() {
    var entity = new AABB(2.5, 0, -0.5, 3.5, 1, 0.5);

    assertEquals(
      Math.hypot(2.5, 0.62),
      AttackEntityTaskProvider.distanceToBoundingBox(
        new Vec3(0, 1.62, 0),
        entity
      ),
      0.000_001
    );
    assertEquals(
      0,
      AttackEntityTaskProvider.distanceToBoundingBox(
        new Vec3(3, 0.5, 0),
        entity
      )
    );
  }
}
