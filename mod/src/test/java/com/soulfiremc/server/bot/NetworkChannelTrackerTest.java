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

import io.netty.channel.embedded.EmbeddedChannel;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertFalse;

class NetworkChannelTrackerTest {
  @Test
  void closesTrackedChannels() throws Exception {
    var tracker = new NetworkChannelTracker();
    var channel = new EmbeddedChannel();
    tracker.track(channel);

    tracker.closeAll(Duration.ofSeconds(1));

    assertFalse(channel.isOpen());
    assertFalse(tracker.hasOpenChannels());
  }

  @Test
  void closesChannelsTrackedAfterShutdownStarts() throws Exception {
    var tracker = new NetworkChannelTracker();
    tracker.closeAll(Duration.ofSeconds(1));
    var channel = new EmbeddedChannel();

    tracker.track(channel);

    assertFalse(channel.isOpen());
    assertFalse(tracker.hasOpenChannels());
  }
}
