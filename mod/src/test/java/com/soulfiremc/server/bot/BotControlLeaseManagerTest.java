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

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

final class BotControlLeaseManagerTest {
  @Test
  void leavesUnleasedBotsAvailableToAllClients() {
    var manager = new BotControlLeaseManager();

    assertDoesNotThrow(() -> manager.authorize(UUID.randomUUID(), null));
  }

  @Test
  void grantsExclusiveControlUntilReleased() {
    var manager = new BotControlLeaseManager();
    var botId = UUID.randomUUID();
    var ownerId = UUID.randomUUID();
    var lease = manager.acquire(botId, ownerId, Duration.ofSeconds(30));

    assertDoesNotThrow(() -> manager.authorize(botId, lease.token()));
    assertThrows(
      BotControlLeaseManager.InvalidLeaseException.class,
      () -> manager.authorize(botId, null));
    assertThrows(
      BotControlLeaseManager.LeaseUnavailableException.class,
      () -> manager.acquire(botId, UUID.randomUUID(), Duration.ofSeconds(30)));

    manager.release(botId, ownerId, lease.token());

    assertDoesNotThrow(() -> manager.authorize(botId, null));
  }

  @Test
  void renewsOnlyMatchingOwnerAndToken() {
    var manager = new BotControlLeaseManager();
    var botId = UUID.randomUUID();
    var ownerId = UUID.randomUUID();
    var lease = manager.acquire(botId, ownerId, Duration.ofSeconds(30));
    var renewed = manager.renew(botId, ownerId, lease.token(), Duration.ofMinutes(2));

    assertEquals(lease.token(), renewed.token());
    assertTrue(renewed.expiresAt().isAfter(Instant.now().plusSeconds(90)));
    assertThrows(
      BotControlLeaseManager.InvalidLeaseException.class,
      () -> manager.renew(botId, UUID.randomUUID(), lease.token(), Duration.ofSeconds(30)));
  }

  @Test
  void clampsLeaseLifetime() {
    var manager = new BotControlLeaseManager();
    var now = Instant.now();
    var shortLease = manager.acquire(
      UUID.randomUUID(),
      UUID.randomUUID(),
      Duration.ofSeconds(1));
    var longLease = manager.acquire(
      UUID.randomUUID(),
      UUID.randomUUID(),
      Duration.ofHours(1));

    assertFalse(shortLease.expiresAt().isBefore(now.plus(BotControlLeaseManager.MIN_TTL)));
    assertTrue(longLease.expiresAt().isBefore(
      now.plus(BotControlLeaseManager.MAX_TTL).plusSeconds(1)));
  }
}
