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
package com.soulfiremc.test.renderer;

import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.textures.GpuTextureView;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.soulfiremc.server.renderer.InventoryItemIconRenderer;
import com.soulfiremc.server.renderer.RenderMaterial;
import com.soulfiremc.server.renderer.RenderQuad;
import com.soulfiremc.server.renderer.RenderVertex;
import com.soulfiremc.server.renderer.RendererAssets;
import com.soulfiremc.test.utils.TestBootstrap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.font.TextRenderable;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.gizmos.DrawableGizmoPrimitives;
import net.minecraft.client.renderer.item.ItemStackRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.client.resources.model.geometry.BakedQuad;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponentMap;
import net.minecraft.gizmos.TextGizmo;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.util.LightCoordsUtil;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.joml.Matrix4f;
import org.joml.Matrix4fc;
import org.joml.Quaternionf;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.lang.reflect.Method;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class InventoryItemIconRendererTest {
  private static ItemStack itemStack(Item item) {
    return new ItemStack(Holder.direct(item, DataComponentMap.EMPTY), 1);
  }

  @BeforeAll
  static void bootstrap() {
    TestBootstrap.bootstrapForTest();
  }

  @Test
  void rendersStaticItemAsPng() throws Exception {
    var result = InventoryItemIconRenderer.render(null, null, null, itemStack(Items.DIAMOND_SWORD));

    assertEquals(InventoryItemIconRenderer.PNG_MIME_TYPE, result.mimeType());
    assertFalse(result.base64().isEmpty());

    var image = ImageIO.read(new ByteArrayInputStream(Base64.getDecoder().decode(result.base64())));
    assertNotNull(image);
    assertTrue(image.getWidth() > 0);
    assertEquals(image.getWidth(), image.getHeight());

    var hasVisiblePixel = false;
    for (var y = 0; y < image.getHeight() && !hasVisiblePixel; y++) {
      for (var x = 0; x < image.getWidth(); x++) {
        if (((image.getRGB(x, y) >>> 24) & 0xFF) > 0) {
          hasVisiblePixel = true;
          break;
        }
      }
    }

    assertTrue(hasVisiblePixel);

    var bounds = visibleBounds(image);
    assertNotNull(bounds);
    assertTrue(bounds.width >= 12 || bounds.height >= 12);
  }

  @Test
  void rendersBlockItemsFromVanillaResolvedScene() throws Exception {
    var result = InventoryItemIconRenderer.render(null, null, null, itemStack(Items.SEA_LANTERN));

    assertEquals(InventoryItemIconRenderer.PNG_MIME_TYPE, result.mimeType());
    assertFalse(result.base64().isEmpty());

    var image = ImageIO.read(new ByteArrayInputStream(Base64.getDecoder().decode(result.base64())));
    assertNotNull(image);
    assertNotNull(visibleBounds(image));
  }

  @Test
  void rendersCompassFromVanillaResolvedScene() throws Exception {
    var result = InventoryItemIconRenderer.render(null, null, null, itemStack(Items.COMPASS));

    assertEquals(InventoryItemIconRenderer.PNG_MIME_TYPE, result.mimeType());
    assertFalse(result.base64().isEmpty());

    var image = ImageIO.read(new ByteArrayInputStream(Base64.getDecoder().decode(result.base64())));
    assertNotNull(image);
    assertNotNull(visibleBounds(image));
  }

  @Test
  void rendersSpecialModelChestWithTransparentCorners() throws Exception {
    var minecraft = Minecraft.getInstance();
    Assumptions.assumeTrue(
      minecraft != null,
      "Live Minecraft instance required to exercise special-model item rendering"
    );

    var result = InventoryItemIconRenderer.render(
      minecraft,
      minecraft.level,
      minecraft.player,
      itemStack(Items.TRAPPED_CHEST)
    );

    assertEquals(InventoryItemIconRenderer.PNG_MIME_TYPE, result.mimeType());
    assertFalse(result.base64().isEmpty());

    var image = ImageIO.read(new ByteArrayInputStream(Base64.getDecoder().decode(result.base64())));
    assertNotNull(image);

    var topLeftAlpha = (image.getRGB(0, 0) >>> 24) & 0xFF;
    var bottomLeftAlpha = (image.getRGB(0, image.getHeight() - 1) >>> 24) & 0xFF;
    var centerAlpha =
      (image.getRGB(image.getWidth() / 2, image.getHeight() / 2) >>> 24) & 0xFF;

    assertEquals(0, topLeftAlpha);
    assertEquals(0, bottomLeftAlpha);
    assertTrue(centerAlpha > 0);
  }

  @Test
  void projectsVanillaGuiYDownQuadsWithoutFlippingTexture() throws Exception {
    var texture = RendererAssets.TextureImage.fromArgb(
      2,
      2,
      new int[]{
        0xFFFF0000, 0xFFFF0000,
        0xFF0000FF, 0xFF0000FF
      },
      null
    );
    var quad = new RenderQuad(
      new RenderVertex(-0.5F, -0.5F, 0.0F, 0.0F, 0.0F, 0xFFFFFFFF),
      new RenderVertex(-0.5F, 0.5F, 0.0F, 0.0F, 1.0F, 0xFFFFFFFF),
      new RenderVertex(0.5F, 0.5F, 0.0F, 1.0F, 1.0F, 0xFFFFFFFF),
      new RenderVertex(0.5F, -0.5F, 0.0F, 1.0F, 0.0F, 0xFFFFFFFF),
      RenderMaterial.create(texture, RendererAssets.AlphaMode.OPAQUE, 0xFFFFFFFF, true, 0.0F)
    );

    var sceneClass = Class.forName("com.soulfiremc.server.renderer.InventoryItemIconRenderer$IconScene");
    var sceneConstructor = sceneClass.getDeclaredConstructor(List.class, List.class, boolean.class);
    sceneConstructor.setAccessible(true);
    var scene = sceneConstructor.newInstance(List.of(quad), List.of(texture), false);
    var renderFrame = InventoryItemIconRenderer.class.getDeclaredMethod("renderFrame", sceneClass, long.class);
    renderFrame.setAccessible(true);
    var image = (BufferedImage) renderFrame.invoke(null, scene, 0L);

    assertRedDominant(image.getRGB(image.getWidth() / 2, image.getHeight() / 2 - 4));
    assertBlueDominant(image.getRGB(image.getWidth() / 2, image.getHeight() / 2 + 4));
  }

  @Test
  void itemSubmitMarksFoilForFoilItemParts() throws Exception {
    var collector = newItemSubmitCollector();
    var collectorClass = collector.getClass();
    var submitItem = collectorClass.getDeclaredMethod(
      "submitItem",
      PoseStack.class,
      ItemDisplayContext.class,
      int.class,
      int.class,
      int.class,
      int[].class,
      List.class,
      ItemStackRenderState.FoilType.class
    );
    submitItem.setAccessible(true);

    submitItem.invoke(
      collector,
      new PoseStack(),
      ItemDisplayContext.GUI,
      0,
      0,
      0xFFFFFFFF,
      new int[0],
      List.<BakedQuad>of(),
      ItemStackRenderState.FoilType.STANDARD
    );

    Method hasFoil = collectorClass.getDeclaredMethod("hasFoil");
    hasFoil.setAccessible(true);
    assertTrue((boolean) hasFoil.invoke(collector));
  }

  @Test
  void itemSubmitCollectorCapturesShapeOutlines() throws Exception {
    var collector = newItemSubmitCollector();
    var collectorClass = collector.getClass();
    var submitShapeOutline = collectorClass.getDeclaredMethod(
      "submitShapeOutline",
      PoseStack.class,
      VoxelShape.class,
      RenderType.class,
      int.class,
      float.class,
      boolean.class
    );
    submitShapeOutline.setAccessible(true);

    submitShapeOutline.invoke(
      collector,
      new PoseStack(),
      Shapes.box(-0.5, -0.5, 0.0, 0.5, 0.5, 1.0),
      RenderTypes.lines(),
      0xFFFFFFFF,
      2.0F,
      false
    );

    assertFalse(unsupported(collector));
    assertTrue(quads(collector).size() >= 12);
  }

  @Test
  void itemSubmitCollectorCapturesNoTextureCustomGeometry() throws Exception {
    var collector = newItemSubmitCollector();
    var collectorClass = collector.getClass();
    var submitCustomGeometry = collectorClass.getDeclaredMethod(
      "submitCustomGeometry",
      PoseStack.class,
      RenderType.class,
      SubmitNodeCollector.CustomGeometryRenderer.class
    );
    submitCustomGeometry.setAccessible(true);
    SubmitNodeCollector.CustomGeometryRenderer renderer = (_, consumer) -> {
      consumer.addVertex(-0.5F, -0.5F, 0.0F).setColor(0xFFFFFFFF);
      consumer.addVertex(-0.5F, 0.5F, 0.0F).setColor(0xFFFFFFFF);
      consumer.addVertex(0.5F, 0.5F, 0.0F).setColor(0xFFFFFFFF);
      consumer.addVertex(0.5F, -0.5F, 0.0F).setColor(0xFFFFFFFF);
    };

    submitCustomGeometry.invoke(collector, new PoseStack(), RenderTypes.debugQuads(), renderer);

    assertFalse(unsupported(collector));
    assertEquals(1, quads(collector).size());
  }

  @Test
  void itemSubmitCollectorCapturesGizmoGeometry() throws Exception {
    var collector = newItemSubmitCollector();
    var collectorClass = collector.getClass();
    var submitGizmoPrimitives = collectorClass.getDeclaredMethod(
      "submitGizmoPrimitives",
      DrawableGizmoPrimitives.Group.class,
      CameraRenderState.class,
      boolean.class
    );
    submitGizmoPrimitives.setAccessible(true);
    var group = new DrawableGizmoPrimitives.Group(
      true,
      List.of(new DrawableGizmoPrimitives.Line(new Vec3(-0.5, -0.5, 0.0), new Vec3(0.5, -0.5, 0.0), 0xFFFFFFFF, 2.0F)),
      List.of(new DrawableGizmoPrimitives.Quad(
        new Vec3(-0.25, -0.25, 0.0),
        new Vec3(-0.25, 0.25, 0.0),
        new Vec3(0.25, 0.25, 0.0),
        new Vec3(0.25, -0.25, 0.0),
        0xFFFFFFFF
      )),
      List.of(new DrawableGizmoPrimitives.TriangleFan(
        new Vec3[]{
          new Vec3(0.0, 0.5, 0.0),
          new Vec3(-0.25, 0.25, 0.0),
          new Vec3(0.25, 0.25, 0.0)
        },
        0xFFFFFFFF
      )),
      List.of(),
      List.of(new DrawableGizmoPrimitives.Point(new Vec3(0.0, 0.0, 0.0), 0xFFFFFFFF, 2.0F))
    );

    submitGizmoPrimitives.invoke(collector, group, null, false);

    assertFalse(unsupported(collector));
    assertTrue(quads(collector).size() >= 4);
  }

  @Test
  void itemSubmitCollectorCapturesSubmittedText() throws Exception {
    var collector = newItemSubmitCollector();
    var collectorClass = collector.getClass();
    var submitText = collectorClass.getDeclaredMethod(
      "submitText",
      PoseStack.class,
      float.class,
      float.class,
      FormattedCharSequence.class,
      boolean.class,
      Font.DisplayMode.class,
      int.class,
      int.class,
      int.class,
      int.class
    );
    submitText.setAccessible(true);

    submitText.invoke(
      collector,
      new PoseStack(),
      -4.0F,
      -4.0F,
      FormattedCharSequence.forward("A", Style.EMPTY),
      false,
      Font.DisplayMode.NORMAL,
      LightCoordsUtil.FULL_BRIGHT,
      0xFFFFFFFF,
      0,
      0
    );

    assertTextSubmissionHandled(collector);
  }

  @Test
  void itemSubmitCollectorCapturesNameTagText() throws Exception {
    var collector = newItemSubmitCollector();
    var collectorClass = collector.getClass();
    var submitNameTag = collectorClass.getDeclaredMethod(
      "submitNameTag",
      PoseStack.class,
      Vec3.class,
      int.class,
      Component.class,
      boolean.class,
      int.class,
      CameraRenderState.class
    );
    submitNameTag.setAccessible(true);

    submitNameTag.invoke(
      collector,
      new PoseStack(),
      Vec3.ZERO,
      0xFFFFFFFF,
      Component.literal("A"),
      false,
      0,
      null
    );

    assertTextSubmissionHandled(collector);
  }

  @Test
  void itemSubmitCollectorCapturesGizmoText() throws Exception {
    var collector = newItemSubmitCollector();
    var collectorClass = collector.getClass();
    var submitGizmoPrimitives = collectorClass.getDeclaredMethod(
      "submitGizmoPrimitives",
      DrawableGizmoPrimitives.Group.class,
      CameraRenderState.class,
      boolean.class
    );
    submitGizmoPrimitives.setAccessible(true);
    var group = new DrawableGizmoPrimitives.Group(
      true,
      List.of(),
      List.of(),
      List.of(),
      List.of(new DrawableGizmoPrimitives.Text(Vec3.ZERO, "A", TextGizmo.Style.whiteAndCentered())),
      List.of()
    );

    submitGizmoPrimitives.invoke(collector, group, null, false);

    assertTextSubmissionHandled(collector);
  }

  @Test
  void itemSubmitCollectorCapturesPreparedTextRenderable() throws Exception {
    var collector = newItemSubmitCollector();
    var collectorClass = collector.getClass();
    var captureTextRenderable = collectorClass.getDeclaredMethod(
      "captureTextRenderable",
      Matrix4fc.class,
      TextRenderable.class,
      Font.DisplayMode.class,
      int.class
    );
    captureTextRenderable.setAccessible(true);

    captureTextRenderable.invoke(
      collector,
      new Matrix4f(),
      new TextRenderable() {
        @Override
        public void render(Matrix4fc pose, VertexConsumer buffer, int packedLightCoords, boolean flat) {
          buffer.addVertex(-0.5F, -0.5F, 0.0F).setColor(0xFFFFFFFF).setUv(0.0F, 0.0F);
          buffer.addVertex(-0.5F, 0.5F, 0.0F).setColor(0xFFFFFFFF).setUv(0.0F, 1.0F);
          buffer.addVertex(0.5F, 0.5F, 0.0F).setColor(0xFFFFFFFF).setUv(1.0F, 1.0F);
          buffer.addVertex(0.5F, -0.5F, 0.0F).setColor(0xFFFFFFFF).setUv(1.0F, 0.0F);
        }

        @Override
        public RenderType renderType(Font.DisplayMode displayMode) {
          return RenderTypes.text(Identifier.withDefaultNamespace("font/test"));
        }

        @Override
        public GpuTextureView textureView() {
          return null;
        }

        @Override
        public RenderPipeline guiPipeline() {
          return RenderPipelines.TEXT;
        }

        @Override public float left() { return -0.5F; }
        @Override public float top() { return -0.5F; }
        @Override public float right() { return 0.5F; }
        @Override public float bottom() { return 0.5F; }
      },
      Font.DisplayMode.NORMAL,
      LightCoordsUtil.FULL_BRIGHT
    );

    assertFalse(unsupported(collector));
    assertEquals(1, quads(collector).size());
  }

  @Test
  void itemSubmitCollectorIgnoresFlameAndLeashWithoutFailingIcon() throws Exception {
    var collector = newItemSubmitCollector();
    var collectorClass = collector.getClass();
    var submitFlame = collectorClass.getDeclaredMethod(
      "submitFlame",
      PoseStack.class,
      EntityRenderState.class,
      Quaternionf.class
    );
    var submitLeash = collectorClass.getDeclaredMethod(
      "submitLeash",
      PoseStack.class,
      EntityRenderState.LeashState.class
    );
    submitFlame.setAccessible(true);
    submitLeash.setAccessible(true);

    submitFlame.invoke(collector, new PoseStack(), null, new Quaternionf());
    submitLeash.invoke(collector, new PoseStack(), null);

    assertFalse(unsupported(collector));
  }

  @Test
  void itemSubmitCollectorCapturesFlameGeometry() throws Exception {
    var collector = newItemSubmitCollector();
    var collectorClass = collector.getClass();
    var submitFlame = collectorClass.getDeclaredMethod(
      "submitFlame",
      PoseStack.class,
      EntityRenderState.class,
      Quaternionf.class
    );
    submitFlame.setAccessible(true);
    var renderState = new EntityRenderState();
    renderState.boundingBoxWidth = 1.0F;
    renderState.boundingBoxHeight = 1.4F;
    renderState.lightCoords = LightCoordsUtil.FULL_BRIGHT;

    submitFlame.invoke(collector, new PoseStack(), renderState, new Quaternionf());

    assertFalse(unsupported(collector));
    assertFalse(quads(collector).isEmpty());
    assertTrue(quads(collector).size() <= 4);
  }

  private static Object newItemSubmitCollector() throws Exception {
    var collectorClass = Class.forName("com.soulfiremc.server.renderer.InventoryItemIconRenderer$ItemSubmitCollector");
    var constructor = collectorClass.getDeclaredConstructor();
    constructor.setAccessible(true);
    return constructor.newInstance();
  }

  private static boolean unsupported(Object collector) throws Exception {
    var unsupported = collector.getClass().getDeclaredMethod("unsupported");
    unsupported.setAccessible(true);
    return (boolean) unsupported.invoke(collector);
  }

  private static void assertTextSubmissionHandled(Object collector) throws Exception {
    assertFalse(unsupported(collector));
    if (Minecraft.getInstance() != null) {
      assertFalse(quads(collector).isEmpty());
    }
  }

  @SuppressWarnings("unchecked")
  private static List<RenderQuad> quads(Object collector) throws Exception {
    var quads = collector.getClass().getDeclaredMethod("quads");
    quads.setAccessible(true);
    return (List<RenderQuad>) quads.invoke(collector);
  }

  private static Rectangle visibleBounds(BufferedImage image) {
    int minX = Integer.MAX_VALUE;
    int minY = Integer.MAX_VALUE;
    int maxX = Integer.MIN_VALUE;
    int maxY = Integer.MIN_VALUE;

    for (var y = 0; y < image.getHeight(); y++) {
      for (var x = 0; x < image.getWidth(); x++) {
        if (((image.getRGB(x, y) >>> 24) & 0xFF) == 0) {
          continue;
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (minX == Integer.MAX_VALUE) {
      return null;
    }
    return new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
  }

  private static void assertRedDominant(int color) {
    var red = (color >> 16) & 0xFF;
    var blue = color & 0xFF;
    assertTrue(red > blue, () -> "Expected red-dominant pixel, got 0x" + Integer.toHexString(color));
  }

  private static void assertBlueDominant(int color) {
    var red = (color >> 16) & 0xFF;
    var blue = color & 0xFF;
    assertTrue(blue > red, () -> "Expected blue-dominant pixel, got 0x" + Integer.toHexString(color));
  }
}
