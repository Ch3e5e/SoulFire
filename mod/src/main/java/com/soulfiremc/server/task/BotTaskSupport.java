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
package com.soulfiremc.server.task;

import com.soulfiremc.grpc.generated.EntityReference;
import com.soulfiremc.grpc.generated.EntitySelector;
import com.soulfiremc.grpc.generated.WorldPosition;
import com.soulfiremc.server.bot.BotConnection;
import com.soulfiremc.server.grpc.WorldServiceImpl;
import io.grpc.Status;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import org.checkerframework.checker.nullness.qual.Nullable;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.function.Predicate;
import java.util.stream.StreamSupport;

final class BotTaskSupport {
  private BotTaskSupport() {
  }

  static void validateConnectionEpoch(
    BotConnection bot,
    String requested
  ) {
    if (!requested.isBlank()
      && !bot.connectionEpoch().toString().equals(requested)) {
      throw Status.FAILED_PRECONDITION
        .withDescription("Entity reference belongs to a previous connection")
        .asRuntimeException();
    }
  }

  static Entity findEntity(BotConnection bot, int networkId) {
    var level = bot.minecraft().level;
    return level == null ? null : level.getEntity(networkId);
  }

  static Entity requireEntity(
    BotConnection bot,
    EntityReference reference
  ) {
    validateConnectionEpoch(bot, reference.getConnectionEpoch());
    if (reference.getNetworkId() <= 0) {
      throw Status.INVALID_ARGUMENT
        .withDescription("target.network_id must be positive")
        .asRuntimeException();
    }
    var entity = findEntity(bot, reference.getNetworkId());
    if (entity == null
      || reference.hasUuid()
      && !entity.getUUID().toString().equals(reference.getUuid())) {
      throw Status.NOT_FOUND
        .withDescription("Target entity is not observable")
        .asRuntimeException();
    }
    return entity;
  }

  static WorldPosition position(BotConnection bot) {
    var player = Objects.requireNonNull(
      bot.minecraft().player,
      "Bot player is not available"
    );
    var level = Objects.requireNonNull(
      bot.minecraft().level,
      "Bot level is not available"
    );
    return WorldPosition.newBuilder()
      .setX(player.getX())
      .setY(player.getY())
      .setZ(player.getZ())
      .setDimension(level.dimension().identifier().toString())
      .build();
  }

  static void requireSafeEntitySelector(EntitySelector selector) {
    var constrained = !selector.getEntityTypesList().isEmpty()
      || !selector.getTagsList().isEmpty()
      || !selector.getCategoriesList().isEmpty()
      || selector.hasUuid()
      || selector.hasNetworkId()
      || selector.hasPlayerName()
      || selector.hasCustomName()
      || !selector.getEquippedItemIdsList().isEmpty()
      || !selector.getEffectIdsList().isEmpty()
      || selector.hasOwnerUuid();
    if (!constrained) {
      throw Status.INVALID_ARGUMENT
        .withDescription(
          "entity selector must constrain a type, category, identity, tag, name, equipment, effect, or owner"
        )
        .asRuntimeException();
    }
  }

  static @Nullable Entity nearestMatchingEntity(
    BotConnection bot,
    EntitySelector selector,
    Vec3 origin,
    double radius,
    boolean livingOnly
  ) {
    return nearestMatchingEntity(
      bot,
      selector,
      origin,
      radius,
      livingOnly,
      _ -> true
    );
  }

  static @Nullable Entity nearestMatchingEntity(
    BotConnection bot,
    EntitySelector selector,
    Vec3 origin,
    double radius,
    boolean livingOnly,
    Predicate<Entity> additionalFilter
  ) {
    return matchingEntities(
      bot,
      selector,
      origin,
      radius,
      livingOnly,
      additionalFilter
    ).stream().findFirst().orElse(null);
  }

  static List<Entity> matchingEntities(
    BotConnection bot,
    EntitySelector selector,
    Vec3 origin,
    double radius,
    boolean livingOnly
  ) {
    return matchingEntities(
      bot,
      selector,
      origin,
      radius,
      livingOnly,
      _ -> true
    );
  }

  static List<Entity> matchingEntities(
    BotConnection bot,
    EntitySelector selector,
    Vec3 origin,
    double radius,
    boolean livingOnly,
    Predicate<Entity> additionalFilter
  ) {
    var level = Objects.requireNonNull(
      bot.minecraft().level,
      "Bot level is not available"
    );
    var player = Objects.requireNonNull(
      bot.minecraft().player,
      "Bot player is not available"
    );
    return StreamSupport.stream(
        level.entitiesForRendering().spliterator(),
        false
      )
      .filter(entity -> entity != player)
      .filter(entity -> !livingOnly || entity instanceof LivingEntity)
      .filter(Entity::isAlive)
      .filter(additionalFilter)
      .filter(entity -> entity.position().distanceToSqr(origin)
        <= radius * radius)
      .filter(entity -> WorldServiceImpl.matchesEntity(
        bot,
        entity,
        selector,
        origin
      ))
      .sorted(Comparator.comparingDouble(
        entity -> entity.position().distanceToSqr(origin)
      ))
      .toList();
  }
}
