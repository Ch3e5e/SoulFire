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

import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.systems.CommandEncoder;
import com.mojang.blaze3d.textures.GpuTexture;
import com.soulfiremc.server.renderer.RendererRuntimeTextureMirror;
import org.joml.Vector4fc;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(CommandEncoder.class)
public class MixinCommandEncoder {
  /// Mirrors NativeImage texture writes. In modern Minecraft every NativeImage upload, including the
  /// full-texture overload, funnels through this method, and the raw ByteBuffer overload no longer
  /// carries a NativeImage format we could interpret, so this is the single place to capture writes.
  @Inject(
    method = "writeToTexture(Lcom/mojang/blaze3d/textures/GpuTexture;Lcom/mojang/blaze3d/platform/NativeImage;IIII)V",
    at = @At("HEAD")
  )
  private void writeNativeImageToTextureHook(
    GpuTexture destination,
    NativeImage source,
    int mipLevel,
    int depthOrLayer,
    int destX,
    int destY,
    CallbackInfo ci) {
    RendererRuntimeTextureMirror.mirrorWrite(
      destination, source, mipLevel, depthOrLayer, destX, destY, source.getWidth(), source.getHeight(), 0, 0);
  }

  @Inject(
    method = "copyTextureToTexture(Lcom/mojang/blaze3d/textures/GpuTexture;Lcom/mojang/blaze3d/textures/GpuTexture;IIIIIII)V",
    at = @At("TAIL")
  )
  private void copyTextureToTextureHook(
    GpuTexture source,
    GpuTexture destination,
    int mipLevel,
    int destX,
    int destY,
    int sourceX,
    int sourceY,
    int width,
    int height,
    CallbackInfo ci) {
    RendererRuntimeTextureMirror.mirrorCopy(source, destination, mipLevel, destX, destY, sourceX, sourceY, width, height);
  }

  @Inject(
    method = "clearColorTexture(Lcom/mojang/blaze3d/textures/GpuTexture;Lorg/joml/Vector4fc;)V",
    at = @At("TAIL")
  )
  private void clearColorTextureHook(GpuTexture colorTexture, Vector4fc clearColor, CallbackInfo ci) {
    RendererRuntimeTextureMirror.mirrorClear(colorTexture, argb(clearColor));
  }

  @Inject(
    method = "clearColorAndDepthTextures(Lcom/mojang/blaze3d/textures/GpuTexture;Lorg/joml/Vector4fc;Lcom/mojang/blaze3d/textures/GpuTexture;D)V",
    at = @At("TAIL")
  )
  private void clearColorAndDepthTexturesHook(
    GpuTexture colorTexture,
    Vector4fc clearColor,
    GpuTexture depthTexture,
    double clearDepth,
    CallbackInfo ci) {
    RendererRuntimeTextureMirror.mirrorClear(colorTexture, argb(clearColor));
  }

  @Inject(
    method = "clearColorAndDepthTextures(Lcom/mojang/blaze3d/textures/GpuTexture;Lorg/joml/Vector4fc;Lcom/mojang/blaze3d/textures/GpuTexture;DIIII)V",
    at = @At("TAIL")
  )
  private void clearColorAndDepthTexturesRegionHook(
    GpuTexture colorTexture,
    Vector4fc clearColor,
    GpuTexture depthTexture,
    double clearDepth,
    int regionX,
    int regionY,
    int regionWidth,
    int regionHeight,
    CallbackInfo ci) {
    RendererRuntimeTextureMirror.mirrorClear(colorTexture, argb(clearColor), regionX, regionY, regionWidth, regionHeight);
  }

  private static int argb(Vector4fc color) {
    return (channel(color.w()) << 24)
      | (channel(color.x()) << 16)
      | (channel(color.y()) << 8)
      | channel(color.z());
  }

  private static int channel(float value) {
    if (!Float.isFinite(value)) {
      return 0;
    }
    return Math.clamp(Math.round(value * 255.0F), 0, 255);
  }
}
