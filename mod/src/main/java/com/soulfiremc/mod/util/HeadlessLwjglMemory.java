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
package com.soulfiremc.mod.util;

import io.github.headlesshq.headlessmc.lwjgl.api.Redirection;
import io.github.headlesshq.headlessmc.lwjgl.api.RedirectionApi;

import java.nio.Buffer;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.DoubleBuffer;
import java.nio.FloatBuffer;
import java.nio.IntBuffer;
import java.nio.LongBuffer;
import java.nio.ShortBuffer;
import java.util.IdentityHashMap;
import java.util.NavigableMap;
import java.util.TreeMap;

/// Java memory backing for the small LWJGL MemoryUtil surface vanilla uses for NativeImage.
public final class HeadlessLwjglMemory {
  private static final Object LOCK = new Object();
  private static final NavigableMap<Long, MemoryBlock> BLOCKS = new TreeMap<>();
  private static final IdentityHashMap<Buffer, BufferView> BUFFER_VIEWS = new IdentityHashMap<>();
  private static long nextAddress = 0x1000_0000L;

  private HeadlessLwjglMemory() {}

  public static void register() {
    var manager = RedirectionApi.getRedirectionManager();
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;nmemAlloc(J)J", redirect(args -> allocate((Long) args[0], false)));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;nmemCalloc(JJ)J", redirect(args -> allocate(Math.multiplyExact((Long) args[0], (Long) args[1]), true)));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;nmemFree(J)V", redirect(args -> {
      free((Long) args[0]);
      return null;
    }));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memFree(Ljava/nio/Buffer;)V", redirect(args -> {
      free((Buffer) args[0]);
      return null;
    }));
    manager.redirect("Lorg/lwjgl/stb/STBImage;nstbi_image_free(J)V", redirect(args -> {
      free((Long) args[0]);
      return null;
    }));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memAlloc(I)Ljava/nio/ByteBuffer;", redirect(args -> byteBuffer(allocate((Integer) args[0], false), (Integer) args[0])));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memCalloc(I)Ljava/nio/ByteBuffer;", redirect(args -> byteBuffer(allocate((Integer) args[0], true), (Integer) args[0])));
    manager.redirect("Lorg/lwjgl/BufferUtils;createByteBuffer(I)Ljava/nio/ByteBuffer;", redirect(args -> byteBuffer(allocate((Integer) args[0], true), (Integer) args[0])));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memAllocInt(I)Ljava/nio/IntBuffer;", redirect(args -> intBuffer(allocate((long) (Integer) args[0] * Integer.BYTES, false), (Integer) args[0])));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memAddress(Ljava/nio/ByteBuffer;)J", redirect(args -> address((ByteBuffer) args[0])));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memAddress(Ljava/nio/IntBuffer;)J", redirect(args -> address((IntBuffer) args[0])));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memByteBuffer(JI)Ljava/nio/ByteBuffer;", redirect(args -> byteBuffer((Long) args[0], (Integer) args[1])));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memByteBufferSafe(JI)Ljava/nio/ByteBuffer;", redirect(args -> (Long) args[0] == 0L ? null : byteBuffer((Long) args[0], (Integer) args[1])));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memIntBuffer(JI)Ljava/nio/IntBuffer;", redirect(args -> intBuffer((Long) args[0], (Integer) args[1])));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memGetByte(J)B", redirect(args -> getByte((Long) args[0])));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memPutByte(JB)V", redirect(args -> {
      putByte((Long) args[0], (Byte) args[1]);
      return null;
    }));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memGetInt(J)I", redirect(args -> getInt((Long) args[0])));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memPutInt(JI)V", redirect(args -> {
      putInt((Long) args[0], (Integer) args[1]);
      return null;
    }));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memCopy(JJJ)V", redirect(args -> {
      copy((Long) args[0], (Long) args[1], (Long) args[2]);
      return null;
    }));
    manager.redirect("Lorg/lwjgl/system/MemoryUtil;memSet(JIJ)V", redirect(args -> {
      set((Long) args[0], (Integer) args[1], (Long) args[2]);
      return null;
    }));
  }

  private static Redirection redirect(ThrowingRedirect redirect) {
    return (_, _, _, args) -> redirect.invoke(args);
  }

  private static long allocate(long size, boolean zero) {
    if (size <= 0 || size > Integer.MAX_VALUE) {
      return 0L;
    }

    synchronized (LOCK) {
      var address = nextAddress;
      nextAddress += size + Long.BYTES;
      BLOCKS.put(address, new MemoryBlock(address, new byte[(int) size]));
      return address;
    }
  }

  private static void free(long address) {
    synchronized (LOCK) {
      var removed = BLOCKS.remove(address);
      if (removed == null) {
        return;
      }

      BUFFER_VIEWS.values().removeIf(view -> view.blockAddress == address);
    }
  }

  private static void free(Buffer buffer) {
    if (buffer == null) {
      return;
    }

    synchronized (LOCK) {
      var view = BUFFER_VIEWS.remove(buffer);
      if (view != null) {
        BLOCKS.remove(view.blockAddress);
        BUFFER_VIEWS.values().removeIf(other -> other.blockAddress == view.blockAddress);
      }
    }
  }

  private static byte getByte(long address) {
    synchronized (LOCK) {
      var resolved = resolve(address);
      return resolved != null ? resolved.block.data[resolved.offset] : 0;
    }
  }

  private static void putByte(long address, byte value) {
    synchronized (LOCK) {
      var resolved = resolve(address);
      if (resolved != null) {
        resolved.block.data[resolved.offset] = value;
      }
    }
  }

  private static int getInt(long address) {
    synchronized (LOCK) {
      var resolved = resolve(address, Integer.BYTES);
      if (resolved == null) {
        return 0;
      }

      return ByteBuffer.wrap(resolved.block.data, resolved.offset, Integer.BYTES)
        .order(ByteOrder.nativeOrder())
        .getInt();
    }
  }

  private static void putInt(long address, int value) {
    synchronized (LOCK) {
      var resolved = resolve(address, Integer.BYTES);
      if (resolved != null) {
        ByteBuffer.wrap(resolved.block.data, resolved.offset, Integer.BYTES)
          .order(ByteOrder.nativeOrder())
          .putInt(value);
      }
    }
  }

  private static void copy(long sourceAddress, long targetAddress, long bytes) {
    if (bytes <= 0 || bytes > Integer.MAX_VALUE) {
      return;
    }

    synchronized (LOCK) {
      var source = resolve(sourceAddress, (int) bytes);
      var target = resolve(targetAddress, (int) bytes);
      if (source != null && target != null) {
        System.arraycopy(source.block.data, source.offset, target.block.data, target.offset, (int) bytes);
      }
    }
  }

  private static void set(long address, int value, long bytes) {
    if (bytes <= 0 || bytes > Integer.MAX_VALUE) {
      return;
    }

    synchronized (LOCK) {
      var resolved = resolve(address, (int) bytes);
      if (resolved == null) {
        return;
      }

      var byteValue = (byte) value;
      for (var i = 0; i < bytes; i++) {
        resolved.block.data[resolved.offset + i] = byteValue;
      }
    }
  }

  private static ByteBuffer byteBuffer(long address, int size) {
    synchronized (LOCK) {
      var resolved = resolve(address, size);
      if (resolved == null) {
        return ByteBuffer.allocate(Math.max(0, size)).order(ByteOrder.nativeOrder());
      }

      var buffer = ByteBuffer.wrap(resolved.block.data, resolved.offset, size)
        .slice()
        .order(ByteOrder.nativeOrder());
      BUFFER_VIEWS.put(buffer, new BufferView(resolved.block.address, address, Byte.BYTES));
      return buffer;
    }
  }

  private static IntBuffer intBuffer(long address, int count) {
    var buffer = byteBuffer(address, Math.max(0, count) * Integer.BYTES).asIntBuffer();
    synchronized (LOCK) {
      var resolved = resolve(address);
      if (resolved != null) {
        BUFFER_VIEWS.put(buffer, new BufferView(resolved.block.address, address, Integer.BYTES));
      }
    }
    return buffer;
  }

  private static long address(Buffer buffer) {
    if (buffer == null) {
      return 0L;
    }

    synchronized (LOCK) {
      var view = BUFFER_VIEWS.get(buffer);
      if (view == null) {
        view = registerExternalBuffer(buffer);
      }
      return view.address + (long) buffer.position() * view.elementSize;
    }
  }

  private static BufferView registerExternalBuffer(Buffer buffer) {
    var elementSize = elementSize(buffer);
    var bytes = Math.max(elementSize, Math.max(0, buffer.capacity()) * elementSize);
    var address = allocate(bytes, true);
    var view = new BufferView(address, address, elementSize);
    BUFFER_VIEWS.put(buffer, view);
    if (buffer instanceof ByteBuffer byteBuffer) {
      var copy = byteBuffer.duplicate();
      copy.clear();
      var block = BLOCKS.get(address);
      if (block != null) {
        copy.get(block.data, 0, Math.min(copy.remaining(), block.data.length));
      }
    }
    return view;
  }

  private static int elementSize(Buffer buffer) {
    return switch (buffer) {
      case ByteBuffer _ -> Byte.BYTES;
      case ShortBuffer _ -> Short.BYTES;
      case IntBuffer _ -> Integer.BYTES;
      case FloatBuffer _ -> Float.BYTES;
      case LongBuffer _ -> Long.BYTES;
      case DoubleBuffer _ -> Double.BYTES;
      default -> Byte.BYTES;
    };
  }

  private static ResolvedMemory resolve(long address) {
    return resolve(address, 1);
  }

  private static ResolvedMemory resolve(long address, int bytes) {
    var entry = BLOCKS.floorEntry(address);
    if (entry == null) {
      return null;
    }

    var block = entry.getValue();
    var offset = address - block.address;
    if (offset < 0 || offset > Integer.MAX_VALUE || offset + bytes > block.data.length) {
      return null;
    }
    return new ResolvedMemory(block, (int) offset);
  }

  private interface ThrowingRedirect {
    Object invoke(Object[] args) throws Throwable;
  }

  private record MemoryBlock(long address, byte[] data) {}

  private record BufferView(long blockAddress, long address, int elementSize) {}

  private record ResolvedMemory(MemoryBlock block, int offset) {}
}
