import { describe, expect, it } from "vitest";

import {
  buildSmokeActivePathDiagnostics,
  buildSmokeDecisionDiagnostics,
  buildSmokeSpatialDiagnostics,
  buildSmokeStuckDiagnostics,
  summarizeSmokeEnvironment,
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
      reason:
        "The action is processing the newest eligible corpse; 1 death location remains in checkpoint memory",
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
        inventoryItemCount: 1,
      }],
      recoveryCandidate: {
        key: "death-1",
        inventoryItemCount: 1,
        status: "active",
        sameDimension: true,
        reason: "Corpse recovery is the active planner action",
      },
    });
  });

  it("explains when a valuable corpse is deferred for survival needs", () => {
    const playerObservation = observation({
      food: 8,
      position: origin,
    });
    const requirement = {
      key: "food-supply",
      itemIds: ["minecraft:cooked_beef"],
      tags: [],
      targetCount: 4,
      currentCount: 0,
      priority: 112,
      satisfied: false,
    } as const;
    const state = checkpoint(BeatGamePhase.ENTER_NETHER, {
      planner: {
        ...checkpoint(BeatGamePhase.ENTER_NETHER).planner,
        currentAction: "satisfy:food-supply",
        requirements: [requirement],
      },
      memory: {
        ...checkpoint(BeatGamePhase.ENTER_NETHER).memory,
        deathPositions: [{
          key: "valuable-death",
          value: {
            x: 40,
            y: -20,
            z: -44,
            dimension: "minecraft:overworld",
            inventoryCounts: {
              "minecraft:iron_pickaxe": 1,
              "minecraft:cobblestone": 64,
            },
          },
          observedAt: "2026-08-03T10:00:00.000Z",
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
        action: "satisfy:food-supply",
        requirement,
      },
    });

    expect(diagnostics.blockers.recoveryCandidate).toMatchObject({
      key: "valuable-death",
      status: "deferred",
      sameDimension: true,
      horizontalDistance: 50,
      verticalDistance: -84,
      reason:
        "Corpse recovery is deferred while food 8 is at or below the eating threshold 14",
    });
  });
});

describe("smoke environment diagnostics", () => {
  it("reports the current day phase and weather without losing game time", () => {
    expect(summarizeSmokeEnvironment({
      clocks: new Map(),
      gameTime: 36_500n,
      raining: true,
      rainLevel: 0.75,
    })).toEqual({
      clocks: [],
      gameTime: 36_500n,
      dayTime: 12_500,
      dayPhase: "dusk",
      isDay: false,
      isNight: false,
      isHostileNight: false,
      raining: true,
      rainLevel: 0.75,
    });
  });

  it("distinguishes dawn from the hostile night window", () => {
    expect(summarizeSmokeEnvironment({
      clocks: new Map(),
      gameTime: 47_945n,
    })).toEqual({
      clocks: [],
      gameTime: 47_945n,
      dayTime: 23_945,
      dayPhase: "dawn",
      isDay: false,
      isNight: false,
      isHostileNight: false,
    });
  });
});

describe("smoke stuck diagnostics", () => {
  it("distinguishes a stalled path and repeated replan loop from slow progress", () => {
    const capturedAt = "2026-08-03T10:05:00.000Z";
    const repeatedFailure = (seconds: number) => ({
      observedAt: `2026-08-03T10:04:${String(seconds).padStart(2, "0")}.000Z`,
      kind: "beat-game-event",
      event: {
        type: "action-failed",
        action: "recover-death",
        detail: "still searching for enough travel food",
      },
    });

    const diagnostics = buildSmokeStuckDiagnostics({
      capturedAt,
      currentAction: "recover-death",
      activePath: {
        pathId: "path-1",
        elapsedMs: 20_000,
        displacementFromOrigin: 0.25,
        distanceToGoal: 18,
      },
      activity: [
        {
          observedAt: "2026-08-03T10:03:00.000Z",
          kind: "beat-game-event",
          event: { type: "action-started", action: "recover-death" },
        },
        repeatedFailure(10),
        repeatedFailure(20),
        repeatedFailure(30),
      ],
    });

    expect(diagnostics.status).toBe("stuck");
    expect(diagnostics.action).toMatchObject({
      name: "recover-death",
      ageMs: 120_000,
    });
    expect(diagnostics.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "path-no-displacement" }),
      expect.objectContaining({ code: "repeated-replan-reason" }),
    ]));
  });

  it("detects task progress that remains frozen across observations", () => {
    const taskProgress = (observedAt: string) => ({
      observedAt,
      kind: "task-progress-observed",
      task: {
        taskId: "task-1",
        progress: {
          current: "4",
          total: "20",
          fraction: 0.2,
          message: "Following route",
        },
      },
    });
    const diagnostics = buildSmokeStuckDiagnostics({
      capturedAt: "2026-08-03T10:00:20.000Z",
      currentAction: "satisfy:logs",
      activity: [
        {
          observedAt: "2026-08-03T10:00:00.000Z",
          kind: "beat-game-event",
          event: { type: "action-started", action: "satisfy:logs" },
        },
        taskProgress("2026-08-03T10:00:02.000Z"),
        taskProgress("2026-08-03T10:00:18.000Z"),
      ],
    });

    expect(diagnostics.status).toBe("stuck");
    expect(diagnostics.latestTask).toMatchObject({
      taskId: "task-1",
      current: "4",
      total: "20",
    });
    expect(diagnostics.findings).toContainEqual(expect.objectContaining({
      code: "task-progress-stalled",
    }));
  });

  it("reports a moving active route as progressing", () => {
    const diagnostics = buildSmokeStuckDiagnostics({
      capturedAt: "2026-08-03T10:00:08.000Z",
      currentAction: "satisfy:logs",
      activePath: {
        pathId: "path-2",
        elapsedMs: 8_000,
        displacementFromOrigin: 7,
        distanceToGoal: 3,
      },
      activity: [
        {
          observedAt: "2026-08-03T10:00:00.000Z",
          kind: "beat-game-event",
          event: { type: "action-started", action: "satisfy:logs" },
        },
        {
          observedAt: "2026-08-03T10:00:07.000Z",
          kind: "task-progress-observed",
          task: {
            taskId: "task-2",
            progress: { current: "7", total: "10", fraction: 0.7 },
          },
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      status: "progressing",
      findings: [],
      lastProgressAgeMs: 1_000,
    });
  });

  it("does not report intentionally interrupted routes as failures", () => {
    const interruptedPath = (seconds: number) => ({
      observedAt: `2026-08-03T10:00:${String(seconds).padStart(2, "0")}.000Z`,
      kind: "pathfind-interrupted",
      cause: "All fibers interrupted without errors.",
    });
    const diagnostics = buildSmokeStuckDiagnostics({
      capturedAt: "2026-08-03T10:00:20.000Z",
      currentAction: "satisfy:food",
      activity: [
        {
          observedAt: "2026-08-03T10:00:00.000Z",
          kind: "beat-game-event",
          event: { type: "action-started", action: "satisfy:food" },
        },
        interruptedPath(5),
        interruptedPath(10),
        interruptedPath(15),
      ],
    });

    expect(diagnostics).toMatchObject({
      status: "progressing",
      findings: [],
    });
  });

  it("does not treat an unquantified entity chase as frozen progress", () => {
    const progress = (observedAt: string) => ({
      observedAt,
      kind: "task-progress-observed",
      task: {
        taskId: "attack-1",
        progress: { fraction: 0, message: "Chasing entity" },
      },
    });
    const diagnostics = buildSmokeStuckDiagnostics({
      capturedAt: "2026-08-03T10:00:20.000Z",
      currentAction: "satisfy:food",
      activity: [
        {
          observedAt: "2026-08-03T10:00:00.000Z",
          kind: "beat-game-event",
          event: { type: "action-started", action: "satisfy:food" },
        },
        progress("2026-08-03T10:00:02.000Z"),
        progress("2026-08-03T10:00:18.000Z"),
      ],
    });

    expect(diagnostics.status).toBe("progressing");
    expect(diagnostics.findings).toEqual([]);
  });

  it("allows a batch smelt to remain quiet while the furnace cooks", () => {
    const diagnostics = buildSmokeStuckDiagnostics({
      capturedAt: "2026-08-03T10:02:00.000Z",
      currentAction: "satisfy:food",
      activity: [
        {
          observedAt: "2026-08-03T10:00:00.000Z",
          kind: "beat-game-event",
          event: { type: "action-started", action: "satisfy:food" },
        },
        {
          observedAt: "2026-08-03T10:00:40.000Z",
          kind: "task-progress-observed",
          task: {
            taskId: "smelt-1",
            progress: { fraction: 0, message: "Smelting" },
          },
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      status: "progressing",
      expectedQuietWindowMs: 240_000,
      findings: [],
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
