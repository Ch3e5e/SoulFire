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
package com.soulfiremc.server.api.event.attack;

import com.soulfiremc.server.InstanceManager;
import com.soulfiremc.server.api.event.SoulFireInstanceEvent;
import com.soulfiremc.server.protocol.BotConnection;

/**
 * When a bot is not active anymore and gets removed from the list of active bots.
 *
 * @param instanceManager the instance manager
 * @param botConnection   the bot connection
 */
public record AttackBotRemoveEvent(InstanceManager instanceManager, BotConnection botConnection) implements SoulFireInstanceEvent {}
