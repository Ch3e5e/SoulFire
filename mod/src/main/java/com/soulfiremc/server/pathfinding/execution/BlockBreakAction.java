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
package com.soulfiremc.server.pathfinding.execution;

import com.soulfiremc.server.bot.BlockPredictionSupport;
import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.cost.Costs;
import com.soulfiremc.server.pathfinding.graph.BlockFace;
import com.soulfiremc.server.pathfinding.graph.actions.movement.MovementMiningCost;
import com.soulfiremc.server.util.SFBlockHelpers;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.level.block.Blocks;

@Slf4j
@RequiredArgsConstructor
public final class BlockBreakAction implements WorldAction {
  @Getter
  private final SFVec3i blockPosition;
  private final BlockFace blockBreakSideHint;
  private boolean putInHand;
  private boolean breakAttempted;
  private boolean predictedBroken;
  private int totalTicks = -1;

  public BlockBreakAction(MovementMiningCost movementMiningCost) {
    this(movementMiningCost.block(), movementMiningCost.blockBreakSideHint());
  }

  @Override
  public boolean isCompleted(BotConnection connection) {
    var level = connection.minecraft().level;
    var position = blockPosition.toBlockPos();
    var blockType = level.getBlockState(position).getBlock();
    if (!SFBlockHelpers.isEmptyBlock(blockType)) {
      return false;
    }
    if (!breakAttempted) {
      return true;
    }

    var pendingPrediction = BlockPredictionSupport.hasPendingPrediction(
      connection,
      position
    );
    predictedBroken |= pendingPrediction;
    return !pendingPrediction;
  }

  public boolean isRejected(BotConnection connection) {
    if (
      !breakAttempted
        || !predictedBroken
        || BlockPredictionSupport.hasPendingPrediction(
        connection,
        blockPosition.toBlockPos()
      )
    ) {
      return false;
    }

    var blockType = connection.minecraft().level
      .getBlockState(blockPosition.toBlockPos())
      .getBlock();
    return !SFBlockHelpers.isEmptyBlock(blockType);
  }

  @Override
  public SFVec3i targetPosition(BotConnection connection) {
    return SFVec3i.fromInt(connection.minecraft().player.blockPosition());
  }

  @Override
  public void tick(BotConnection connection) {
    var clientEntity = connection.minecraft().player;
    connection.controlState().resetAll();

    var level = connection.minecraft().level;
    var breakTarget = blockBreakSideHint.getMiddleOfFace(blockPosition);
    connection.rotationControl().lookAt(breakTarget);
    if (!connection.rotationControl().isFacing(breakTarget)) {
      return;
    }

    if (!putInHand) {
      if (ItemPlaceHelper.placeBestToolInHand(connection, blockPosition)) {
        putInHand = true;
      }

      return;
    }

    var optionalBlock = level.getBlockState(blockPosition.toBlockPos());
    if (optionalBlock.getBlock() == Blocks.VOID_AIR) {
      log.warn("Block at {} is not loaded!", blockPosition);
      return;
    }
    if (SFBlockHelpers.isEmptyBlock(optionalBlock.getBlock())) {
      predictedBroken |= BlockPredictionSupport.hasPendingPrediction(
        connection,
        blockPosition.toBlockPos()
      );
      return;
    }

    if (totalTicks == -1) {
      totalTicks = Costs.getRequiredMiningTicks(
          clientEntity,
          clientEntity.getInventory().getSelectedItem(),
          optionalBlock)
        .ticks();
    }

    var gameMode = connection.minecraft().gameMode;
    var target = blockPosition.toBlockPos();
    var direction = blockBreakSideHint.toDirection();
    if (!breakAttempted) {
      if (gameMode.startDestroyBlock(target, direction)) {
        breakAttempted = true;
        clientEntity.swing(InteractionHand.MAIN_HAND);
      }
      return;
    }

    if (gameMode.continueDestroyBlock(target, direction)) {
      predictedBroken |=
        SFBlockHelpers.isEmptyBlock(level.getBlockState(target).getBlock());
      clientEntity.swing(InteractionHand.MAIN_HAND);
    }
  }

  public boolean breakAttempted() {
    return breakAttempted;
  }

  @Override
  public int getAllowedTicks() {
    return totalTicks == -1 ? 20 : totalTicks + 20;
  }

  @Override
  public String toString() {
    return "BlockBreakAction -> " + blockPosition.formatXYZ();
  }
}
