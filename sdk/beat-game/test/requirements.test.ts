import { describe, expect, it } from "vitest";

import {
  BeatGamePhase,
  defaultBeatGameStrategy,
  PortalStrategy,
  requirementsForPhase,
} from "../src/index.js";
import { observation } from "./fixtures.js";

describe("beat-game requirements", () => {
  it("counts interchangeable item choices without double counting tags", () => {
    const inventory = observation({
      counts: {
        "minecraft:cooked_beef": 4,
        "minecraft:bread": 3,
      },
    }).inventory;

    const food = requirementsForPhase(
      BeatGamePhase.PREPARE_OVERWORLD,
      inventory,
      defaultBeatGameStrategy,
    ).find(({ key }) => key === "food");

    expect(food?.currentCount).toBe(7);
    expect(food?.satisfied).toBe(false);
  });

  it("requires a compact cooked reserve before leaving initial preparation", () => {
    const food = requirementsForPhase(
      BeatGamePhase.PREPARE_OVERWORLD,
      observation({
        counts: {
          "minecraft:cooked_mutton": 7,
          "minecraft:mutton": 64,
        },
      }).inventory,
      defaultBeatGameStrategy,
    ).find(({ key }) => key === "food");

    expect(food).toMatchObject({
      currentCount: 7,
      targetCount: 8,
      satisfied: false,
    });
  });

  it("orders missing requirements by explicit planner priority", () => {
    const requirements = requirementsForPhase(
      BeatGamePhase.PREPARE_OVERWORLD,
      observation().inventory,
      defaultBeatGameStrategy,
    );

    expect(requirements.map(({ key }) => key)).toEqual([
      "logs",
      "cobblestone",
      "melee-weapon",
      "food",
      "iron",
      "pickaxe",
      "shield",
      "water-bucket",
      "ignition",
    ]);
  });

  it("shrinks the bootstrap log reserve as durable equipment comes online", () => {
    const logRequirement = (
      counts: Readonly<Record<string, number>>,
    ) =>
      requirementsForPhase(
        BeatGamePhase.PREPARE_OVERWORLD,
        observation({ counts }).inventory,
        defaultBeatGameStrategy,
      ).find(({ key }) => key === "logs");

    expect(logRequirement({})).toMatchObject({
      targetCount: 8,
      satisfied: false,
    });
    expect(logRequirement({
      "minecraft:wooden_pickaxe": 1,
      "minecraft:oak_log": 4,
    })).toMatchObject({
      targetCount: 4,
      satisfied: true,
    });
    expect(logRequirement({
      "minecraft:stone_pickaxe": 1,
      "minecraft:raw_iron": 7,
      "minecraft:oak_log": 2,
    })).toMatchObject({
      targetCount: 2,
      satisfied: true,
    });
    expect(logRequirement({
      "minecraft:wooden_pickaxe": 1,
      "minecraft:cooked_chicken": 8,
      "minecraft:oak_log": 3,
    })).toMatchObject({
      targetCount: 3,
      satisfied: true,
    });
    expect(logRequirement({
      "minecraft:shield": 1,
    })).toMatchObject({
      targetCount: 0,
      satisfied: true,
    });
  });

  it("requires a diamond pickaxe before mining an obsidian frame", () => {
    const strategy = {
      ...defaultBeatGameStrategy,
      portalStrategy: PortalStrategy.OBSIDIAN,
    };

    expect(requirementsForPhase(
      BeatGamePhase.ENTER_NETHER,
      observation().inventory,
      strategy,
    ).map(({ key }) => key)).toEqual([
      "diamond-pickaxe",
      "obsidian",
      "water-bucket",
      "ignition",
    ]);

    expect(requirementsForPhase(
      BeatGamePhase.ENTER_NETHER,
      observation({
        counts: {
          "minecraft:diamond_pickaxe": 1,
          "minecraft:obsidian": strategy.targetObsidianCount,
        },
      }).inventory,
      strategy,
    ).map(({ key }) => key)).not.toContain("diamond-pickaxe");
  });
});
