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
package com.soulfiremc.server.pathfinding.graph.constraint;

import com.soulfiremc.server.pathfinding.SFVec3i;
import net.minecraft.world.level.block.state.BlockState;

import java.util.Set;

public record BlockBreakBlacklistConstraint(
  PathConstraint delegate,
  Set<SFVec3i> blockedPositions
) implements DelegatePathConstraint {
  public BlockBreakBlacklistConstraint {
    blockedPositions = Set.copyOf(blockedPositions);
  }

  @Override
  public boolean canBreakBlock(SFVec3i pos, BlockState blockState) {
    return !blockedPositions.contains(pos)
      && delegate.canBreakBlock(pos, blockState);
  }
}
