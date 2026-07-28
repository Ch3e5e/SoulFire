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
package com.soulfiremc.server.api;

import com.soulfiremc.server.settings.lib.SettingsObject;
import com.soulfiremc.server.settings.property.BooleanProperty;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.List;

/// Registers server-wide and per-instance settings pages for one plugin.
public final class PluginSettingsRegistry {
  private final PluginApiRegistry registry;
  private final PluginInfo owner;

  PluginSettingsRegistry(PluginApiRegistry registry, PluginInfo owner) {
    this.registry = registry;
    this.owner = owner;
  }

  public PluginSettingsPageRegistration registerServerPage(
    Class<? extends SettingsObject> settingsClass,
    String id,
    String pageName,
    String iconId,
    @Nullable BooleanProperty<?> enabledProperty
  ) {
    return registry.registerSettingsPage(
      owner,
      PluginSettingsPageRegistration.Scope.SERVER,
      settingsClass,
      id,
      pageName,
      iconId,
      enabledProperty
    );
  }

  public PluginSettingsPageRegistration registerInstancePage(
    Class<? extends SettingsObject> settingsClass,
    String id,
    String pageName,
    String iconId,
    @Nullable BooleanProperty<?> enabledProperty
  ) {
    return registry.registerSettingsPage(
      owner,
      PluginSettingsPageRegistration.Scope.INSTANCE,
      settingsClass,
      id,
      pageName,
      iconId,
      enabledProperty
    );
  }

  public List<PluginSettingsPageRegistration> pages() {
    return registry.settingsPages(owner.id());
  }
}
