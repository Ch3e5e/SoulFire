import { describe, expect, it } from "vitest";

import {
  buildSmokeActivePathDiagnostics,
  buildSmokeDecisionDiagnostics,
  buildSmokeSpatialDiagnostics,
  summarizeSmokeSpatialDiagnostics,
} from "../smoke/debug-diagnostics.js";
import {
  BeatGamePhase,
  defaultBeatGameStrategy,
} from "../src/index.js";
import { checkpoint, observation } from "./fixtures.js";

const origin = {
  x: 10,
  y: 64,
  z: -4,
  dimension: "minecraft:overworld",
} as const;

describe("smoke spatial diagnostics", () => {
  it("relates world observations and entity motion to one pinned origin", () => {
    const diagnostics = buildSmokeSpatialDiagnostics({
      origin,
      originVelocity: { x: 1, y: 0, z: 0 },
      finalPosition: { ...origin, x: 13, z: 0 },
      localBlockRadius: 5,
      entityRadius: 48,
      surfaceRadius: 12,
      startedAt: "2026-08-03T10:00:00.000Z",
      completedAt: "2026-08-03T10:00:00.250Z",
      blocks: [
        block("minecraft:air", 10, 65, -4, false),
        block("minecraft:stone", 10, 63, -4, true),
        block("minecraft:water", 12, 64, -4, false),
        block("minecraft:stone", 11, 63, -4, true),
      ],
      entities: [
        entity("minecraft:cow", 7, { x: 16, y: 64, z: -4 }, {
          x: 1,
          y: 0,
          z: 0,
        }),
        entity("minecraft:creeper", 8, { x: 14, y: 64, z: -4 }, {
          x: 0,
          y: 0,
          z: 0,
        }),
        {
          ...entity("minecraft:item", 9, { x: 11, y: 64, z: -4 }, {
            x: 0,
            y: 0,
            z: 0,
          }),
          itemId: "minecraft:beef",
        },
      ],
      surface: [
        surface(8, -6, 62, "minecraft:water"),
        surface(10, -4, 64, "minecraft:grass_block"),
        surface(12, -2, 66, "minecraft:stone"),
        {
          x: 14,
          z: 0,
          loaded: false,
          skyLight: 0,
          blockLight: 0,
        },
      ],
    });

    expect(diagnostics.capture).toMatchObject({
      durationMs: 250,
      displacement: 5,
      origin,
    });
    expect(diagnostics.blocks).toMatchObject({
      observed: 4,
      air: 1,
      fluids: 1,
      solid: 2,
      byBlockId: [
        { id: "minecraft:stone", count: 2 },
        { id: "minecraft:air", count: 1 },
        { id: "minecraft:water", count: 1 },
      ],
    });
    expect(diagnostics.entities.items[0]).toMatchObject({
      itemId: "minecraft:beef",
      distance: 1,
      closingSpeed: 1,
    });
    expect(diagnostics.entities.hostile[0]).toMatchObject({
      entityType: "minecraft:creeper",
      distance: 4,
      closingSpeed: 1,
    });
    expect(diagnostics.entities.other[0]).toMatchObject({
      entityType: "minecraft:cow",
      distance: 6,
      closingSpeed: 0,
    });
    expect(diagnostics.surface).toMatchObject({
      observed: 4,
      unloaded: 1,
      minimumY: 62,
      maximumY: 66,
    });

    const summary = summarizeSmokeSpatialDiagnostics(diagnostics);
    expect(summary.blocks.closest.map(({ blockId }) => blockId)).toEqual([
      "minecraft:stone",
      "minecraft:stone",
      "minecraft:water",
    ]);
    expect(summary.entities).toMatchObject({
      observed: 3,
      hostileCount: 1,
      itemCount: 1,
      otherCount: 1,
    });
  });

  it("measures active path progress against the exact traced goal", () => {
    const diagnostics = buildSmokeActivePathDiagnostics({
      pathId: "path-1",
      startedAt: "2026-08-03T10:00:00.000Z",
      origin,
      goal: {
        type: "xz",
        x: 20,
        z: -4,
        dimension: origin.dimension,
        radius: 2,
      },
      policy: {
        allowMining: false,
        allowPlacing: false,
        maxFallDistance: 3,
        maxSearchTimeMs: 30_000,
      },
    }, {
      ...origin,
      x: 16,
    }, "2026-08-03T10:00:01.250Z");

    expect(diagnostics).toMatchObject({
      status: "active",
      pathId: "path-1",
      elapsedMs: 1_250,
      displacementFromOrigin: 6,
      distanceToGoal: 2,
    });
  });
});

describe("smoke decision diagnostics", () => {
  it("explains an active recovery and the action a fresh replan would choose", () => {
    const playerObservation = observation({ food: 18 });
    const requirement = {
      key: "logs",
      itemIds: ["minecraft:oak_log"],
      tags: [],
      targetCount: 4,
      currentCount: 0,
      priority: 120,
      satisfied: false,
    } as const;
    const state = checkpoint(BeatGamePhase.ENTER_NETHER, {
      planner: {
        ...checkpoint(BeatGamePhase.ENTER_NETHER).planner,
        currentAction: "recover-death",
        currentActionId: "recovery-1",
        requirements: [requirement],
      },
      memory: {
        ...checkpoint(BeatGamePhase.ENTER_NETHER).memory,
        deathPositions: [{
          key: "death-1",
          value: {
            x: 100,
            y: 63,
            z: -20,
            dimension: "minecraft:overworld",
            inventoryCounts: { "minecraft:iron_pickaxe": 1 },
          },
          observedAt: "2026-01-01T00:01:00.000Z",
          confidence: 1,
        }],
      },
    });

    const diagnostics = buildSmokeDecisionDiagnostics({
      checkpoint: state,
      observation: playerObservation,
      strategy: defaultBeatGameStrategy,
      nextIfReplanned: {
        type: "satisfy-requirement",
        action: "satisfy:logs",
        requirement,
      },
    });

    expect(diagnostics.activeAction).toMatchObject({
      action: "recover-death",
      actionId: "recovery-1",
      reason: "The action is recovering 1 remembered death location",
    });
    expect(diagnostics.nextIfReplanned).toMatchObject({
      decision: {
        type: "satisfy-requirement",
        action: "satisfy:logs",
        requirement: { key: "logs", missingCount: 4 },
      },
      reason:
        "logs is the highest-priority actionable requirement: 4 missing (0/4, priority 120)",
    });
    if (
      diagnostics.nextIfReplanned.decision.type !== "satisfy-requirement"
    ) {
      throw new Error("Expected a requirement decision");
    }
    expect(diagnostics.nextIfReplanned.decision.requirement)
      .not.toHaveProperty("itemIds");
    expect(diagnostics.blockers).toMatchObject({
      pendingRequirements: [{ key: "logs", missingCount: 4 }],
      rememberedDeaths: [{
        key: "death-1",
        position: { x: 100, y: 63, z: -20 },
      }],
    });
  });
});

function block(
  blockId: string,
  x: number,
  y: number,
  z: number,
  solid: boolean,
) {
  return {
    blockId,
    position: { x, y, z, dimension: origin.dimension },
    properties: {},
    diggable: true,
    replaceable: blockId === "minecraft:air",
    solid,
    interactive: false,
    observedAt: "2026-08-03T10:00:00.100Z",
  };
}

function entity(
  entityType: string,
  networkId: number,
  position: Readonly<{ x: number; y: number; z: number }>,
  velocity: Readonly<{ x: number; y: number; z: number }>,
) {
  return {
    connectionEpoch: "epoch",
    networkId,
    entityType,
    position: { ...position, dimension: origin.dimension },
    velocity,
    alive: true,
    observedAt: "2026-08-03T10:00:00.100Z",
  };
}

function surface(
  x: number,
  z: number,
  surfaceY: number,
  blockId: string,
) {
  return {
    x,
    z,
    loaded: true,
    surfaceY,
    blockId,
    biomeId: "minecraft:plains",
    skyLight: 15,
    blockLight: 0,
  };
}
