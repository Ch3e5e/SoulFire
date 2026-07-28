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

import com.google.protobuf.Message;
import com.soulfiremc.server.bot.ControlTask;

import java.util.Objects;
import java.util.concurrent.CompletableFuture;

/// A running provider task and the protobuf value it produces.
public record BotTaskExecution(
  ControlTask control,
  CompletableFuture<? extends Message> result
) {
  public BotTaskExecution {
    Objects.requireNonNull(control, "control");
    Objects.requireNonNull(result, "result");
  }
}
