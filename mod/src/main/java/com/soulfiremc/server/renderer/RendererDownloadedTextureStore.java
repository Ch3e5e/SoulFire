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
package com.soulfiremc.server.renderer;

import com.mojang.blaze3d.platform.NativeImage;
import lombok.extern.slf4j.Slf4j;
import net.minecraft.resources.Identifier;
import org.jetbrains.annotations.Nullable;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/// CPU copy of textures that vanilla's SkinManager resolved through SkinTextureDownloader.
@Slf4j
public final class RendererDownloadedTextureStore {
  private static final Object LOCK = new Object();
  private static final Map<Identifier, RendererAssets.TextureImage> TEXTURES = new HashMap<>();

  private RendererDownloadedTextureStore() {}

  public static void register(Identifier location, NativeImage image) {
    var pixels = new int[image.getWidth() * image.getHeight()];
    for (var y = 0; y < image.getHeight(); y++) {
      for (var x = 0; x < image.getWidth(); x++) {
        pixels[x + y * image.getWidth()] = image.getPixel(x, y);
      }
    }

    var texture = RendererAssets.TextureImage.fromArgb(image.getWidth(), image.getHeight(), pixels, null);
    synchronized (LOCK) {
      TEXTURES.put(location, texture);
    }
  }

  public static void register(Identifier location, BufferedImage image) {
    register(location, image.getWidth(), image.getHeight(), image.getRGB(0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth()));
  }

  public static void register(Identifier location, int width, int height, int[] argbPixels) {
    var texture = RendererAssets.TextureImage.fromArgb(width, height, argbPixels, null);
    synchronized (LOCK) {
      TEXTURES.put(location, texture);
    }
  }

  public static void registerDownloadedTexture(
    Identifier location,
    Path localCopy,
    String url,
    Proxy proxy,
    boolean processLegacySkin
  ) {
    try {
      var image = readDownloadedImage(localCopy, url, proxy);
      var texture = processLegacySkin
        ? normalizedSkinTexture(image.getWidth(), image.getHeight(), image.getRGB(0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth()), url)
        : RendererAssets.TextureImage.from(image, null);
      if (texture == null) {
        return;
      }

      synchronized (LOCK) {
        TEXTURES.put(location, texture);
      }
    } catch (Throwable t) {
      log.debug("Failed to mirror downloaded renderer texture {}", location, t);
    }
  }

  public static void unregister(Identifier location) {
    synchronized (LOCK) {
      TEXTURES.remove(location);
    }
  }

  @Nullable
  public static RendererAssets.TextureImage texture(Identifier location) {
    synchronized (LOCK) {
      return TEXTURES.get(location);
    }
  }

  @Nullable
  static RendererAssets.TextureImage normalizedSkinTexture(int width, int height, int[] argbPixels, String source) {
    try {
      return RendererAssets.TextureImage.fromArgb(64, 64, normalizedSkinPixels(width, height, argbPixels, source), null);
    } catch (Throwable t) {
      log.debug("Failed to normalize renderer skin texture {}", source, t);
      return null;
    }
  }

  private static BufferedImage readDownloadedImage(Path localCopy, String url, Proxy proxy) throws IOException {
    if (Files.isRegularFile(localCopy)) {
      var image = ImageIO.read(localCopy.toFile());
      if (image != null) {
        return image;
      }
      throw new IOException("Invalid cached image " + localCopy);
    }

    var uri = URI.create(url);
    var connection = (HttpURLConnection) uri.toURL().openConnection(proxy);
    try {
      connection.setDoInput(true);
      connection.setDoOutput(false);
      connection.connect();
      var responseCode = connection.getResponseCode();
      if (responseCode / 100 != 2) {
        throw new IOException("Failed to open " + uri + ", HTTP error code: " + responseCode);
      }

      var image = ImageIO.read(connection.getInputStream());
      if (image != null) {
        return image;
      }
      throw new IOException("Invalid downloaded image " + uri);
    } finally {
      connection.disconnect();
    }
  }

  private static int[] normalizedSkinPixels(int width, int height, int[] argbPixels, String source) {
    if (width != 64 || height != 32 && height != 64 || argbPixels.length < width * height) {
      throw new IllegalStateException("Discarding incorrectly sized (" + width + "x" + height + ") skin texture from " + source);
    }

    var legacy = height == 32;
    var pixels = legacy ? new int[64 * 64] : Arrays.copyOf(argbPixels, 64 * 64);
    if (legacy) {
      copyRect(argbPixels, 64, pixels, 64, 0, 0, 0, 0, 64, 32, false, false);
      fillRect(pixels, 64, 0, 32, 64, 32, 0);
      copyRect(pixels, 64, pixels, 64, 4, 16, 20, 48, 4, 4, true, false);
      copyRect(pixels, 64, pixels, 64, 8, 16, 24, 48, 4, 4, true, false);
      copyRect(pixels, 64, pixels, 64, 0, 20, 24, 52, 4, 12, true, false);
      copyRect(pixels, 64, pixels, 64, 4, 20, 20, 52, 4, 12, true, false);
      copyRect(pixels, 64, pixels, 64, 8, 20, 16, 52, 4, 12, true, false);
      copyRect(pixels, 64, pixels, 64, 12, 20, 28, 52, 4, 12, true, false);
      copyRect(pixels, 64, pixels, 64, 44, 16, 36, 48, 4, 4, true, false);
      copyRect(pixels, 64, pixels, 64, 48, 16, 40, 48, 4, 4, true, false);
      copyRect(pixels, 64, pixels, 64, 40, 20, 40, 52, 4, 12, true, false);
      copyRect(pixels, 64, pixels, 64, 44, 20, 36, 52, 4, 12, true, false);
      copyRect(pixels, 64, pixels, 64, 48, 20, 32, 52, 4, 12, true, false);
      copyRect(pixels, 64, pixels, 64, 52, 20, 44, 52, 4, 12, true, false);
    }

    setNoAlpha(pixels, 64, 0, 0, 32, 16);
    if (legacy) {
      doNotchTransparencyHack(pixels, 64, 32, 0, 64, 32);
    }

    setNoAlpha(pixels, 64, 0, 16, 64, 32);
    setNoAlpha(pixels, 64, 16, 48, 48, 64);
    return pixels;
  }

  private static void fillRect(int[] pixels, int stride, int xs, int ys, int width, int height, int argb) {
    for (var y = ys; y < ys + height; y++) {
      Arrays.fill(pixels, xs + y * stride, xs + width + y * stride, argb);
    }
  }

  private static void copyRect(
    int[] source,
    int sourceStride,
    int[] target,
    int targetStride,
    int sourceX,
    int sourceY,
    int targetX,
    int targetY,
    int width,
    int height,
    boolean swapX,
    boolean swapY
  ) {
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var dx = swapX ? width - 1 - x : x;
        var dy = swapY ? height - 1 - y : y;
        target[targetX + dx + (targetY + dy) * targetStride] = source[sourceX + x + (sourceY + y) * sourceStride];
      }
    }
  }

  private static void setNoAlpha(int[] pixels, int stride, int x0, int y0, int x1, int y1) {
    for (var x = x0; x < x1; x++) {
      for (var y = y0; y < y1; y++) {
        var index = x + y * stride;
        pixels[index] = 0xFF000000 | (pixels[index] & 0x00FFFFFF);
      }
    }
  }

  private static void doNotchTransparencyHack(int[] pixels, int stride, int x0, int y0, int x1, int y1) {
    for (var x = x0; x < x1; x++) {
      for (var y = y0; y < y1; y++) {
        if (((pixels[x + y * stride] >>> 24) & 0xFF) < 128) {
          return;
        }
      }
    }

    for (var x = x0; x < x1; x++) {
      for (var y = y0; y < y1; y++) {
        var index = x + y * stride;
        pixels[index] &= 0x00FFFFFF;
      }
    }
  }
}
