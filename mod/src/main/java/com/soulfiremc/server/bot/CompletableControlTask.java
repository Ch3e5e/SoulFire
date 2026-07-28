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

import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/// Adds observable completion to a control task so remote callers only receive
/// success after the bot game thread has executed the action.
public final class CompletableControlTask implements ControlTask {
  private final UUID actionId = UUID.randomUUID();
  private final ControlTask delegate;
  private final CompletableFuture<ControlStopReason> completion = new CompletableFuture<>();

  public CompletableControlTask(ControlTask delegate) {
    this.delegate = delegate;
  }

  public UUID actionId() {
    return actionId;
  }

  public CompletableFuture<ControlStopReason> completion() {
    return completion;
  }

  @Override
  public void tick() {
    delegate.tick();
  }

  @Override
  public boolean isDone() {
    return delegate.isDone();
  }

  @Override
  public ControlPriority priority() {
    return delegate.priority();
  }

  @Override
  public Set<ControlResource> resources() {
    return delegate.resources();
  }

  @Override
  public void onStarted() {
    delegate.onStarted();
  }

  @Override
  public void onSuspended() {
    delegate.onSuspended();
  }

  @Override
  public void onResumed() {
    delegate.onResumed();
  }

  @Override
  public void onStopped(ControlStopReason reason, @Nullable Throwable cause) {
    try {
      delegate.onStopped(reason, cause);
    } finally {
      if (cause != null) {
        completion.completeExceptionally(cause);
      } else {
        completion.complete(reason);
      }
    }
  }

  @Override
  public @Nullable String description() {
    return delegate.description();
  }
}
