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

import lombok.extern.slf4j.Slf4j;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/// Owned automation contribution with a small failure-isolation circuit
/// breaker. Three consecutive failures disable it for the current server run.
@Slf4j
public final class PluginAutomationExtensionRegistration {
  private static final int FAILURE_LIMIT = 3;

  private final PluginInfo owner;
  private final PluginAutomationExtension extension;
  private final AtomicInteger consecutiveFailures = new AtomicInteger();
  private final AtomicBoolean enabled = new AtomicBoolean(true);

  PluginAutomationExtensionRegistration(
    PluginInfo owner,
    PluginAutomationExtension extension
  ) {
    this.owner = owner;
    this.extension = extension;
  }

  public PluginInfo owner() {
    return owner;
  }

  public PluginAutomationExtension extension() {
    return extension;
  }

  public String id() {
    return "plugin.%s.%s".formatted(owner.id(), extension.id());
  }

  public int priority() {
    return extension.priority();
  }

  public boolean enabled() {
    return enabled.get();
  }

  public void invokeTick(PluginAutomationExtensionContext context) {
    invoke("tick", () -> extension.onTick(context));
  }

  public void invokeObservation(PluginAutomationExtensionContext context) {
    invoke("observation", () -> extension.onObservation(context));
  }

  private void invoke(String phase, CheckedRunnable action) {
    if (!enabled.get()) {
      return;
    }
    try {
      action.run();
      consecutiveFailures.set(0);
    } catch (Throwable throwable) {
      var failures = consecutiveFailures.incrementAndGet();
      log.warn(
        "Plugin automation extension {} failed during {} ({}/{})",
        id(),
        phase,
        failures,
        FAILURE_LIMIT,
        throwable
      );
      if (failures >= FAILURE_LIMIT && enabled.compareAndSet(true, false)) {
        log.error("Disabled faulty plugin automation extension {} for this server run", id());
      }
    }
  }

  @FunctionalInterface
  private interface CheckedRunnable {
    void run() throws Exception;
  }
}
