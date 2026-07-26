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
package com.soulfiremc.mod.mixin.soulfire.api.event;

import com.soulfiremc.server.api.SoulFireAPI;
import com.soulfiremc.server.api.event.bot.BotBlockUpdateEvent;
import com.soulfiremc.server.api.event.bot.BotPostEntityTickEvent;
import com.soulfiremc.server.api.event.bot.BotPreEntityTickEvent;
import com.soulfiremc.server.bot.BotConnection;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import org.checkerframework.checker.nullness.qual.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.Objects;

@Mixin(ClientLevel.class)
public class MixinClientLevel {
  @Unique
  private @Nullable BlockState soulfire$previousBlockState;

  @Inject(method = "tickEntities", at = @At("HEAD"))
  private void onEntityTickPre(CallbackInfo ci) {
    SoulFireAPI.postEvent(new BotPreEntityTickEvent(BotConnection.current()));
  }

  @Inject(method = "tickEntities", at = @At("RETURN"))
  private void onEntityTickPost(CallbackInfo ci) {
    SoulFireAPI.postEvent(new BotPostEntityTickEvent(BotConnection.current()));
  }

  @Inject(method = "setBlock", at = @At("HEAD"))
  private void capturePreviousBlockState(
    BlockPos position,
    BlockState state,
    int updateFlags,
    int updateLimit,
    CallbackInfoReturnable<Boolean> cir
  ) {
    soulfire$previousBlockState = ((ClientLevel) (Object) this).getBlockState(position);
  }

  @Inject(method = "setBlock", at = @At("RETURN"))
  private void postBlockUpdate(
    BlockPos position,
    BlockState state,
    int updateFlags,
    int updateLimit,
    CallbackInfoReturnable<Boolean> cir
  ) {
    var previousState = soulfire$previousBlockState;
    soulfire$previousBlockState = null;
    if (!cir.getReturnValueZ() || previousState == null || Objects.equals(previousState, state)) {
      return;
    }
    BotConnection.currentOptional().ifPresent(connection ->
      SoulFireAPI.postEvent(new BotBlockUpdateEvent(connection, position.immutable(), previousState, state)));
  }
}
