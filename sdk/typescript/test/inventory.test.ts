import { create } from "@bufbuild/protobuf";
import {
  createClient,
  createRouterTransport,
} from "@connectrpc/connect";
import { describe, expect, it } from "vitest";

import {
  ContainerSnapshotSchema,
  InventoryArea,
  InventoryRecommendationKind,
  InventoryItemRecommendationSchema,
  InventoryMutationResponseSchema,
  RankInventoryItemsResponseSchema,
  InventoryService,
  type RankInventoryItemsRequest,
  type TransferItemsRequest,
} from "../src/generated/soulfire/inventory_pb.js";
import { SoulFireInventory } from "../src/inventory.js";

describe("SoulFireContainer", () => {
  it("chains revision-safe deposit and withdraw operations", async () => {
    const transfers: TransferItemsRequest[] = [];
    const transport = createRouterTransport(({ service }) => {
      service(InventoryService, {
        openBlockContainer() {
          return response(42, 10n);
        },
        transferItems(request) {
          transfers.push(request);
          return response(42, request.expectedRevision + 1n);
        },
        closeSemanticContainer() {
          return response(0, 13n);
        },
      });
    });
    const inventory = new SoulFireInventory(
      "instance-id",
      "bot-id",
      createClient(InventoryService, transport),
      (options) => options,
    );

    const container = await inventory.open({ x: 1, y: 64, z: 2 });
    await container.deposit({ itemIds: ["minecraft:cobblestone"] }, 32);
    await container.withdraw({ itemIds: ["minecraft:bread"] }, 4);
    await container.close();

    expect(transfers).toHaveLength(2);
    expect(transfers[0]).toMatchObject({
      expectedRevision: 10n,
      from: InventoryArea.PLAYER,
      to: InventoryArea.CONTAINER,
    });
    expect(transfers[1]).toMatchObject({
      expectedRevision: 11n,
      from: InventoryArea.CONTAINER,
      to: InventoryArea.PLAYER,
    });
    expect(container.closed).toBe(true);
  });

  it("requests an explainable best tool for the exact target block", async () => {
    let ranked: RankInventoryItemsRequest | undefined;
    const transport = createRouterTransport(({ service }) => {
      service(InventoryService, {
        rankInventoryItems(request) {
          ranked = request;
          return create(RankInventoryItemsResponseSchema, {
            recommendations: [
              create(InventoryItemRecommendationSchema, {
                score: 2_000,
              }),
            ],
            revision: 12n,
          });
        },
      });
    });
    const inventory = new SoulFireInventory(
      "instance-id",
      "bot-id",
      createClient(InventoryService, transport),
      (options) => options,
    );

    const recommendation = await inventory.bestTool(
      { x: 1, y: 64, z: 2, dimension: "minecraft:overworld" },
      {
        preferHotbar: true,
        preferHighDurability: true,
        preferredEnchantmentIds: ["minecraft:fortune"],
        excludedEnchantmentIds: ["minecraft:vanishing_curse"],
      },
    );

    expect(recommendation?.score).toBe(2_000);
    expect(ranked).toMatchObject({
      kind: InventoryRecommendationKind.TOOL,
      limit: 1,
      targetBlock: {
        x: 1,
        y: 64,
        z: 2,
        dimension: "minecraft:overworld",
      },
      preferHotbar: true,
      preferHighDurability: true,
      preferredEnchantmentIds: ["minecraft:fortune"],
      excludedEnchantmentIds: ["minecraft:vanishing_curse"],
      scope: {
        instanceId: "instance-id",
        botId: "bot-id",
      },
    });
  });
});

function response(containerId: number, revision: bigint) {
  return create(InventoryMutationResponseSchema, {
    container: create(ContainerSnapshotSchema, {
      containerId,
      revision,
    }),
  });
}
