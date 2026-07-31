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
import com.soulfiremc.server.bot.BotInteractionSupport;
import com.soulfiremc.server.pathfinding.BlockPlaceAgainstData;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint;
import com.soulfiremc.server.util.SFBlockHelpers;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

@Slf4j
@RequiredArgsConstructor
public final class BlockPlaceAction implements WorldAction {
  private static final int MAX_CONFIRMATION_TICKS = 40;
  @Getter
  private final SFVec3i blockPosition;
  private final BlockPlaceAgainstData blockPlaceAgainstData;
  private final PathConstraint pathConstraint;
  private InteractionHand placementHand;
  private boolean finishedPlacing;
  private boolean interactionRejected;
  private int confirmationTicks;

  @Override
  public boolean isCompleted(BotConnection connection) {
    var level = connection.minecraft().level;
    var position = blockPosition.toBlockPos();
    if (
      !SFBlockHelpers.isCollisionShapeFullBlock(
        level.getBlockState(position)
      )
    ) {
      return false;
    }
    return !finishedPlacing
      || !BlockPredictionSupport.hasPendingPrediction(
      connection,
      position
    );
  }

  public boolean isRejected(BotConnection connection) {
    var position = blockPosition.toBlockPos();
    return placementWasRejected(
      interactionRejected,
      finishedPlacing,
      BlockPredictionSupport.hasPendingPrediction(connection, position),
      SFBlockHelpers.isCollisionShapeFullBlock(
        connection.minecraft().level.getBlockState(position)
      ),
      confirmationTicks
    );
  }

  static boolean placementWasRejected(
    boolean interactionRejected,
    boolean finishedPlacing,
    boolean pendingPrediction,
    boolean fullBlockPresent,
    int confirmationTicks
  ) {
    return interactionRejected
      || (
      finishedPlacing
        && (
        (!pendingPrediction && !fullBlockPresent)
          || confirmationTicks >= MAX_CONFIRMATION_TICKS
      )
    );
  }

  @Override
  public SFVec3i targetPosition(BotConnection connection) {
    return SFVec3i.fromInt(connection.minecraft().player.blockPosition());
  }

  @Override
  public void tick(BotConnection connection) {
    var clientEntity = connection.minecraft().player;

    connection.controlState().resetAll();

    if (placementHand == null) {
      placementHand = ItemPlaceHelper.placeBestBlockInHand(
        connection,
        pathConstraint
      );
      return;
    }

    if (finishedPlacing) {
      confirmationTicks++;
      return;
    }

    var placeTarget = Vec3.atCenterOf(blockPlaceAgainstData.againstPos().toBlockPos()).add(
      blockPlaceAgainstData.blockFace().toDirection().getUnitVec3().multiply(0.5, 0.5, 0.5));
    connection.rotationControl().lookAt(placeTarget);
    if (!connection.rotationControl().isFacing(placeTarget)) {
      return;
    }

    var hand = placementHand;
    var interaction = BotInteractionSupport.withSneaking(
      clientEntity,
      true,
      () -> connection.minecraft().gameMode.useItemOn(
        clientEntity,
        hand,
        new BlockHitResult(
          placeTarget,
          blockPlaceAgainstData.blockFace().toDirection(),
          blockPlaceAgainstData.againstPos().toBlockPos(),
          false
        )
      )
    );
    if (interaction instanceof InteractionResult.Success success) {
      if (success.swingSource() == InteractionResult.SwingSource.CLIENT) {
        clientEntity.swing(hand);
      }
      finishedPlacing = true;
    } else {
      interactionRejected = true;
    }
  }

  @Override
  public int getAllowedTicks() {
    // 3-seconds max to place a block
    return 3 * 20;
  }

  @Override
  public String toString() {
    return "BlockPlaceAction -> " + blockPosition.formatXYZ();
  }
}
