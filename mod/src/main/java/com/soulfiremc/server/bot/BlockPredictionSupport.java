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

import com.soulfiremc.mod.mixin.soulfire.BlockStatePredictionHandlerAccessor;
import com.soulfiremc.mod.mixin.soulfire.ClientLevelAccessor;
import com.soulfiremc.server.util.SFBlockHelpers;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockState;

public final class BlockPredictionSupport {
  private BlockPredictionSupport() {}

  public enum BreakReconciliation {
    CONTINUE,
    AWAIT_CONFIRMATION,
    COMPLETE,
    RETRY_REPLACEMENT,
    REJECTED
  }

  public static boolean hasPendingPrediction(
    BotConnection connection,
    BlockPos position
  ) {
    var levelAccessor = (ClientLevelAccessor) connection.minecraft().level;
    var predictionHandler =
      levelAccessor.soulfire$getBlockStatePredictionHandler();
    var accessor = (BlockStatePredictionHandlerAccessor) predictionHandler;
    return accessor.soulfire$getServerVerifiedStates()
      .containsKey(position.asLong());
  }

  public static BreakReconciliation reconcileBreak(
    BlockState currentState,
    BlockState attemptedState,
    boolean breakAttempted,
    boolean predictedBroken,
    boolean pendingPrediction,
    int replacementRetries,
    int maximumReplacementRetries
  ) {
    if (isClearedBreakTarget(currentState)) {
      return breakAttempted && pendingPrediction
        ? BreakReconciliation.AWAIT_CONFIRMATION
        : BreakReconciliation.COMPLETE;
    }
    if (!breakAttempted || !predictedBroken || pendingPrediction) {
      return BreakReconciliation.CONTINUE;
    }
    if (
      replacementRetries < maximumReplacementRetries
        && (
        !currentState.equals(attemptedState)
          || SFBlockHelpers.isGravityAffected(currentState)
      )
    ) {
      return BreakReconciliation.RETRY_REPLACEMENT;
    }
    return BreakReconciliation.REJECTED;
  }

  public static boolean isClearedBreakTarget(BlockState state) {
    return SFBlockHelpers.isEmptyBlock(state.getBlock())
      || state.getBlock() instanceof LiquidBlock;
  }
}
