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

import com.soulfiremc.grpc.generated.*;
import com.soulfiremc.server.SoulFireServer;
import com.soulfiremc.server.user.PermissionContext;
import io.grpc.Status;
import io.grpc.stub.ServerCallStreamObserver;
import io.grpc.stub.StreamObserver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

/// Multiplexes the complete per-bot event contract onto one instance stream.
///
/// The internal child observers reuse BotLiveService's snapshot, filtering,
/// sequencing, backpressure, and cleanup behavior. One public gRPC stream can
/// therefore observe a fleet without maintaining a second event mapper.
@Slf4j
@RequiredArgsConstructor
public final class InstanceLiveServiceImpl extends InstanceLiveServiceGrpc.InstanceLiveServiceImplBase {
  private final SoulFireServer soulFireServer;

  @Override
  public void watchInstanceEvents(
    WatchInstanceEventsRequest request,
    StreamObserver<InstanceEvent> responseObserver
  ) {
    var instanceId = UUID.fromString(request.getInstanceId());
    ServerRPCConstants.USER_CONTEXT_KEY.get()
      .hasPermissionOrThrow(PermissionContext.instance(
        InstancePermission.READ_BOT_INFO,
        instanceId));
    var instance = soulFireServer.getInstance(instanceId)
      .orElseThrow(() -> Status.NOT_FOUND
        .withDescription("Instance '%s' not found".formatted(instanceId))
        .asRuntimeException());
    var parent = (ServerCallStreamObserver<InstanceEvent>) responseObserver;
    var closed = new AtomicBoolean(false);
    var children = new CopyOnWriteArrayList<MultiplexingObserver>();
    var selectedBotIds = parseBotIds(request.getFilter().getBotIdsList());
    var botFilter = botFilter(request.getFilter());
    var legacyEnvelope = !request.getFilter().hasBotEvents();
    var botLiveService = new BotLiveServiceImpl(soulFireServer);

    for (var entry : instance.settingsSource().accounts().entrySet()) {
      var botId = entry.getKey();
      if (!selectedBotIds.isEmpty() && !selectedBotIds.contains(botId)) {
        continue;
      }
      var child = new MultiplexingObserver(
        parent,
        botId,
        entry.getValue().lastKnownName(),
        legacyEnvelope
      );
      children.add(child);
      botLiveService.watchBotEvents(
        WatchBotEventsRequest.newBuilder()
          .setInstanceId(request.getInstanceId())
          .setBotId(botId.toString())
          .setFilter(botFilter)
          .build(),
        child
      );
    }

    parent.setOnReadyHandler(() ->
      children.forEach(MultiplexingObserver::notifyReady));
    parent.setOnCancelHandler(() -> {
      if (closed.compareAndSet(false, true)) {
        children.forEach(MultiplexingObserver::cancel);
        children.clear();
      }
    });
  }

  private static Set<UUID> parseBotIds(List<String> botIds) {
    try {
      return botIds.stream()
        .map(UUID::fromString)
        .collect(java.util.stream.Collectors.toUnmodifiableSet());
    } catch (IllegalArgumentException e) {
      throw Status.INVALID_ARGUMENT
        .withDescription("Instance event bot_ids must contain UUIDs")
        .withCause(e)
        .asRuntimeException();
    }
  }

  private static BotEventFilter botFilter(InstanceEventFilter filter) {
    if (filter.hasBotEvents()) {
      return filter.getBotEvents();
    }
    return BotEventFilter.newBuilder()
      .setIncludeChat(filter.getIncludeChat())
      .setIncludeLifecycle(filter.getIncludeLifecycle())
      .build();
  }

  private static final class MultiplexingObserver extends ServerCallStreamObserver<BotEvent> {
    private final ServerCallStreamObserver<InstanceEvent> parent;
    private final String botId;
    private final String botName;
    private final boolean legacyEnvelope;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private volatile Runnable cancelHandler = () -> {};
    private volatile Runnable readyHandler = () -> {};

    private MultiplexingObserver(
      ServerCallStreamObserver<InstanceEvent> parent,
      UUID botId,
      String botName,
      boolean legacyEnvelope
    ) {
      this.parent = parent;
      this.botId = botId.toString();
      this.botName = botName;
      this.legacyEnvelope = legacyEnvelope;
    }

    @Override
    public void onNext(BotEvent event) {
      var result = InstanceEvent.newBuilder()
        .setBotProfileId(botId);
      if (botName != null) {
        result.setBotName(botName);
      }
      if (legacyEnvelope && event.getEventCase() == BotEvent.EventCase.CHAT) {
        result.setChat(event.getChat());
      } else if (legacyEnvelope && event.getEventCase() == BotEvent.EventCase.LIFECYCLE) {
        result.setLifecycle(event.getLifecycle());
      } else {
        result.setBotEvent(event);
      }
      synchronized (parent) {
        if (!isCancelled() && parent.isReady()) {
          parent.onNext(result.build());
        }
      }
    }

    @Override
    public void onError(Throwable error) {
      log.debug("Bot event child stream failed for {}", botId, error);
      cancel();
    }

    @Override
    public void onCompleted() {
      cancel();
    }

    @Override
    public boolean isCancelled() {
      return cancelled.get() || parent.isCancelled();
    }

    @Override
    public void setOnCancelHandler(Runnable handler) {
      cancelHandler = handler;
    }

    @Override
    public void setCompression(String compression) {
      parent.setCompression(compression);
    }

    @Override
    public boolean isReady() {
      return !isCancelled() && parent.isReady();
    }

    @Override
    public void setOnReadyHandler(Runnable handler) {
      readyHandler = handler;
    }

    @Override
    public void disableAutoInboundFlowControl() {
      // This observer only receives server output.
    }

    @Override
    public void request(int count) {
      // This observer only receives server output.
    }

    @Override
    public void setMessageCompression(boolean enable) {
      parent.setMessageCompression(enable);
    }

    private void notifyReady() {
      if (isReady()) {
        readyHandler.run();
      }
    }

    private void cancel() {
      if (cancelled.compareAndSet(false, true)) {
        cancelHandler.run();
      }
    }
  }
}
