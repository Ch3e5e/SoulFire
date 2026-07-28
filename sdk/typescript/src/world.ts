import type {
  DescMessage,
  MessageInitShape,
} from "@bufbuild/protobuf";
import type { CallOptions, Client } from "@connectrpc/connect";

import {
  WorldService,
  type CanSeeBlockRequestSchema,
  type CanSeeBlockResponse,
  type EstimateExplosionDamageRequestSchema,
  type EstimateExplosionDamageResponse,
  type EstimateDigTimeRequestSchema,
  type EstimateDigTimeResponse,
  type GetWorldBlockRequestSchema,
  type GetWorldBlockResponse,
  type GetWorldEntityRequestSchema,
  type GetWorldEntityResponse,
  type QueryBlocksRequestSchema,
  type QueryBlocksResponse,
  type QueryEntitiesRequestSchema,
  type QueryEntitiesResponse,
  type RaycastRequestSchema,
  type RaycastResponse,
} from "./generated/soulfire/world_pb.js";
import type {
  BlockSnapshot,
  EntitySnapshot,
  PlayerSnapshot,
} from "./generated/soulfire/domain_pb.js";

type BotScoped<T extends DescMessage> = Omit<
  MessageInitShape<T>,
  "$typeName" | "botId" | "instanceId"
>;

type PlayerRaycastRequest = Omit<
  BotScoped<typeof RaycastRequestSchema>,
  "direction" | "origin"
>;

export class SoulFireWorld {
  public constructor(
    private readonly instanceId: string,
    private readonly botId: string,
    private readonly client: Client<typeof WorldService>,
  ) {}

  public async player(options?: CallOptions): Promise<PlayerSnapshot> {
    const response = await this.client.getPlayerSnapshot(
      this.scope(),
      options,
    );
    if (response.player === undefined) {
      throw new Error("SoulFire did not return a player snapshot");
    }
    return response.player;
  }

  public block(
    request: BotScoped<typeof GetWorldBlockRequestSchema>,
    options?: CallOptions,
  ): Promise<GetWorldBlockResponse> {
    return this.client.getWorldBlock(
      { ...request, ...this.scope() },
      options,
    );
  }

  public queryBlocks(
    request: BotScoped<typeof QueryBlocksRequestSchema>,
    options?: CallOptions,
  ): Promise<QueryBlocksResponse> {
    return this.client.queryBlocks(
      { ...request, ...this.scope() },
      options,
    );
  }

  public entity(
    request: BotScoped<typeof GetWorldEntityRequestSchema>,
    options?: CallOptions,
  ): Promise<GetWorldEntityResponse> {
    return this.client.getWorldEntity(
      { ...request, ...this.scope() },
      options,
    );
  }

  public queryEntities(
    request: BotScoped<typeof QueryEntitiesRequestSchema>,
    options?: CallOptions,
  ): Promise<QueryEntitiesResponse> {
    return this.client.queryEntities(
      { ...request, ...this.scope() },
      options,
    );
  }

  public raycast(
    request: BotScoped<typeof RaycastRequestSchema>,
    options?: CallOptions,
  ): Promise<RaycastResponse> {
    return this.client.raycast(
      { ...request, ...this.scope() },
      options,
    );
  }

  public raycastFromPlayer(
    request: PlayerRaycastRequest = {},
    options?: CallOptions,
  ): Promise<RaycastResponse> {
    return this.client.raycast(
      { ...request, ...this.scope() },
      options,
    );
  }

  public async blockAtCursor(
    maximumDistance = 256,
    options?: CallOptions,
  ): Promise<BlockSnapshot | undefined> {
    const response = await this.raycastFromPlayer(
      { maximumDistance, includeEntities: false },
      options,
    );
    return response.block;
  }

  public async entityAtCursor(
    maximumDistance = 3.5,
    options?: CallOptions,
  ): Promise<EntitySnapshot | undefined> {
    const response = await this.raycastFromPlayer(
      { maximumDistance, includeEntities: true },
      options,
    );
    return response.entity;
  }

  public estimateExplosionDamage(
    request: BotScoped<typeof EstimateExplosionDamageRequestSchema>,
    options?: CallOptions,
  ): Promise<EstimateExplosionDamageResponse> {
    return this.client.estimateExplosionDamage(
      { ...request, ...this.scope() },
      options,
    );
  }

  public canSeeBlock(
    request: BotScoped<typeof CanSeeBlockRequestSchema>,
    options?: CallOptions,
  ): Promise<CanSeeBlockResponse> {
    return this.client.canSeeBlock(
      { ...request, ...this.scope() },
      options,
    );
  }

  public estimateDigTime(
    request: BotScoped<typeof EstimateDigTimeRequestSchema>,
    options?: CallOptions,
  ): Promise<EstimateDigTimeResponse> {
    return this.client.estimateDigTime(
      { ...request, ...this.scope() },
      options,
    );
  }

  private scope(): { instanceId: string; botId: string } {
    return { instanceId: this.instanceId, botId: this.botId };
  }
}
