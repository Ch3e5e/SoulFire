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
import com.soulfiremc.server.pathfinding.execution.BlockBreakAction;
import com.soulfiremc.server.pathfinding.execution.GapJumpAction;
import com.soulfiremc.server.pathfinding.graph.BlockFace;
import com.soulfiremc.server.pathfinding.graph.GraphInstructions;
import com.soulfiremc.server.pathfinding.graph.actions.movement.ActionDirection;
import com.soulfiremc.test.utils.TestBlockAccessorBuilder;
import com.soulfiremc.test.utils.TestPathConstraint;
import net.minecraft.world.level.block.Blocks;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.OptionalInt;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class AvoidFluidConstraintTest {
  @Test
  void rejectsFluidAtTheDestinationFeetOrHead() {
    var blocks = new TestBlockAccessorBuilder();
    blocks.setBlockAt(0, 64, 0, Blocks.WATER);
    blocks.setBlockAt(1, 65, 0, Blocks.WATER);
    var level = blocks.build();

    assertFalse(AvoidFluidConstraint.isDryDestination(
      level,
      instruction(0, 64, 0)
    ));
    assertFalse(AvoidFluidConstraint.isDryDestination(
      level,
      instruction(1, 64, 0)
    ));
    assertTrue(AvoidFluidConstraint.isDryDestination(
      level,
      instruction(2, 64, 0)
    ));
  }

  @Test
  void rejectsMiningADestinationThatAdjacentFluidWillFill() {
    var blocks = new TestBlockAccessorBuilder();
    blocks.setBlockAt(0, 64, 0, Blocks.STONE);
    blocks.setBlockAt(1, 64, 0, Blocks.WATER);
    var level = blocks.build();
    var target = SFVec3i.from(0, 64, 0);

    assertTrue(AvoidFluidConstraint.isDryDestination(
      level,
      instruction(0, 64, 0)
    ));
    assertFalse(AvoidFluidConstraint.isDryDestination(
      level,
      new GraphInstructions(
        target,
        0,
        false,
        ActionDirection.NORTH,
        1,
        List.of(new BlockBreakAction(target, BlockFace.TOP))
      )
    ));
  }

  @Test
  void rejectsParkourBecauseAFailedJumpCanEnterFluidBelowTheRoute() {
    var level = new TestBlockAccessorBuilder().build();
    var delegate = TestPathConstraint.INSTANCE;
    var constraint = new AvoidFluidConstraint(
      delegate,
      level,
      OptionalInt.empty()
    );
    var target = SFVec3i.from(2, 64, 0);
    var parkour = new GraphInstructions(
      target,
      0,
      false,
      ActionDirection.EAST,
      1,
      List.of(new GapJumpAction(target))
    );

    assertFalse(constraint.allowsInstruction(parkour));
  }

  @Test
  void allowsAscendingThroughFluidOnlyWhenStartingSubmerged() {
    var blocks = new TestBlockAccessorBuilder();
    blocks.setBlockAt(0, 64, 0, Blocks.WATER);
    blocks.setBlockAt(1, 65, 0, Blocks.WATER);
    blocks.setBlockAt(2, 63, 0, Blocks.WATER);
    var level = blocks.build();
    var submerged = new AvoidFluidConstraint(
      TestPathConstraint.INSTANCE,
      level,
      OptionalInt.of(64)
    );
    var dry = new AvoidFluidConstraint(
      TestPathConstraint.INSTANCE,
      level,
      OptionalInt.empty()
    );

    assertFalse(submerged.allowsInstruction(instruction(0, 64, 0)));
    assertTrue(submerged.allowsInstruction(instruction(1, 65, 0)));
    assertFalse(submerged.allowsInstruction(instruction(2, 63, 0)));
    assertFalse(dry.allowsInstruction(instruction(1, 65, 0)));
    assertTrue(submerged.allowsInstruction(instruction(3, 64, 0)));
  }

  private static GraphInstructions instruction(int x, int y, int z) {
    return new GraphInstructions(
      SFVec3i.from(x, y, z),
      0,
      false,
      ActionDirection.NORTH,
      1,
      List.of()
    );
  }
}
