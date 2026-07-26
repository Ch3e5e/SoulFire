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

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.api.FieldBehavior;
import com.linecorp.armeria.server.Server;
import com.linecorp.armeria.server.docs.FieldRequirement;
import com.linecorp.armeria.server.grpc.GrpcService;
import com.soulfiremc.grpc.generated.InstanceServiceGrpc;
import com.soulfiremc.grpc.generated.MetricsServiceGrpc;
import com.soulfiremc.grpc.generated.ScriptServiceGrpc;
import com.soulfiremc.grpc.generated.UserServiceGrpc;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class OpenApiSpecGeneratorTest {
  private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

  @Test
  void optionalBehaviorOverridesRequiredness() {
    assertFalse(OpenApiSpecGenerator.isRequired(
      FieldRequirement.REQUIRED,
      Set.of(FieldBehavior.OPTIONAL)
    ));
  }

  @Test
  void schemaMetadataMapsOpenApiKeywords() {
    var schema = JSON_MAPPER.createObjectNode();
    schema.put("type", "string");

    OpenApiSpecGenerator.applyFieldSchemaMetadata(
      schema,
      Set.of(FieldBehavior.OUTPUT_ONLY),
      "uuid",
      "\"550e8400-e29b-41d4-a716-446655440000\""
    );

    assertEquals("uuid", schema.path("format").asText());
    assertTrue(schema.path("readOnly").asBoolean());
    assertEquals("550e8400-e29b-41d4-a716-446655440000", schema.path("example").asText());
    assertFalse(schema.has("x-google-field-behaviors"));
  }

  @Test
  void unsupportedBehaviorsArePreservedAsExtension() {
    var schema = JSON_MAPPER.createObjectNode();
    schema.put("type", "array");

    OpenApiSpecGenerator.applyFieldSchemaMetadata(
      schema,
      EnumSet.of(FieldBehavior.UNORDERED_LIST, FieldBehavior.IMMUTABLE),
      "",
      ""
    );

    var behaviors = schema.path("x-google-field-behaviors");
    assertEquals(2, behaviors.size());
    assertEquals("IMMUTABLE", behaviors.get(0).asText());
    assertEquals("UNORDERED_LIST", behaviors.get(1).asText());
  }

  @Test
  void generatedSpecIncludesUnorderedListExtensionFromProto() {
    var grpcService = GrpcService.builder()
      .addService(new UserServiceGrpc.UserServiceImplBase() {
      })
      .enableUnframedRequests(true)
      .enableHttpJsonTranscoding(true)
      .build();
    try (var server = Server.builder()
      .service(grpcService)
      .build()) {
      var openApi = OpenApiSpecGenerator.generate(server.config().serviceConfigs(), "https://example.com");
      var usersSchema = findPropertySchema(openApi, "users");

      assertNotNull(usersSchema);
      assertEquals("array", usersSchema.path("type").asText());
      assertEquals("UNORDERED_LIST", usersSchema.path("x-google-field-behaviors").get(0).asText());
    }
  }

  @Test
  void generatedSpecIncludesCustomizableServerTemplate() {
    var grpcService = GrpcService.builder()
      .addService(new UserServiceGrpc.UserServiceImplBase() {
      })
      .enableUnframedRequests(true)
      .enableHttpJsonTranscoding(true)
      .build();
    try (var server = Server.builder()
      .service(grpcService)
      .build()) {
      var openApi = OpenApiSpecGenerator.generate(server.config().serviceConfigs(), "https://api.example.com:8443/api/v1");
      var servers = openApi.withArray("servers");

      assertEquals(2, servers.size());
      assertEquals("https://api.example.com:8443/api/v1", servers.get(0).path("url").asText());
      assertEquals("{scheme}://{host}:{port}/{basePath}", servers.get(1).path("url").asText());
      assertEquals("User-selected server", servers.get(1).path("description").asText());

      var variables = (ObjectNode) servers.get(1).path("variables");
      assertEquals("https", variables.path("scheme").path("default").asText());
      assertEquals("http", variables.path("scheme").path("enum").get(0).asText());
      assertEquals("https", variables.path("scheme").path("enum").get(1).asText());
      assertEquals("api.example.com", variables.path("host").path("default").asText());
      assertEquals("8443", variables.path("port").path("default").asText());
      assertEquals("api/v1", variables.path("basePath").path("default").asText());
    }
  }

  @Test
  void generatedSpecUsesOpenApi31Dialect() {
    var grpcService = GrpcService.builder()
      .addService(new UserServiceGrpc.UserServiceImplBase() {
      })
      .enableUnframedRequests(true)
      .enableHttpJsonTranscoding(true)
      .build();
    try (var server = Server.builder()
      .service(grpcService)
      .build()) {
      var openApi = OpenApiSpecGenerator.generate(server.config().serviceConfigs(), "https://example.com");

      assertEquals("3.1.0", openApi.path("openapi").asText());
      assertEquals(
        "https://spec.openapis.org/oas/3.1/dialect/base",
        openApi.path("jsonSchemaDialect").asText()
      );
      assertFalse(openApi.toPrettyString().contains("\"nullable\""));
    }
  }

  @Test
  void generatedSpecUsesCanonicalHttpBindings() {
    var grpcService = GrpcService.builder()
      .addService(new UserServiceGrpc.UserServiceImplBase() {
      })
      .enableUnframedRequests(true)
      .enableHttpJsonTranscoding(true)
      .build();
    try (var server = Server.builder()
      .service(grpcService)
      .build()) {
      var openApi = OpenApiSpecGenerator.generate(server.config().serviceConfigs(), "https://example.com");
      var paths = (ObjectNode) openApi.path("paths");
      var operationIds = new HashSet<String>();

      paths.properties().forEach(pathEntry ->
        pathEntry.getValue().properties().forEach(operationEntry -> {
          var operation = operationEntry.getValue();
          assertTrue(operationIds.add(operation.path("operationId").asText()));
          operation.path("parameters").forEach(parameter -> {
            if ("path".equals(parameter.path("in").asText())) {
              assertTrue(pathEntry.getKey().contains("{%s}".formatted(parameter.path("name").asText())));
            }
          });
        }));

      var deleteUser = paths.path("/v1/users/{id}").path("delete");
      assertFalse(deleteUser.isMissingNode());
      assertEquals("deleteUser", deleteUser.path("operationId").asText());
    }
  }

  @Test
  void generatedSchemasUseCanonicalProtoJsonShapes() {
    var grpcService = GrpcService.builder()
      .addService(new MetricsServiceGrpc.MetricsServiceImplBase() {
      })
      .enableUnframedRequests(true)
      .enableHttpJsonTranscoding(true)
      .build();
    try (var server = Server.builder()
      .service(grpcService)
      .build()) {
      var openApi = OpenApiSpecGenerator.generate(server.config().serviceConfigs(), "https://example.com");
      var schemas = openApi.path("components").path("schemas");
      var metrics = schemas.path("soulfire.v1.MetricsSnapshot").path("properties");

      assertTrue(metrics.has("packetsSentTotal"));
      assertFalse(metrics.has("packets_sent_total"));
      assertEquals("string", metrics.path("packetsSentTotal").path("type").asText());
      assertEquals("uint64", metrics.path("packetsSentTotal").path("x-protobuf-type").asText());
      assertEquals("string", metrics.path("timestamp").path("type").asText());
      assertEquals("date-time", metrics.path("timestamp").path("format").asText());
      assertFalse(schemas.has("google.protobuf.Timestamp"));
    }
  }

  @Test
  void generatedRequestBodiesHaveStableNamesAndJsonProperties() {
    var grpcService = GrpcService.builder()
      .addService(new InstanceServiceGrpc.InstanceServiceImplBase() {
      })
      .addService(new ScriptServiceGrpc.ScriptServiceImplBase() {
      })
      .enableUnframedRequests(true)
      .enableHttpJsonTranscoding(true)
      .build();
    try (var server = Server.builder()
      .service(grpcService)
      .build()) {
      var openApi = OpenApiSpecGenerator.generate(server.config().serviceConfigs(), "https://example.com");
      var createInstance = openApi.path("paths").path("/v1/instances").path("post");
      var requestSchema = createInstance.path("requestBody").path("content").path("application/json").path("schema");

      assertEquals("createInstance", createInstance.path("operationId").asText());
      assertEquals("CreateInstanceRequestBody", requestSchema.path("title").asText());
      assertTrue(requestSchema.path("properties").has("friendlyName"));
      assertFalse(requestSchema.path("properties").has("friendly_name"));

      var createScript = openApi.path("paths").path("/v1/instances/{instance_id}/scripts").path("post");
      var scriptRequestSchema = createScript.path("requestBody").path("content").path("application/json").path("schema");
      var scriptProperties = scriptRequestSchema.path("properties");
      assertTrue(scriptProperties.has("nodes"));
      assertFalse(scriptProperties.has("nodes.id"));
      assertEquals("array", scriptProperties.path("nodes").path("type").asText());
      assertEquals(
        "#/components/schemas/soulfire.v1.ScriptNode",
        scriptProperties.path("nodes").path("items").path("$ref").asText()
      );
      assertFalse(scriptProperties.has("instanceId"));
      assertFalse(scriptProperties.has("instance_id"));

      var authChain = findPropertySchema(openApi, "authChain");
      assertNotNull(authChain);
      assertEquals("object", authChain.path("type").asText());
      assertTrue(authChain.path("additionalProperties").asBoolean());

      var value = findPropertySchema(openApi, "value");
      assertNotNull(value);
      assertFalse(value.has("type"));
      assertEquals("google.protobuf.Value", value.path("x-protobuf-type").asText());
    }
  }

  private static ObjectNode findPropertySchema(ObjectNode openApi, String propertyName) {
    var schemas = openApi.path("components").path("schemas");
    if (!(schemas instanceof ObjectNode objectNode)) {
      return null;
    }

    var iterator = objectNode.properties().iterator();
    while (iterator.hasNext()) {
      var schema = iterator.next().getValue();
      var property = schema.path("properties").path(propertyName);
      if (property instanceof ObjectNode propertyNode) {
        return propertyNode;
      }
    }

    return null;
  }
}
