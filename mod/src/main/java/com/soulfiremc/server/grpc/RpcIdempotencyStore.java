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
package com.soulfiremc.server.grpc;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.grpc.Status;
import org.jetbrains.annotations.NotNull;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;

/// Bounded, user-scoped deduplication for retry-safe mutating RPCs.
final class RpcIdempotencyStore<T> {
  static final int MAX_KEY_LENGTH = 128;

  private final Cache<@NotNull Scope, Entry<T>> entries = Caffeine.newBuilder()
    .maximumSize(10_000)
    .expireAfterWrite(Duration.ofMinutes(10))
    .build();

  CompletableFuture<T> execute(
    UUID userId,
    String instanceId,
    String botId,
    String operation,
    String key,
    String fingerprint,
    Supplier<CompletableFuture<T>> action
  ) {
    if (key.isBlank()) {
      throw Status.INVALID_ARGUMENT
        .withDescription("idempotency_key must not be blank when provided")
        .asRuntimeException();
    }
    if (key.length() > MAX_KEY_LENGTH) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "idempotency_key must be at most %d characters".formatted(
            MAX_KEY_LENGTH
          )
        )
        .asRuntimeException();
    }

    var scope = new Scope(userId, instanceId, botId, operation, key);
    var candidate = new Entry<T>(fingerprint);
    var entry = entries.asMap().putIfAbsent(scope, candidate);
    if (entry != null) {
      if (!entry.fingerprint.equals(fingerprint)) {
        throw Status.ALREADY_EXISTS
          .withDescription(
            "idempotency_key was already used with a different request"
          )
          .asRuntimeException();
      }
      return entry.result;
    }

    try {
      action.get().whenComplete((result, error) -> {
        if (error == null) {
          candidate.result.complete(result);
        } else {
          candidate.result.completeExceptionally(error);
          entries.invalidate(scope);
        }
      });
    } catch (Throwable throwable) {
      candidate.result.completeExceptionally(throwable);
      entries.invalidate(scope);
    }
    return candidate.result;
  }

  private record Scope(
    UUID userId,
    String instanceId,
    String botId,
    String operation,
    String key
  ) {}

  private static final class Entry<T> {
    private final String fingerprint;
    private final CompletableFuture<T> result = new CompletableFuture<>();

    private Entry(String fingerprint) {
      this.fingerprint = fingerprint;
    }
  }
}
