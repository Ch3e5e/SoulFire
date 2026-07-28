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
package com.soulfiremc.mod.mixin.soulfire;

import com.soulfiremc.server.task.AnimalLoveState;
import net.minecraft.world.entity.animal.Animal;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Animal.class)
public abstract class AnimalLoveStateMixin implements AnimalLoveState {
  @Unique
  private long soulfire$lastLoveEventTick = Long.MIN_VALUE;

  @Inject(method = "handleEntityEvent", at = @At("HEAD"))
  private void soulfire$recordLoveEvent(byte event, CallbackInfo callback) {
    if (event == 18) {
      var animal = (Animal) (Object) this;
      soulfire$lastLoveEventTick = animal.level().getGameTime();
    }
  }

  @Override
  public long soulfire$lastLoveEventTick() {
    return soulfire$lastLoveEventTick;
  }
}
