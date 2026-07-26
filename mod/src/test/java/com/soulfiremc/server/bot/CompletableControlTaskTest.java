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
package com.soulfiremc.server.bot;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

final class CompletableControlTaskTest {
  @Test
  void completesOnlyAfterTheControlTaskRuns() {
    var control = new BotControlAPI();
    var runs = new AtomicInteger();
    var task = new CompletableControlTask(ControlTask.once(runs::incrementAndGet));

    control.replace(task);

    assertFalse(task.completion().isDone());
    assertEquals(0, runs.get());

    control.tick();

    assertEquals(1, runs.get());
    assertEquals(ControlStopReason.COMPLETED, task.completion().join());
  }

  @Test
  void reportsCancellationWithoutRunningTheTask() {
    var control = new BotControlAPI();
    var runs = new AtomicInteger();
    var task = new CompletableControlTask(ControlTask.once(runs::incrementAndGet));
    control.replace(task);

    assertTrue(control.cancel(task));
    assertEquals(0, runs.get());
    assertEquals(ControlStopReason.CANCELLED, task.completion().join());
  }
}
