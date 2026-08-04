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

import net.minecraft.world.level.block.Blocks;
import org.junit.jupiter.api.Test;

import static com.soulfiremc.server.bot.BlockPredictionSupport.BreakReconciliation.AWAIT_CONFIRMATION;
import static com.soulfiremc.server.bot.BlockPredictionSupport.BreakReconciliation.COMPLETE;
import static com.soulfiremc.server.bot.BlockPredictionSupport.BreakReconciliation.REJECTED;
import static com.soulfiremc.server.bot.BlockPredictionSupport.BreakReconciliation.RETRY_REPLACEMENT;
import static org.junit.jupiter.api.Assertions.assertEquals;

final class BlockPredictionSupportTest {
  @Test
  void waitsForTheServerToConfirmPredictedAir() {
    assertEquals(
      AWAIT_CONFIRMATION,
      reconcile(Blocks.AIR, Blocks.STONE, true, true, true, 0)
    );
    assertEquals(
      COMPLETE,
      reconcile(Blocks.AIR, Blocks.STONE, true, true, false, 0)
    );
  }

  @Test
  void completesWhenBreakingAPlantRestoresItsFluid() {
    assertEquals(
      AWAIT_CONFIRMATION,
      reconcile(Blocks.WATER, Blocks.KELP_PLANT, true, true, true, 0)
    );
    assertEquals(
      COMPLETE,
      reconcile(Blocks.WATER, Blocks.KELP_PLANT, true, true, false, 0)
    );
  }

  @Test
  void retriesWhenGravityReplacesAConfirmedBreak() {
    assertEquals(
      RETRY_REPLACEMENT,
      reconcile(Blocks.SAND, Blocks.SAND, true, true, false, 0)
    );
    assertEquals(
      RETRY_REPLACEMENT,
      reconcile(Blocks.GRAVEL, Blocks.GRAVEL, true, true, false, 1)
    );
  }

  @Test
  void retriesWhenTheServerReplacesTheBrokenBlockWithAnotherState() {
    assertEquals(
      RETRY_REPLACEMENT,
      reconcile(Blocks.STONE, Blocks.GRAVEL, true, true, false, 0)
    );
  }

  @Test
  void rejectsSolidCorrectionsAndBoundedGravityRetries() {
    assertEquals(
      REJECTED,
      reconcile(Blocks.STONE, Blocks.STONE, true, true, false, 0)
    );
    assertEquals(
      REJECTED,
      reconcile(Blocks.SAND, Blocks.SAND, true, true, false, 2)
    );
  }

  private static BlockPredictionSupport.BreakReconciliation reconcile(
    net.minecraft.world.level.block.Block block,
    net.minecraft.world.level.block.Block attemptedBlock,
    boolean breakAttempted,
    boolean predictedBroken,
    boolean pendingPrediction,
    int fallingBlockRetries
  ) {
    return BlockPredictionSupport.reconcileBreak(
      block.defaultBlockState(),
      attemptedBlock.defaultBlockState(),
      breakAttempted,
      predictedBroken,
      pendingPrediction,
      fallingBlockRetries,
      2
    );
  }
}
