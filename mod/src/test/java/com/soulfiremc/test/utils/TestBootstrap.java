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
package com.soulfiremc.test.utils;

import com.soulfiremc.mod.util.SFConstants;
import net.fabricmc.loader.impl.launch.FabricLauncherBase;
import net.minecraft.SharedConstants;
import net.minecraft.client.ClientBootstrap;
import net.minecraft.core.Holder;
import net.minecraft.core.MappedRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.Bootstrap;
import net.minecraft.tags.TagKey;
import net.minecraft.tags.TagLoader;

import java.lang.reflect.InvocationTargetException;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class TestBootstrap {
  private static final Object BOOTSTRAP_LOCK = new Object();
  private static volatile boolean bootstrapped;

  private TestBootstrap() {
  }

  public static void bootstrapForTest() {
    SFConstants.NOT_REGISTRY_INIT_PHASE = false;

    var targetClassLoader = fabricTargetClassLoader();
    if (targetClassLoader != null && targetClassLoader != TestBootstrap.class.getClassLoader()) {
      invokeTargetBootstrap(targetClassLoader);
      return;
    }

    Thread.currentThread().setContextClassLoader(testClassLoader());

    if (bootstrapped) {
      return;
    }

    synchronized (BOOTSTRAP_LOCK) {
      if (bootstrapped) {
        return;
      }

      SharedConstants.tryDetectVersion();
      SharedConstants.CHECK_DATA_FIXER_SCHEMA = false;
      Bootstrap.bootStrap();
      bindTagsToEmpty();
      ClientBootstrap.bootstrap();
      Bootstrap.validate();
      bootstrapped = true;
    }
  }

  public static ClassLoader testClassLoader() {
    var targetClassLoader = fabricTargetClassLoader();
    return targetClassLoader != null ? targetClassLoader : TestBootstrap.class.getClassLoader();
  }

  private static ClassLoader fabricTargetClassLoader() {
    try {
      var launcher = FabricLauncherBase.getLauncher();
      return launcher != null ? launcher.getTargetClassLoader() : null;
    } catch (LinkageError _) {
      return null;
    }
  }

  private static void invokeTargetBootstrap(ClassLoader targetClassLoader) {
    try {
      var targetBootstrap = Class.forName(TestBootstrap.class.getName(), true, targetClassLoader);
      if (targetBootstrap == TestBootstrap.class) {
        Thread.currentThread().setContextClassLoader(testClassLoader());
        return;
      }

      targetBootstrap.getMethod("bootstrapForTest").invoke(null);
    } catch (ClassNotFoundException | IllegalAccessException | NoSuchMethodException e) {
      throw new IllegalStateException("Failed to bootstrap Minecraft in the Fabric test class loader", e);
    } catch (InvocationTargetException e) {
      var cause = e.getCause();
      if (cause instanceof RuntimeException runtimeException) {
        throw runtimeException;
      } else if (cause instanceof Error error) {
        throw error;
      }

      throw new IllegalStateException("Failed to bootstrap Minecraft in the Fabric test class loader", cause);
    }
  }

  private static void bindTagsToEmpty() {
    for (var registry : BuiltInRegistries.REGISTRY) {
      bindTagsToEmpty(registry);
    }
  }

  private static <T> void bindTagsToEmpty(Registry<T> registry) {
    try {
      registry.prepareTagReload(new TagLoader.LoadResult<T>(registry.key(), Map.<TagKey<T>, List<Holder<T>>>of()))
        .apply();
    } catch (IllegalStateException e) {
      if (registry instanceof MappedRegistry<?> mappedRegistry && Objects.equals(e.getMessage(), "Invalid method used for tag loading")) {
        mappedRegistry.bindAllTagsToEmpty();
        mappedRegistry.freeze();
        return;
      }

      throw e;
    }
  }
}
