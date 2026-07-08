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

import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.net.Proxy;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class RendererDownloadedTextureStoreTest {
  @TempDir
  private Path tempDir;

  @Test
  void storesDownloadedTexturePixelsByTextureLocation() {
    var location = Identifier.withDefaultNamespace("skins/downloaded");
    var image = new BufferedImage(2, 1, BufferedImage.TYPE_INT_ARGB);
    image.setRGB(0, 0, 0xFF336699);
    image.setRGB(1, 0, 0x80445566);

    try {
      RendererDownloadedTextureStore.register(location, image);
      var texture = RendererDownloadedTextureStore.texture(location);

      assertNotNull(texture);
      assertEquals(0xFF336699, texture.sample(0.25F, 0.5F, 0));
      assertEquals(0x80445566, texture.sample(0.75F, 0.5F, 0));
    } finally {
      RendererDownloadedTextureStore.unregister(location);
    }
  }

  @Test
  void unregistersDownloadedTexturePixels() {
    var location = Identifier.withDefaultNamespace("skins/removed");
    RendererDownloadedTextureStore.register(location, 1, 1, new int[]{0xFFFFFFFF});

    RendererDownloadedTextureStore.unregister(location);

    assertNull(RendererDownloadedTextureStore.texture(location));
  }

  @Test
  void mirrorsDownloadedSkinFromPngCacheWithVanillaAlphaRules() throws Exception {
    var location = Identifier.withDefaultNamespace("skins/cached");
    var cacheFile = tempDir.resolve("skin.png");
    var image = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
    image.setRGB(8, 8, 0x40112233);
    image.setRGB(40, 8, 0x40223344);
    ImageIO.write(image, "png", cacheFile.toFile());

    try {
      RendererDownloadedTextureStore.registerDownloadedTexture(location, cacheFile, "https://textures.example/skin.png", Proxy.NO_PROXY, true);

      var texture = RendererDownloadedTextureStore.texture(location);
      assertNotNull(texture);
      var mirrored = texture.toBufferedImage();
      assertEquals(0xFF112233, mirrored.getRGB(8, 8));
      assertEquals(0x40223344, mirrored.getRGB(40, 8));
    } finally {
      RendererDownloadedTextureStore.unregister(location);
    }
  }

  @Test
  void expandsLegacyDownloadedSkinWithoutNativeImage() throws Exception {
    var location = Identifier.withDefaultNamespace("skins/legacy");
    var cacheFile = tempDir.resolve("legacy-skin.png");
    var image = new BufferedImage(64, 32, BufferedImage.TYPE_INT_ARGB);
    image.setRGB(4, 16, 0xFF112233);
    ImageIO.write(image, "png", cacheFile.toFile());

    try {
      RendererDownloadedTextureStore.registerDownloadedTexture(location, cacheFile, "https://textures.example/legacy.png", Proxy.NO_PROXY, true);

      var texture = RendererDownloadedTextureStore.texture(location);
      assertNotNull(texture);
      assertEquals(64, texture.width());
      assertEquals(64, texture.height());
      assertEquals(0xFF112233, texture.toBufferedImage().getRGB(23, 48));
    } finally {
      RendererDownloadedTextureStore.unregister(location);
    }
  }
}
