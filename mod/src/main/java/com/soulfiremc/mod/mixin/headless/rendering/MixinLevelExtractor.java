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
package com.soulfiremc.mod.mixin.headless.rendering;

import net.minecraft.client.renderer.extract.LevelExtractor;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(LevelExtractor.class)
public abstract class MixinLevelExtractor {
  @Inject(method = "blockChanged", at = @At("HEAD"), cancellable = true)
  private void blockChangedHook(BlockPos pos, int updateFlags, CallbackInfo ci) {
    ci.cancel();
  }

  @Inject(method = "setBlocksDirty(IIIIII)V", at = @At("HEAD"), cancellable = true)
  private void setBlocksDirtyHook(int x0, int y0, int z0, int x1, int y1, int z1, CallbackInfo ci) {
    ci.cancel();
  }

  @Inject(
    method = "setBlockDirty(Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/block/state/BlockState;)V",
    at = @At("HEAD"),
    cancellable = true
  )
  private void setBlockDirtyHook(BlockPos pos, BlockState oldState, BlockState newState, CallbackInfo ci) {
    ci.cancel();
  }

  @Inject(method = "setSectionDirtyWithNeighbors", at = @At("HEAD"), cancellable = true)
  private void setSectionDirtyWithNeighborsHook(int sectionX, int sectionY, int sectionZ, CallbackInfo ci) {
    ci.cancel();
  }

  @Inject(method = "setSectionRangeDirty", at = @At("HEAD"), cancellable = true)
  private void setSectionRangeDirtyHook(
    int minSectionX,
    int minSectionY,
    int minSectionZ,
    int maxSectionX,
    int maxSectionY,
    int maxSectionZ,
    CallbackInfo ci) {
    ci.cancel();
  }

  @Inject(method = "setSectionDirty(III)V", at = @At("HEAD"), cancellable = true)
  private void setSectionDirtyHook(int sectionX, int sectionY, int sectionZ, CallbackInfo ci) {
    ci.cancel();
  }
}
