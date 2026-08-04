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

import net.minecraft.world.InteractionResult;
import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BotInteractionSupportTest {
  @Test
  void fallsBackToItemUseWhenBlockInteractionPasses() {
    var fallbackCalled = new AtomicBoolean();

    var result = BotInteractionSupport.withItemUseFallback(
      InteractionResult.PASS,
      () -> {
        fallbackCalled.set(true);
        return InteractionResult.CONSUME;
      }
    );

    assertTrue(fallbackCalled.get());
    assertSame(InteractionResult.CONSUME, result);
  }

  @Test
  void preservesTerminalBlockInteractionResults() {
    var fallbackCalled = new AtomicBoolean();

    var success = BotInteractionSupport.withItemUseFallback(
      InteractionResult.SUCCESS,
      () -> {
        fallbackCalled.set(true);
        return InteractionResult.CONSUME;
      }
    );
    var failure = BotInteractionSupport.withItemUseFallback(
      InteractionResult.FAIL,
      () -> {
        fallbackCalled.set(true);
        return InteractionResult.CONSUME;
      }
    );

    assertFalse(fallbackCalled.get());
    assertSame(InteractionResult.SUCCESS, success);
    assertSame(InteractionResult.FAIL, failure);
  }
}
