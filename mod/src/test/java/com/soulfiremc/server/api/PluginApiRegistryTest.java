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

import com.mojang.brigadier.CommandDispatcher;
import com.soulfiremc.grpc.generated.ClientServiceGrpc;
import com.soulfiremc.grpc.generated.plugin.example.v1.EchoRequest;
import com.soulfiremc.grpc.generated.plugin.example.v1.EchoResponse;
import com.soulfiremc.grpc.generated.plugin.example.v1.ExamplePluginServiceGrpc;
import com.soulfiremc.grpc.generated.plugin.example.v1.Tick;
import com.soulfiremc.server.bot.ControlResource;
import com.soulfiremc.server.bot.ControlTask;
import com.soulfiremc.server.command.CommandSourceStack;
import com.soulfiremc.server.command.brigadier.BrigadierHelper;
import com.soulfiremc.server.settings.lib.SettingsPageRegistry;
import com.soulfiremc.server.settings.server.DevSettings;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;

class PluginApiRegistryTest {
  @Test
  void buildsDeterministicCatalogFromRegisteredService() {
    var registry = new PluginApiRegistry();
    var context = registry.createContext(pluginInfo("example"));
    var permission = context.permissions().register(readPermission());
    context.sdk().register(metadata(1));
    context.rpc().register(new ExamplePluginServiceGrpc.ExamplePluginServiceImplBase() {});

    var first = registry.find("example").orElseThrow();
    var second = registry.find("example").orElseThrow();

    assertEquals(permission.id(), first.permissions().getFirst().id());
    assertArrayEquals(first.descriptorSha256(), second.descriptorSha256());
    assertEquals(64, first.descriptorSha256Hex().length());
    assertTrue(first.descriptorSet().getFileList().stream()
      .anyMatch(file -> file.getName().endsWith("plugin/example/v1/example.proto")));
    assertEquals(
      List.of("plugin.example.read"),
      first.services().getFirst().methodPermissions().get("Echo").stream()
        .map(RegisteredPluginPermission::id)
        .toList()
    );
    assertTrue(first.toProto().getServices(0).getMethods(0).getExposedToMcp());
    assertEquals(first.descriptorSha256Hex(), first.toProto().getDescriptorSha256());
  }

  @Test
  void rejectsMissingAndDuplicatePermissionDefinitions() {
    var missingRegistry = new PluginApiRegistry();
    var missingContext = missingRegistry.createContext(pluginInfo("example"));
    missingContext.sdk().register(metadata(1));
    var missing = assertThrows(
      IllegalArgumentException.class,
      () -> missingContext.rpc().register(
        new ExamplePluginServiceGrpc.ExamplePluginServiceImplBase() {}
      )
    );
    assertTrue(missing.getMessage().contains("unregistered permission"));

    var duplicateRegistry = new PluginApiRegistry();
    var duplicateContext = duplicateRegistry.createContext(pluginInfo("example"));
    duplicateContext.permissions().register(readPermission());
    assertThrows(
      IllegalStateException.class,
      () -> duplicateContext.permissions().register(readPermission())
    );
  }

  @Test
  void rejectsCoreNamespacesAndMismatchedApiMajors() {
    var coreRegistry = new PluginApiRegistry();
    var coreContext = coreRegistry.createContext(pluginInfo("example"));
    var namespaceFailure = assertThrows(
      IllegalArgumentException.class,
      () -> coreContext.rpc().register(new ClientServiceGrpc.ClientServiceImplBase() {})
    );
    assertTrue(namespaceFailure.getMessage().contains("protobuf package"));

    var majorRegistry = new PluginApiRegistry();
    var majorContext = majorRegistry.createContext(pluginInfo("example"));
    majorContext.permissions().register(readPermission());
    majorContext.sdk().register(metadata(2));
    var majorFailure = assertThrows(
      IllegalArgumentException.class,
      () -> majorContext.rpc().register(
        new ExamplePluginServiceGrpc.ExamplePluginServiceImplBase() {}
      )
    );
    assertTrue(majorFailure.getMessage().contains("major"));
  }

  @Test
  void rejectsDuplicatePluginAndServiceNames() {
    var registry = new PluginApiRegistry();
    var context = registry.createContext(pluginInfo("example"));
    context.permissions().register(readPermission());
    context.sdk().register(metadata(1));
    context.rpc().register(new ExamplePluginServiceGrpc.ExamplePluginServiceImplBase() {});

    assertThrows(
      IllegalStateException.class,
      () -> registry.createContext(pluginInfo("example"))
    );
    assertThrows(
      IllegalStateException.class,
      () -> context.rpc().register(
        new ExamplePluginServiceGrpc.ExamplePluginServiceImplBase() {}
      )
    );
  }

  @Test
  void publishesTypedPluginTaskProvidersInTheCatalog() {
    var registry = new PluginApiRegistry();
    var context = registry.createContext(pluginInfo("example"));
    var permission = context.permissions().register(readPermission());
    context.sdk().register(metadata(1));
    context.tasks().register(new PluginBotTaskProvider<EchoRequest, EchoResponse>() {
      @Override
      public EchoRequest inputPrototype() {
        return EchoRequest.getDefaultInstance();
      }

      @Override
      public EchoResponse resultPrototype() {
        return EchoResponse.getDefaultInstance();
      }

      @Override
      public Set<ControlResource> resources(EchoRequest input) {
        return Set.of(ControlResource.CHAT);
      }

      @Override
      public BotTaskExecution start(
        com.soulfiremc.server.task.BotTaskContext taskContext,
        EchoRequest input
      ) {
        return new BotTaskExecution(
          ControlTask.once(() -> {
          }),
          CompletableFuture.completedFuture(
            EchoResponse.newBuilder().setMessage(input.getMessage()).build()
          )
        );
      }
    }, permission);

    var definition = registry.find("example").orElseThrow();

    assertEquals(
      List.of("type.googleapis.com/soulfire.plugin.example.v1.EchoRequest"),
      definition.toProto().getTaskTypeUrlsList()
    );
    assertEquals(1, definition.tasks().size());
    assertEquals(
      "type.googleapis.com/soulfire.plugin.example.v1.EchoResponse",
      definition.toProto().getTaskTypes(0).getResultTypeUrl()
    );
    assertEquals(
      List.of("plugin.example.read"),
      definition.toProto().getTaskTypes(0).getPermissionsList()
    );
    assertTrue(definition.descriptorSet().getFileList().stream()
      .anyMatch(file -> file.getName().endsWith("plugin/example/v1/example.proto")));
  }

  @Test
  void publishesTypedPermissionScopedPluginEvents() throws Exception {
    var registry = new PluginApiRegistry();
    var context = registry.createContext(pluginInfo("example"));
    var permission = context.permissions().register(readPermission());
    context.sdk().register(metadata(1));
    var eventType = context.events().register(Tick.getDefaultInstance(), permission);
    var received = new java.util.ArrayList<PublishedPluginEvent>();
    var subscription = registry.subscribeEvents(received::add);
    var instanceId = UUID.randomUUID();

    var sequence = eventType.publish(
      PluginEventTarget.instance(instanceId),
      Tick.newBuilder().setSequence(42).build()
    );

    assertEquals(subscription.sequence() + 1, sequence);
    assertEquals(1, received.size());
    assertEquals(instanceId, received.getFirst().target().instanceId().orElseThrow());
    assertEquals(42, ((Tick) received.getFirst().payload()).getSequence());
    var descriptor = registry.find("example").orElseThrow();
    assertEquals(
      List.of("type.googleapis.com/soulfire.plugin.example.v1.Tick"),
      descriptor.toProto().getEventTypeUrlsList()
    );
    assertEquals(
      List.of("plugin.example.read"),
      descriptor.toProto().getEventTypes(0).getPermissionsList()
    );
    assertTrue(descriptor.descriptorSet().getFileList().stream()
      .anyMatch(file -> file.getName().endsWith("plugin/example/v1/example.proto")));
    assertThrows(
      IllegalArgumentException.class,
      () -> eventType.publish(PluginEventTarget.global(), Tick.getDefaultInstance())
    );
    subscription.closeable().close();
  }

  @Test
  void appliesDeclarativePluginSettingsAndCommands() {
    var registry = new PluginApiRegistry();
    var context = registry.createContext(pluginInfo("example"));
    context.settings().registerServerPage(
      DevSettings.class,
      "example-settings",
      "Example settings",
      "plug",
      null
    );
    context.commands().register(
      BrigadierHelper.literal("example-command").executes(_ -> 1)
    );
    var settings = new SettingsPageRegistry();
    var commands = new CommandDispatcher<CommandSourceStack>();

    registry.applySettingsPages(
      PluginSettingsPageRegistration.Scope.SERVER,
      settings
    );
    registry.applyCommands(commands);

    var page = settings.exportSettingsPages().getFirst();
    assertEquals("example-settings", page.getId());
    assertEquals("example", page.getOwningPluginId());
    assertNotNull(commands.getRoot().getChild("example-command"));
    assertThrows(
      IllegalStateException.class,
      () -> context.commands().register(BrigadierHelper.literal("example-command"))
    );
  }

  private static PluginInfo pluginInfo(String id) {
    return new PluginInfo(
      id,
      "1.0.0",
      "Plugin API test",
      "SoulFire",
      "AGPL-3.0",
      "https://soulfiremc.com"
    );
  }

  private static PluginPermission readPermission() {
    return PluginPermission.instance(
      "read",
      "Read example state",
      "Reads example state.",
      PluginPermission.Risk.READ
    );
  }

  private static PluginSdkMetadata metadata(int major) {
    return new PluginSdkMetadata(
      "*",
      major,
      PluginSdkMetadata.Stability.EXPERIMENTAL,
      Optional.empty(),
      Optional.empty(),
      Optional.empty(),
      Optional.empty(),
      Optional.empty(),
      List.of(),
      List.of()
    );
  }
}
