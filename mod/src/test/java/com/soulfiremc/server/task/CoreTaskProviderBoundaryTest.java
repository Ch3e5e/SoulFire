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

import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CoreTaskProviderBoundaryTest {
  private static final Set<String> EXPECTED_TASK_TYPES = Set.of(
    "soulfire.v1.GoToTask",
    "soulfire.v1.FollowEntityTask",
    "soulfire.v1.AttackEntityTask",
    "soulfire.v1.AttackNearestTask",
    "soulfire.v1.RangedAttackTask",
    "soulfire.v1.FleeTask",
    "soulfire.v1.GuardTask",
    "soulfire.v1.SleepTask",
    "soulfire.v1.FishTask",
    "soulfire.v1.FarmTask",
    "soulfire.v1.BreedTask",
    "soulfire.v1.ExploreTask",
    "soulfire.v1.ContainerTransferTask",
    "soulfire.v1.MaintainLoadoutTask",
    "soulfire.v1.AutoEatTask",
    "soulfire.v1.AutoRespawnTask",
    "soulfire.v1.AutoTotemTask",
    "soulfire.v1.AutoArmorTask",
    "soulfire.v1.CollectBlocksTask",
    "soulfire.v1.ExcavateTask",
    "soulfire.v1.BuildTask",
    "soulfire.v1.CraftTask",
    "soulfire.v1.SmeltTask",
    "soulfire.v1.BrewTask",
    "soulfire.v1.VillagerTradeTask"
  );
  private static final Set<String> REMOVED_NATIVE_TYPES = Set.of(
    "com.soulfiremc.grpc.generated.AutomationServiceGrpc",
    "com.soulfiremc.server.api.PluginAutomationExtension",
    "com.soulfiremc.server.automation.AutomationController",
    "com.soulfiremc.server.command.builtin.AutomationCommand",
    "com.soulfiremc.server.grpc.AutomationServiceImpl",
    "com.soulfiremc.server.settings.instance.AutomationSettings"
  );

  @Test
  void registersEveryGeneralPurposeTaskProvider() {
    var actual = BotTaskManager.coreProviders().stream()
      .map(provider -> provider.inputPrototype()
        .getDescriptorForType()
        .getFullName())
      .collect(Collectors.toUnmodifiableSet());

    assertEquals(EXPECTED_TASK_TYPES, actual);
  }

  @Test
  void removedNativePlannerTypesAreNotOnTheRuntimeClasspath() {
    var loader = CoreTaskProviderBoundaryTest.class.getClassLoader();

    for (var removedType : REMOVED_NATIVE_TYPES) {
      assertThrows(
        ClassNotFoundException.class,
        () -> loader.loadClass(removedType),
        removedType
      );
    }
  }
}
