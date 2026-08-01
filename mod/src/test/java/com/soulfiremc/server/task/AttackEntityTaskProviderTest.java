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

import com.soulfiremc.grpc.generated.AttackEntityTask;
import com.soulfiremc.server.bot.ControlResource;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

  @Test
  void directlyPursuesVisibleNearbyTargetsOnReachableTerrain() {
    assertTrue(AttackEntityTaskProvider.shouldPursueDirectly(
      12,
      2.5,
      true,
      false
    ));
    assertFalse(AttackEntityTaskProvider.shouldPursueDirectly(
      12.01,
      2,
      true,
      false
    ));
    assertFalse(AttackEntityTaskProvider.shouldPursueDirectly(
      8,
      2.51,
      true,
      false
    ));
    assertFalse(AttackEntityTaskProvider.shouldPursueDirectly(
      8,
      1,
      false,
      false
    ));
  }

  @Test
  void directlyPursuesVisibleNearbyTargetsThroughFluidInThreeDimensions() {
    assertTrue(AttackEntityTaskProvider.shouldPursueDirectly(
      8,
      6,
      true,
      true
    ));
    assertFalse(AttackEntityTaskProvider.shouldPursueDirectly(
      12.01,
      6,
      true,
      true
    ));

    assertEquals(1, AttackEntityTaskProvider.fluidVerticalInput(0.36));
    assertEquals(0, AttackEntityTaskProvider.fluidVerticalInput(0.35));
    assertEquals(0, AttackEntityTaskProvider.fluidVerticalInput(-0.35));
    assertEquals(-1, AttackEntityTaskProvider.fluidVerticalInput(-0.36));
  }

  @Test
  void claimsOffhandControlOnlyWhenShieldingIsRequested() {
    var provider = new AttackEntityTaskProvider();

    assertFalse(provider.resources(
      AttackEntityTask.getDefaultInstance()
    ).contains(ControlResource.OFF_HAND));
    assertTrue(provider.resources(
      AttackEntityTask.newBuilder().setUseOffhandShield(true).build()
    ).contains(ControlResource.OFF_HAND));
  }
}
