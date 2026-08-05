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
    driver.currentObservation = observation({
      position: {
        x: 4.5,
        y: -50,
        z: 0.5,
        dimension: "minecraft:overworld",
      },
    });
    driver.blockQueryResolver = ({ center, radius, selector }) => {
      if (radius !== 4.9 || Object.keys(selector).length !== 0) {
        return [];
      }
      return Math.floor(center.x) === blockedSource.position.x
        ? standVolume(blockedStand, {
          x: 1,
          y: -51,
          z: 0,
          dimension: blockedStand.dimension,
        })
        : standVolume(clearStand);
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
    driver.blockQueryResolver = ({ radius, selector }) =>
      radius === 4.9 && Object.keys(selector).length === 0
        ? [
          blockObservation(stand),
          blockObservation({ ...stand, y: stand.y + 1 }),
          blockObservation({ ...stand, y: stand.y - 1 }),
        ]
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
});
