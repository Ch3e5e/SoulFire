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
package com.soulfiremc.server.api;

import com.google.protobuf.DescriptorProtos;
import com.soulfiremc.grpc.generated.*;

import java.util.HexFormat;
import java.util.List;

/// Immutable catalog entry for one plugin's complete protobuf API.
public record PluginApiDefinition(
  PluginInfo pluginInfo,
  PluginSdkMetadata sdkMetadata,
  List<RegisteredPluginPermission> permissions,
  List<PluginRpcRegistration> services,
  List<BotTaskProviderRegistration<?, ?>> tasks,
  List<PluginEventRegistration<?>> events,
  DescriptorProtos.FileDescriptorSet descriptorSet,
  byte[] descriptorSha256
) {
  public PluginApiDefinition {
    permissions = List.copyOf(permissions);
    services = List.copyOf(services);
    tasks = List.copyOf(tasks);
    events = List.copyOf(events);
    descriptorSha256 = descriptorSha256.clone();
  }

  @Override
  public byte[] descriptorSha256() {
    return descriptorSha256.clone();
  }

  public String descriptorSha256Hex() {
    return HexFormat.of().formatHex(descriptorSha256);
  }

  public PluginApiDescriptor toProto() {
    var sdkPackages = PluginSdkPackages.newBuilder();
    sdkMetadata.typescriptPackage().ifPresent(sdkPackages::setTypescriptPackage);
    sdkMetadata.pythonPackage().ifPresent(sdkPackages::setPythonPackage);
    sdkMetadata.mavenArtifact().ifPresent(sdkPackages::setMavenArtifact);

    var result = PluginApiDescriptor.newBuilder()
      .setPluginId(pluginInfo.id())
      .setPluginVersion(pluginInfo.version())
      .setDescription(pluginInfo.description())
      .setAuthor(pluginInfo.author())
      .setLicense(pluginInfo.license())
      .setWebsiteUrl(pluginInfo.website())
      .setRequiredSoulfireVersion(sdkMetadata.requiredSoulFireVersion())
      .setApiMajorVersion(sdkMetadata.apiMajorVersion())
      .setDescriptorSha256(descriptorSha256Hex())
      .addAllPermissions(permissions.stream().map(RegisteredPluginPermission::toProto).toList())
      .addAllServices(services.stream().map(PluginApiDefinition::serviceToProto).toList())
      .addAllEventTypeUrls(java.util.stream.Stream.concat(
          sdkMetadata.eventTypeUrls().stream(),
          events.stream().map(PluginEventRegistration::typeUrl))
        .distinct()
        .sorted()
        .toList())
      .addAllEventTypes(events.stream()
        .map(event -> PluginEventTypeDescriptor.newBuilder()
          .setTypeUrl(event.typeUrl())
          .addAllPermissions(event.permissions().stream()
            .map(RegisteredPluginPermission::id)
            .toList())
          .build())
        .toList())
      .addAllTaskTypeUrls(java.util.stream.Stream.concat(
          sdkMetadata.taskTypeUrls().stream(),
          tasks.stream().map(BotTaskProviderRegistration::typeUrl))
        .distinct()
        .sorted()
        .toList())
      .addAllTaskTypes(tasks.stream()
        .map(task -> {
          var descriptor = PluginTaskTypeDescriptor.newBuilder()
            .setInputTypeUrl(task.typeUrl())
            .setResultTypeUrl(task.resultTypeUrl())
            .addAllPermissions(task.permissions().stream()
              .map(RegisteredPluginPermission::id)
              .toList());
          task.progressTypeUrl().ifPresent(descriptor::setProgressTypeUrl);
          return descriptor.build();
        })
        .toList())
      .setStability(switch (sdkMetadata.stability()) {
        case EXPERIMENTAL -> PluginApiStability.PLUGIN_API_STABILITY_EXPERIMENTAL;
        case BETA -> PluginApiStability.PLUGIN_API_STABILITY_BETA;
        case STABLE -> PluginApiStability.PLUGIN_API_STABILITY_STABLE;
        case DEPRECATED -> PluginApiStability.PLUGIN_API_STABILITY_DEPRECATED;
      })
      .setSdkPackages(sdkPackages);
    sdkMetadata.documentationUrl().ifPresent(result::setDocumentationUrl);
    sdkMetadata.sourceUrl().ifPresent(result::setSourceUrl);
    return result.build();
  }

  private static PluginRpcServiceDescriptor serviceToProto(PluginRpcRegistration registration) {
    var service = registration.descriptor();
    return PluginRpcServiceDescriptor.newBuilder()
      .setName(service.getName())
      .setFullName(service.getFullName())
      .addAllMethods(service.getMethods().stream()
        .map(method -> {
          var docs = method.getOptions().hasExtension(ApiDocsProto.apiMethod)
            ? method.getOptions().getExtension(ApiDocsProto.apiMethod)
            : ApiMethodDocs.getDefaultInstance();
          return PluginRpcMethodDescriptor.newBuilder()
            .setName(method.getName())
            .setFullName(service.getFullName() + "/" + method.getName())
            .setInputTypeUrl("type.googleapis.com/" + method.getInputType().getFullName())
            .setOutputTypeUrl("type.googleapis.com/" + method.getOutputType().getFullName())
            .setClientStreaming(method.isClientStreaming())
            .setServerStreaming(method.isServerStreaming())
            .addAllPermissions(registration.methodPermissions().get(method.getName()).stream()
              .map(RegisteredPluginPermission::id)
              .toList())
            .setDisplayName(docs.getDisplayName())
            .setDescription(docs.getDescription())
            .setExposedToMcp(docs.getExposeToMcp())
            .setMcpRequiresConfirmation(docs.getMcpRequiresConfirmation())
            .build();
        })
        .toList())
      .build();
  }
}
