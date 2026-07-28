import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  activateEndPortal,
  castNetherPortal,
  collectBlocks,
  craftItem,
  createNetherPortalFrame,
  throwEyeOfEnder,
} from "../src/index.js";
import { FakeBeatGameDriver, observation } from "./fixtures.js";

describe("beat-game behavior programs", () => {
  it("delegates reusable collection to the durable generic task", async () => {
    const driver = new FakeBeatGameDriver();

    await Effect.runPromise(collectBlocks(driver, {
      blockIds: ["minecraft:oak_log"],
      count: 4,
      searchRadius: 32,
      path: { allowMining: false },
    }));

    expect(driver.tasks).toEqual([{
      type: "collect-blocks",
      blockIds: ["minecraft:oak_log"],
      tags: [],
      count: 4,
      searchRadius: 32,
    }]);
    expect(driver.activeControlScopes).toBe(0);
    expect(driver.actions.at(-1)).toEqual({ type: "reset-movement" });
  });

  it("derives an eye sample from ordinary item use and entity observation", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      position: { x: 10, z: 20 },
    });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 42,
      entityType: "minecraft:eye_of_ender",
      position: {
        x: 20,
        y: 68,
        z: 30,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0.4, y: 0.2, z: 0.4 },
      alive: true,
      observedAt: "2026-01-01T00:00:01.000Z",
    }];

    const sample = await Effect.runPromise(throwEyeOfEnder(driver, {
      observationDelayMs: 1,
    }));

    expect(sample.origin.x).toBe(10);
    expect(sample.direction.x).toBeCloseTo(Math.SQRT1_2);
    expect(sample.direction.z).toBeCloseTo(Math.SQRT1_2);
    expect(driver.actions.map(({ type }) => type)).toEqual([
      "select-item",
      "look",
      "use-item",
    ]);
    expect(driver.activeControlScopes).toBe(0);
  });

  it("expands craftable recipe dependencies before the requested item", async () => {
    const driver = new FakeBeatGameDriver();
    let planksCrafted = false;
    driver.recipeResolver = (resultItemId) => {
      if (resultItemId === "minecraft:stick") {
        return [{
          recipeId: "stick",
          recipeType: "crafting",
          resultItemId,
          resultCount: 4,
          ingredients: [{
            itemIds: ["minecraft:oak_planks"],
            tags: [],
            count: 2,
          }],
        }];
      }
      if (resultItemId === "minecraft:oak_planks") {
        return [{
          recipeId: "planks",
          recipeType: "crafting",
          resultItemId,
          resultCount: 4,
          ingredients: [{
            itemIds: ["minecraft:oak_log"],
            tags: [],
            count: 1,
          }],
        }];
      }
      return [];
    };
    driver.craftabilityResolver = (recipeId) => {
      if (recipeId === "stick" && !planksCrafted) {
        return {
          canCraft: false,
          maximumCraftCount: 0,
          missing: [{
            itemIds: ["minecraft:oak_planks"],
            tags: [],
            available: 0,
            missing: 2,
          }],
        };
      }
      return {
        canCraft: true,
        maximumCraftCount: 64,
        missing: [],
      };
    };
    driver.taskObserver = (task) => {
      if (task.type === "craft" && task.recipeId === "planks") {
        planksCrafted = true;
      }
    };

    await Effect.runPromise(craftItem(driver, {
      resultItemId: "minecraft:stick",
      count: 4,
    }));

    expect(driver.tasks.filter(({ type }) => type === "craft")).toEqual([
      {
        type: "craft",
        recipeId: "planks",
        count: 1,
      },
      {
        type: "craft",
        recipeId: "stick",
        count: 1,
      },
    ]);
  });

  it("keeps portal geometry in TypeScript", () => {
    const frame = createNetherPortalFrame({
      x: 0,
      y: 64,
      z: 0,
      dimension: "minecraft:overworld",
    }, "z");

    expect(frame.blocks.every(({ dimension }) =>
      dimension === "minecraft:overworld"
    )).toBe(true);
    expect(frame.blocks.some(({ z }) => z === 3)).toBe(true);
  });

  it("pathfinds and verifies custom portal casting steps", async () => {
    const driver = new FakeBeatGameDriver();
    const target = {
      x: 0,
      y: 64,
      z: 0,
      dimension: "minecraft:overworld",
    };
    driver.blockQueryResolver = ({ selector }) =>
      selector.blockIds?.includes("minecraft:obsidian") === true
        ? [{
          blockId: "minecraft:obsidian",
          position: target,
          properties: {},
          diggable: true,
          replaceable: false,
          interactive: false,
          observedAt: "2026-01-01T00:00:01.000Z",
        }]
        : [];

    await Effect.runPromise(castNetherPortal(driver, {
      origin: target,
      ignite: false,
      steps: [{
        itemIds: ["minecraft:lava_bucket"],
        action: {
          type: "interact-block",
          position: { ...target, y: 63 },
          face: "up",
        },
        expectedBlock: {
          position: target,
          blockIds: ["minecraft:obsidian"],
        },
        observationDelayMs: 1,
      }],
    }));

    expect(driver.paths).toHaveLength(1);
    expect(driver.actions.map(({ type }) => type)).toContain(
      "interact-block",
    );
    expect(driver.activeControlScopes).toBe(0);
  });

  it("does not report End portal activation before portal blocks appear", async () => {
    const driver = new FakeBeatGameDriver();
    driver.blockQueryResolver = ({ selector }) =>
      selector.blockIds?.includes("minecraft:end_portal_frame") === true
        ? [{
          blockId: "minecraft:end_portal_frame",
          position: {
            x: 1,
            y: 32,
            z: 1,
            dimension: "minecraft:overworld",
          },
          properties: { eye: "false" },
          diggable: false,
          replaceable: false,
          interactive: true,
          observedAt: "2026-01-01T00:00:01.000Z",
        }]
        : [];

    const exit = await Effect.runPromiseExit(activateEndPortal(driver, {
      confirmationAttempts: 1,
      confirmationDelayMs: 0,
    }));

    expect(exit._tag).toBe("Failure");
    expect(driver.actions).toContainEqual({
      type: "interact-block",
      position: {
        x: 1,
        y: 32,
        z: 1,
        dimension: "minecraft:overworld",
      },
      face: "up",
      hand: "main",
    });
    expect(driver.activeControlScopes).toBe(0);
  });
});
