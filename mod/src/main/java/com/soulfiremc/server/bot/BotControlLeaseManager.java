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

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/// Coordinates exclusive SDK control of bots without coupling a lease to one
/// transient Minecraft connection.
public final class BotControlLeaseManager {
  public static final Duration DEFAULT_TTL = Duration.ofSeconds(30);
  public static final Duration MIN_TTL = Duration.ofSeconds(5);
  public static final Duration MAX_TTL = Duration.ofMinutes(5);

  private final SecureRandom secureRandom = new SecureRandom();
  private final Map<UUID, Lease> leases = new HashMap<>();

  public synchronized Lease acquire(UUID botId, UUID ownerId, Duration requestedTtl) {
    var now = Instant.now();
    removeExpired(botId, now);
    if (leases.containsKey(botId)) {
      throw new LeaseUnavailableException("Bot control is already leased");
    }

    var lease = new Lease(botId, ownerId, createToken(), now.plus(clampTtl(requestedTtl)));
    leases.put(botId, lease);
    return lease;
  }

  public synchronized Lease renew(UUID botId, UUID ownerId, String token, Duration requestedTtl) {
    var now = Instant.now();
    var current = requireLease(botId, ownerId, token, now);
    var renewed = new Lease(botId, ownerId, current.token(), now.plus(clampTtl(requestedTtl)));
    leases.put(botId, renewed);
    return renewed;
  }

  public synchronized void release(UUID botId, UUID ownerId, String token) {
    var current = requireLease(botId, ownerId, token, Instant.now());
    leases.remove(botId, current);
  }

  public synchronized void authorize(UUID botId, @Nullable String token) {
    var now = Instant.now();
    removeExpired(botId, now);
    var lease = leases.get(botId);
    if (lease != null && !lease.token().equals(token)) {
      throw new InvalidLeaseException("Bot control is leased by another client");
    }
  }

  public synchronized void clear(UUID botId) {
    leases.remove(botId);
  }

  private Lease requireLease(UUID botId, UUID ownerId, String token, Instant now) {
    removeExpired(botId, now);
    var lease = leases.get(botId);
    if (lease == null
      || !lease.ownerId().equals(ownerId)
      || !lease.token().equals(token)) {
      throw new InvalidLeaseException("Bot control lease is missing, expired, or does not match");
    }
    return lease;
  }

  private void removeExpired(UUID botId, Instant now) {
    var current = leases.get(botId);
    if (current != null && !current.expiresAt().isAfter(now)) {
      leases.remove(botId, current);
    }
  }

  private Duration clampTtl(Duration requestedTtl) {
    if (requestedTtl.isZero() || requestedTtl.isNegative()) {
      return DEFAULT_TTL;
    }
    if (requestedTtl.compareTo(MIN_TTL) < 0) {
      return MIN_TTL;
    }
    if (requestedTtl.compareTo(MAX_TTL) > 0) {
      return MAX_TTL;
    }
    return requestedTtl;
  }

  private String createToken() {
    var bytes = new byte[32];
    secureRandom.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  public record Lease(UUID botId, UUID ownerId, String token, Instant expiresAt) {}

  public static final class LeaseUnavailableException extends IllegalStateException {
    public LeaseUnavailableException(String message) {
      super(message);
    }
  }

  public static final class InvalidLeaseException extends IllegalStateException {
    public InvalidLeaseException(String message) {
      super(message);
    }
  }
}
