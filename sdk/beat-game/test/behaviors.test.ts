import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  activateEndPortal,
  attackNearest,
  BeatGameDriverError,
  buildNetherPortal,
  castNetherPortal,
  collectDragonEgg,
  collectBlocks,
  collectNearbyDrops,
  craftItem,
  createNetherPortalFrame,
  eatWhenNeeded,
  enterEndPortal,
  enterPortal,
  exitEnd,
  excavateStaircase,
  fightEnderDragon,
  respawnAndRecover,
  throwEyeOfEnder,
} from "../src/index.js";
import {
  blockObservation,
  FakeBeatGameDriver,
  installStaircaseMovementSimulation,
  observation,
} from "./fixtures.js";

function installPortalWorld(
  driver: FakeBeatGameDriver,
  frame: ReturnType<typeof createNetherPortalFrame>,
  options: {
    readonly initialBlocks?: readonly ReturnType<
      typeof blockObservation
    >[];
    readonly rejectFirstPlacementAt?: ReturnType<
      typeof createNetherPortalFrame
    >["blocks"][number];
  } = {},
) {
  const key = (
    position: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly dimension: string;
    },
  ) =>
    `${position.dimension}:${position.x}:${position.y}:${position.z}`;
  const blocks = new Map(
    (options.initialBlocks ?? []).map((block) => [
      key(block.position),
      block,
    ]),
  );
  const placementAttempts = new Map<string, number>();
  let portalActive = false;
  let rejectedPlacement = false;

  driver.blockQueryResolver = ({ center, selector }) => {
    if (selector.blockIds?.includes("minecraft:obsidian") === true) {
      return [...blocks.values()].filter(({ blockId }) =>
        blockId === "minecraft:obsidian"
      );
    }
    if (selector.blockIds?.includes("minecraft:nether_portal") === true) {
      const interior = frame.interior[0];
      return portalActive && interior !== undefined
        ? [blockObservation(interior, {
          blockId: "minecraft:nether_portal",
          diggable: false,
          replaceable: false,
        })]
        : [];
    }
    const position = {
      x: Math.floor(center.x),
      y: Math.floor(center.y),
      z: Math.floor(center.z),
      dimension: center.dimension,
    };
    return [blocks.get(key(position)) ?? blockObservation(position, {
      blockId: "minecraft:air",
      replaceable: true,
    })];
  };
  driver.actionObserver = (action) => {
    if (action.type === "dig-block") {
      blocks.delete(key(action.position));
      return;
    }
    if (action.type === "interact-block") {
      portalActive = true;
      return;
    }
    if (action.type !== "place-block") {
      return;
    }
    const offset = {
      down: { x: 0, y: -1, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      north: { x: 0, y: 0, z: -1 },
      south: { x: 0, y: 0, z: 1 },
      west: { x: -1, y: 0, z: 0 },
      east: { x: 1, y: 0, z: 0 },
    }[action.face];
    const target = {
      x: action.against.x + offset.x,
      y: action.against.y + offset.y,
      z: action.against.z + offset.z,
      dimension: action.against.dimension,
    };
    const targetKey = key(target);
    placementAttempts.set(
      targetKey,
      (placementAttempts.get(targetKey) ?? 0) + 1,
    );
    if (
      !rejectedPlacement
      && options.rejectFirstPlacementAt !== undefined
      && targetKey === key(options.rejectFirstPlacementAt)
    ) {
      rejectedPlacement = true;
      return;
    }
    const selection = driver.actions.findLast((candidate) =>
      candidate.type === "select-item"
    );
    const itemId = selection?.type === "select-item"
      ? selection.selector.itemIds?.[0]
      : undefined;
    if (itemId === undefined) {
      throw new Error("Portal placement did not select a block");
    }
    blocks.set(targetKey, blockObservation(target, { blockId: itemId }));
  };

  return { blocks, key, placementAttempts };
}

function queriedBlockPosition(
  center: Readonly<{
    x: number;
    y: number;
    z: number;
    dimension: string;
  }>,
) {
  return {
    x: Math.floor(center.x),
    y: Math.floor(center.y),
    z: Math.floor(center.z),
    dimension: center.dimension,
  };
}

describe("beat-game behavior programs", () => {
  it("bounds recovery eating and completes when supplies run out", async () => {
    const driver = new FakeBeatGameDriver();

    await Effect.runPromise(eatWhenNeeded(driver, {
      foodLevel: 18,
      maximumMeals: 8,
      completeWhenNoFood: true,
      restoreSelectedSlot: true,
    }));

    expect(driver.tasks).toEqual([{
      type: "auto-eat",
      foodItemIds: [],
      foodLevel: 18,
      maximumMeals: 8,
      completeWhenNoFood: true,
      restoreSelectedSlot: true,
    }]);
  });

  it("returns to the death site before searching for dropped items", async () => {
    const driver = new FakeBeatGameDriver();
    const deathPosition = {
      x: 96,
      y: 63,
      z: -48,
      dimension: "minecraft:overworld",
    };
    const dropPosition = {
      x: 97,
      y: 63,
      z: -48,
      dimension: "minecraft:overworld",
    };
    driver.currentObservation = observation({
      dead: true,
      health: 0,
      position: deathPosition,
    });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 24,
      entityType: "minecraft:item",
      position: dropPosition,
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 5,
      observedAt: "2026-01-01T00:00:00.000Z",
    }];

    await Effect.runPromise(respawnAndRecover(driver, {
      deathPosition,
    }));

    expect(driver.tasks).toContainEqual({
      type: "auto-respawn",
      maximumRespawns: 1,
    });
    expect(driver.paths.map(({ position }) => position)).toEqual([
      deathPosition,
      dropPosition,
    ]);
    expect(driver.entityQueries).toContainEqual({
      origin: deathPosition,
      radius: 24,
      selector: { alive: true, categories: [6] },
      maximumResults: 64,
    });
  });

  it("sweeps nearby item entities into pickup range", async () => {
    const driver = new FakeBeatGameDriver();
    const position = {
      x: 4,
      y: 64,
      z: -2,
      dimension: "minecraft:overworld",
    };
    driver.currentObservation = observation({ position });
    driver.entityResults = [
      {
        connectionEpoch: "epoch-1",
        networkId: 10,
        entityType: "minecraft:item",
        itemId: "minecraft:mutton",
        position: {
          x: 6,
          y: 64,
          z: -2,
          dimension: "minecraft:overworld",
        },
        velocity: { x: 0, y: 0, z: 0 },
        alive: true,
        observedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        connectionEpoch: "epoch-1",
        networkId: 11,
        entityType: "minecraft:sheep",
        position: {
          x: 7,
          y: 64,
          z: -2,
          dimension: "minecraft:overworld",
        },
        velocity: { x: 0, y: 0, z: 0 },
        alive: true,
        observedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    await Effect.runPromise(collectNearbyDrops(driver, {
      settleDelayMs: 0,
    }));

    expect(driver.entityQueries).toEqual([{
      origin: position,
      radius: 8,
      selector: {
        entityTypes: ["minecraft:item"],
        alive: true,
      },
      maximumResults: 16,
    }]);
    expect(driver.paths).toEqual([expect.objectContaining({
      position: driver.entityResults[0]?.position,
      radius: 1.5,
    })]);
    expect(driver.maximumActiveControlScopes).toBe(1);
  });

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

  it("carves and follows each level of a descending staircase", async () => {
    const driver = new FakeBeatGameDriver();
    driver.blockQueryResolver = ({ center }) => [
      blockObservation(queriedBlockPosition(center)),
    ];
    const from = {
      x: 4,
      y: 10,
      z: 1,
      dimension: "minecraft:overworld",
    };
    const to = {
      x: 2,
      y: 6,
      z: 3,
      dimension: "minecraft:overworld",
    };

    installStaircaseMovementSimulation(driver, from);
    driver.currentObservation = {
      ...driver.currentObservation,
      player: {
        ...driver.currentObservation.player,
        velocity: {
          ...driver.currentObservation.player.velocity,
          y: -0.0784000015258789,
        },
      },
    };
    await Effect.runPromise(excavateStaircase(driver, { from, to }));

    expect(driver.paths.map(({ position, radius }) => ({
      position,
      radius,
    }))).toEqual([
      { position: from, radius: 0.5 },
      {
            position: { ...from, x: 3, y: 9 },
            radius: 0.5,
      },
      {
            position: { ...from, x: 3, y: 8, z: 2 },
            radius: 0.5,
      },
      {
            position: { ...from, x: 2, y: 7, z: 2 },
            radius: 0.5,
      },
      { position: to, radius: 0.5 },
    ]);
    expect(driver.actions.filter(({ type }) => type === "dig-block"))
      .toHaveLength(12);
    expect(driver.paths.slice(1).every(({ policy }) =>
      !policy.allowMining
      && !policy.allowPlacing
      && policy.maxFallDistance === 1
    )).toBe(true);
    expect(driver.actions).toContainEqual({
      type: "dig-block",
      position: { ...from, x: 3, y: 11 },
    });
    expect(driver.actions[0]).toMatchObject({
      type: "select-item",
      selector: {
        itemIds: expect.arrayContaining(["minecraft:diamond_pickaxe"]),
      },
    });
    expect(driver.activeControlScopes).toBe(0);
  });

  it("delegates staircase tread movement to constrained pathfinding", async () => {
    const driver = new FakeBeatGameDriver();
    driver.blockQueryResolver = ({ center }) => [
      blockObservation(queriedBlockPosition(center)),
    ];
    const from = {
      x: 0,
      y: 3,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const to = {
      x: 0,
      y: 2,
      z: 1,
      dimension: "minecraft:overworld",
    };

    installStaircaseMovementSimulation(driver, from);
    await Effect.runPromise(excavateStaircase(driver, { from, to }));

    expect(driver.paths).toEqual([
      expect.objectContaining({ position: from, radius: 0.5 }),
      expect.objectContaining({
        position: to,
        radius: 0.5,
        policy: expect.objectContaining({
          allowMining: false,
          allowPlacing: false,
          maxFallDistance: 1,
        }),
      }),
    ]);
    expect(driver.actions.some(({ type }) => type === "set-movement"))
      .toBe(false);
    expect(driver.currentObservation.player.position).toMatchObject({
      y: 2,
      dimension: "minecraft:overworld",
    });
  });

  it("absorbs an adjacent staging result into the staircase endpoint", async () => {
    const driver = new FakeBeatGameDriver();
    driver.blockQueryResolver = ({ center }) => [
      blockObservation(queriedBlockPosition(center)),
    ];
    const from = {
      x: 0,
      y: 3,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const requestedTo = {
      x: 0,
      y: 2,
      z: 1,
      dimension: "minecraft:overworld",
    };

    installStaircaseMovementSimulation(driver, from);
    const resolvePath = driver.pathResolver;
    let pathCount = 0;
    driver.pathResolver = (position, radius, policy) =>
      resolvePath(position, radius, policy).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            pathCount += 1;
            if (pathCount !== 1) {
              return;
            }
            driver.currentObservation = observation({
              position: {
                x: from.x + 1.5,
                y: from.y,
                z: from.z + 0.5,
                dimension: from.dimension,
              },
            });
          })
        ),
      );

    await Effect.runPromise(excavateStaircase(driver, {
      from,
      to: requestedTo,
    }));

    expect(driver.actions).toContainEqual({
      type: "dig-block",
      position: {
        x: 1,
        y: 2,
        z: 1,
        dimension: "minecraft:overworld",
      },
    });
    expect(driver.paths.at(-1)).toMatchObject({
      position: requestedTo,
      radius: 2,
    });
  });

  it("continues from a settled fall instead of climbing to a stale start", async () => {
    const driver = new FakeBeatGameDriver();
    driver.blockQueryResolver = ({ center }) => [
      blockObservation(queriedBlockPosition(center)),
    ];
    const plannedFrom = {
      x: 0,
      y: 12,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const settledFrom = {
      ...plannedFrom,
      y: 8,
    };
    const to = {
      ...plannedFrom,
      y: 6,
      z: 2,
    };

    installStaircaseMovementSimulation(driver, plannedFrom);
    const resolveObservation = driver.observationResolver;
    let observations = 0;
    driver.observationResolver = () =>
      resolveObservation().pipe(
        Effect.map((current) => {
          observations += 1;
          if (observations > 4) {
            return current;
          }
          const falling = observations === 1;
          const position = falling ? { ...settledFrom, y: 10 } : settledFrom;
          driver.currentObservation = {
            ...current,
            player: {
              ...current.player,
              position: {
                ...position,
                x: position.x + 0.5,
                z: position.z + 0.5,
              },
              velocity: {
                ...current.player.velocity,
                y: falling ? -1 : 0,
              },
            },
          };
          return driver.currentObservation;
        }),
      );

    await Effect.runPromise(excavateStaircase(driver, {
      from: plannedFrom,
      to,
    }));

    expect(driver.paths).not.toContainEqual(expect.objectContaining({
      position: plannedFrom,
    }));
    expect(driver.paths[0]).toMatchObject({
      position: {
        ...settledFrom,
        y: 7,
        z: 1,
      },
      radius: 0.5,
    });
  });

  it("hands off to normal pathfinding after breaking into a lower room", async () => {
    const driver = new FakeBeatGameDriver();
    driver.blockQueryResolver = ({ center }) => [
      blockObservation(queriedBlockPosition(center)),
    ];
    const from = {
      x: 0,
      y: 5,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const firstStep = {
      ...from,
      y: 4,
      z: 1,
    };
    const to = {
      ...from,
      y: 3,
      z: 2,
    };

    installStaircaseMovementSimulation(driver, from);
    const resolvePath = driver.pathResolver;
    driver.pathResolver = (position, radius, policy) => {
      if (
        position.x === firstStep.x
        && position.y === firstStep.y
        && position.z === firstStep.z
        && !policy.allowMining
      ) {
        return Effect.sync(() => {
          driver.paths.push({ position, radius, policy });
          driver.currentObservation = {
            ...driver.currentObservation,
            player: {
              ...driver.currentObservation.player,
              position: {
                ...position,
                y: position.y - 3,
              },
            },
          };
        }).pipe(
          Effect.zipRight(Effect.fail(new BeatGameDriverError({
            operation: "pathfind",
            retryable: true,
            message: "fell into an existing room",
          }))),
        );
      }
      return resolvePath(position, radius, policy);
    };

    await Effect.runPromise(excavateStaircase(driver, { from, to }));

    expect(driver.paths).toContainEqual(expect.objectContaining({
      position: firstStep,
      radius: 0.5,
      policy: expect.objectContaining({
        allowMining: false,
        allowPlacing: false,
      }),
    }));
    expect(driver.paths.at(-1)).toMatchObject({
      position: to,
      radius: 4,
      policy: expect.objectContaining({
        allowMining: true,
        allowPlacing: true,
      }),
    });
  });

  it("uses a broad detour when the staircase is deeper than its span", async () => {
    const driver = new FakeBeatGameDriver();
    driver.blockQueryResolver = ({ center }) => [
      blockObservation(queriedBlockPosition(center)),
    ];
    const from = {
      x: 0,
      y: 10,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const to = {
      x: 0,
      y: 4,
      z: 2,
      dimension: "minecraft:overworld",
    };

    installStaircaseMovementSimulation(driver, from);
    await Effect.runPromise(excavateStaircase(driver, { from, to }));

    expect(driver.paths).toHaveLength(7);
    expect(driver.paths[0]?.position).toEqual(from);
    expect(driver.paths.at(-1)?.position).toEqual(to);
    expect(driver.paths.slice(1).every(({ policy }) =>
      !policy.allowMining
      && !policy.allowPlacing
      && policy.maxFallDistance === 1
    )).toBe(true);
  });

  it("bridges a missing staircase floor before opening the tunnel", async () => {
    const driver = new FakeBeatGameDriver();
    const from = {
      x: 0,
      y: 3,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const to = {
      x: 1,
      y: 2,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const support = { ...to, y: 1 };
    const previousSupport = { ...from, y: 2 };
    let supportPlaced = false;
    let treadPlaced = false;
    driver.currentObservation = observation({
      counts: { "minecraft:cobblestone": 2 },
    });
    driver.actionObserver = (action) => {
      if (
        action.type === "place-block"
        && action.against.x === previousSupport.x
        && action.against.y === previousSupport.y
        && action.against.z === previousSupport.z
      ) {
        if (driver.actions.some(({ type }) => type === "dig-block")) {
          throw new Error("Staircase opened before its tread was built");
        }
        treadPlaced = true;
      }
      if (
        action.type === "place-block"
        && action.against.x === to.x
        && action.against.y === to.y
        && action.against.z === to.z
        && action.face === "down"
      ) {
        if (!treadPlaced) {
          throw new Error("Support was placed before its tread");
        }
        supportPlaced = true;
      }
    };
    driver.blockQueryResolver = ({ center, selector }) => {
      const position = queriedBlockPosition(center);
      if (
        position.x === support.x
        && position.y === support.y
        && position.z === support.z
      ) {
        if (selector.replaceable === false && !supportPlaced) {
          return [];
        }
        return [blockObservation(support, supportPlaced
          ? { blockId: "minecraft:cobblestone" }
          : {
            blockId: "minecraft:air",
            diggable: true,
            replaceable: true,
          })];
      }
      if (
        position.x === to.x
        && position.y === to.y
        && position.z === to.z
      ) {
        return [blockObservation(to, treadPlaced
          ? { blockId: "minecraft:cobblestone" }
          : {
            blockId: "minecraft:air",
            diggable: true,
            replaceable: true,
          })];
      }
      if (
        position.x === previousSupport.x
        && position.y === previousSupport.y
        && position.z === previousSupport.z
      ) {
        return [blockObservation(previousSupport)];
      }
      return [];
    };

    installStaircaseMovementSimulation(driver, from);
    await Effect.runPromise(excavateStaircase(driver, { from, to }));

    expect(driver.actions).toContainEqual({
      type: "place-block",
      against: previousSupport,
      face: "east",
      hand: "main",
    });
    expect(driver.actions).toContainEqual({
      type: "place-block",
      against: to,
      face: "down",
      hand: "main",
    });
    expect(driver.blockQueries.some(({ center, selector }) =>
      center.x === support.x + 0.5
      && center.y === support.y + 0.5
      && center.z === support.z + 0.5
      && selector.replaceable === false
    )).toBe(true);
    expect(driver.paths).toContainEqual(expect.objectContaining({
      position: to,
      radius: 0.5,
    }));
  });

  it("builds a missing staircase support from a lower anchor first", async () => {
    const driver = new FakeBeatGameDriver();
    const from = {
      x: 0,
      y: 3,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const to = {
      x: 1,
      y: 2,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const support = { ...to, y: 1 };
    const lowerAnchor = { ...support, y: 0 };
    let supportPlaced = false;
    driver.currentObservation = observation({
      counts: { "minecraft:cobblestone": 1 },
    });
    driver.actionObserver = (action) => {
      if (
        action.type === "place-block"
        && action.against.x === lowerAnchor.x
        && action.against.y === lowerAnchor.y
        && action.against.z === lowerAnchor.z
        && action.face === "up"
      ) {
        supportPlaced = true;
      }
    };
    driver.blockQueryResolver = ({ center, selector }) => {
      const position = queriedBlockPosition(center);
      if (
        position.x === support.x
        && position.y === support.y
        && position.z === support.z
      ) {
        if (selector.replaceable === false && !supportPlaced) {
          return [];
        }
        return [blockObservation(support, supportPlaced
          ? { blockId: "minecraft:cobblestone" }
          : {
            blockId: "minecraft:air",
            replaceable: true,
          })];
      }
      if (
        position.x === to.x
        && position.y === to.y
        && position.z === to.z
      ) {
        return [blockObservation(to, {
          blockId: "minecraft:air",
          replaceable: true,
        })];
      }
      return [blockObservation(position)];
    };

    installStaircaseMovementSimulation(driver, from);
    await Effect.runPromise(excavateStaircase(driver, { from, to }));

    expect(driver.actions).toContainEqual({
      type: "place-block",
      against: lowerAnchor,
      face: "up",
      hand: "main",
    });
    expect(driver.actions).not.toContainEqual({
      type: "place-block",
      against: to,
      face: "down",
      hand: "main",
    });
  });

  it("bridges an open staircase tread from the current safe step", async () => {
    const driver = new FakeBeatGameDriver();
    const from = {
      x: 0,
      y: 4,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const firstStep = { ...from, x: 1, y: 3 };
    const to = { ...from, x: 2, y: 2 };
    const support = { ...to, y: 1 };
    let treadPlaced = false;
    let supportPlaced = false;
    let bridgedFromCurrentStep = false;
    driver.currentObservation = observation({
      counts: { "minecraft:cobblestone": 2 },
    });
    driver.actionObserver = (action) => {
      if (
        action.type === "place-block"
        && action.against.x === firstStep.x
        && action.against.y === firstStep.y - 1
        && action.against.z === firstStep.z
        && action.face === "east"
      ) {
        const current = driver.paths.at(-1)?.position;
        bridgedFromCurrentStep = current?.x === firstStep.x
          && current.y === firstStep.y
          && current.z === firstStep.z
          && current.dimension === firstStep.dimension;
        treadPlaced = true;
      }
      if (
        action.type === "place-block"
        && action.against.x === to.x
        && action.against.y === to.y
        && action.against.z === to.z
        && action.face === "down"
      ) {
        supportPlaced = true;
      }
    };
    driver.blockQueryResolver = ({ center, selector }) => {
      const position = queriedBlockPosition(center);
      if (
        position.x === to.x
        && position.y === to.y
        && position.z === to.z
      ) {
        if (selector.replaceable === false && !treadPlaced) {
          return [];
        }
        return [blockObservation(to, treadPlaced
          ? { blockId: "minecraft:cobblestone" }
          : { blockId: "minecraft:air", replaceable: true })];
      }
      if (
        position.x === support.x
        && position.y === support.y
        && position.z === support.z
      ) {
        if (selector.replaceable === false && !supportPlaced) {
          return [];
        }
        return [blockObservation(support, supportPlaced
          ? { blockId: "minecraft:cobblestone" }
          : { blockId: "minecraft:air", replaceable: true })];
      }
      return [blockObservation(position)];
    };

    installStaircaseMovementSimulation(driver, from);
    await Effect.runPromise(excavateStaircase(driver, { from, to }));

    expect(bridgedFromCurrentStep).toBe(true);
    expect(driver.paths.filter(({ position }) =>
      position.x === from.x
      && position.y === from.y
      && position.z === from.z
      && position.dimension === from.dimension
    )).toHaveLength(1);
  });

  it("hands an open structure interior back to ordinary pathfinding", async () => {
    const driver = new FakeBeatGameDriver();
    const from = {
      x: 0,
      y: 3,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const to = {
      x: 1,
      y: 2,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const support = { ...to, y: 1 };
    driver.currentObservation = observation({
      counts: { "minecraft:cobblestone": 2 },
    });
    driver.blockQueryResolver = ({ center }) => {
      const position = queriedBlockPosition(center);
      if (
        (
          position.x === to.x
          && position.y === to.y
          && position.z === to.z
        )
        || (
          position.x === support.x
          && position.y === support.y
          && position.z === support.z
        )
      ) {
        return [blockObservation(position, {
          blockId: "minecraft:cave_air",
          replaceable: true,
        })];
      }
      return [blockObservation(position)];
    };

    installStaircaseMovementSimulation(driver, from);
    await Effect.runPromise(excavateStaircase(driver, {
      from,
      to,
      openSpaceHandoffRadius: 1,
    }));

    expect(driver.paths).toContainEqual(expect.objectContaining({
      position: to,
      radius: 1,
      policy: expect.objectContaining({
        allowMining: true,
        allowPlacing: true,
      }),
    }));
    expect(driver.actions).not.toContainEqual(expect.objectContaining({
      type: "place-block",
    }));
  });

  it("continues excavating through open space far above the destination", async () => {
    const driver = new FakeBeatGameDriver();
    const from = {
      x: 0,
      y: 12,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const to = {
      x: 10,
      y: 2,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const firstStep = { ...from, x: 1, y: 11 };
    const firstSupport = { ...firstStep, y: 10 };
    const lowerAnchor = { ...firstSupport, y: 9 };
    let supportPlaced = false;
    driver.currentObservation = observation({
      counts: { "minecraft:cobblestone": 2 },
    });
    driver.actionObserver = (action) => {
      if (
        action.type === "place-block"
        && action.against.x === lowerAnchor.x
        && action.against.y === lowerAnchor.y
        && action.against.z === lowerAnchor.z
        && action.face === "up"
      ) {
        supportPlaced = true;
      }
    };
    driver.blockQueryResolver = ({ center, selector }) => {
      const position = queriedBlockPosition(center);
      if (
        position.x === firstStep.x
        && position.y === firstStep.y
        && position.z === firstStep.z
      ) {
        return [blockObservation(position, {
          blockId: "minecraft:cave_air",
          replaceable: true,
        })];
      }
      if (
        position.x === firstSupport.x
        && position.y === firstSupport.y
        && position.z === firstSupport.z
      ) {
        if (selector.replaceable === false && !supportPlaced) {
          return [];
        }
        return [blockObservation(position, supportPlaced
          ? { blockId: "minecraft:cobblestone" }
          : {
            blockId: "minecraft:cave_air",
            replaceable: true,
          })];
      }
      return [blockObservation(position)];
    };

    installStaircaseMovementSimulation(driver, from);
    await Effect.runPromise(excavateStaircase(driver, {
      from,
      to,
      openSpaceHandoffRadius: 1,
    }));

    expect(supportPlaced).toBe(true);
    expect(driver.paths).not.toContainEqual(expect.objectContaining({
      radius: 1,
    }));
    expect(driver.paths.at(-1)?.position).toEqual(to);
  });

  it("reselects and retries a transient staircase support placement", async () => {
    const driver = new FakeBeatGameDriver();
    const from = {
      x: 0,
      y: 3,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const to = {
      x: 1,
      y: 2,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const support = { ...to, y: 1 };
    let placementAttempts = 0;
    let supportPlaced = false;
    driver.currentObservation = observation({
      counts: { "minecraft:cobblestone": 8 },
    });
    driver.actionResolver = (action) => {
      if (
        action.type !== "place-block"
        || action.face !== "down"
        || action.against.x !== to.x
        || action.against.y !== to.y
        || action.against.z !== to.z
      ) {
        return Effect.void;
      }
      placementAttempts += 1;
      if (placementAttempts === 1) {
        return Effect.fail(new BeatGameDriverError({
          operation: "place-block",
          retryable: true,
          message: "transient placement rejection",
        }));
      }
      supportPlaced = true;
      return Effect.void;
    };
    driver.blockQueryResolver = ({ center, selector }) => {
      const position = queriedBlockPosition(center);
      if (
        position.x === support.x
        && position.y === support.y - 1
        && position.z === support.z
      ) {
        return [blockObservation(position, {
          blockId: "minecraft:air",
          replaceable: true,
        })];
      }
      if (
        position.x === support.x
        && position.y === support.y
        && position.z === support.z
      ) {
        if (selector.replaceable === false && !supportPlaced) {
          return [];
        }
        return [blockObservation(support, supportPlaced
          ? { blockId: "minecraft:cobblestone" }
          : {
            blockId: "minecraft:air",
            replaceable: true,
          })];
      }
      return [blockObservation(position)];
    };

    installStaircaseMovementSimulation(driver, from);
    await Effect.runPromise(excavateStaircase(driver, { from, to }));

    expect(placementAttempts).toBe(2);
    expect(driver.actions.filter((action) =>
      action.type === "select-item"
      && action.selector.itemIds?.includes("minecraft:cobblestone")
    )).toHaveLength(2);
  });

  it("clears gravel restored during staircase support placement", async () => {
    const driver = new FakeBeatGameDriver();
    const from = {
      x: 0,
      y: 3,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const to = {
      x: 1,
      y: 2,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const support = { ...to, y: 1 };
    let supportState: "air" | "cobblestone" | "gravel" = "gravel";
    let placementAttempts = 0;
    driver.currentObservation = observation({
      counts: { "minecraft:cobblestone": 8 },
    });
    driver.actionResolver = (action) => {
      if (
        action.type === "dig-block"
        && action.position.x === support.x
        && action.position.y === support.y
        && action.position.z === support.z
      ) {
        supportState = "air";
        return Effect.void;
      }
      if (
        action.type !== "place-block"
        || action.face !== "down"
        || action.against.x !== to.x
        || action.against.y !== to.y
        || action.against.z !== to.z
      ) {
        return Effect.void;
      }
      placementAttempts += 1;
      if (placementAttempts === 1) {
        supportState = "gravel";
        return Effect.fail(new BeatGameDriverError({
          operation: "place-block",
          retryable: true,
          message: "gravel fell back into the support position",
        }));
      }
      supportState = "cobblestone";
      return Effect.void;
    };
    driver.blockQueryResolver = ({ center, selector }) => {
      const position = queriedBlockPosition(center);
      if (
        position.x !== support.x
        || position.y !== support.y
        || position.z !== support.z
      ) {
        return [blockObservation(position)];
      }
      if (
        (selector.replaceable === true && supportState !== "air")
        || (selector.replaceable === false && supportState === "air")
      ) {
        return [];
      }
      return [blockObservation(support, {
        blockId: supportState === "air"
          ? "minecraft:air"
          : `minecraft:${supportState}`,
        replaceable: supportState === "air",
      })];
    };

    installStaircaseMovementSimulation(driver, from);
    await Effect.runPromise(excavateStaircase(driver, { from, to }));

    expect(placementAttempts).toBe(2);
    expect(driver.actions.filter((action) =>
      action.type === "dig-block"
      && action.position.x === support.x
      && action.position.y === support.y
      && action.position.z === support.z
    )).toHaveLength(2);
    expect(supportState).toBe("cobblestone");
  });

  it("replaces a gravity-affected staircase floor before stepping on it", async () => {
    const driver = new FakeBeatGameDriver();
    const from = {
      x: 0,
      y: 3,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const to = {
      x: 1,
      y: 2,
      z: 0,
      dimension: "minecraft:overworld",
    };
    const support = { ...to, y: 1 };
    let supportIsGravel = true;
    driver.currentObservation = observation({
      counts: { "minecraft:cobblestone": 1 },
    });
    driver.actionObserver = (action) => {
      if (action.type === "dig-block" && action.position.y === support.y) {
        supportIsGravel = false;
      }
    };
    driver.blockQueryResolver = ({ center, selector }) => {
      const position = queriedBlockPosition(center);
      if (
        position.x === support.x
        && position.y === support.y
        && position.z === support.z
      ) {
        if (supportIsGravel) {
          return [blockObservation(support, {
            blockId: "minecraft:gravel",
          })];
        }
        return [blockObservation(support, {
          blockId: selector.replaceable === false
            ? "minecraft:cobblestone"
            : "minecraft:air",
          replaceable: selector.replaceable !== false,
        })];
      }
      return [blockObservation(position)];
    };

    installStaircaseMovementSimulation(driver, from);
    await Effect.runPromise(excavateStaircase(driver, { from, to }));

    expect(driver.actions).toContainEqual({
      type: "dig-block",
      position: support,
    });
    expect(driver.actions).toContainEqual({
      type: "place-block",
      against: { ...support, y: support.y - 1 },
      face: "up",
      hand: "main",
    });
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

  it("unlocks the crafting table recipe by producing planks first", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      counts: { "minecraft:oak_log": 1 },
    });
    let planksCrafted = false;
    driver.recipeResolver = (resultItemId) => {
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
      if (
        resultItemId === "minecraft:crafting_table"
        && planksCrafted
      ) {
        return [{
          recipeId: "crafting-table",
          recipeType: "crafting",
          resultItemId,
          resultCount: 1,
          ingredients: [{
            itemIds: ["minecraft:oak_planks"],
            tags: [],
            count: 4,
          }],
        }];
      }
      return [];
    };
    driver.craftabilityResolver = () => ({
      canCraft: true,
      maximumCraftCount: 64,
      missing: [],
    });
    driver.taskObserver = (task) => {
      if (task.type === "craft" && task.recipeId === "planks") {
        planksCrafted = true;
      }
    };

    await Effect.runPromise(craftItem(driver, {
      resultItemId: "minecraft:crafting_table",
      count: 1,
    }));

    expect(driver.tasks.filter(({ type }) => type === "craft")).toEqual([
      {
        type: "craft",
        recipeId: "planks",
        count: 1,
      },
      {
        type: "craft",
        recipeId: "crafting-table",
        count: 1,
      },
    ]);
  });

  it("unlocks the wooden pickaxe recipe by producing sticks first", async () => {
    const driver = new FakeBeatGameDriver();
    let sticksCrafted = false;
    driver.recipeResolver = (resultItemId) => {
      if (resultItemId === "minecraft:stick") {
        return [{
          recipeId: "stick",
          recipeType: "crafting",
          resultItemId,
          resultCount: 4,
          ingredients: [{
            itemIds: ["minecraft:spruce_planks"],
            tags: [],
            count: 2,
          }],
        }];
      }
      if (
        resultItemId === "minecraft:wooden_pickaxe"
        && sticksCrafted
      ) {
        return [{
          recipeId: "wooden-pickaxe",
          recipeType: "crafting",
          resultItemId,
          resultCount: 1,
          ingredients: [
            {
              itemIds: ["minecraft:spruce_planks"],
              tags: [],
              count: 3,
            },
            {
              itemIds: ["minecraft:stick"],
              tags: [],
              count: 2,
            },
          ],
        }];
      }
      return [];
    };
    driver.craftabilityResolver = () => ({
      canCraft: true,
      maximumCraftCount: 64,
      missing: [],
    });
    driver.taskObserver = (task) => {
      if (task.type === "craft" && task.recipeId === "stick") {
        sticksCrafted = true;
      }
    };

    await Effect.runPromise(craftItem(driver, {
      resultItemId: "minecraft:wooden_pickaxe",
      count: 1,
    }));

    expect(driver.tasks.filter(({ type }) => type === "craft")).toEqual([
      {
        type: "craft",
        recipeId: "stick",
        count: 1,
      },
      {
        type: "craft",
        recipeId: "wooden-pickaxe",
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

  it("builds a minimal Nether frame from verified primitive placements", async () => {
    const driver = new FakeBeatGameDriver();
    const origin = {
      x: 10,
      y: 64,
      z: 20,
      dimension: "minecraft:overworld",
    };
    const frame = createNetherPortalFrame(origin);
    const world = installPortalWorld(driver, frame);

    await Effect.runPromise(buildNetherPortal(driver, {
      origin,
      ignite: false,
    }));

    expect(driver.tasks).toHaveLength(0);
    expect(frame.blocks.every((position) =>
      world.blocks.get(world.key(position))?.blockId
        === "minecraft:obsidian"
    )).toBe(true);
    expect(driver.actions.filter(({ type }) => type === "place-block"))
      .toHaveLength(13);
    expect(driver.paths.every(({ policy }) =>
      !policy.allowMining && !policy.allowPlacing
    )).toBe(true);
    expect(driver.paths.every(({ radius }) => radius === 1)).toBe(true);
    expect(driver.activeControlScopes).toBe(0);
  });

  it("retries a rejected portal block placement at the same origin", async () => {
    const driver = new FakeBeatGameDriver();
    const origin = {
      x: 10,
      y: 64,
      z: 20,
      dimension: "minecraft:overworld",
    };
    const frame = createNetherPortalFrame(origin);
    const initiallyRejected = frame.blocks[0];
    if (initiallyRejected === undefined) {
      throw new Error("Expected a portal frame block");
    }
    const world = installPortalWorld(driver, frame, {
      rejectFirstPlacementAt: initiallyRejected,
    });

    await Effect.runPromise(buildNetherPortal(driver, {
      origin,
      ignite: false,
    }));

    expect(world.placementAttempts.get(world.key(initiallyRejected))).toBe(2);
    expect(driver.paths).toContainEqual(expect.objectContaining({
      position: {
        x: 11,
        y: 65,
        z: 19,
        dimension: "minecraft:overworld",
      },
      radius: 1,
    }));
  });

  it("retries a portal placement rejected by the primitive RPC", async () => {
    const driver = new FakeBeatGameDriver();
    const origin = {
      x: 10,
      y: 64,
      z: 20,
      dimension: "minecraft:overworld",
    };
    const frame = createNetherPortalFrame(origin);
    const world = installPortalWorld(driver, frame);
    let rejected = false;
    driver.actionResolver = (action) => {
      if (action.type === "place-block" && !rejected) {
        rejected = true;
        return Effect.fail(new BeatGameDriverError({
          operation: "placeBlock",
          retryable: true,
          message: "The held item could not be used on the target block",
        }));
      }
      return Effect.sync(() => {
        driver.actionObserver(action);
        return {};
      });
    };

    await Effect.runPromise(buildNetherPortal(driver, {
      origin,
      ignite: false,
    }));

    expect(rejected).toBe(true);
    expect(frame.blocks.every((position) =>
      world.blocks.get(world.key(position))?.blockId
        === "minecraft:obsidian"
    )).toBe(true);
  });

  it("clears build scaffolding from the portal before ignition", async () => {
    const driver = new FakeBeatGameDriver();
    const origin = {
      x: 10,
      y: 64,
      z: 20,
      dimension: "minecraft:overworld",
    };
    const frame = createNetherPortalFrame(origin);
    const scaffold = frame.interior[0];
    if (scaffold === undefined) {
      throw new Error("Expected a portal interior");
    }
    installPortalWorld(driver, frame, {
      initialBlocks: [
        blockObservation(scaffold, { blockId: "minecraft:cobblestone" }),
      ],
    });

    await Effect.runPromise(buildNetherPortal(driver, { origin }));

    expect(driver.actions).toContainEqual({
      type: "dig-block",
      position: scaffold,
    });
    expect(driver.actions.findIndex(({ type }) => type === "dig-block"))
      .toBeLessThan(
        driver.actions.findIndex(({ type }) => type === "interact-block"),
      );
  });

  it("cancels portal navigation when the dimension changes", async () => {
    const driver = new FakeBeatGameDriver();
    const portal = {
      x: 10,
      y: 64,
      z: 20,
      dimension: "minecraft:overworld",
    };
    let observations = 0;
    driver.observationResolver = () =>
      Effect.sync(() => {
        observations += 1;
        const dimension = observations > 1
            ? "minecraft:the_nether"
            : "minecraft:overworld";
        return observation({
          dimension,
          position: {
            ...portal,
            x: portal.x + 0.5,
            z: portal.z + 0.5,
            dimension,
          },
        });
      });
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
      }).pipe(Effect.zipRight(Effect.never));

    await Effect.runPromise(enterPortal(driver, { portal }));

    expect(driver.paths).toHaveLength(1);
    expect(observations).toBeGreaterThan(1);
    expect(driver.actions).toContainEqual({ type: "reset-movement" });
  });

  it("prefers observed portal geometry over a conflicting axis property", async () => {
    const driver = new FakeBeatGameDriver();
    const portal = {
      x: 10,
      y: 64,
      z: 20,
      dimension: "minecraft:the_nether",
    };
    driver.currentObservation = observation({
      dimension: "minecraft:the_nether",
      position: { ...portal, x: 10.5, z: 17.5 },
    });
    driver.blockResults = [portal.x, portal.x + 1].map((x) => ({
      blockId: "minecraft:nether_portal",
      position: { ...portal, x },
      properties: { axis: "z" },
      diggable: false,
      replaceable: false,
      interactive: false,
      observedAt: "2026-01-01T00:00:01.000Z",
    }));
    driver.observationResolver = () =>
      Effect.sync(() => {
        const look = driver.actions.findLast((action) =>
          action.type === "look"
        );
        const moving = driver.actions.some((action) =>
          action.type === "set-movement" && action.forward === true
        );
        const dimension = moving
          ? "minecraft:overworld"
          : "minecraft:the_nether";
        return observation({
          dimension,
          position: moving
            ? {
              x: 11,
              y: 64,
              z: 20.5,
              dimension,
            }
            : { ...portal, x: 10.5, z: 17.5, dimension },
          rotation: {
            yaw: look?.type === "look" ? look.yaw : 0,
            pitch: look?.type === "look" ? look.pitch : 0,
          },
        });
      });

    await Effect.runPromise(enterPortal(driver, { portal }));

    expect(driver.paths).toEqual([
      expect.objectContaining({
        position: {
          x: 11,
          y: 64,
          z: 19,
          dimension: "minecraft:the_nether",
        },
        radius: 0,
      }),
    ]);
    expect(driver.actions).toContainEqual({
      type: "set-movement",
      forward: true,
      sprint: false,
    });
  });

  it("pathfinds back to a portal approach after a wide retreat", async () => {
    const driver = new FakeBeatGameDriver();
    const portal = {
      x: 104,
      y: 50,
      z: 158,
      dimension: "minecraft:the_nether",
    };
    driver.currentObservation = observation({
      dimension: "minecraft:the_nether",
      position: { x: 101.2, y: 50, z: 159 },
    });
    driver.blockResults = [portal.z, portal.z + 1].map((z) =>
      blockObservation(
        { ...portal, z },
        {
          blockId: "minecraft:nether_portal",
          properties: { axis: "z" },
          diggable: false,
        },
      )
    );
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
        driver.currentObservation = observation({
          dimension: position.dimension,
          position,
        });
      });
    driver.observationResolver = () =>
      Effect.sync(() => {
        const look = driver.actions.findLast((action) =>
          action.type === "look"
        );
        const moving = driver.actions.some((action) =>
          action.type === "set-movement" && action.forward === true
        );
        const dimension = moving
          ? "minecraft:overworld"
          : "minecraft:the_nether";
        return observation({
          dimension,
          position: {
            ...driver.currentObservation.player.position,
            dimension,
          },
          rotation: {
            yaw: look?.type === "look" ? look.yaw : 0,
            pitch: look?.type === "look" ? look.pitch : 0,
          },
        });
      });

    await Effect.runPromise(enterPortal(driver, { portal }));

    expect(driver.paths).toEqual([
      expect.objectContaining({
        position: {
          x: 103,
          y: 50,
          z: 159,
          dimension: "minecraft:the_nether",
        },
        radius: 0,
      }),
    ]);
  });

  it("keeps clearing movement while portal contact charges", async () => {
    const driver = new FakeBeatGameDriver();
    const portal = {
      x: 10,
      y: 64,
      z: 20,
      dimension: "minecraft:overworld",
    };
    const portalBlocks = [portal.x, portal.x + 1].map((x) =>
      blockObservation(
        { ...portal, x },
        {
          blockId: "minecraft:nether_portal",
          properties: { axis: "x" },
          diggable: false,
        },
      )
    );
    let touchedPortal = false;
    let resetsAfterContact = 0;
    driver.currentObservation = observation({
      position: { x: 11, y: 64, z: 17.5 },
    });
    driver.blockQueryResolver = ({ selector }) =>
      selector.blockIds?.includes("minecraft:nether_portal") === true
        ? portalBlocks
        : [];
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
        driver.currentObservation = observation({ position });
      });
    driver.actionObserver = (action) => {
      if (action.type === "set-movement" && action.forward === true) {
        touchedPortal = true;
      }
      if (touchedPortal && action.type === "reset-movement") {
        resetsAfterContact += 1;
      }
    };
    driver.observationResolver = () =>
      Effect.sync(() => {
        const dimension = resetsAfterContact >= 3
          ? "minecraft:the_nether"
          : "minecraft:overworld";
        const look = driver.actions.findLast((action) =>
          action.type === "look"
        );
        return observation({
          dimension,
          position: touchedPortal
            ? { x: 11, y: 64, z: 21.2, dimension }
            : {
              ...driver.currentObservation.player.position,
              dimension,
            },
          rotation: {
            yaw: look?.type === "look" ? look.yaw : 0,
            pitch: look?.type === "look" ? look.pitch : 0,
          },
        });
      });

    await Effect.runPromise(
      enterPortal(driver, { portal }).pipe(Effect.timeout("2 seconds")),
    );

    expect(resetsAfterContact).toBeGreaterThanOrEqual(3);
    expect(driver.currentObservation.player.position).toMatchObject({
      x: 11,
      y: 64,
      z: 19,
    });
  });

  it("stops a portal approach before wrong-way movement can wander", async () => {
    const driver = new FakeBeatGameDriver();
    const portal = {
      x: 10,
      y: 65,
      z: 20,
      dimension: "minecraft:overworld",
    };
    driver.currentObservation = observation({
      position: { ...portal, x: 11.5, z: 17.5 },
    });
    driver.blockResults = [portal.x, portal.x + 1].map((x) =>
      blockObservation(
        { ...portal, x },
        {
          blockId: "minecraft:nether_portal",
          properties: { axis: "x" },
          diggable: false,
        },
      )
    );
    let movementPulses = 0;
    driver.actionObserver = (action) => {
      if (action.type === "set-movement" && action.forward === true) {
        movementPulses += 1;
      }
    };
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
        driver.currentObservation = observation({ position });
      });
    driver.observationResolver = () =>
      Effect.sync(() => {
        if (movementPulses === 0) {
          return driver.currentObservation;
        }
        const look = driver.actions.findLast((action) =>
          action.type === "look"
        );
        return observation({
          position: {
            ...portal,
            x: 11 - movementPulses,
            z: 19.5,
          },
          rotation: {
            yaw: look?.type === "look" ? look.yaw : 0,
            pitch: look?.type === "look" ? look.pitch : 0,
          },
        });
      });

    await expect(
      Effect.runPromise(enterPortal(driver, { portal })),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        "Moved away from the Nether portal while approaching it",
      ),
    });

    expect(movementPulses).toBeLessThan(8);
    expect(driver.actions.at(-1)).toEqual({ type: "reset-movement" });
  });

  it("steps out after spawning inside a Nether portal", async () => {
    const driver = new FakeBeatGameDriver();
    const portal = {
      x: 10,
      y: 65,
      z: 20,
      dimension: "minecraft:the_nether",
    };
    driver.blockResults = [portal.x, portal.x + 1].map((x) =>
      blockObservation(
        { ...portal, x },
        {
          blockId: "minecraft:nether_portal",
          properties: { axis: "x" },
          diggable: false,
        },
      )
    );
    driver.observationResolver = () =>
      Effect.sync(() => {
        const look = driver.actions.findLast((action) =>
          action.type === "look"
        );
        const moving = driver.actions.some((action) =>
          action.type === "set-movement" && action.forward === true
        );
        return observation({
          dimension: moving
            ? "minecraft:overworld"
            : "minecraft:the_nether",
          position: {
            x: 11,
            y: 65,
            z: 20.5,
          },
          rotation: {
            yaw: look?.type === "look" ? look.yaw : 0,
            pitch: look?.type === "look" ? look.pitch : 0,
          },
        });
      });

    await Effect.runPromise(enterPortal(driver, { portal }));

    expect(driver.paths).toHaveLength(0);
    expect(driver.actions).toContainEqual({
      type: "set-movement",
      forward: true,
      sprint: true,
    });
    expect(driver.actions.at(-1)).toEqual({ type: "reset-movement" });
  });

  it("places a raised portal approach before entering its path", async () => {
    const driver = new FakeBeatGameDriver();
    const portal = {
      x: 10,
      y: 65,
      z: 20,
      dimension: "minecraft:overworld",
    };
    const support = {
      x: 11,
      y: 64,
      z: 21,
      dimension: "minecraft:overworld",
    };
    const base = { ...support, y: 63 };
    const portalBlocks = [portal.x, portal.x + 1].map((x) => ({
      blockId: "minecraft:nether_portal",
      position: { ...portal, x },
      properties: { axis: "x" },
      diggable: false,
      replaceable: false,
      interactive: false,
      observedAt: "2026-01-01T00:00:01.000Z",
    }));
    let supportPlaced = false;
    driver.currentObservation = observation({
      position: { x: 11, y: 64, z: 24 },
    });
    driver.blockQueryResolver = ({ selector }) => {
      if (selector.blockIds?.includes("minecraft:nether_portal") === true) {
        return portalBlocks;
      }
      if (selector.replaceable === false) {
        return supportPlaced
          ? [{
            blockId: "minecraft:cobblestone",
            position: support,
            properties: {},
            diggable: true,
            replaceable: false,
            interactive: false,
            observedAt: "2026-01-01T00:00:02.000Z",
          }]
          : [];
      }
      return [
        {
          blockId: "minecraft:air",
          position: support,
          properties: {},
          diggable: true,
          replaceable: true,
          interactive: false,
          observedAt: "2026-01-01T00:00:01.000Z",
        },
        {
          blockId: "minecraft:stone",
          position: base,
          properties: {},
          diggable: true,
          replaceable: false,
          interactive: false,
          observedAt: "2026-01-01T00:00:01.000Z",
        },
      ];
    };
    driver.actionObserver = (action) => {
      if (action.type === "place-block") {
        supportPlaced = true;
      }
    };
    driver.observationResolver = () =>
      Effect.sync(() => {
        const latestPath = driver.paths.at(-1)?.position;
        const standingPosition = latestPath === undefined
          ? driver.currentObservation.player.position
          : {
            ...latestPath,
            x: latestPath.x + 0.5,
            z: latestPath.z + 0.5,
          };
        const look = driver.actions.findLast((action) =>
          action.type === "look"
        );
        const moving = driver.actions.some((action) =>
          action.type === "set-movement" && action.forward === true
        );
        const dimension = moving
          ? "minecraft:the_nether"
          : "minecraft:overworld";
        return observation({
          dimension,
          position: moving
            ? { ...portal, x: 11, z: 20.5, dimension }
            : { ...standingPosition, dimension },
          rotation: {
            yaw: look?.type === "look" ? look.yaw : 0,
            pitch: look?.type === "look" ? look.pitch : 0,
          },
        });
      });

    await Effect.runPromise(enterPortal(driver, { portal }));

    expect(driver.actions).toContainEqual({
      type: "place-block",
      against: base,
      face: "up",
      hand: "main",
    });
    const placementIndex = driver.actions.findIndex(({ type }) =>
      type === "place-block"
    );
    expect(placementIndex).toBeGreaterThan(-1);
    expect(driver.paths).toEqual([
      expect.objectContaining({
        position: {
          ...portal,
          x: 11,
          z: 21,
        },
        radius: 0,
      }),
    ]);
    expect(driver.activeControlScopes).toBe(0);
  });

  it("bridges a short gap leading into a generated portal", async () => {
    const driver = new FakeBeatGameDriver();
    const portal = {
      x: 10,
      y: 65,
      z: 20,
      dimension: "minecraft:the_nether",
    };
    const portalBlocks = [portal.x, portal.x + 1].map((x) =>
      blockObservation(
        { ...portal, x },
        {
          blockId: "minecraft:nether_portal",
          properties: { axis: "x" },
          diggable: false,
        },
      )
    );
    const solidSupports = new Set(["11,64,17"]);
    driver.currentObservation = observation({
      dimension: "minecraft:the_nether",
      position: { x: 11.5, y: 65, z: 17.5 },
    });
    driver.blockQueryResolver = ({ center, selector }) => {
      if (selector.blockIds?.includes("minecraft:nether_portal") === true) {
        return portalBlocks;
      }
      const supports = [...solidSupports].map((key) => {
        const [x, y, z] = key.split(",").map(Number);
        return blockObservation({
          x: x!,
          y: y!,
          z: z!,
          dimension: "minecraft:the_nether",
        }, { blockId: "minecraft:cobblestone" });
      });
      if (selector.replaceable === false) {
        return supports;
      }
      return [
        blockObservation(
          {
            x: Math.floor(center.x),
            y: Math.floor(center.y),
            z: Math.floor(center.z),
            dimension: center.dimension,
          },
          {
            blockId: "minecraft:air",
            replaceable: true,
          },
        ),
        ...supports,
      ];
    };
    driver.actionObserver = (action) => {
      if (action.type === "place-block" && action.face === "south") {
        solidSupports.add(
          `${action.against.x},${action.against.y},${
            action.against.z + 1
          }`,
        );
      }
    };
    driver.observationResolver = () =>
      Effect.sync(() => {
        const latestPath = driver.paths.at(-1)?.position
          ?? driver.currentObservation.player.position;
        const look = driver.actions.findLast((action) =>
          action.type === "look"
        );
        const moving = driver.actions.some((action) =>
          action.type === "set-movement" && action.forward === true
        );
        const dimension = moving
          ? "minecraft:overworld"
          : "minecraft:the_nether";
        return observation({
          dimension,
          position: moving
            ? { ...portal, x: 11, z: 20.5, dimension }
            : { ...latestPath, dimension },
          rotation: {
            yaw: look?.type === "look" ? look.yaw : 0,
            pitch: look?.type === "look" ? look.pitch : 0,
          },
        });
      });

    await Effect.runPromise(enterPortal(driver, { portal }));

    expect(driver.actions.filter(({ type }) => type === "place-block"))
      .toEqual([
        {
          type: "place-block",
          against: {
            x: 11,
            y: 64,
            z: 17,
            dimension: "minecraft:the_nether",
          },
          face: "south",
          hand: "main",
        },
        {
          type: "place-block",
          against: {
            x: 11,
            y: 64,
            z: 18,
            dimension: "minecraft:the_nether",
          },
          face: "south",
          hand: "main",
        },
      ]);
  });

  it("pathfinds onto a raised Nether portal approach before crossing", async () => {
    const driver = new FakeBeatGameDriver();
    const portal = {
      x: 10,
      y: 65,
      z: 20,
      dimension: "minecraft:the_nether",
    };
    const portalBlocks = [portal.z, portal.z + 1].map((z) =>
      blockObservation(
        { ...portal, z },
        {
          blockId: "minecraft:nether_portal",
          properties: { axis: "z" },
          diggable: false,
        },
      )
    );
    driver.currentObservation = observation({
      dimension: "minecraft:the_nether",
      position: { x: 8.5, y: 64, z: 20.5 },
    });
    driver.blockQueryResolver = ({ center, selector }) =>
      selector.blockIds?.includes("minecraft:nether_portal") === true
        ? portalBlocks
        : [blockObservation({
          x: Math.floor(center.x),
          y: Math.floor(center.y),
          z: Math.floor(center.z),
          dimension: center.dimension,
        })];
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
        driver.currentObservation = observation({
          dimension: position.dimension,
          position,
        });
      });
    driver.observationResolver = () =>
      Effect.sync(() => {
        const latestPath = driver.paths.at(-1)?.position
          ?? driver.currentObservation.player.position;
        const look = driver.actions.findLast((action) =>
          action.type === "look"
        );
        const moving = driver.actions.some((action) =>
          action.type === "set-movement" && action.forward === true
        );
        const dimension = moving
          ? "minecraft:overworld"
          : driver.currentObservation.player.position.dimension;
        return observation({
          dimension,
          position: moving
            ? { ...portal, x: 10.5, z: 21, dimension }
            : { ...latestPath, dimension },
          rotation: {
            yaw: look?.type === "look" ? look.yaw : 0,
            pitch: look?.type === "look" ? look.pitch : 0,
          },
        });
      });

    await Effect.runPromise(enterPortal(driver, { portal }));

    expect(driver.paths).toEqual([
      expect.objectContaining({
        position: {
          x: 9,
          y: 65,
          z: 21,
          dimension: "minecraft:the_nether",
        },
        radius: 0,
      }),
    ]);
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

  it("reselects an eye after every reachable portal-frame path and preserves the room", async () => {
    const driver = new FakeBeatGameDriver();
    const frames = [1, 2].map((x) => ({
      blockId: "minecraft:end_portal_frame",
      position: {
        x,
        y: 32,
        z: 1,
        dimension: "minecraft:overworld",
      },
      properties: { eye: "false" },
      diggable: false,
      replaceable: false,
      interactive: true,
      observedAt: "2026-01-01T00:00:01.000Z",
    }));
    const filled = new Set<number>();
    driver.blockQueryResolver = ({ center, radius, selector }) => {
      if (selector.blockIds?.includes("minecraft:end_portal") === true) {
        return filled.size === frames.length
          ? [{
            ...frames[0]!,
            blockId: "minecraft:end_portal",
            properties: {},
          }]
          : [];
      }
      if (
        selector.blockIds?.includes("minecraft:end_portal_frame") !== true
      ) {
        return [];
      }
      return frames.filter(({ position }) =>
        !filled.has(position.x)
        && (
          radius > 0.5
          || Math.floor(center.x) === position.x
        )
      );
    };
    driver.actionObserver = (action) => {
      if (action.type === "interact-block") {
        filled.add(action.position.x);
      }
    };

    const activated = await Effect.runPromise(activateEndPortal(driver, {
      confirmationAttempts: 1,
      confirmationDelayMs: 0,
    }));

    expect(activated).toBe(2);
    expect(driver.actions.map(({ type }) => type)).toEqual([
      "select-item",
      "interact-block",
      "select-item",
      "interact-block",
    ]);
    expect(driver.paths).toHaveLength(2);
    expect(driver.paths.every(({ radius }) => radius === 3)).toBe(true);
    expect(driver.paths.every(({ policy }) =>
      !policy.allowMining && !policy.allowPlacing
    )).toBe(true);
    expect(driver.activeControlScopes).toBe(0);
  });

  it("fills portal frames already within reach without repositioning", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      position: {
        x: 2.5,
        y: 3,
        z: 0.5,
        dimension: "minecraft:overworld",
      },
    });
    const frame = blockObservation(
      {
        x: 2,
        y: 2,
        z: 2,
        dimension: "minecraft:overworld",
      },
      {
        blockId: "minecraft:end_portal_frame",
        properties: { eye: "false" },
        diggable: false,
        interactive: true,
      },
    );
    let filled = false;
    driver.blockQueryResolver = ({ selector }) => {
      if (selector.blockIds?.includes("minecraft:end_portal") === true) {
        return filled
          ? [blockObservation(frame.position, {
            blockId: "minecraft:end_portal",
          })]
          : [];
      }
      return selector.blockIds?.includes(
          "minecraft:end_portal_frame",
        ) === true && !filled
        ? [frame]
        : [];
    };
    driver.actionObserver = (action) => {
      if (action.type === "interact-block") {
        filled = true;
      }
    };

    const activated = await Effect.runPromise(activateEndPortal(driver, {
      confirmationAttempts: 1,
      confirmationDelayMs: 0,
    }));

    expect(activated).toBe(1);
    expect(driver.paths).toHaveLength(0);
    expect(driver.actions).toContainEqual({
      type: "interact-block",
      position: frame.position,
      face: "up",
      hand: "main",
    });
  });

  it("waits for the End dimension before completing portal entry", async () => {
    const driver = new FakeBeatGameDriver();
    const portals = Array.from({ length: 9 }, (_, index) => ({
      x: 1 + index % 3,
      y: 31,
      z: 1 + Math.floor(index / 3),
      dimension: "minecraft:overworld",
    }));
    driver.blockQueryResolver = ({ selector }) =>
      selector.blockIds?.includes("minecraft:end_portal") === true
        ? portals.map((portal) => blockObservation(portal, {
          blockId: "minecraft:end_portal",
          replaceable: true,
        }))
        : [];
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
        driver.currentObservation = observation({
          position,
        });
      });
    driver.observationResolver = () =>
      Effect.sync(() => {
        if (driver.actions.some((action) =>
          action.type === "set-movement" && action.forward === true
        )) {
          return observation({
            dimension: "minecraft:the_end",
            position: {
              x: 100,
              y: 49,
              z: 0,
              dimension: "minecraft:the_end",
            },
          });
        }
        const look = driver.actions.findLast((action) =>
          action.type === "look"
        );
        driver.currentObservation = observation({
          position: {
            ...driver.currentObservation.player.position,
            dimension: "minecraft:overworld",
          },
          rotation: {
            yaw: look?.type === "look" ? look.yaw : 0,
            pitch: look?.type === "look" ? look.pitch : 0,
          },
        });
        return driver.currentObservation;
      });

    await Effect.runPromise(enterEndPortal(driver, {
      transitionTimeoutMs: 100,
    }));

    expect(driver.paths).toHaveLength(0);
    expect(driver.actions).toContainEqual({
      type: "set-movement",
      forward: true,
      jump: true,
      sprint: false,
    });
    expect(driver.actions).toContainEqual({ type: "reset-movement" });
    expect(driver.activeControlScopes).toBe(0);
    expect(driver.maximumActiveControlScopes).toBe(1);
  });

  it("builds a reachable End portal approach when the bot is below the rim", async () => {
    const driver = new FakeBeatGameDriver();
    const portals = Array.from({ length: 9 }, (_, index) => ({
      x: 1 + index % 3,
      y: 31,
      z: 1 + Math.floor(index / 3),
      dimension: "minecraft:overworld",
    }));
    const placed = new Set<string>();
    driver.currentObservation = observation({
      counts: { "minecraft:cobblestone": 8 },
      position: {
        x: -4,
        y: 30,
        z: 2,
        dimension: "minecraft:overworld",
      },
    });
    driver.blockQueryResolver = ({ center, selector }) => {
      if (selector.blockIds?.includes("minecraft:end_portal") === true) {
        return portals.map((portal) => blockObservation(portal, {
          blockId: "minecraft:end_portal",
          replaceable: true,
        }));
      }
      const position = {
        x: Math.floor(center.x),
        y: Math.floor(center.y),
        z: Math.floor(center.z),
        dimension: "minecraft:overworld",
      };
      const key = `${position.x}:${position.y}:${position.z}`;
      const solid = position.y <= 28 || placed.has(key);
      return [blockObservation(position, solid
        ? {}
        : {
          blockId: "minecraft:air",
          diggable: true,
          replaceable: true,
        })];
    };
    driver.actionObserver = (action) => {
      if (action.type === "place-block" && action.face === "up") {
        placed.add(
          `${action.against.x}:${action.against.y + 1}:${action.against.z}`,
        );
      }
    };
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
        driver.currentObservation = observation({
          counts: { "minecraft:cobblestone": 8 },
          position,
        });
      });
    driver.observationResolver = () =>
      Effect.sync(() => {
        if (driver.actions.some((action) =>
          action.type === "set-movement" && action.forward === true
        )) {
          return observation({
            dimension: "minecraft:the_end",
            position: {
              x: 100,
              y: 49,
              z: 0,
              dimension: "minecraft:the_end",
            },
          });
        }
        const look = driver.actions.findLast((action) =>
          action.type === "look"
        );
        return {
          ...driver.currentObservation,
          player: {
            ...driver.currentObservation.player,
            rotation: {
              yaw: look?.type === "look" ? look.yaw : 0,
              pitch: look?.type === "look" ? look.pitch : 0,
            },
          },
        };
      });

    await Effect.runPromise(enterEndPortal(driver, {
      transitionTimeoutMs: 100,
    }));

    expect(driver.actions.filter(({ type }) => type === "place-block"))
      .toHaveLength(2);
    expect(driver.paths.map(({ position }) => position)).toEqual([
      {
        x: -1,
        y: 31,
        z: 2,
        dimension: "minecraft:overworld",
      },
    ]);
    expect(driver.actions).toContainEqual({
      type: "set-movement",
      forward: true,
      jump: true,
      sprint: false,
    });
    expect(driver.maximumActiveControlScopes).toBe(1);
  });

  it("waits for a dragon or a world-level defeat result", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      dimension: "minecraft:the_end",
    });
    let resultQueries = 0;
    driver.blockQueryResolver = ({ selector }) => {
      if (
        selector.blockIds?.includes("minecraft:dragon_egg") !== true
      ) {
        return [];
      }
      resultQueries += 1;
      return resultQueries < 2
        ? []
        : [blockObservation({
          x: 0,
          y: 64,
          z: 0,
          dimension: "minecraft:the_end",
        }, {
          blockId: "minecraft:dragon_egg",
        })];
    };

    await Effect.runPromise(fightEnderDragon(driver, {
      defeatConfirmationAttempts: 2,
      defeatConfirmationDelayMs: 0,
    }));

    expect(resultQueries).toBe(2);
    expect(driver.tasks).toHaveLength(0);
  });

  it("does not infer a dragon kill from one empty entity query", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      dimension: "minecraft:the_end",
    });

    const exit = await Effect.runPromiseExit(fightEnderDragon(driver, {
      defeatConfirmationAttempts: 1,
      defeatConfirmationDelayMs: 0,
    }));

    expect(exit._tag).toBe("Failure");
  });

  it("keeps ranged dragon attacks stationary near the void", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      dimension: "minecraft:the_end",
    });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 42,
      entityType: "minecraft:ender_dragon",
      position: {
        x: 8,
        y: 67,
        z: 0,
        dimension: "minecraft:the_end",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 1,
      observedAt: "2026-01-01T00:00:01.000Z",
    }];
    driver.taskObserver = (task) => {
      if (task.type === "ranged-attack") {
        driver.entityResults = [];
      }
    };
    driver.blockQueryResolver = ({ selector }) =>
      selector.blockIds?.includes("minecraft:end_portal") === true
        ? [blockObservation({
          x: 0,
          y: 64,
          z: 0,
          dimension: "minecraft:the_end",
        }, {
          blockId: "minecraft:end_portal",
        })]
        : [];

    await Effect.runPromise(fightEnderDragon(driver, {
      defeatConfirmationAttempts: 1,
      defeatConfirmationDelayMs: 0,
    }));

    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "ranged-attack",
      strafe: false,
    }));
  });

  it("caps nearest-target attacks at the protocol radius limit", async () => {
    const driver = new FakeBeatGameDriver();

    await Effect.runPromise(attackNearest(driver, {
      selector: { entityTypes: ["minecraft:ender_dragon"] },
      radius: 256,
      maximumTargets: 1,
    }));

    expect(driver.tasks).toContainEqual({
      type: "attack-nearest",
      selector: { entityTypes: ["minecraft:ender_dragon"] },
      radius: 128,
      maximumTargets: 1,
    });
  });

  it("teleports the dragon egg and drops it onto a torch", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      dimension: "minecraft:the_end",
      counts: { "minecraft:torch": 1 },
    });
    const initial = {
      x: 0,
      y: 65,
      z: 0,
      dimension: "minecraft:the_end",
    };
    const moved = {
      x: 5,
      y: 66,
      z: 3,
      dimension: "minecraft:the_end",
    };
    let teleported = false;
    driver.blockQueryResolver = ({ selector }) =>
      selector.blockIds?.includes("minecraft:dragon_egg") === true
        ? [{
          blockId: "minecraft:dragon_egg",
          position: teleported ? moved : initial,
          properties: {},
          diggable: true,
          replaceable: false,
          interactive: false,
          observedAt: "2026-01-01T00:00:01.000Z",
        }]
        : [];
    driver.actionObserver = (action) => {
      if (action.type !== "dig-block") {
        return;
      }
      if (action.position.y === initial.y) {
        teleported = true;
      }
      if (action.position.y === moved.y - 1) {
        driver.currentObservation = observation({
          dimension: "minecraft:the_end",
          counts: {
            "minecraft:torch": 1,
            "minecraft:dragon_egg": 1,
          },
        });
      }
    };

    await Effect.runPromise(collectDragonEgg(driver, {
      confirmationAttempts: 2,
      confirmationDelayMs: 0,
    }));

    expect(driver.actions).toContainEqual({
      type: "place-block",
      against: { ...moved, y: moved.y - 3 },
      face: "up",
      hand: "main",
    });
    expect(driver.actions).toContainEqual({
      type: "dig-block",
      position: { ...moved, y: moved.y - 1 },
    });
    expect(driver.activeControlScopes).toBe(0);
  });

  it("enters the End exit portal and performs the credits respawn", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      dimension: "minecraft:the_end",
      counts: { "minecraft:dragon_egg": 1 },
    });
    const portal = {
      x: 0,
      y: 63,
      z: 0,
      dimension: "minecraft:the_end",
    };
    driver.blockQueryResolver = ({ selector }) =>
      selector.blockIds?.includes("minecraft:end_portal") === true
        ? [{
          blockId: "minecraft:end_portal",
          position: portal,
          properties: {},
          diggable: false,
          replaceable: false,
          interactive: false,
          observedAt: "2026-01-01T00:00:01.000Z",
        }]
        : [];
    driver.actionObserver = (action) => {
      if (action.type === "respawn") {
        driver.currentObservation = observation({
          dimension: "minecraft:overworld",
          counts: { "minecraft:dragon_egg": 1 },
        });
      }
    };

    await Effect.runPromise(exitEnd(driver, {
      confirmationAttempts: 2,
      confirmationDelayMs: 0,
    }));

    expect(driver.paths[0]).toMatchObject({ position: portal, radius: 0 });
    expect(driver.actions).toContainEqual({ type: "respawn" });
    expect(driver.activeControlScopes).toBe(0);
  });
});
