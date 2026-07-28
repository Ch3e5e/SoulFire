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

import com.google.protobuf.Descriptors;
import com.google.protobuf.Message;
import com.soulfiremc.server.SoulFireServer;
import com.soulfiremc.server.api.PluginCallContext;
import com.soulfiremc.server.api.PluginRpcRegistration;
import com.soulfiremc.server.api.RegisteredPluginPermission;
import com.soulfiremc.server.database.AuditLogType;
import com.soulfiremc.server.user.PermissionContext;
import com.soulfiremc.server.util.structs.GsonInstance;
import io.grpc.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/// Enforces the dynamic permissions declared by every method in a plugin API.
public final class PluginRpcPermissionInterceptor implements ServerInterceptor {
  private final SoulFireServer server;
  private final PluginRpcRegistration registration;

  public PluginRpcPermissionInterceptor(
    SoulFireServer server,
    PluginRpcRegistration registration
  ) {
    this.server = server;
    this.registration = registration;
  }

  @Override
  public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(
    ServerCall<ReqT, RespT> call,
    Metadata headers,
    ServerCallHandler<ReqT, RespT> next
  ) {
    var methodName = call.getMethodDescriptor().getBareMethodName();
    var permissions = registration.methodPermissions().get(methodName);
    if (permissions == null) {
      call.close(Status.INTERNAL.withDescription("Plugin RPC permission metadata is missing"), new Metadata());
      return new ServerCall.Listener<>() {};
    }

    var startedAt = System.nanoTime();
    var callContext = new AtomicReference<PluginCallContext>();
    var auditedCall = new AuditedServerCall<>(
      call,
      server,
      registration,
      methodName,
      startedAt,
      callContext
    );
    var delegate = next.startCall(auditedCall, headers);
    var parentContext = Context.current();
    return new ForwardingServerCallListener.SimpleForwardingServerCallListener<>(delegate) {
      private boolean rejected;
      private Context requestContext = parentContext;

      @Override
      public void onMessage(ReqT message) {
        try {
          var target = authorize(message, permissions);
          var user = ServerRPCConstants.USER_CONTEXT_KEY.get();
          var pluginContext = new PluginCallContext(
            server,
            registration,
            methodName,
            user,
            target.instanceId(),
            target.botId(),
            target.taskId(),
            permissions,
            headers,
            parentContext
          );
          callContext.set(pluginContext);
          requestContext = PluginCallContext.install(parentContext, pluginContext);
          requestContext.run(() -> super.onMessage(message));
        } catch (StatusRuntimeException e) {
          rejected = true;
          auditedCall.close(e.getStatus(), e.getTrailers() != null ? e.getTrailers() : new Metadata());
        } catch (RuntimeException e) {
          rejected = true;
          auditedCall.close(
            Status.INVALID_ARGUMENT.withDescription(e.getMessage()).withCause(e),
            new Metadata()
          );
        }
      }

      @Override
      public void onHalfClose() {
        if (!rejected) {
          requestContext.run(super::onHalfClose);
        }
      }

      @Override
      public void onReady() {
        if (!rejected) {
          requestContext.run(super::onReady);
        }
      }

      @Override
      public void onCancel() {
        requestContext.run(super::onCancel);
      }

      @Override
      public void onComplete() {
        requestContext.run(super::onComplete);
      }
    };
  }

  private static PermissionTarget authorize(
    Object request,
    List<RegisteredPluginPermission> permissions
  ) {
    if (!(request instanceof Message message)) {
      throw Status.INTERNAL.withDescription("Plugin RPC requests must be protobuf messages")
        .asRuntimeException();
    }
    var target = target(message);
    var user = ServerRPCConstants.USER_CONTEXT_KEY.get();
    if (user == null) {
      throw Status.UNAUTHENTICATED.withDescription("Authenticated user context is missing")
        .asRuntimeException();
    }

    for (var permission : permissions) {
      validateTarget(permission, target);
      user.hasPermissionOrThrow(PermissionContext.plugin(
        permission,
        target.instanceId(),
        target.botId(),
        target.taskId()
      ));
    }
    return target;
  }

  private static PermissionTarget target(Message request) {
    return new PermissionTarget(
      uuidField(request, "instance_id"),
      uuidField(request, "bot_id"),
      uuidField(request, "task_id")
    );
  }

  private static Optional<UUID> uuidField(Message request, String fieldName) {
    var field = request.getDescriptorForType().findFieldByName(fieldName);
    if (field == null || field.isRepeated() || field.getJavaType() != Descriptors.FieldDescriptor.JavaType.STRING) {
      return Optional.empty();
    }
    var value = (String) request.getField(field);
    if (value.isBlank()) {
      return Optional.empty();
    }
    try {
      return Optional.of(UUID.fromString(value));
    } catch (IllegalArgumentException e) {
      throw Status.INVALID_ARGUMENT
        .withDescription("Plugin RPC field %s must be a UUID".formatted(fieldName))
        .withCause(e)
        .asRuntimeException();
    }
  }

  private static void validateTarget(
    RegisteredPluginPermission permission,
    PermissionTarget target
  ) {
    switch (permission.definition().scope()) {
      case GLOBAL -> {
        return;
      }
      case INSTANCE -> require(target.instanceId(), "instance_id", permission.id());
      case BOT -> {
        require(target.instanceId(), "instance_id", permission.id());
        require(target.botId(), "bot_id", permission.id());
      }
      case TASK -> {
        require(target.instanceId(), "instance_id", permission.id());
        require(target.taskId(), "task_id", permission.id());
      }
    }
  }

  private static void require(Optional<UUID> value, String fieldName, String permissionId) {
    if (value.isEmpty()) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "Plugin RPC permission %s requires a UUID %s field".formatted(permissionId, fieldName)
        )
        .asRuntimeException();
    }
  }

  private record PermissionTarget(
    Optional<UUID> instanceId,
    Optional<UUID> botId,
    Optional<UUID> taskId
  ) {}

  private static final class AuditedServerCall<ReqT, RespT>
    extends ForwardingServerCall.SimpleForwardingServerCall<ReqT, RespT> {
    private final SoulFireServer server;
    private final PluginRpcRegistration registration;
    private final String methodName;
    private final long startedAt;
    private final AtomicReference<PluginCallContext> callContext;
    private final AtomicBoolean reported = new AtomicBoolean();

    private AuditedServerCall(
      ServerCall<ReqT, RespT> delegate,
      SoulFireServer server,
      PluginRpcRegistration registration,
      String methodName,
      long startedAt,
      AtomicReference<PluginCallContext> callContext
    ) {
      super(delegate);
      this.server = server;
      this.registration = registration;
      this.methodName = methodName;
      this.startedAt = startedAt;
      this.callContext = callContext;
    }

    @Override
    public void close(Status status, Metadata trailers) {
      report(status);
      super.close(status, trailers);
    }

    private void report(Status status) {
      if (!reported.compareAndSet(false, true)) {
        return;
      }
      var context = callContext.get();
      if (context == null || context.instanceId().isEmpty()) {
        return;
      }
      server.getInstance(context.instanceId().orElseThrow()).ifPresent(instance -> {
        var stats = instance.pluginStats().forPlugin(registration.owner());
        stats.counter(
          "sdk_rpc_requests",
          "SDK RPC requests",
          "calls",
          "waypoints"
        ).increment();
        if (!status.isOk()) {
          stats.counter(
            "sdk_rpc_failures",
            "SDK RPC failures",
            "calls",
            "triangle-alert"
          ).increment();
        }
        stats.gauge(
          "sdk_rpc_last_latency",
          "Last SDK RPC latency",
          "ms",
          "timer"
        ).set((System.nanoTime() - startedAt) / 1_000_000.0);
        instance.addAuditLog(
          context.user(),
          AuditLogType.PLUGIN_RPC,
          GsonInstance.GSON.toJson(Map.of(
            "pluginId", registration.owner().id(),
            "service", registration.descriptor().getFullName(),
            "method", methodName,
            "botId", context.botId().map(UUID::toString).orElse(""),
            "taskId", context.taskId().map(UUID::toString).orElse(""),
            "status", status.getCode().name()
          ))
        );
      });
    }
  }
}
