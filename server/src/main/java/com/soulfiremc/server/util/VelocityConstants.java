/*
 * SoulFire
 * Copyright (C) 2024  AlexProgrammerDE
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
package com.soulfiremc.server.util;

import net.kyori.adventure.key.Key;

/**
 * Various useful constants. Taken from <a
 * href="https://github.com/PaperMC/Velocity/blob/dev/3.0.0/proxy/src/main/java/com/velocitypowered/proxy/connection/VelocityConstants.java#L25">Velocity</a>
 */
public final class VelocityConstants {
  public static final Key VELOCITY_IP_FORWARDING_CHANNEL = Key.key("velocity:player_info");
  public static final int MODERN_FORWARDING_DEFAULT = 1;
  public static final int MODERN_FORWARDING_WITH_KEY = 2;
  public static final int MODERN_FORWARDING_WITH_KEY_V2 = 3;
  public static final int MODERN_LAZY_SESSION = 4;
  public static final int MODERN_FORWARDING_MAX_VERSION = MODERN_LAZY_SESSION;

  private VelocityConstants() {}
}
