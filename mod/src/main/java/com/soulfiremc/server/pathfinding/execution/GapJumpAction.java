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

import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.util.VectorHelper;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RequiredArgsConstructor
public final class GapJumpAction implements WorldAction {
  private static final int MINIMUM_RUN_UP_TICKS = 2;
  private static final int MAXIMUM_RUN_UP_TICKS = 3;
  private static final double MINIMUM_FORWARD_SPEED = 0.08;

  @Getter
  private final SFVec3i blockPosition;
  private int runUpTicks;
  private boolean startedJumping;

  @Override
  public boolean isCompleted(BotConnection connection) {
    var clientEntity = connection.minecraft().player;
    var botPosition = clientEntity.position();
    var level = connection.minecraft().level;

    var blockMeta = level.getBlockState(blockPosition.toBlockPos());
    var targetMiddleBlock = VectorHelper.topMiddleOfBlock(blockPosition, blockMeta);
    if (!MovementAction.hasReachedTargetHeight(
      botPosition.y,
      targetMiddleBlock.y,
      clientEntity.onGround()
        || clientEntity.isInWater()
        || clientEntity.isInLava()
        || clientEntity.onClimbable()
    )) {
      return false;
    }

    return MovementAction.horizontalDistance(botPosition, targetMiddleBlock) <= 0.3;
  }

  @Override
  public SFVec3i targetPosition(BotConnection connection) {
    return blockPosition;
  }

  @Override
  public void tick(BotConnection connection) {
    var clientEntity = connection.minecraft().player;
    connection.controlState().resetAll();

    var level = connection.minecraft().level;

    var blockMeta = level.getBlockState(blockPosition.toBlockPos());
    var targetMiddleBlock = VectorHelper.topMiddleOfBlock(blockPosition, blockMeta);

    connection.rotationControl().lookHorizontallyAt(targetMiddleBlock);

    connection.controlState().sprint(true);
    connection.controlState().up(true);
    if (!startedJumping && clientEntity.onGround()) {
      runUpTicks++;
      var velocity = VectorHelper.toVector2dXZ(clientEntity.getDeltaMovement());
      var targetDirection = VectorHelper.toVector2dXZ(
        targetMiddleBlock.subtract(clientEntity.position())
      );
      var forwardSpeed = velocity.equals(0, 0) || targetDirection.equals(0, 0)
        ? 0
        : velocity.dot(targetDirection.normalize());
      startedJumping = shouldStartJump(runUpTicks, forwardSpeed);
    }
    if (startedJumping) {
      connection.controlState().jump(true);
    }
  }

  static boolean shouldStartJump(int runUpTicks, double forwardSpeed) {
    return runUpTicks >= MAXIMUM_RUN_UP_TICKS
      || (runUpTicks >= MINIMUM_RUN_UP_TICKS && forwardSpeed >= MINIMUM_FORWARD_SPEED);
  }

  @Override
  public int getAllowedTicks() {
    // 5-seconds max to walk to a block
    return 5 * 20;
  }

  @Override
  public String toString() {
    return "GapJumpAction -> " + blockPosition.formatXYZ();
  }
}
