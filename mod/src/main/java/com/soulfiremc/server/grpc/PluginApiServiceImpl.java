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

import com.google.protobuf.Any;
import com.google.protobuf.util.Timestamps;
import com.soulfiremc.grpc.generated.*;
import com.soulfiremc.server.api.PluginApiDefinition;
import com.soulfiremc.server.api.PluginApiRegistry;
import com.soulfiremc.server.api.PluginEventTarget;
import com.soulfiremc.server.api.PublishedPluginEvent;
import com.soulfiremc.server.user.PermissionContext;
import io.grpc.Status;
import io.grpc.stub.ServerCallStreamObserver;
import io.grpc.stub.StreamObserver;

import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/// Exposes plugin API metadata and descriptor sets to authenticated SDKs.
public final class PluginApiServiceImpl extends PluginApiServiceGrpc.PluginApiServiceImplBase {
  private final PluginApiRegistry registry;

  public PluginApiServiceImpl(PluginApiRegistry registry) {
    this.registry = registry;
  }

  @Override
  public void listPluginApis(
    ListPluginApisRequest request,
    StreamObserver<ListPluginApisResponse> responseObserver
  ) {
    requireReadAccess();
    var snapshot = registry.snapshot();
    responseObserver.onNext(ListPluginApisResponse.newBuilder()
      .setRevision(snapshot.revision())
      .addAllPlugins(snapshot.plugins().stream().map(PluginApiDefinition::toProto).toList())
      .build());
    responseObserver.onCompleted();
  }

  @Override
  public void getPluginApi(
    GetPluginApiRequest request,
    StreamObserver<GetPluginApiResponse> responseObserver
  ) {
    requireReadAccess();
    var plugin = requiredPlugin(request.getPluginId());
    responseObserver.onNext(GetPluginApiResponse.newBuilder()
      .setRevision(registry.revision())
      .setPlugin(plugin.toProto())
      .build());
    responseObserver.onCompleted();
  }

  @Override
  public void getPluginDescriptorSet(
    GetPluginDescriptorSetRequest request,
    StreamObserver<GetPluginDescriptorSetResponse> responseObserver
  ) {
    requireReadAccess();
    var plugin = requiredPlugin(request.getPluginId());
    if (request.hasExpectedSha256()
      && !request.getExpectedSha256().equalsIgnoreCase(plugin.descriptorSha256Hex())) {
      throw Status.FAILED_PRECONDITION
        .withDescription("Plugin descriptor hash changed")
        .asRuntimeException();
    }
    responseObserver.onNext(GetPluginDescriptorSetResponse.newBuilder()
      .setPluginId(plugin.pluginInfo().id())
      .setPluginVersion(plugin.pluginInfo().version())
      .setDescriptorSha256(plugin.descriptorSha256Hex())
      .setDescriptorSet(plugin.descriptorSet().toByteString())
      .build());
    responseObserver.onCompleted();
  }

  @Override
  public void watchPluginApis(
    WatchPluginApisRequest request,
    StreamObserver<PluginApiEvent> responseObserver
  ) {
    requireReadAccess();
    if (!(responseObserver instanceof ServerCallStreamObserver<PluginApiEvent> serverObserver)) {
      throw Status.INTERNAL.withDescription("Server stream cancellation is unavailable")
        .asRuntimeException();
    }

    var subscription = new AtomicReference<AutoCloseable>();
    serverObserver.setOnCancelHandler(() -> close(subscription.getAndSet(null)));
    var listener = registry.subscribe(snapshot -> {
      if (!serverObserver.isCancelled()) {
        serverObserver.onNext(snapshotEvent(snapshot));
      }
    });
    subscription.set(listener);
    if (serverObserver.isCancelled()) {
      close(subscription.getAndSet(null));
      return;
    }
    serverObserver.onNext(snapshotEvent(registry.snapshot()));
  }

  @Override
  public void watchPluginEvents(
    WatchPluginEventsRequest request,
    StreamObserver<PluginEvent> responseObserver
  ) {
    requireReadAccess();
    if (!(responseObserver instanceof ServerCallStreamObserver<PluginEvent> observer)) {
      throw Status.INTERNAL.withDescription("Server stream cancellation is unavailable")
        .asRuntimeException();
    }
    var user = ServerRPCConstants.USER_CONTEXT_KEY.get();
    var filter = EventFilter.from(request);
    var closed = new AtomicBoolean();
    var readyDelivered = new AtomicBoolean();
    var dropped = new AtomicLong();
    var subscription = new AtomicReference<AutoCloseable>();

    var registered = registry.subscribeEvents(event -> {
      if (
        closed.get()
        || observer.isCancelled()
        || !filter.matches(event)
        || !authorized(user, event)
      ) {
        return;
      }
      if (!readyDelivered.get() || !observer.isReady()) {
        dropped.incrementAndGet();
        return;
      }
      synchronized (observer) {
        if (closed.get() || observer.isCancelled() || !observer.isReady()) {
          dropped.incrementAndGet();
          return;
        }
        try {
          observer.onNext(pluginEvent(event, dropped.getAndSet(0)));
        } catch (Throwable throwable) {
          closed.set(true);
        }
      }
    });
    subscription.set(registered.closeable());

    var sendReady = (Runnable) () -> {
      if (
        closed.get()
        || observer.isCancelled()
        || !observer.isReady()
        || !readyDelivered.compareAndSet(false, true)
      ) {
        return;
      }
      synchronized (observer) {
        observer.onNext(PluginEvent.newBuilder()
          .setSequence(registered.sequence())
          .setEmittedAt(Timestamps.fromMillis(System.currentTimeMillis()))
          .setKind(PluginEventKind.PLUGIN_EVENT_KIND_READY)
          .setScope(com.soulfiremc.grpc.generated.PluginEventScope.getDefaultInstance())
          .setDroppedBefore(dropped.getAndSet(0))
          .setResumeGap(
            request.getAfterSequence() > 0
              && request.getAfterSequence() != registered.sequence()
          )
          .build());
      }
    };
    observer.setOnReadyHandler(sendReady);
    observer.setOnCancelHandler(() -> {
      closed.set(true);
      close(subscription.getAndSet(null));
    });
    sendReady.run();
  }

  private static PluginEvent pluginEvent(PublishedPluginEvent event, long droppedBefore) {
    return PluginEvent.newBuilder()
      .setSequence(event.sequence())
      .setEmittedAt(Timestamps.fromMillis(event.emittedAtMillis()))
      .setKind(PluginEventKind.PLUGIN_EVENT_KIND_DATA)
      .setPluginId(event.registration().owner().id())
      .setTypeUrl(event.registration().typeUrl())
      .setScope(pluginEventScope(event.target()))
      .setPayload(Any.pack(event.payload()))
      .setDroppedBefore(droppedBefore)
      .build();
  }

  private static com.soulfiremc.grpc.generated.PluginEventScope pluginEventScope(
    PluginEventTarget target
  ) {
    var scope = com.soulfiremc.grpc.generated.PluginEventScope.newBuilder();
    target.instanceId().ifPresent(value -> scope.setInstanceId(value.toString()));
    target.botId().ifPresent(value -> scope.setBotId(value.toString()));
    target.taskId().ifPresent(value -> scope.setTaskId(value.toString()));
    return scope.build();
  }

  private static boolean authorized(
    com.soulfiremc.server.user.SoulFireUser user,
    PublishedPluginEvent event
  ) {
    var target = event.target();
    return event.registration().permissions().stream().allMatch(permission ->
      user.hasPermission(PermissionContext.plugin(
        permission,
        target.instanceId(),
        target.botId(),
        target.taskId()
      )));
  }

  private static PluginApiEvent snapshotEvent(PluginApiRegistry.Snapshot snapshot) {
    return PluginApiEvent.newBuilder()
      .setRevision(snapshot.revision())
      .setKind(PluginApiEventKind.PLUGIN_API_EVENT_KIND_SNAPSHOT)
      .addAllPlugins(snapshot.plugins().stream().map(PluginApiDefinition::toProto).toList())
      .build();
  }

  private PluginApiDefinition requiredPlugin(String pluginId) {
    return registry.find(pluginId)
      .orElseThrow(() -> Status.NOT_FOUND
        .withDescription("Plugin API not found: " + pluginId)
        .asRuntimeException());
  }

  private static void requireReadAccess() {
    ServerRPCConstants.USER_CONTEXT_KEY.get()
      .hasPermissionOrThrow(PermissionContext.global(GlobalPermission.READ_CLIENT_DATA));
  }

  private static void close(AutoCloseable closeable) {
    if (closeable == null) {
      return;
    }
    try {
      closeable.close();
    } catch (Exception e) {
      throw new IllegalStateException("Failed to close plugin API subscription", e);
    }
  }

  private record EventFilter(
    Set<String> pluginIds,
    Set<String> typeUrls,
    Optional<UUID> instanceId,
    Optional<UUID> botId,
    Optional<UUID> taskId
  ) {
    static EventFilter from(WatchPluginEventsRequest request) {
      var instanceId = uuid(request.hasInstanceId(), request.getInstanceId(), "instance_id");
      var botId = uuid(request.hasBotId(), request.getBotId(), "bot_id");
      var taskId = uuid(request.hasTaskId(), request.getTaskId(), "task_id");
      if (botId.isPresent() && instanceId.isEmpty()) {
        throw Status.INVALID_ARGUMENT
          .withDescription("bot_id filter requires instance_id")
          .asRuntimeException();
      }
      if (taskId.isPresent() && instanceId.isEmpty()) {
        throw Status.INVALID_ARGUMENT
          .withDescription("task_id filter requires instance_id")
          .asRuntimeException();
      }
      return new EventFilter(
        Set.copyOf(request.getPluginIdsList()),
        Set.copyOf(request.getTypeUrlsList()),
        instanceId,
        botId,
        taskId
      );
    }

    boolean matches(PublishedPluginEvent event) {
      var target = event.target();
      return (pluginIds.isEmpty() || pluginIds.contains(event.registration().owner().id()))
        && (typeUrls.isEmpty() || typeUrls.contains(event.registration().typeUrl()))
        && (instanceId.isEmpty() || instanceId.equals(target.instanceId()))
        && (botId.isEmpty() || botId.equals(target.botId()))
        && (taskId.isEmpty() || taskId.equals(target.taskId()));
    }

    private static Optional<UUID> uuid(boolean present, String value, String fieldName) {
      if (!present) {
        return Optional.empty();
      }
      try {
        return Optional.of(UUID.fromString(value));
      } catch (IllegalArgumentException exception) {
        throw Status.INVALID_ARGUMENT
          .withDescription(fieldName + " must be a UUID")
          .withCause(exception)
          .asRuntimeException();
      }
    }
  }
}
