import { describe, expect, it } from "vitest";

import {
  BeatGamePhase,
  decideBeatGameAction,
  defaultBeatGameStrategy,
} from "../src/index.js";
import { checkpoint, observation } from "./fixtures.js";

describe("beat-game planner", () => {
  it("recovers a death before considering phase requirements", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.PREPARE_OVERWORLD),
      observation: observation({ dead: true }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toEqual({
      type: "recover-death",
      action: "recover-death",
    });
  });

  it("acquires emergency food instead of retreating without regeneration", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.PREPARE_OVERWORLD),
      observation: observation({
        food: 17,
        health: 12,
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "satisfy-requirement",
      action: "satisfy:food",
      requirement: { key: "food" },
    });
  });

  it("cooks raw food before trying to recover at low health", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.PREPARE_OVERWORLD),
      observation: observation({
        counts: { "minecraft:porkchop": 3 },
        food: 17,
        health: 12,
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "satisfy-requirement",
      action: "satisfy:food",
      requirement: { key: "food" },
    });
  });

  it("cooks raw food instead of consuming it at the normal hunger threshold", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.PREPARE_OVERWORLD),
      observation: observation({
        counts: {
          "minecraft:oak_log": defaultBeatGameStrategy.targetLogCount,
          "minecraft:porkchop": 3,
        },
        food: defaultBeatGameStrategy.eatBelowFood,
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "satisfy-requirement",
      action: "satisfy:food",
      requirement: { key: "food" },
    });
  });

  it("cooks a partial raw-food reserve before portal work", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.ENTER_NETHER),
      observation: observation({
        counts: {
          "minecraft:oak_log": defaultBeatGameStrategy.targetLogCount,
          "minecraft:porkchop": 3,
        },
        food: defaultBeatGameStrategy.eatBelowFood,
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "satisfy-requirement",
      action: "satisfy:food",
      requirement: { key: "food" },
    });
  });

  it("gathers cooking prerequisites before preparing raw food while healthy", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.PREPARE_OVERWORLD),
      observation: observation({
        counts: { "minecraft:porkchop": 3 },
        food: defaultBeatGameStrategy.eatBelowFood,
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "satisfy-requirement",
      action: "satisfy:logs",
      requirement: { key: "logs" },
    });
  });

  it("eats raw food when hunger becomes critical", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.PREPARE_OVERWORLD),
      observation: observation({
        counts: { "minecraft:porkchop": 3 },
        food: 6,
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "eat",
      action: "eat",
    });
  });

  it("secures emergency food before phase work when hunger is urgent", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.ENTER_NETHER),
      observation: observation({ food: 10 }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "satisfy-requirement",
      action: "satisfy:food-supply",
      requirement: { key: "food-supply" },
    });
  });

  it("crafts a wooden sword as soon as enough wood is available", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.PREPARE_OVERWORLD),
      observation: observation({
        counts: { "minecraft:oak_log": 2 },
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "satisfy-requirement",
      action: "satisfy:basic-melee-weapon",
      requirement: { key: "basic-melee-weapon" },
    });
  });

  it("defers a small healthy food top-up while required work remains", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.ENTER_NETHER),
      observation: observation({
        counts: {
          "minecraft:cooked_cod": 7,
          "minecraft:oak_log": 8,
          "minecraft:cobblestone": 20,
          "minecraft:stone_sword": 1,
        },
        food: 17,
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "satisfy-requirement",
      action: "satisfy:shield",
      requirement: { key: "shield" },
    });
  });

  it("secures iron before topping up a useful surface food reserve", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.PREPARE_OVERWORLD),
      observation: observation({
        counts: {
          "minecraft:cooked_beef": 5,
          "minecraft:spruce_log": 8,
          "minecraft:cobblestone": 20,
          "minecraft:stone_sword": 1,
          "minecraft:stone_pickaxe": 1,
        },
        food: 20,
        position: { y: 76 },
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "satisfy-requirement",
      action: "satisfy:iron",
      requirement: { key: "iron" },
    });
  });

  it("tops up a deferred food reserve before entering the Nether", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.ENTER_NETHER),
      observation: observation({
        counts: {
          "minecraft:cooked_cod": 7,
          "minecraft:oak_log": 8,
          "minecraft:cobblestone": 20,
          "minecraft:stone_sword": 1,
          "minecraft:iron_ingot": 7,
          "minecraft:shield": 1,
          "minecraft:iron_pickaxe": 1,
          "minecraft:lava_bucket": 1,
          "minecraft:water_bucket": 1,
          "minecraft:flint_and_steel": 1,
        },
        food: 20,
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "satisfy-requirement",
      action: "satisfy:food-supply",
      requirement: { key: "food-supply" },
    });
  });

  it("finishes deep portal work before topping up a healthy food reserve", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.ENTER_NETHER),
      observation: observation({
        counts: {
          "minecraft:cooked_cod": 6,
          "minecraft:oak_log": 8,
          "minecraft:cobblestone": 20,
          "minecraft:stone_sword": 1,
          "minecraft:iron_ingot": 7,
          "minecraft:shield": 1,
          "minecraft:iron_pickaxe": 1,
          "minecraft:lava_bucket": 1,
          "minecraft:water_bucket": 1,
          "minecraft:flint_and_steel": 1,
        },
        food: 20,
        position: { y: -53 },
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "build-and-enter-nether",
      action: "build-and-enter-nether",
    });
  });

  it("keeps a useful deep-work food reserve without abandoning the portal", () => {
    const decision = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.ENTER_NETHER),
      observation: observation({
        counts: {
          "minecraft:cooked_cod": 4,
          "minecraft:oak_log": 8,
          "minecraft:cobblestone": 20,
          "minecraft:stone_sword": 1,
          "minecraft:iron_ingot": 7,
          "minecraft:shield": 1,
          "minecraft:iron_pickaxe": 1,
          "minecraft:lava_bucket": 1,
          "minecraft:water_bucket": 1,
          "minecraft:flint_and_steel": 1,
        },
        food: 20,
        position: { y: -53 },
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "build-and-enter-nether",
      action: "build-and-enter-nether",
    });
  });

  it("recovers in place when current hunger or emergency food can heal", () => {
    const base = checkpoint(BeatGamePhase.PREPARE_OVERWORLD);

    expect(decideBeatGameAction({
      checkpoint: base,
      observation: observation({
        food: 18,
        health: 12,
      }),
      strategy: defaultBeatGameStrategy,
    })).toMatchObject({ type: "retreat" });

    expect(decideBeatGameAction({
      checkpoint: base,
      observation: observation({
        counts: { "minecraft:rotten_flesh": 1 },
        food: 17,
        health: 12,
      }),
      strategy: defaultBeatGameStrategy,
    })).toMatchObject({ type: "retreat" });
  });

  it("advances only after a fresh observation satisfies preparation", () => {
    const base = checkpoint(BeatGamePhase.PREPARE_OVERWORLD);
    const decision = decideBeatGameAction({
      checkpoint: {
        ...base,
        planner: {
          ...base.planner,
          completedActions: ["prepare-equipment"],
        },
      },
      observation: observation({
        counts: {
          "minecraft:cooked_beef": 16,
          "minecraft:oak_log": 8,
          "minecraft:cobblestone": 20,
          "minecraft:stone_sword": 1,
          "minecraft:iron_ingot": 7,
          "minecraft:iron_pickaxe": 1,
          "minecraft:water_bucket": 1,
          "minecraft:flint_and_steel": 1,
          "minecraft:shield": 1,
        },
      }),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({
      type: "advance-phase",
      from: BeatGamePhase.PREPARE_OVERWORLD,
      to: BeatGamePhase.ENTER_NETHER,
    });
  });

  it("handles hunger, low health, and equipment preparation explicitly", () => {
    const counts = {
      "minecraft:cooked_beef": 16,
      "minecraft:oak_log": 8,
      "minecraft:cobblestone": 20,
      "minecraft:stone_sword": 1,
      "minecraft:iron_ingot": 7,
      "minecraft:iron_pickaxe": 1,
      "minecraft:water_bucket": 1,
      "minecraft:flint_and_steel": 1,
      "minecraft:shield": 1,
    };
    const base = checkpoint(BeatGamePhase.PREPARE_OVERWORLD);

    expect(decideBeatGameAction({
      checkpoint: base,
      observation: observation({ counts, food: 10 }),
      strategy: defaultBeatGameStrategy,
    })).toMatchObject({ type: "eat" });

    expect(decideBeatGameAction({
      checkpoint: base,
      observation: observation({ counts, health: 4 }),
      strategy: defaultBeatGameStrategy,
    })).toMatchObject({ type: "retreat" });

    expect(decideBeatGameAction({
      checkpoint: base,
      observation: observation({ counts }),
      strategy: defaultBeatGameStrategy,
    })).toMatchObject({ type: "prepare-equipment" });
  });

  it("uses dimension evidence before advancing through a portal phase", () => {
    const base = checkpoint(BeatGamePhase.ENTER_NETHER);
    const counts = {
      "minecraft:cooked_cod": 8,
      "minecraft:oak_log": 8,
      "minecraft:cobblestone": 20,
      "minecraft:stone_sword": 1,
      "minecraft:iron_ingot": 7,
      "minecraft:shield": 1,
      "minecraft:iron_pickaxe": 1,
      "minecraft:obsidian": 10,
      "minecraft:water_bucket": 1,
      "minecraft:flint_and_steel": 1,
    };

    expect(decideBeatGameAction({
      checkpoint: base,
      observation: observation({ counts }),
      strategy: defaultBeatGameStrategy,
    }).type).toBe("build-and-enter-nether");

    expect(decideBeatGameAction({
      checkpoint: base,
      observation: observation({
        counts,
        dimension: "minecraft:the_nether",
      }),
      strategy: defaultBeatGameStrategy,
    })).toMatchObject({
      type: "advance-phase",
      to: BeatGamePhase.COLLECT_NETHER_RESOURCES,
    });
  });

  it("uses a shared stronghold estimate without making every bot throw eyes", () => {
    const base = checkpoint(BeatGamePhase.LOCATE_STRONGHOLD);
    const decision = decideBeatGameAction({
      checkpoint: {
        ...base,
        memory: {
          ...base.memory,
          strongholdEstimate: {
            x: 1200,
            y: 32,
            z: -800,
            dimension: "minecraft:overworld",
          },
        },
      },
      observation: observation(),
      strategy: defaultBeatGameStrategy,
    });

    expect(decision).toMatchObject({ type: "search-stronghold" });
  });

  it("requires the egg and an observed End exit before completion", () => {
    const collect = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.COLLECT_DRAGON_EGG),
      observation: observation({
        dimension: "minecraft:the_end",
        counts: { "minecraft:torch": 1 },
      }),
      strategy: defaultBeatGameStrategy,
    });
    expect(collect).toMatchObject({ type: "collect-dragon-egg" });

    const advanceToExit = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.COLLECT_DRAGON_EGG),
      observation: observation({
        dimension: "minecraft:the_end",
        counts: {
          "minecraft:torch": 1,
          "minecraft:dragon_egg": 1,
        },
      }),
      strategy: defaultBeatGameStrategy,
    });
    expect(advanceToExit).toMatchObject({
      type: "advance-phase",
      to: BeatGamePhase.EXIT_END,
    });

    const exit = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.EXIT_END),
      observation: observation({
        dimension: "minecraft:the_end",
        counts: { "minecraft:dragon_egg": 1 },
      }),
      strategy: defaultBeatGameStrategy,
    });
    expect(exit).toMatchObject({ type: "exit-end" });

    const complete = decideBeatGameAction({
      checkpoint: checkpoint(BeatGamePhase.EXIT_END),
      observation: observation({
        dimension: "minecraft:overworld",
        counts: { "minecraft:dragon_egg": 1 },
      }),
      strategy: defaultBeatGameStrategy,
    });
    expect(complete).toMatchObject({
      type: "advance-phase",
      to: BeatGamePhase.COMPLETE,
    });
  });
});
