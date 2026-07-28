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

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

final class WorldServiceImplTest {
  @Test
  void armorReductionUsesVanillaDamageDependentFloor() {
    assertEquals(
      12.0F,
      WorldServiceImpl.damageAfterArmor(20.0F, 20.0F, 0.0F),
      1.0E-5F);
    assertEquals(
      84.0F,
      WorldServiceImpl.damageAfterArmor(100.0F, 20.0F, 0.0F),
      1.0E-5F);
  }

  @Test
  void armorToughnessPreservesMoreEffectiveArmorForLargeHits() {
    assertEquals(
      8.0F,
      WorldServiceImpl.damageAfterArmor(20.0F, 20.0F, 8.0F),
      1.0E-5F);
  }
}
