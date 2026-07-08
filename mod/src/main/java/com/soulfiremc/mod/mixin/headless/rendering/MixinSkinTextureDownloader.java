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

import com.soulfiremc.server.renderer.RendererDownloadedTextureStore;
import net.minecraft.client.renderer.texture.SkinTextureDownloader;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Util;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.net.Proxy;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;

@Mixin(SkinTextureDownloader.class)
public class MixinSkinTextureDownloader {
  @Shadow
  @Final
  private Proxy proxy;

  @Inject(method = "downloadAndRegisterSkin", at = @At("RETURN"), cancellable = true)
  private void mirrorDownloadedTextureHook(
    Identifier textureId,
    Path localCopy,
    String url,
    boolean processLegacySkin,
    CallbackInfoReturnable<CompletableFuture<ClientAsset.Texture>> cir
  ) {
    var original = cir.getReturnValue();
    cir.setReturnValue(original.thenCompose(texture -> CompletableFuture.supplyAsync(() -> {
      RendererDownloadedTextureStore.registerDownloadedTexture(texture.texturePath(), localCopy, url, proxy, processLegacySkin);
      return texture;
    }, Util.nonCriticalIoPool().forName("mirrorDownloadedTexture"))));
  }
}
