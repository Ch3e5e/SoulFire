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

import com.soulfiremc.server.renderer.RendererRuntimeTextureMirror;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.saveddata.maps.MapItemSavedData;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(targets = "net.minecraft.client.resources.MapTextureManager$MapInstance")
public class MixinMapTextureManagerMapInstance {
  @Unique
  private static final int soulfire$MAP_SIZE = 128;

  @Shadow
  private MapItemSavedData data;

  @Shadow
  @Final
  private DynamicTexture texture;

  @Shadow
  @Final
  private Identifier location;

  @Shadow
  private boolean requiresUpload;

  @Inject(method = "updateTextureIfNeeded", at = @At("HEAD"))
  private void mirrorMapTextureBeforeNativeUpload(CallbackInfo ci) {
    if (!requiresUpload || data == null || data.colors.length < soulfire$MAP_SIZE * soulfire$MAP_SIZE) {
      return;
    }

    var pixels = new int[soulfire$MAP_SIZE * soulfire$MAP_SIZE];
    for (var i = 0; i < pixels.length; i++) {
      pixels[i] = MapColor.getColorFromPackedId(data.colors[i]);
    }

    RendererRuntimeTextureMirror.registerArgb(location, texture.getTexture(), soulfire$MAP_SIZE, soulfire$MAP_SIZE, pixels);
  }
}
