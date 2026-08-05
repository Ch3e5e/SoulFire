import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { BeatGameDriverError } from "../src/errors.js";
import { approachLavaSourceFromSide } from "../src/liquids.js";
import {
  defaultBeatGameStrategy,
  type BeatGameBlockPosition,
} from "../src/model.js";
import {
  blockObservation,
  FakeBeatGameDriver,
  observation,
} from "./fixtures.js";

describe("lava interaction positioning", () => {
  it("uses a visible source beyond four blocks without replanning", async () => {
    const driver = new FakeBeatGameDriver();
    const source = blockObservation({
      x: 3,
      y: 62,
      z: 0,
      dimension: "minecraft:overworld",
    }, {
      blockId: "minecraft:lava",
      properties: { level: "0" },
      replaceable: true,
    });
    driver.currentObservation = observation({
      position: {
        x: 0.5,
        y: 64,
        z: 0.5,
        dimension: "minecraft:overworld",
      },
    });

    const selected = await Effect.runPromise(approachLavaSourceFromSide(
      driver,
      driver.currentObservation,
      [source],
      {
        path: defaultBeatGameStrategy.path,
        requireExposableSource: true,
      },
    ));

    expect(selected.position).toEqual(source.position);
    expect(driver.paths).toHaveLength(0);
    expect(driver.raycasts).toHaveLength(1);
  });

  it("skips stands whose sampled sightline is already obstructed", async () => {
    const driver = new FakeBeatGameDriver();
    const blockedSource = blockObservation({
      x: 0,
      y: -52,
      z: 0,
      dimension: "minecraft:overworld",
    }, {
      blockId: "minecraft:lava",
      properties: { level: "0" },
      replaceable: true,
    });
    const clearSource = blockObservation({
      x: 8,
      y: -52,
      z: 0,
      dimension: "minecraft:overworld",
    }, {
      blockId: "minecraft:lava",
      properties: { level: "0" },
      replaceable: true,
    });
    const blockedStand = {
      x: 2,
      y: -50,
      z: 0,
      dimension: "minecraft:overworld",
    } as const;
    const clearStand = {
      x: 6,
      y: -50,
      z: 0,
      dimension: "minecraft:overworld",
    } as const;
    const standVolume = (
      stand: BeatGameBlockPosition,
      obstruction?: BeatGameBlockPosition,
    ) => [
      blockObservation(stand, {
        blockId: "minecraft:air",
        replaceable: true,
      }),
      blockObservation({ ...stand, y: stand.y + 1 }, {
        blockId: "minecraft:air",
        replaceable: true,
      }),
      blockObservation({ ...stand, y: stand.y - 1 }),
      ...(obstruction === undefined
        ? []
        : [blockObservation(obstruction, { blockId: "minecraft:stone" })]),
    ];
    const blockedStandVolume = standVolume(blockedStand, {
      x: 1,
      y: -51,
      z: 0,
      dimension: blockedStand.dimension,
    });
    const clearStandVolume = standVolume(clearStand);
    driver.currentObservation = observation({
      position: {
        x: 4.5,
        y: -50,
        z: 0.5,
        dimension: "minecraft:overworld",
      },
    });
    driver.blockQueryResolver = ({ center, radius, selector }) => {
      if (Object.keys(selector).length === 0 && radius === 0.25) {
        return [...blockedStandVolume, ...clearStandVolume].filter((block) =>
          block.position.x === Math.floor(center.x)
          && block.position.y === Math.floor(center.y)
          && block.position.z === Math.floor(center.z)
        );
      }
      return radius === 4.9 && Object.keys(selector).length === 0
        ? Math.floor(center.x) === blockedSource.position.x
          ? blockedStandVolume
          : clearStandVolume
        : [];
    };
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
        driver.currentObservation = observation({ position });
      });

    const selected = await Effect.runPromise(approachLavaSourceFromSide(
      driver,
      driver.currentObservation,
      [blockedSource, clearSource],
      {
        path: defaultBeatGameStrategy.path,
        requireExposableSource: true,
      },
    ));

    expect(selected.position).toEqual(clearSource.position);
    expect(driver.paths).toEqual([{
      position: {
        x: clearStand.x + 0.5,
        y: clearStand.y,
        z: clearStand.z + 0.5,
        dimension: clearStand.dimension,
      },
      radius: 0.75,
      policy: expect.objectContaining({
        allowMining: false,
        avoidFluids: true,
        maxFallDistance: 1,
      }),
    }]);
  });

  it("excavates a sealed stand when that clears its lava sightline", async () => {
    const driver = new FakeBeatGameDriver();
    const source = blockObservation({
      x: 0,
      y: -52,
      z: 0,
      dimension: "minecraft:overworld",
    }, {
      blockId: "minecraft:lava",
      properties: { level: "0" },
      replaceable: true,
    });
    const stand = {
      x: 2,
      y: -52,
      z: 0,
      dimension: "minecraft:overworld",
    } as const;
    driver.currentObservation = observation({
      position: {
        x: 12.5,
        y: -52,
        z: 0.5,
        dimension: "minecraft:overworld",
      },
    });
    const standBlocks = [
      blockObservation(stand),
      blockObservation({ ...stand, y: stand.y + 1 }),
      blockObservation({ ...stand, y: stand.y - 1 }),
    ];
    driver.blockQueryResolver = ({ radius, selector }) =>
      radius === 4.9 && Object.keys(selector).length === 0
        ? standBlocks
        : radius === 0.25 && Object.keys(selector).length === 0
        ? standBlocks
        : [];
    driver.pathResolver = (position, radius, policy) => {
      driver.paths.push({ position, radius, policy });
      if (!policy.allowMining) {
        return Effect.fail(new BeatGameDriverError({
          operation: "pathfind",
          code: "unreachable",
          retryable: true,
          message: "The sealed stand has no open route",
        }));
      }
      driver.currentObservation = observation({ position });
      return Effect.void;
    };

    const selected = await Effect.runPromise(approachLavaSourceFromSide(
      driver,
      driver.currentObservation,
      [source],
      {
        path: defaultBeatGameStrategy.path,
        requireExposableSource: true,
      },
    ));

    expect(selected.position).toEqual(source.position);
    expect(driver.paths.at(-1)).toEqual({
      position: {
        x: stand.x + 0.5,
        y: stand.y,
        z: stand.z + 0.5,
        dimension: stand.dimension,
      },
      radius: 0.75,
      policy: expect.objectContaining({
        allowMining: true,
        avoidFluids: true,
        maxFallDistance: 1,
      }),
    });
  });

  it("skips a stand that fills with lava after candidate discovery", async () => {
    const driver = new FakeBeatGameDriver();
    const firstSource = blockObservation({
      x: 0,
      y: -52,
      z: 0,
      dimension: "minecraft:overworld",
    }, {
      blockId: "minecraft:lava",
      properties: { level: "0" },
      replaceable: true,
    });
    const secondSource = blockObservation({
      x: 8,
      y: -52,
      z: 0,
      dimension: "minecraft:overworld",
    }, {
      blockId: "minecraft:lava",
      properties: { level: "0" },
      replaceable: true,
    });
    const floodedStand = {
      x: 2,
      y: -50,
      z: 0,
      dimension: "minecraft:overworld",
    } as const;
    const safeStand = {
      x: 6,
      y: -50,
      z: 0,
      dimension: "minecraft:overworld",
    } as const;
    const discoveredVolume = (stand: BeatGameBlockPosition) => [
      blockObservation(stand, {
        blockId: "minecraft:air",
        replaceable: true,
      }),
      blockObservation({ ...stand, y: stand.y + 1 }, {
        blockId: "minecraft:air",
        replaceable: true,
      }),
      blockObservation({ ...stand, y: stand.y - 1 }),
    ];
    const floodedStandVolume = discoveredVolume(floodedStand);
    const safeStandVolume = discoveredVolume(safeStand);
    driver.currentObservation = observation({
      position: {
        x: 4.5,
        y: -50,
        z: 0.5,
        dimension: "minecraft:overworld",
      },
    });
    driver.blockQueryResolver = ({ center, radius, selector }) => {
      if (Object.keys(selector).length !== 0) {
        return [];
      }
      if (radius === 4.9) {
        return Math.floor(center.x) === firstSource.position.x
          ? floodedStandVolume
          : safeStandVolume;
      }
      if (radius !== 0.25) {
        return [];
      }
      const position = {
        x: Math.floor(center.x),
        y: Math.floor(center.y),
        z: Math.floor(center.z),
      };
      if (
        position.x === floodedStand.x
        && position.y === floodedStand.y
        && position.z === floodedStand.z
      ) {
        return [blockObservation(floodedStand, {
          blockId: "minecraft:lava",
          properties: { level: "1" },
          replaceable: true,
        })];
      }
      return [...floodedStandVolume, ...safeStandVolume].filter((block) =>
        block.position.x === position.x
        && block.position.y === position.y
        && block.position.z === position.z
      );
    };
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
        driver.currentObservation = observation({ position });
      });

    const selected = await Effect.runPromise(approachLavaSourceFromSide(
      driver,
      driver.currentObservation,
      [firstSource, secondSource],
      {
        path: defaultBeatGameStrategy.path,
        requireExposableSource: true,
      },
    ));

    expect(selected.position).toEqual(secondSource.position);
    expect(driver.paths).toEqual([{
      position: {
        x: safeStand.x + 0.5,
        y: safeStand.y,
        z: safeStand.z + 0.5,
        dimension: safeStand.dimension,
      },
      radius: 0.75,
      policy: expect.objectContaining({
        allowMining: false,
        avoidFluids: true,
        maxFallDistance: 1,
      }),
    }]);
  });

  it("accepts a safe adjacent arrival when the exact stand is unreachable", async () => {
    const driver = new FakeBeatGameDriver();
    const source = blockObservation({
      x: 0,
      y: -52,
      z: 0,
      dimension: "minecraft:overworld",
    }, {
      blockId: "minecraft:lava",
      properties: { level: "0" },
      replaceable: true,
    });
    const stand = {
      x: 2,
      y: -50,
      z: 0,
      dimension: "minecraft:overworld",
    } as const;
    const standBlocks = [
      blockObservation(stand, {
        blockId: "minecraft:air",
        replaceable: true,
      }),
      blockObservation({ ...stand, y: stand.y + 1 }, {
        blockId: "minecraft:air",
        replaceable: true,
      }),
      blockObservation({ ...stand, y: stand.y - 1 }),
    ];
    driver.currentObservation = observation({
      position: {
        x: 4.5,
        y: -50,
        z: 0.5,
        dimension: "minecraft:overworld",
      },
    });
    driver.blockQueryResolver = ({ radius, selector }) =>
      Object.keys(selector).length === 0
          && (radius === 4.9 || radius === 0.25)
        ? standBlocks
        : [];
    driver.pathResolver = (position, radius, policy) => {
      driver.paths.push({ position, radius, policy });
      if (radius === 0.75) {
        return Effect.fail(new BeatGameDriverError({
          operation: "pathfind",
          code: "unreachable",
          retryable: true,
          message: "The precise stand center is unreachable",
        }));
      }
      driver.currentObservation = observation({ position });
      return Effect.void;
    };

    const selected = await Effect.runPromise(approachLavaSourceFromSide(
      driver,
      driver.currentObservation,
      [source],
      {
        path: defaultBeatGameStrategy.path,
        requireExposableSource: true,
      },
    ));

    expect(selected.position).toEqual(source.position);
    expect(driver.paths.map(({ radius }) => radius)).toEqual([0.75, 1.1]);
  });
});
