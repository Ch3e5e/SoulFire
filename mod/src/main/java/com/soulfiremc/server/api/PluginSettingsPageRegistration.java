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

/// A validated settings page declared by a plugin during `onLoad`.
public record PluginSettingsPageRegistration(
  PluginInfo owner,
  Scope scope,
  Class<? extends SettingsObject> settingsClass,
  String id,
  String pageName,
  String iconId,
  @Nullable BooleanProperty<?> enabledProperty
) {
  public enum Scope {
    SERVER,
    INSTANCE
  }
}
