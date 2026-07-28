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

import java.util.List;
import java.util.Objects;
import java.util.Optional;

/// Compatibility and package metadata advertised with a plugin API.
public record PluginSdkMetadata(
  String requiredSoulFireVersion,
  int apiMajorVersion,
  Stability stability,
  Optional<String> typescriptPackage,
  Optional<String> pythonPackage,
  Optional<String> mavenArtifact,
  Optional<String> documentationUrl,
  Optional<String> sourceUrl,
  List<String> eventTypeUrls,
  List<String> taskTypeUrls
) {
  public PluginSdkMetadata {
    Objects.requireNonNull(requiredSoulFireVersion, "requiredSoulFireVersion");
    Objects.requireNonNull(stability, "stability");
    Objects.requireNonNull(typescriptPackage, "typescriptPackage");
    Objects.requireNonNull(pythonPackage, "pythonPackage");
    Objects.requireNonNull(mavenArtifact, "mavenArtifact");
    Objects.requireNonNull(documentationUrl, "documentationUrl");
    Objects.requireNonNull(sourceUrl, "sourceUrl");
    eventTypeUrls = List.copyOf(eventTypeUrls);
    taskTypeUrls = List.copyOf(taskTypeUrls);
    if (apiMajorVersion < 1) {
      throw new IllegalArgumentException("Plugin API major version must be positive");
    }
  }

  public static PluginSdkMetadata experimental() {
    return new PluginSdkMetadata(
      "*",
      1,
      Stability.EXPERIMENTAL,
      Optional.empty(),
      Optional.empty(),
      Optional.empty(),
      Optional.empty(),
      Optional.empty(),
      List.of(),
      List.of()
    );
  }

  public enum Stability {
    EXPERIMENTAL,
    BETA,
    STABLE,
    DEPRECATED
  }
}
