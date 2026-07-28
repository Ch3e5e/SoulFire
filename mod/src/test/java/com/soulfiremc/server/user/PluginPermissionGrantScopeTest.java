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
package com.soulfiremc.server.user;

import com.soulfiremc.grpc.generated.PluginPermissionScope;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

final class PluginPermissionGrantScopeTest {
  private static final String RESOURCE_ID = "00000000-0000-0000-0000-000000000042";

  @Test
  void normalizesScopedResourceIds() {
    var key = PluginPermissionGrantScope.fromRequest(
      PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_BOT,
      Optional.of(RESOURCE_ID)
    );

    assertEquals("BOT", key.scope());
    assertEquals(UUID.fromString(RESOURCE_ID).toString(), key.resourceId());
  }

  @Test
  void globalScopeRejectsResourceIds() {
    assertThrows(
      IllegalArgumentException.class,
      () -> PluginPermissionGrantScope.fromRequest(
        PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_GLOBAL,
        Optional.of(RESOURCE_ID)
      )
    );
  }

  @Test
  void scopedPermissionsRequireResourceIds() {
    assertThrows(
      IllegalArgumentException.class,
      () -> PluginPermissionGrantScope.fromRequest(
        PluginPermissionScope.PLUGIN_PERMISSION_SCOPE_INSTANCE,
        Optional.empty()
      )
    );
  }
}
