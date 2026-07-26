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
package com.soulfiremc.server.grpc;

import com.google.protobuf.Timestamp;
import com.soulfiremc.grpc.generated.*;
import com.soulfiremc.server.InstanceManager;
import com.soulfiremc.server.SoulFireServer;
import com.soulfiremc.server.adventure.SoulFireAdventure;
import com.soulfiremc.server.api.SoulFireAPI;
import com.soulfiremc.server.api.event.SoulFireEvent;
import com.soulfiremc.server.api.event.bot.BotBlockUpdateEvent;
import com.soulfiremc.server.api.event.bot.BotConnectedEvent;
import com.soulfiremc.server.api.event.bot.BotConnectionInitEvent;
import com.soulfiremc.server.api.event.bot.BotDamageEvent;
import com.soulfiremc.server.api.event.bot.BotDisconnectedEvent;
import com.soulfiremc.server.api.event.bot.BotOpenContainerEvent;
import com.soulfiremc.server.api.event.bot.BotPostEntityTickEvent;
import com.soulfiremc.server.api.event.bot.BotPostTickEvent;
import com.soulfiremc.server.api.event.bot.ChatMessageReceiveEvent;
import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.bot.BotControlLeaseManager;
import com.soulfiremc.server.bot.CompletableControlTask;
import com.soulfiremc.server.bot.ControlStopReason;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.pathfinding.SFVec3i;
import com.soulfiremc.server.pathfinding.execution.PathExecutor;
import com.soulfiremc.server.pathfinding.goals.CloseToPosGoal;
import com.soulfiremc.server.pathfinding.goals.DynamicGoalScorer;
import com.soulfiremc.server.pathfinding.goals.GoalScorer;
import com.soulfiremc.server.pathfinding.goals.PosGoal;
import com.soulfiremc.server.pathfinding.goals.XZGoal;
import com.soulfiremc.server.pathfinding.graph.constraint.NoBlockBreakingConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.NoBlockPlacingConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraint;
import com.soulfiremc.server.pathfinding.graph.constraint.PathConstraintImpl;
import com.soulfiremc.server.user.PermissionContext;
import io.grpc.Status;
import io.grpc.stub.ServerCallStreamObserver;
import io.grpc.stub.StreamObserver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.kyori.adventure.text.serializer.gson.GsonComponentSerializer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.stream.StreamSupport;

/// BotLiveService is the automation-first API for SoulFire bots. It provides the
/// streaming event channel, imperative per-position / per-entity actions, world
/// queries, and pathfinding RPCs that make the public gRPC surface feel like a
/// mineflayer/azalea style bot library.
@Slf4j
@RequiredArgsConstructor
public final class BotLiveServiceImpl extends BotLiveServiceGrpc.BotLiveServiceImplBase {
  private static final int MAX_FIND_BLOCKS_DISTANCE = 128;
  private static final int MAX_FIND_BLOCKS_COUNT = 256;
  private static final float MAX_ENTITY_RADIUS = 128.0F;
  private static final float MAX_BLOCK_RADIUS = 64.0F;
  private static final long PATH_PROGRESS_INTERVAL_MS = 500L;
  private static final long ENTITY_SCAN_INTERVAL_NANOS = TimeUnit.MILLISECONDS.toNanos(200);
  private static final Duration DEFAULT_ACTION_TIMEOUT = Duration.ofSeconds(10);
  private static final Duration DIG_ACTION_TIMEOUT = Duration.ofMinutes(1);
  private static final Duration DEFAULT_PATH_TIMEOUT = Duration.ofMinutes(5);
  private static final Duration MAX_PATH_TIMEOUT = Duration.ofHours(1);

  private final SoulFireServer soulFireServer;
  private final ConcurrentHashMap<BotKey, PathAction> activePaths = new ConcurrentHashMap<>();

  private static <T> T callInBotContext(BotConnection botConnection, Callable<T> callable) throws Exception {
    return botConnection.runnableWrapper().wrap(callable).call();
  }

  private static BotConnection requireOnlineBot(SoulFireServer soulFireServer, UUID instanceId, UUID botId) {
    var instance = soulFireServer.getInstance(instanceId)
      .orElseThrow(() -> Status.NOT_FOUND
        .withDescription("Instance '%s' not found".formatted(instanceId))
        .asRuntimeException());
    var bot = instance.botConnections().get(botId);
    if (bot == null) {
      throw Status.FAILED_PRECONDITION
        .withDescription("Bot '%s' is not online".formatted(botId))
        .asRuntimeException();
    }
    return bot;
  }

  private static BotConnection requireControlledOnlineBot(
    SoulFireServer soulFireServer,
    UUID instanceId,
    UUID botId
  ) {
    ServerRPCConstants.USER_CONTEXT_KEY.get()
      .hasPermissionOrThrow(PermissionContext.instance(
        InstancePermission.CONTROL_BOT_ACTIONS,
        instanceId));
    var instance = requireConfiguredBot(soulFireServer, instanceId, botId);
    try {
      instance.botControlLeaseManager().authorize(
        botId,
        ServerRPCConstants.BOT_CONTROL_TOKEN_CONTEXT_KEY.get());
    } catch (BotControlLeaseManager.InvalidLeaseException e) {
      throw Status.PERMISSION_DENIED
        .withDescription(e.getMessage())
        .asRuntimeException();
    }
    var bot = instance.botConnections().get(botId);
    if (bot == null || bot.isDisconnected()) {
      throw Status.FAILED_PRECONDITION
        .withDescription("Bot '%s' is not online".formatted(botId))
        .asRuntimeException();
    }
    return bot;
  }

  private static <T> void submitAction(
    BotConnection bot,
    ControlTask delegate,
    Duration timeout,
    Function<BotActionResult, T> responseFactory,
    StreamObserver<T> responseObserver
  ) {
    var task = new CompletableControlTask(delegate);
    var serverObserver = (ServerCallStreamObserver<T>) responseObserver;
    serverObserver.setOnCancelHandler(() -> bot.botControl().cancel(task));
    try {
      callInBotContext(bot, () -> {
        bot.botControl().replace(task);
        return null;
      });
    } catch (Throwable t) {
      responseObserver.onError(toGrpcError("Failed to submit bot action", t));
      return;
    }

    task.completion()
      .orTimeout(timeout.toMillis(), TimeUnit.MILLISECONDS)
      .whenComplete((reason, error) -> {
        if (serverObserver.isCancelled()) {
          return;
        }
        if (unwrapAsyncError(error) instanceof TimeoutException) {
          bot.botControl().cancel(task);
        }
        var result = buildActionResult(task, reason, error);
        synchronized (serverObserver) {
          if (serverObserver.isCancelled()) {
            return;
          }
          serverObserver.onNext(responseFactory.apply(result));
          serverObserver.onCompleted();
        }
      });
  }

  private static BotActionResult buildActionResult(
    CompletableControlTask task,
    @Nullable ControlStopReason reason,
    @Nullable Throwable error
  ) {
    var builder = BotActionResult.newBuilder().setActionId(task.actionId().toString());
    if (error != null) {
      var cause = unwrapAsyncError(error);
      return builder
        .setStatus(BotActionStatus.BOT_ACTION_STATUS_FAILED)
        .setError(Objects.requireNonNullElse(cause.getMessage(), cause.getClass().getSimpleName()))
        .build();
    }
    return builder
      .setStatus(switch (Objects.requireNonNull(reason)) {
        case COMPLETED, CLAIMED -> BotActionStatus.BOT_ACTION_STATUS_COMPLETED;
        case CANCELLED, REPLACED -> BotActionStatus.BOT_ACTION_STATUS_CANCELLED;
        case FAILED -> BotActionStatus.BOT_ACTION_STATUS_FAILED;
      })
      .build();
  }

  private static @Nullable Throwable unwrapAsyncError(@Nullable Throwable error) {
    var current = error;
    while ((current instanceof CompletionException || current instanceof ExecutionException)
      && current.getCause() != null) {
      current = current.getCause();
    }
    return current;
  }

  private static RuntimeException toGrpcError(String message, Throwable throwable) {
    var cause = Objects.requireNonNull(unwrapAsyncError(throwable));
    if (cause instanceof io.grpc.StatusRuntimeException statusError) {
      return statusError;
    }
    return Status.INTERNAL
      .withDescription(message + ": " + Objects.requireNonNullElse(
        cause.getMessage(),
        cause.getClass().getSimpleName()))
      .withCause(cause)
      .asRuntimeException();
  }

  private static InteractionHand toMcHand(Hand hand) {
    return switch (hand) {
      case HAND_OFF -> InteractionHand.OFF_HAND;
      case HAND_MAIN, HAND_UNSPECIFIED, UNRECOGNIZED -> InteractionHand.MAIN_HAND;
    };
  }

  private static Direction toMcDirection(BlockFace face) {
    return switch (face) {
      case BLOCK_FACE_DOWN -> Direction.DOWN;
      case BLOCK_FACE_UP -> Direction.UP;
      case BLOCK_FACE_NORTH -> Direction.NORTH;
      case BLOCK_FACE_SOUTH -> Direction.SOUTH;
      case BLOCK_FACE_WEST -> Direction.WEST;
      case BLOCK_FACE_EAST -> Direction.EAST;
      case BLOCK_FACE_UNSPECIFIED, UNRECOGNIZED ->
        throw Status.INVALID_ARGUMENT.withDescription("block face must be specified").asRuntimeException();
    };
  }

  private static BlockPosition toProtoBlockPosition(BlockPos pos, String dimension) {
    return BlockPosition.newBuilder()
      .setX(pos.getX())
      .setY(pos.getY())
      .setZ(pos.getZ())
      .setDimension(dimension)
      .build();
  }

  private static BlockPos toMcBlockPos(BlockPosition pos) {
    return new BlockPos(pos.getX(), pos.getY(), pos.getZ());
  }

  private static com.soulfiremc.grpc.generated.BlockState buildBlockState(BlockPos pos, BlockState state, String dimension) {
    var builder = com.soulfiremc.grpc.generated.BlockState.newBuilder()
      .setPosition(toProtoBlockPosition(pos, dimension))
      .setBlockId(BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString());
    for (var property : state.getProperties()) {
      @SuppressWarnings({"rawtypes", "unchecked"})
      var name = property.getName();
      builder.putProperties(name, getPropertyValueAsString(state, property));
    }
    return builder.build();
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private static String getPropertyValueAsString(BlockState state, Property property) {
    return property.getName(state.getValue(property));
  }

  private static WorldPosition buildWorldPosition(Vec3 pos, String dimension) {
    return WorldPosition.newBuilder()
      .setX(pos.x)
      .setY(pos.y)
      .setZ(pos.z)
      .setDimension(dimension)
      .build();
  }

  private static NearbyEntity buildNearbyEntity(Entity entity, Vec3 relativeTo, String dimension) {
    var builder = NearbyEntity.newBuilder()
      .setEntityId(entity.getId())
      .setEntityType(BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString())
      .setPosition(buildWorldPosition(entity.position(), dimension))
      .setDistance((float) Math.sqrt(entity.position().distanceToSqr(relativeTo)))
      .setIsPlayer(entity instanceof Player);
    var customName = entity.getCustomName();
    if (customName != null) {
      builder.setDisplayName(customName.getString());
    } else if (entity instanceof Player player) {
      builder.setDisplayName(player.getGameProfile().name());
    }
    if (entity instanceof LivingEntity living) {
      builder.setHealth(living.getHealth());
    }
    return builder.build();
  }

  // =====================================================================
  // WatchBotEvents
  // =====================================================================

  @Override
  public void watchBotEvents(WatchBotEventsRequest request, StreamObserver<BotEvent> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    ServerRPCConstants.USER_CONTEXT_KEY.get()
      .hasPermissionOrThrow(PermissionContext.instance(InstancePermission.READ_BOT_INFO, instanceId));

    var instance = requireConfiguredBot(soulFireServer, instanceId, botId);
    var filter = request.getFilter();
    var serverObserver = (ServerCallStreamObserver<BotEvent>) responseObserver;
    var closed = new AtomicBoolean(false);
    var lastState = new AtomicReference<BotLiveState>(null);
    var lastInventory = new AtomicReference<BotInventoryStateResponse>(null);
    var lastEntities = new AtomicReference<Map<Integer, NearbyEntity>>(Map.of());
    var lastEntityScan = new AtomicLong();
    var spawnedConnection = new AtomicReference<BotConnection>(null);
    var dead = new AtomicReference<Boolean>(null);
    var cleanupActions = new CopyOnWriteArrayList<Runnable>();
    Runnable cleanup = () -> {
      if (!closed.compareAndSet(false, true)) {
        return;
      }
      cleanupActions.forEach(action -> {
        try {
          action.run();
        } catch (Throwable t) {
          log.debug("Failed to clean up bot event subscription", t);
        }
      });
    };
    serverObserver.setOnCancelHandler(cleanup);

    emitBotEvent(serverObserver, closed, BotEvent.newBuilder()
      .setStatus(instance.botStateManager().status(botId))
      .build());

    var current = instance.botConnections().get(botId);
    if (current != null && !current.isDisconnected()) {
      emitCurrentSnapshot(
        current,
        filter,
        serverObserver,
        closed,
        lastState,
        lastInventory,
        spawnedConnection,
        dead);
      if (filter.getIncludeEntityEvents()) {
        emitEntityChanges(
          current,
          filter,
          serverObserver,
          closed,
          lastEntities,
          true);
      }
    }

    var removeStatusListener = instance.botStateManager().addStatusListener(event -> {
      if (closed.get()) {
        return;
      }
      if (event.removedBotId() != null && event.removedBotId().equals(botId)) {
        synchronized (serverObserver) {
          if (!closed.get() && !serverObserver.isCancelled()) {
            serverObserver.onCompleted();
          }
        }
        cleanup.run();
        return;
      }
      if (event.status() != null && event.status().getProfileId().equals(botId.toString())) {
        emitBotEvent(serverObserver, closed, BotEvent.newBuilder()
          .setStatus(event.status())
          .build());
      }
    });
    cleanupActions.add(removeStatusListener);

    Consumer<BotConnectionInitEvent> connectionInitListener = event -> {
      if (!matches(event.connection(), instance, botId)) {
        return;
      }
      lastState.set(null);
      lastInventory.set(null);
      lastEntities.set(Map.of());
      spawnedConnection.set(null);
      dead.set(null);
      if (filter.getIncludeLifecycle()) {
        emitLifecycle(
          serverObserver,
          closed,
          BotLifecycleKind.BOT_LIFECYCLE_CONNECTING,
          null);
      }
    };
    register(cleanupActions, BotConnectionInitEvent.class, connectionInitListener);

    Consumer<BotConnectedEvent> connectedListener = event -> {
      if (filter.getIncludeLifecycle() && matches(event.connection(), instance, botId)) {
        emitLifecycle(
          serverObserver,
          closed,
          BotLifecycleKind.BOT_LIFECYCLE_CONNECTED,
          null);
      }
    };
    register(cleanupActions, BotConnectedEvent.class, connectedListener);

    Consumer<BotPostTickEvent> stateListener = event -> {
      var connection = event.connection();
      if (!matches(connection, instance, botId)) {
        return;
      }
      emitCurrentSnapshot(
        connection,
        filter,
        serverObserver,
        closed,
        lastState,
        lastInventory,
        spawnedConnection,
        dead);
    };
    register(cleanupActions, BotPostTickEvent.class, stateListener);

    Consumer<BotDisconnectedEvent> disconnectListener = event -> {
      if (!matches(event.connection(), instance, botId)) {
        return;
      }
      if (filter.getIncludeLifecycle()) {
        var reason = event.message() == null
          ? null
          : SoulFireAdventure.PLAIN_MESSAGE_SERIALIZER.serialize(event.message());
        emitLifecycle(
          serverObserver,
          closed,
          BotLifecycleKind.BOT_LIFECYCLE_DISCONNECTED,
          reason);
      }
      lastState.set(null);
      lastInventory.set(null);
      lastEntities.set(Map.of());
      spawnedConnection.set(null);
      dead.set(null);
    };
    register(cleanupActions, BotDisconnectedEvent.class, disconnectListener);

    if (filter.getIncludeChat()) {
      Consumer<ChatMessageReceiveEvent> chatListener = event -> {
        if (!matches(event.connection(), instance, botId)) {
          return;
        }
        var received = Instant.ofEpochMilli(event.timestamp());
        var chat = BotChatEvent.newBuilder()
          .setSource(ChatSource.CHAT_SOURCE_UNKNOWN)
          .setPlainText(event.parseToPlainText())
          .setJsonComponent(GsonComponentSerializer.gson().serialize(event.message()))
          .setReceivedAt(Timestamp.newBuilder()
            .setSeconds(received.getEpochSecond())
            .setNanos(received.getNano())
            .build())
          .build();
        emitBotEvent(serverObserver, closed, BotEvent.newBuilder().setChat(chat).build());
      };
      register(cleanupActions, ChatMessageReceiveEvent.class, chatListener);
    }

    if (filter.getIncludeEntityEvents()) {
      Consumer<BotPostEntityTickEvent> entityListener = event -> {
        if (!matches(event.connection(), instance, botId)) {
          return;
        }
        var now = System.nanoTime();
        var previousScan = lastEntityScan.get();
        if (now - previousScan < ENTITY_SCAN_INTERVAL_NANOS
          || !lastEntityScan.compareAndSet(previousScan, now)) {
          return;
        }
        emitEntityChanges(
          event.connection(),
          filter,
          serverObserver,
          closed,
          lastEntities,
          false);
      };
      register(cleanupActions, BotPostEntityTickEvent.class, entityListener);
    }

    if (filter.getIncludeBlockUpdates()) {
      var radius = normalizedRadius(filter.getBlockRadius(), 16.0F, MAX_BLOCK_RADIUS);
      Consumer<BotBlockUpdateEvent> blockListener = event -> {
        if (!matches(event.connection(), instance, botId)
          || !withinRadius(event.connection(), event.position(), radius)) {
          return;
        }
        var dimension = currentDimension(event.connection());
        var update = com.soulfiremc.grpc.generated.BotBlockUpdateEvent.newBuilder()
          .setPosition(toProtoBlockPosition(event.position(), dimension))
          .setOldBlockId(BuiltInRegistries.BLOCK.getKey(event.previousState().getBlock()).toString())
          .setNewBlockId(BuiltInRegistries.BLOCK.getKey(event.state().getBlock()).toString())
          .build();
        emitBotEvent(serverObserver, closed, BotEvent.newBuilder()
          .setBlockUpdate(update)
          .build());
      };
      register(cleanupActions, BotBlockUpdateEvent.class, blockListener);
    }

    if (filter.getIncludeDamage()) {
      Consumer<BotDamageEvent> damageListener = event -> {
        if (!matches(event.connection(), instance, botId)) {
          return;
        }
        var damage = com.soulfiremc.grpc.generated.BotDamageEvent.newBuilder()
          .setPreviousHealth(event.previousHealth())
          .setHealth(event.newHealth())
          .setAmount(event.damageAmount())
          .build();
        emitBotEvent(serverObserver, closed, BotEvent.newBuilder().setDamage(damage).build());
      };
      register(cleanupActions, BotDamageEvent.class, damageListener);
    }

    if (filter.getIncludeInventory()) {
      Consumer<BotOpenContainerEvent> containerListener = event -> {
        if (matches(event.connection(), instance, botId)) {
          emitCurrentInventory(
            event.connection(),
            serverObserver,
            closed,
            lastInventory);
        }
      };
      register(cleanupActions, BotOpenContainerEvent.class, containerListener);
    }
  }

  private static InstanceManager requireConfiguredBot(
    SoulFireServer soulFireServer,
    UUID instanceId,
    UUID botId
  ) {
    var instance = soulFireServer.getInstance(instanceId)
      .orElseThrow(() -> Status.NOT_FOUND
        .withDescription("Instance '%s' not found".formatted(instanceId))
        .asRuntimeException());
    if (!instance.settingsSource().accounts().containsKey(botId)) {
      throw Status.NOT_FOUND
        .withDescription("Bot '%s' is not configured".formatted(botId))
        .asRuntimeException();
    }
    return instance;
  }

  private static boolean matches(BotConnection connection, InstanceManager instance, UUID botId) {
    return connection.instanceManager() == instance
      && connection.accountProfileId().equals(botId);
  }

  private static <E extends SoulFireEvent> void register(
    List<Runnable> cleanupActions,
    Class<E> eventType,
    Consumer<E> listener
  ) {
    SoulFireAPI.registerListener(eventType, listener);
    cleanupActions.add(() -> SoulFireAPI.unregisterListener(eventType, listener));
  }

  private static void emitBotEvent(
    ServerCallStreamObserver<BotEvent> observer,
    AtomicBoolean closed,
    BotEvent event
  ) {
    synchronized (observer) {
      if (!closed.get() && !observer.isCancelled()) {
        observer.onNext(event);
      }
    }
  }

  private static void emitLifecycle(
    ServerCallStreamObserver<BotEvent> observer,
    AtomicBoolean closed,
    BotLifecycleKind kind,
    String message
  ) {
    var lifecycle = BotLifecycleEvent.newBuilder().setKind(kind);
    if (message != null && !message.isBlank()) {
      lifecycle.setMessage(message);
    }
    emitBotEvent(observer, closed, BotEvent.newBuilder()
      .setLifecycle(lifecycle)
      .build());
  }

  private static void emitCurrentSnapshot(
    BotConnection connection,
    BotEventFilter filter,
    ServerCallStreamObserver<BotEvent> observer,
    AtomicBoolean closed,
    AtomicReference<BotLiveState> lastState,
    AtomicReference<BotInventoryStateResponse> lastInventory,
    AtomicReference<BotConnection> spawnedConnection,
    AtomicReference<Boolean> dead
  ) {
    try {
      var snapshot = callInBotContext(connection, () -> {
        var minecraft = connection.minecraft();
        var player = minecraft.player;
        if (player == null) {
          return null;
        }
        return new TickSnapshot(
          BotServiceImpl.buildLiveStatePublic(minecraft, player, false),
          filter.getIncludeInventory()
            ? BotServiceImpl.buildInventoryStatePublic(minecraft, player, false)
            : null,
          player.isDeadOrDying());
      });
      if (snapshot == null) {
        return;
      }

      var previousState = lastState.getAndSet(snapshot.state());
      if (previousState == null) {
        emitBotEvent(observer, closed, BotEvent.newBuilder()
          .setSnapshot(snapshot.state())
          .build());
      } else if (filter.getIncludeStateDeltas()) {
        var delta = computeDelta(previousState, snapshot.state());
        if (delta != null) {
          emitBotEvent(observer, closed, BotEvent.newBuilder()
            .setStateDelta(delta)
            .build());
        }
      }

      if (filter.getIncludeLifecycle()
        && spawnedConnection.getAndSet(connection) != connection) {
        emitLifecycle(observer, closed, BotLifecycleKind.BOT_LIFECYCLE_SPAWNED, null);
      }

      var previousDead = dead.getAndSet(snapshot.dead());
      if (filter.getIncludeLifecycle()
        && previousDead != null
        && previousDead != snapshot.dead()) {
        emitLifecycle(
          observer,
          closed,
          snapshot.dead()
            ? BotLifecycleKind.BOT_LIFECYCLE_DIED
            : BotLifecycleKind.BOT_LIFECYCLE_RESPAWNED,
          null);
      }

      if (snapshot.inventory() != null) {
        var previousInventory = lastInventory.getAndSet(snapshot.inventory());
        if (!snapshot.inventory().equals(previousInventory)) {
          emitInventory(observer, closed, snapshot.inventory());
        }
      }
    } catch (Throwable t) {
      log.debug("Failed to emit current bot snapshot", t);
    }
  }

  private static void emitCurrentInventory(
    BotConnection connection,
    ServerCallStreamObserver<BotEvent> observer,
    AtomicBoolean closed,
    AtomicReference<BotInventoryStateResponse> lastInventory
  ) {
    try {
      var inventory = callInBotContext(connection, () -> {
        var minecraft = connection.minecraft();
        var player = minecraft.player;
        return player == null
          ? null
          : BotServiceImpl.buildInventoryStatePublic(minecraft, player, false);
      });
      if (inventory != null && !inventory.equals(lastInventory.getAndSet(inventory))) {
        emitInventory(observer, closed, inventory);
      }
    } catch (Throwable t) {
      log.debug("Failed to emit current bot inventory", t);
    }
  }

  private static void emitInventory(
    ServerCallStreamObserver<BotEvent> observer,
    AtomicBoolean closed,
    BotInventoryStateResponse inventory
  ) {
    emitBotEvent(observer, closed, BotEvent.newBuilder()
      .setInventory(BotInventoryEvent.newBuilder().setState(inventory))
      .build());
  }

  private static void emitEntityChanges(
    BotConnection connection,
    BotEventFilter filter,
    ServerCallStreamObserver<BotEvent> observer,
    AtomicBoolean closed,
    AtomicReference<Map<Integer, NearbyEntity>> lastEntities,
    boolean initial
  ) {
    try {
      var radius = normalizedRadius(filter.getEntityRadius(), 32.0F, MAX_ENTITY_RADIUS);
      var next = callInBotContext(connection, () -> observedEntities(connection, radius));
      var previous = lastEntities.getAndSet(next);
      for (var entry : next.entrySet()) {
        var prior = previous.get(entry.getKey());
        if (prior == null || !prior.equals(entry.getValue())) {
          var kind = prior == null
            ? EntityEventKind.ENTITY_EVENT_SPAWN
            : EntityEventKind.ENTITY_EVENT_UPDATE;
          emitEntityEvent(observer, closed, kind, entry.getValue());
        }
      }
      if (!initial) {
        for (var entry : previous.entrySet()) {
          if (!next.containsKey(entry.getKey())) {
            emitEntityEvent(
              observer,
              closed,
              EntityEventKind.ENTITY_EVENT_DESPAWN,
              entry.getValue());
          }
        }
      }
    } catch (Throwable t) {
      log.debug("Failed to emit entity changes", t);
    }
  }

  private static Map<Integer, NearbyEntity> observedEntities(
    BotConnection connection,
    float radius
  ) {
    var minecraft = connection.minecraft();
    var player = minecraft.player;
    var level = minecraft.level;
    if (player == null || level == null) {
      return Map.of();
    }
    var radiusSquared = radius * radius;
    var dimension = level.dimension().identifier().toString();
    var entities = new HashMap<Integer, NearbyEntity>();
    for (var entity : level.entitiesForRendering()) {
      if (entity == player || entity.distanceToSqr(player) > radiusSquared) {
        continue;
      }
      entities.put(
        entity.getId(),
        buildNearbyEntity(entity, player.position(), dimension));
    }
    return Map.copyOf(entities);
  }

  private static void emitEntityEvent(
    ServerCallStreamObserver<BotEvent> observer,
    AtomicBoolean closed,
    EntityEventKind kind,
    NearbyEntity entity
  ) {
    emitBotEvent(observer, closed, BotEvent.newBuilder()
      .setEntityEvent(BotEntityEvent.newBuilder()
        .setKind(kind)
        .setEntity(entity))
      .build());
  }

  private static float normalizedRadius(float requested, float defaultRadius, float maxRadius) {
    return Math.min(requested > 0.0F ? requested : defaultRadius, maxRadius);
  }

  private static boolean withinRadius(BotConnection connection, BlockPos position, float radius) {
    var player = connection.minecraft().player;
    return player != null && player.blockPosition().distSqr(position) <= radius * radius;
  }

  private static String currentDimension(BotConnection connection) {
    var level = connection.minecraft().level;
    return level == null ? "" : level.dimension().identifier().toString();
  }

  private record TickSnapshot(
    BotLiveState state,
    @Nullable BotInventoryStateResponse inventory,
    boolean dead
  ) {}

  private static BotStateDelta computeDelta(BotLiveState prev, BotLiveState next) {
    if (prev == null) {
      return null;
    }
    var b = BotStateDelta.newBuilder();
    var changed = false;
    if (prev.getX() != next.getX()) { b.setX(next.getX()); changed = true; }
    if (prev.getY() != next.getY()) { b.setY(next.getY()); changed = true; }
    if (prev.getZ() != next.getZ()) { b.setZ(next.getZ()); changed = true; }
    if (prev.getXRot() != next.getXRot()) { b.setXRot(next.getXRot()); changed = true; }
    if (prev.getYRot() != next.getYRot()) { b.setYRot(next.getYRot()); changed = true; }
    if (prev.getHealth() != next.getHealth()) { b.setHealth(next.getHealth()); changed = true; }
    if (prev.getMaxHealth() != next.getMaxHealth()) { b.setMaxHealth(next.getMaxHealth()); changed = true; }
    if (prev.getFoodLevel() != next.getFoodLevel()) { b.setFoodLevel(next.getFoodLevel()); changed = true; }
    if (prev.getSaturationLevel() != next.getSaturationLevel()) { b.setSaturationLevel(next.getSaturationLevel()); changed = true; }
    if (prev.getSelectedHotbarSlot() != next.getSelectedHotbarSlot()) { b.setSelectedHotbarSlot(next.getSelectedHotbarSlot()); changed = true; }
    if (!Objects.equals(prev.getDimension(), next.getDimension())) { b.setDimension(next.getDimension()); changed = true; }
    if (prev.getExperienceLevel() != next.getExperienceLevel()) { b.setExperienceLevel(next.getExperienceLevel()); changed = true; }
    if (prev.getExperienceProgress() != next.getExperienceProgress()) { b.setExperienceProgress(next.getExperienceProgress()); changed = true; }
    if (prev.getGameMode() != next.getGameMode()) { b.setGameMode(next.getGameMode()); changed = true; }
    return changed ? b.build() : null;
  }

  // =====================================================================
  // SendChat
  // =====================================================================

  @Override
  public void sendChat(SendChatRequest request, StreamObserver<SendChatResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    var bot = requireControlledOnlineBot(soulFireServer, instanceId, botId);
    submitAction(
      bot,
      ControlTask.once("SDK send chat", () -> bot.sendChatMessage(request.getMessage())),
      DEFAULT_ACTION_TIMEOUT,
      result -> SendChatResponse.newBuilder().setResult(result).build(),
      responseObserver);
  }

  // =====================================================================
  // GetBlock
  // =====================================================================

  @Override
  public void getBlock(GetBlockRequest request, StreamObserver<GetBlockResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    ServerRPCConstants.USER_CONTEXT_KEY.get()
      .hasPermissionOrThrow(PermissionContext.instance(InstancePermission.READ_BOT_INFO, instanceId));

    try {
      var bot = requireOnlineBot(soulFireServer, instanceId, botId);
      var response = callInBotContext(bot, () -> {
        var level = bot.minecraft().level;
        if (level == null) {
          return GetBlockResponse.newBuilder().setLoaded(false).build();
        }
        var pos = toMcBlockPos(request.getPosition());
        if (!level.hasChunkAt(pos)) {
          return GetBlockResponse.newBuilder().setLoaded(false).build();
        }
        var state = level.getBlockState(pos);
        var dimension = level.dimension().identifier().toString();
        return GetBlockResponse.newBuilder()
          .setLoaded(true)
          .setBlock(buildBlockState(pos, state, dimension))
          .build();
      });
      responseObserver.onNext(response);
      responseObserver.onCompleted();
    } catch (Throwable t) {
      log.error("Error getting block", t);
      throw toGrpcError("Failed to get block", t);
    }
  }

  // =====================================================================
  // FindBlocks
  // =====================================================================

  @Override
  public void findBlocks(FindBlocksRequest request, StreamObserver<FindBlocksResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    ServerRPCConstants.USER_CONTEXT_KEY.get()
      .hasPermissionOrThrow(PermissionContext.instance(InstancePermission.READ_BOT_INFO, instanceId));

    try {
      var bot = requireOnlineBot(soulFireServer, instanceId, botId);
      var maxDistance = Math.min(Math.max(request.getMaxDistance(), 0), MAX_FIND_BLOCKS_DISTANCE);
      var maxCount = Math.min(Math.max(request.getMaxCount(), 0), MAX_FIND_BLOCKS_COUNT);
      var blockIds = request.getBlockIdsList();
      if (blockIds.isEmpty() || maxDistance == 0 || maxCount == 0) {
        responseObserver.onNext(FindBlocksResponse.getDefaultInstance());
        responseObserver.onCompleted();
        return;
      }

      var response = callInBotContext(bot, () -> {
        var player = bot.minecraft().player;
        var level = bot.minecraft().level;
        if (player == null || level == null) {
          return FindBlocksResponse.getDefaultInstance();
        }

        var matchSet = new HashSet<>(blockIds);
        var origin = player.blockPosition();
        var dimension = level.dimension().identifier().toString();

        // Collect matches with their squared distance, then sort ascending.
        var matches = new ArrayList<ScoredMatch>();
        var radius = maxDistance;
        for (var dx = -radius; dx <= radius; dx++) {
          for (var dy = -radius; dy <= radius; dy++) {
            for (var dz = -radius; dz <= radius; dz++) {
              var pos = origin.offset(dx, dy, dz);
              if (!level.hasChunkAt(pos)) {
                continue;
              }
              var state = level.getBlockState(pos);
              var id = BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();
              if (!matchSet.contains(id)) {
                continue;
              }
              var sqDistance = origin.distSqr(pos);
              if (sqDistance > (double) radius * radius) {
                continue;
              }
              matches.add(new ScoredMatch(pos.immutable(), state, sqDistance));
            }
          }
        }

        matches.sort(Comparator.comparingDouble(ScoredMatch::sqDistance));
        var responseBuilder = FindBlocksResponse.newBuilder();
        var limit = Math.min(matches.size(), maxCount);
        for (var i = 0; i < limit; i++) {
          var match = matches.get(i);
          responseBuilder.addBlocks(buildBlockState(match.pos(), match.state(), dimension));
        }
        return responseBuilder.build();
      });
      responseObserver.onNext(response);
      responseObserver.onCompleted();
    } catch (Throwable t) {
      log.error("Error finding blocks", t);
      throw toGrpcError("Failed to find blocks", t);
    }
  }

  private record ScoredMatch(BlockPos pos, BlockState state, double sqDistance) {}

  // =====================================================================
  // ListNearbyEntities
  // =====================================================================

  @Override
  public void listNearbyEntities(ListNearbyEntitiesRequest request, StreamObserver<ListNearbyEntitiesResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    ServerRPCConstants.USER_CONTEXT_KEY.get()
      .hasPermissionOrThrow(PermissionContext.instance(InstancePermission.READ_BOT_INFO, instanceId));

    try {
      var bot = requireOnlineBot(soulFireServer, instanceId, botId);
      var radius = Math.min(Math.max(request.getRadius(), 0), MAX_ENTITY_RADIUS);
      var typeFilter = request.getEntityTypesList();
      var includePlayers = request.getIncludePlayers();

      var response = callInBotContext(bot, () -> {
        var player = bot.minecraft().player;
        var level = bot.minecraft().level;
        if (player == null || level == null) {
          return ListNearbyEntitiesResponse.getDefaultInstance();
        }
        var origin = player.position();
        var dimension = level.dimension().identifier().toString();
        var typeSet = typeFilter.isEmpty() ? null : new HashSet<>(typeFilter);

        var results = StreamSupport.stream(level.entitiesForRendering().spliterator(), false)
          .filter(entity -> entity != player)
          .filter(entity -> includePlayers || !(entity instanceof Player))
          .filter(entity -> {
            if (typeSet == null) {
              return true;
            }
            var id = BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString();
            return typeSet.contains(id);
          })
          .filter(entity -> entity.position().distanceToSqr(origin) <= (double) radius * radius)
          .sorted(Comparator.comparingDouble(e -> e.position().distanceToSqr(origin)))
          .map(entity -> buildNearbyEntity(entity, origin, dimension))
          .toList();

        return ListNearbyEntitiesResponse.newBuilder()
          .addAllEntities(results)
          .build();
      });
      responseObserver.onNext(response);
      responseObserver.onCompleted();
    } catch (Throwable t) {
      log.error("Error listing nearby entities", t);
      throw toGrpcError("Failed to list nearby entities", t);
    }
  }

  // =====================================================================
  // DigBlock
  // =====================================================================

  @Override
  public void digBlock(DigBlockRequest request, StreamObserver<DigBlockResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    var bot = requireControlledOnlineBot(soulFireServer, instanceId, botId);
    submitAction(
      bot,
      new DigBlockTask(bot, toMcBlockPos(request.getPosition()), request.getCancel()),
      DIG_ACTION_TIMEOUT,
      result -> DigBlockResponse.newBuilder().setResult(result).build(),
      responseObserver);
  }

  private static Direction nearestFaceTo(Vec3 eyePos, BlockPos target) {
    var center = Vec3.atCenterOf(target);
    var dx = eyePos.x - center.x;
    var dy = eyePos.y - center.y;
    var dz = eyePos.z - center.z;
    var ax = Math.abs(dx);
    var ay = Math.abs(dy);
    var az = Math.abs(dz);
    if (ay >= ax && ay >= az) {
      return dy >= 0 ? Direction.UP : Direction.DOWN;
    }
    if (ax >= az) {
      return dx >= 0 ? Direction.EAST : Direction.WEST;
    }
    return dz >= 0 ? Direction.SOUTH : Direction.NORTH;
  }

  private static void requireReach(LocalPlayer player, BlockPos position) {
    if (player.getEyePosition().distanceToSqr(Vec3.atCenterOf(position)) > 36.0D) {
      throw Status.OUT_OF_RANGE
        .withDescription("Target block is outside the bot's interaction reach")
        .asRuntimeException();
    }
  }

  private static final class DigBlockTask implements ControlTask {
    private final BotConnection bot;
    private final BlockPos position;
    private final boolean cancel;
    private Direction face = Direction.UP;
    private boolean started;
    private boolean done;
    private int ticks;

    private DigBlockTask(BotConnection bot, BlockPos position, boolean cancel) {
      this.bot = bot;
      this.position = position;
      this.cancel = cancel;
    }

    @Override
    public void tick() {
      var minecraft = bot.minecraft();
      var gameMode = minecraft.gameMode;
      var player = minecraft.player;
      var level = minecraft.level;
      if (gameMode == null || player == null || level == null) {
        throw Status.FAILED_PRECONDITION
          .withDescription("Bot player, level, or game mode is not available")
          .asRuntimeException();
      }
      if (cancel) {
        gameMode.stopDestroyBlock();
        done = true;
        return;
      }
      if (level.getBlockState(position).isAir()) {
        done = true;
        return;
      }
      requireReach(player, position);
      if (!started) {
        face = nearestFaceTo(player.getEyePosition(), position);
        if (!gameMode.startDestroyBlock(position, face)) {
          throw Status.FAILED_PRECONDITION
            .withDescription("The target block cannot be broken")
            .asRuntimeException();
        }
        player.swing(InteractionHand.MAIN_HAND);
        started = true;
        return;
      }
      if (!gameMode.continueDestroyBlock(position, face)) {
        throw Status.FAILED_PRECONDITION
          .withDescription("Block breaking was rejected")
          .asRuntimeException();
      }
      player.swing(InteractionHand.MAIN_HAND);
      ticks++;
      if (level.getBlockState(position).isAir()) {
        done = true;
      } else if (ticks >= DIG_ACTION_TIMEOUT.toSeconds() * 20) {
        throw Status.DEADLINE_EXCEEDED
          .withDescription("Block breaking timed out")
          .asRuntimeException();
      }
    }

    @Override
    public boolean isDone() {
      return done;
    }

    @Override
    public void onStopped(ControlStopReason reason, @Nullable Throwable cause) {
      if (reason != ControlStopReason.COMPLETED) {
        var gameMode = bot.minecraft().gameMode;
        if (gameMode != null) {
          gameMode.stopDestroyBlock();
        }
      }
      done = true;
    }

    @Override
    public String description() {
      return "SDK dig block";
    }
  }

  // =====================================================================
  // PlaceBlock
  // =====================================================================

  @Override
  public void placeBlock(PlaceBlockRequest request, StreamObserver<PlaceBlockResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    var bot = requireControlledOnlineBot(soulFireServer, instanceId, botId);
    var against = toMcBlockPos(request.getAgainst());
    var direction = toMcDirection(request.getFace());
    var hand = toMcHand(request.getHand());
    submitAction(
      bot,
      ControlTask.once("SDK place block", () -> {
        var gameMode = bot.minecraft().gameMode;
        var player = bot.minecraft().player;
        var level = bot.minecraft().level;
        if (gameMode == null || player == null || level == null) {
          throw Status.FAILED_PRECONDITION
            .withDescription("Bot player, level, or game mode is not available")
            .asRuntimeException();
        }
        requireReach(player, against);
        var hitPos = Vec3.atCenterOf(against)
          .add(direction.getStepX() * 0.5, direction.getStepY() * 0.5, direction.getStepZ() * 0.5);
        var hit = new BlockHitResult(hitPos, direction, against, false);
        var result = gameMode.useItemOn(player, hand, hit);
        if (!(result instanceof InteractionResult.Success success)) {
          throw Status.FAILED_PRECONDITION
            .withDescription("The held item could not be used on the target block")
            .asRuntimeException();
        }
        if (success.swingSource() == InteractionResult.SwingSource.CLIENT) {
          player.swing(hand);
        }
      }),
      DEFAULT_ACTION_TIMEOUT,
      result -> PlaceBlockResponse.newBuilder().setResult(result).build(),
      responseObserver);
  }

  // =====================================================================
  // UseItem
  // =====================================================================

  @Override
  public void useItem(UseItemRequest request, StreamObserver<UseItemResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    var bot = requireControlledOnlineBot(soulFireServer, instanceId, botId);
    var hand = toMcHand(request.getHand());
    submitAction(
      bot,
      ControlTask.once("SDK use item", () -> {
        var gameMode = bot.minecraft().gameMode;
        var player = bot.minecraft().player;
        if (gameMode == null || player == null) {
          throw Status.FAILED_PRECONDITION
            .withDescription("Bot player or game mode is not available")
            .asRuntimeException();
        }
        var result = gameMode.useItem(player, hand);
        if (!(result instanceof InteractionResult.Success success)) {
          throw Status.FAILED_PRECONDITION
            .withDescription("The held item could not be used")
            .asRuntimeException();
        }
        if (success.swingSource() == InteractionResult.SwingSource.CLIENT) {
          player.swing(hand);
        }
      }),
      DEFAULT_ACTION_TIMEOUT,
      result -> UseItemResponse.newBuilder().setResult(result).build(),
      responseObserver);
  }

  @Override
  public void releaseItem(ReleaseItemRequest request, StreamObserver<ReleaseItemResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    var bot = requireControlledOnlineBot(soulFireServer, instanceId, botId);
    submitAction(
      bot,
      ControlTask.once("SDK release item", () -> {
        var gameMode = bot.minecraft().gameMode;
        var player = bot.minecraft().player;
        if (gameMode == null || player == null) {
          throw Status.FAILED_PRECONDITION
            .withDescription("Bot player or game mode is not available")
            .asRuntimeException();
        }
        if (!player.isUsingItem()) {
          throw Status.FAILED_PRECONDITION
            .withDescription("The bot is not using an item")
            .asRuntimeException();
        }
        gameMode.releaseUsingItem(player);
      }),
      DEFAULT_ACTION_TIMEOUT,
      result -> ReleaseItemResponse.newBuilder().setResult(result).build(),
      responseObserver);
  }

  // =====================================================================
  // AttackEntity
  // =====================================================================

  @Override
  public void attackEntity(AttackEntityRequest request, StreamObserver<AttackEntityResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    var bot = requireControlledOnlineBot(soulFireServer, instanceId, botId);
    submitAction(
      bot,
      ControlTask.once("SDK attack entity", () -> {
        var gameMode = bot.minecraft().gameMode;
        var player = bot.minecraft().player;
        var level = bot.minecraft().level;
        if (gameMode == null || player == null || level == null) {
          throw Status.FAILED_PRECONDITION
            .withDescription("Bot player, level, or game mode is not available")
            .asRuntimeException();
        }
        var target = findEntityById(level, request.getEntityId());
        if (target == null) {
          throw Status.NOT_FOUND
            .withDescription("Target entity is not observable")
            .asRuntimeException();
        }
        if (target.distanceToSqr(player) > 36.0D) {
          throw Status.OUT_OF_RANGE
            .withDescription("Target entity is outside the bot's interaction reach")
            .asRuntimeException();
        }
        var wasSprinting = player.isSprinting();
        player.setSprinting(request.getSprinting());
        try {
          gameMode.attack(player, target);
          player.swing(InteractionHand.MAIN_HAND);
        } finally {
          player.setSprinting(wasSprinting);
        }
      }),
      DEFAULT_ACTION_TIMEOUT,
      result -> AttackEntityResponse.newBuilder().setResult(result).build(),
      responseObserver);
  }

  private static Entity findEntityById(ClientLevel level, int id) {
    return StreamSupport.stream(level.entitiesForRendering().spliterator(), false)
      .filter(e -> e.getId() == id)
      .findFirst()
      .orElse(null);
  }

  // =====================================================================
  // InteractEntity
  // =====================================================================

  @Override
  public void interactEntity(InteractEntityRequest request, StreamObserver<InteractEntityResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    var bot = requireControlledOnlineBot(soulFireServer, instanceId, botId);
    var hand = toMcHand(request.getHand());
    submitAction(
      bot,
      ControlTask.once("SDK interact entity", () -> {
        var gameMode = bot.minecraft().gameMode;
        var player = bot.minecraft().player;
        var level = bot.minecraft().level;
        if (gameMode == null || player == null || level == null) {
          throw Status.FAILED_PRECONDITION
            .withDescription("Bot player, level, or game mode is not available")
            .asRuntimeException();
        }
        var target = findEntityById(level, request.getEntityId());
        if (target == null) {
          throw Status.NOT_FOUND
            .withDescription("Target entity is not observable")
            .asRuntimeException();
        }
        if (target.distanceToSqr(player) > 36.0D) {
          throw Status.OUT_OF_RANGE
            .withDescription("Target entity is outside the bot's interaction reach")
            .asRuntimeException();
        }
        var wasSneaking = player.isShiftKeyDown();
        player.setShiftKeyDown(request.getSneaking());
        try {
          var result = gameMode.interact(player, target, new EntityHitResult(target), hand);
          if (!(result instanceof InteractionResult.Success success)) {
            throw Status.FAILED_PRECONDITION
              .withDescription("The target entity rejected the interaction")
              .asRuntimeException();
          }
          if (success.swingSource() == InteractionResult.SwingSource.CLIENT) {
            player.swing(hand);
          }
        } finally {
          player.setShiftKeyDown(wasSneaking);
        }
      }),
      DEFAULT_ACTION_TIMEOUT,
      result -> InteractEntityResponse.newBuilder().setResult(result).build(),
      responseObserver);
  }

  // =====================================================================
  // SwingArm
  // =====================================================================

  @Override
  public void swingArm(SwingArmRequest request, StreamObserver<SwingArmResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    var bot = requireControlledOnlineBot(soulFireServer, instanceId, botId);
    var hand = toMcHand(request.getHand());
    submitAction(
      bot,
      ControlTask.once("SDK swing arm", () -> {
        var player = bot.minecraft().player;
        if (player == null) {
          throw Status.FAILED_PRECONDITION
            .withDescription("Bot player is not available")
            .asRuntimeException();
        }
        player.swing(hand);
      }),
      DEFAULT_ACTION_TIMEOUT,
      result -> SwingArmResponse.newBuilder().setResult(result).build(),
      responseObserver);
  }

  @Override
  public void respawn(RespawnRequest request, StreamObserver<RespawnResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    var bot = requireControlledOnlineBot(soulFireServer, instanceId, botId);
    submitAction(
      bot,
      ControlTask.once("SDK respawn", () -> {
        var player = bot.minecraft().player;
        if (player == null) {
          throw Status.FAILED_PRECONDITION
            .withDescription("Bot player is not available")
            .asRuntimeException();
        }
        if (!player.isDeadOrDying()) {
          throw Status.FAILED_PRECONDITION
            .withDescription("Bot is not dead")
            .asRuntimeException();
        }
        player.respawn();
      }),
      DEFAULT_ACTION_TIMEOUT,
      result -> RespawnResponse.newBuilder().setResult(result).build(),
      responseObserver);
  }

  // =====================================================================
  // GoTo
  // =====================================================================

  @Override
  public void goTo(GoToRequest request, StreamObserver<PathfindProgress> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    var bot = requireControlledOnlineBot(soulFireServer, instanceId, botId);
    var serverObserver = (ServerCallStreamObserver<PathfindProgress>) responseObserver;
    var actionId = UUID.randomUUID();
    var key = new BotKey(instanceId, botId);

    GoalScorer goalScorer;
    WorldPositionSupplier goalPositionSupplier;
    try {
      var resolved = resolveGoal(bot, request.getGoal());
      goalScorer = resolved.scorer();
      goalPositionSupplier = resolved.positionSupplier();
    } catch (Throwable t) {
      responseObserver.onError(toGrpcError("Failed to resolve pathfinding goal", t));
      return;
    }

    try {
      serverObserver.onNext(PathfindProgress.newBuilder()
        .setStatus(PathfindStatus.PATHFIND_STATUS_PLANNING)
        .setActionId(actionId.toString())
        .build());
    } catch (Throwable t) {
      log.debug("Failed to emit PLANNING", t);
      return;
    }

    CompletableFuture<Void> future;
    try {
      var constraint = buildPathConstraint(bot, request.getOptions());
      future = callInBotContext(
        bot,
        () -> PathExecutor.executePathfinding(bot, goalScorer, constraint));
    } catch (Throwable t) {
      responseObserver.onError(toGrpcError("Failed to start pathfinding", t));
      return;
    }

    var timedOut = new AtomicBoolean();
    var action = new PathAction(actionId, future, timedOut);
    var priorAction = activePaths.put(key, action);
    if (priorAction != null && !priorAction.future().isDone()) {
      priorAction.future().cancel(true);
    }

    emitProgress(
      actionId,
      bot,
      serverObserver,
      goalPositionSupplier,
      PathfindStatus.PATHFIND_STATUS_MOVING,
      null);

    var completed = new AtomicBoolean(false);
    Runnable schedule = new Runnable() {
      @Override
      public void run() {
        if (completed.get() || serverObserver.isCancelled()) {
          return;
        }
        if (future.isDone()) {
          return;
        }
        emitProgress(
          actionId,
          bot,
          serverObserver,
          goalPositionSupplier,
          PathfindStatus.PATHFIND_STATUS_MOVING,
          null);
        soulFireServer.scheduler().schedule(this, PATH_PROGRESS_INTERVAL_MS, TimeUnit.MILLISECONDS);
      }
    };
    soulFireServer.scheduler().schedule(schedule, PATH_PROGRESS_INTERVAL_MS, TimeUnit.MILLISECONDS);

    var pathTimeout = normalizePathTimeout(request.getOptions().getTimeoutSeconds());
    soulFireServer.scheduler().schedule(() -> {
      if (!future.isDone()) {
        timedOut.set(true);
        future.cancel(true);
      }
    }, pathTimeout.toMillis(), TimeUnit.MILLISECONDS);

    serverObserver.setOnCancelHandler(() -> {
      completed.set(true);
      if (!future.isDone()) {
        future.cancel(true);
      }
      activePaths.remove(key, action);
    });

    future.whenComplete((_, error) -> {
      if (!completed.compareAndSet(false, true)) {
        return;
      }
      activePaths.remove(key, action);
      if (serverObserver.isCancelled()) {
        return;
      }
      try {
        if (error == null) {
          emitProgress(
            actionId,
            bot,
            serverObserver,
            goalPositionSupplier,
            PathfindStatus.PATHFIND_STATUS_COMPLETED,
            null);
        } else if (timedOut.get()) {
          emitProgress(
            actionId,
            bot,
            serverObserver,
            goalPositionSupplier,
            PathfindStatus.PATHFIND_STATUS_FAILED,
            "Pathfinding timed out after %s seconds".formatted(pathTimeout.toSeconds()));
        } else if (unwrapAsyncError(error) instanceof CancellationException) {
          emitProgress(
            actionId,
            bot,
            serverObserver,
            goalPositionSupplier,
            PathfindStatus.PATHFIND_STATUS_CANCELLED,
            "cancelled");
        } else {
          var cause = Objects.requireNonNull(unwrapAsyncError(error));
          var msg = Objects.requireNonNullElse(cause.getMessage(), cause.getClass().getSimpleName());
          emitProgress(
            actionId,
            bot,
            serverObserver,
            goalPositionSupplier,
            PathfindStatus.PATHFIND_STATUS_FAILED,
            msg);
        }
        serverObserver.onCompleted();
      } catch (Throwable t) {
        log.debug("Failed to emit final pathfind progress", t);
      }
    });
  }

  private static PathConstraint buildPathConstraint(
    BotConnection bot,
    PathfindOptions options
  ) {
    PathConstraint constraint = new PathConstraintImpl(bot);
    if (!options.getAllowMining()) {
      constraint = new NoBlockBreakingConstraint(constraint);
    }
    if (!options.getAllowPlacing()) {
      constraint = new NoBlockPlacingConstraint(constraint);
    }
    return constraint;
  }

  private static Duration normalizePathTimeout(int timeoutSeconds) {
    if (timeoutSeconds <= 0) {
      return DEFAULT_PATH_TIMEOUT;
    }
    var requested = Duration.ofSeconds(timeoutSeconds);
    return requested.compareTo(MAX_PATH_TIMEOUT) > 0 ? MAX_PATH_TIMEOUT : requested;
  }

  private static void emitProgress(UUID actionId,
                                   BotConnection bot,
                                   ServerCallStreamObserver<PathfindProgress> observer,
                                   WorldPositionSupplier goalPosSupplier,
                                   PathfindStatus status,
                                   String error) {
    if (observer.isCancelled()) {
      return;
    }
    var progressBuilder = PathfindProgress.newBuilder()
      .setStatus(status)
      .setActionId(actionId.toString());
    try {
      var player = bot.minecraft().player;
      var level = bot.minecraft().level;
      if (player != null && level != null) {
        var dimension = level.dimension().identifier().toString();
        progressBuilder.setPosition(buildWorldPosition(player.position(), dimension));
        if (goalPosSupplier != null) {
          var goalPos = goalPosSupplier.get(bot);
          if (goalPos != null) {
            var dx = goalPos.x - player.getX();
            var dy = goalPos.y - player.getY();
            var dz = goalPos.z - player.getZ();
            progressBuilder.setDistanceRemaining((float) Math.sqrt(dx * dx + dy * dy + dz * dz));
          }
        }
      }
    } catch (Throwable t) {
      log.trace("Failed to enrich progress", t);
    }
    if (error != null) {
      progressBuilder.setError(error);
    }
    synchronized (observer) {
      if (!observer.isCancelled()) {
        observer.onNext(progressBuilder.build());
      }
    }
  }

  private record ResolvedGoal(GoalScorer scorer, WorldPositionSupplier positionSupplier) {}

  @FunctionalInterface
  private interface WorldPositionSupplier {
    Vec3 get(BotConnection bot);
  }

  private static ResolvedGoal resolveGoal(BotConnection bot, PathfindGoal goal) {
    return switch (goal.getGoalCase()) {
      case BLOCK -> {
        var block = goal.getBlock();
        var pos = toMcBlockPos(block.getPosition());
        var vec = SFVec3i.from(pos.getX(), pos.getY(), pos.getZ());
        var radius = Math.max(1, Math.round(block.getRadius()));
        var scorer = block.getRadius() <= 0
          ? (GoalScorer) new PosGoal(vec)
          : new CloseToPosGoal(vec, radius);
        WorldPositionSupplier supplier = _ -> Vec3.atCenterOf(pos);
        yield new ResolvedGoal(scorer, supplier);
      }
      case NEAR -> {
        var near = goal.getNear();
        var pos = near.getPosition();
        var vec = SFVec3i.fromDouble(new Vec3(pos.getX(), pos.getY(), pos.getZ()));
        var radius = Math.max(1, Math.round(near.getRadius()));
        yield new ResolvedGoal(
          new CloseToPosGoal(vec, radius),
          _ -> new Vec3(pos.getX(), pos.getY(), pos.getZ()));
      }
      case ENTITY -> {
        var entityGoal = goal.getEntity();
        var id = entityGoal.getEntityId();
        var level = bot.minecraft().level;
        if (level == null) {
          throw Status.FAILED_PRECONDITION.withDescription("Level not loaded").asRuntimeException();
        }
        var entity = findEntityById(level, id);
        if (entity == null) {
          throw Status.NOT_FOUND.withDescription("Entity '%d' not observable".formatted(id)).asRuntimeException();
        }
        var entityPos = entity.position();
        var radius = Math.max(1, Math.round(entityGoal.getRadius()));
        DynamicGoalScorer scorer = () -> {
          var live = bot.minecraft().level;
          if (live == null) {
            return new CloseToPosGoal(SFVec3i.fromDouble(entityPos), radius);
          }
          var found = findEntityById(live, id);
          var position = found == null ? entityPos : found.position();
          return new CloseToPosGoal(SFVec3i.fromDouble(position), radius);
        };
        yield new ResolvedGoal(
          scorer,
          b -> {
            var live = b.minecraft().level;
            if (live == null) {
              return entityPos;
            }
            var found = findEntityById(live, id);
            return found == null ? entityPos : found.position();
          });
      }
      case XZ -> {
        var xz = goal.getXz();
        var scorer = new XZGoal((int) Math.round(xz.getX()), (int) Math.round(xz.getZ()));
        yield new ResolvedGoal(
          scorer,
          b -> {
            var player = b.minecraft().player;
            var y = player != null ? player.getY() : 0.0;
            return new Vec3(xz.getX(), y, xz.getZ());
          });
      }
      case GOAL_NOT_SET ->
        throw Status.INVALID_ARGUMENT.withDescription("goal must be set").asRuntimeException();
    };
  }

  // =====================================================================
  // StopPathfinding
  // =====================================================================

  @Override
  public void stopPathfinding(StopPathfindingRequest request, StreamObserver<StopPathfindingResponse> responseObserver) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());

    try {
      requireControlledOnlineBot(soulFireServer, instanceId, botId);
      var action = activePaths.get(new BotKey(instanceId, botId));
      if (action != null && !action.future().isDone()) {
        action.future().cancel(true);
      }
      responseObserver.onNext(StopPathfindingResponse.getDefaultInstance());
      responseObserver.onCompleted();
    } catch (Throwable t) {
      responseObserver.onError(toGrpcError("Failed to stop pathfinding", t));
    }
  }

  @Override
  public void acquireBotControl(
    AcquireBotControlRequest request,
    StreamObserver<AcquireBotControlResponse> responseObserver
  ) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    ServerRPCConstants.USER_CONTEXT_KEY.get()
      .hasPermissionOrThrow(PermissionContext.instance(
        InstancePermission.CONTROL_BOT_ACTIONS,
        instanceId));
    var instance = requireConfiguredBot(soulFireServer, instanceId, botId);
    try {
      var lease = instance.botControlLeaseManager().acquire(
        botId,
        ServerRPCConstants.USER_CONTEXT_KEY.get().getUniqueId(),
        Duration.ofSeconds(request.getTtlSeconds()));
      responseObserver.onNext(AcquireBotControlResponse.newBuilder()
        .setLease(buildControlLease(lease))
        .build());
      responseObserver.onCompleted();
    } catch (BotControlLeaseManager.LeaseUnavailableException e) {
      responseObserver.onError(Status.ALREADY_EXISTS
        .withDescription(e.getMessage())
        .asRuntimeException());
    }
  }

  @Override
  public void renewBotControl(
    RenewBotControlRequest request,
    StreamObserver<RenewBotControlResponse> responseObserver
  ) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    ServerRPCConstants.USER_CONTEXT_KEY.get()
      .hasPermissionOrThrow(PermissionContext.instance(
        InstancePermission.CONTROL_BOT_ACTIONS,
        instanceId));
    var instance = requireConfiguredBot(soulFireServer, instanceId, botId);
    try {
      var lease = instance.botControlLeaseManager().renew(
        botId,
        ServerRPCConstants.USER_CONTEXT_KEY.get().getUniqueId(),
        request.getToken(),
        Duration.ofSeconds(request.getTtlSeconds()));
      responseObserver.onNext(RenewBotControlResponse.newBuilder()
        .setLease(buildControlLease(lease))
        .build());
      responseObserver.onCompleted();
    } catch (BotControlLeaseManager.InvalidLeaseException e) {
      responseObserver.onError(Status.PERMISSION_DENIED
        .withDescription(e.getMessage())
        .asRuntimeException());
    }
  }

  @Override
  public void releaseBotControl(
    ReleaseBotControlRequest request,
    StreamObserver<ReleaseBotControlResponse> responseObserver
  ) {
    var instanceId = UUID.fromString(request.getInstanceId());
    var botId = UUID.fromString(request.getBotId());
    ServerRPCConstants.USER_CONTEXT_KEY.get()
      .hasPermissionOrThrow(PermissionContext.instance(
        InstancePermission.CONTROL_BOT_ACTIONS,
        instanceId));
    var instance = requireConfiguredBot(soulFireServer, instanceId, botId);
    try {
      instance.botControlLeaseManager().release(
        botId,
        ServerRPCConstants.USER_CONTEXT_KEY.get().getUniqueId(),
        request.getToken());
      responseObserver.onNext(ReleaseBotControlResponse.getDefaultInstance());
      responseObserver.onCompleted();
    } catch (BotControlLeaseManager.InvalidLeaseException e) {
      responseObserver.onError(Status.PERMISSION_DENIED
        .withDescription(e.getMessage())
        .asRuntimeException());
    }
  }

  private static BotControlLease buildControlLease(BotControlLeaseManager.Lease lease) {
    return BotControlLease.newBuilder()
      .setToken(lease.token())
      .setExpiresAt(Timestamp.newBuilder()
        .setSeconds(lease.expiresAt().getEpochSecond())
        .setNanos(lease.expiresAt().getNano())
        .build())
      .build();
  }

  private record BotKey(UUID instanceId, UUID botId) {}

  private record PathAction(
    UUID actionId,
    CompletableFuture<Void> future,
    AtomicBoolean timedOut
  ) {}
}
