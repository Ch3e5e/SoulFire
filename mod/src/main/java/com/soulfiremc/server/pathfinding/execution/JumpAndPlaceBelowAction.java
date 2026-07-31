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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

@Slf4j
@RequiredArgsConstructor
public final class JumpAndPlaceBelowAction implements WorldAction {
  private static final int MAX_CONFIRMATION_TICKS = 40;
  private static final double PLACEMENT_CLEARANCE = 1.01;
  private static final double MAX_HORIZONTAL_DRIFT = 0.04;
  private static final double MAX_HORIZONTAL_OFFSET = 0.15;
  private final SFVec3i blockPlacePosition;
  private final BlockPlaceAgainstData blockPlaceAgainstData;
  private final PathConstraint pathConstraint;
  private InteractionHand placementHand;
  private boolean finishedPlacing;
  private boolean interactionRejected;
  private int confirmationTicks;

  public SFVec3i blockPlacePosition() {
    return blockPlacePosition;
  }

  @Override
  public boolean isCompleted(BotConnection connection) {
    var level = connection.minecraft().level;
    var position = blockPlacePosition.toBlockPos();
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
    var position = blockPlacePosition.toBlockPos();
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
    return blockPlacePosition.add(0, 1, 0);
  }

  @Override
  public void tick(BotConnection connection) {
    var clientEntity = connection.minecraft().player;
    connection.controlState().resetAll();

    var placementCenter = new Vec3(
      blockPlacePosition.x + 0.5D,
      clientEntity.getY(),
      blockPlacePosition.z + 0.5D
    );
    if (needsHorizontalCentering(
      clientEntity.position(),
      placementCenter
    )) {
      connection.rotationControl().lookHorizontallyAt(placementCenter);
      var movementInput = MovementAction.movementInputFor(
        clientEntity.position(),
        clientEntity.getYRot(),
        placementCenter
      );
      var controlState = connection.controlState();
      controlState.up(movementInput.forward());
      controlState.down(movementInput.backward());
      controlState.left(movementInput.left());
      controlState.right(movementInput.right());
      return;
    }

    var placeTarget = Vec3.atCenterOf(blockPlaceAgainstData.againstPos().toBlockPos()).add(
      blockPlaceAgainstData.blockFace().toDirection().getUnitVec3().multiply(0.5, 0.5, 0.5));
    connection.rotationControl().lookAt(placeTarget);

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

    var deltaMovement = clientEntity.getDeltaMovement();
    if (!isHorizontallyStable(deltaMovement)) {
      return;
    }

    if (needsAdditionalJumpHeight(clientEntity.getY(), blockPlacePosition.y)) {
      // Keep jumping until the player's collision box no longer intersects
      // the block being placed. Releasing jump on the first airborne tick
      // sends use-item-on while the player still occupies the target cell,
      // which authoritative servers reject.
      connection.controlState().jump(true);
      return;
    }
    connection.controlState().jump(false);

    var hand = placementHand;
    if (!connection.rotationControl().isFacing(placeTarget)) {
      return;
    }

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

  static boolean isHorizontallyStable(Vec3 deltaMovement) {
    return Math.hypot(
      deltaMovement.x,
      deltaMovement.z
    ) < MAX_HORIZONTAL_DRIFT;
  }

  static boolean needsHorizontalCentering(
    Vec3 playerPosition,
    Vec3 placementCenter
  ) {
    return Math.hypot(
      placementCenter.x - playerPosition.x,
      placementCenter.z - playerPosition.z
    ) > MAX_HORIZONTAL_OFFSET;
  }

  static boolean needsAdditionalJumpHeight(double playerY, int placementY) {
    return playerY < placementY + PLACEMENT_CLEARANCE;
  }

  @Override
  public int getAllowedTicks() {
    // 3-seconds max to place a block
    return 3 * 20;
  }

  @Override
  public String toString() {
    return "JumpAndPlaceBelowAction -> " + blockPlacePosition.add(0, 1, 0).formatXYZ();
  }
}
