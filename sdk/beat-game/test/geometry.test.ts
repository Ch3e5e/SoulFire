import { describe, expect, it } from "vitest";

import {
  createNetherPortalFrame,
  NETHER_PORTAL_FRAME_OBSIDIAN_COUNT,
  rotationToward,
  triangulateStronghold,
  type BeatGameEyeSample,
} from "../src/index.js";

describe("beat-game geometry", () => {
  it("constructs the minimum valid portal frame without optional corners", () => {
    const frame = createNetherPortalFrame({
      x: 10,
      y: 64,
      z: -3,
      dimension: "minecraft:overworld",
    });

    expect(frame.blocks).toHaveLength(NETHER_PORTAL_FRAME_OBSIDIAN_COUNT);
    expect(new Set(frame.blocks.map(({ x, y, z }) => `${x}:${y}:${z}`)).size)
      .toBe(NETHER_PORTAL_FRAME_OBSIDIAN_COUNT);
    expect(frame.blocks).not.toContainEqual({
      x: 10,
      y: 64,
      z: -3,
      dimension: "minecraft:overworld",
    });
    expect(frame.blocks).not.toContainEqual({
      x: 13,
      y: 68,
      z: -3,
      dimension: "minecraft:overworld",
    });
    expect(frame.interior).toHaveLength(6);
  });

  it("triangulates intersecting eye samples from a useful baseline", () => {
    const samples: readonly BeatGameEyeSample[] = [
      {
        origin: {
          x: 0,
          y: 70,
          z: 0,
          dimension: "minecraft:overworld",
        },
        direction: { x: Math.SQRT1_2, z: Math.SQRT1_2 },
        observedAt: "2026-01-01T00:00:00.000Z",
        confidence: 1,
      },
      {
        origin: {
          x: 100,
          y: 70,
          z: 0,
          dimension: "minecraft:overworld",
        },
        direction: { x: 0, z: 1 },
        observedAt: "2026-01-01T00:01:00.000Z",
        confidence: 0.9,
      },
    ];

    const result = triangulateStronghold(samples);

    expect(result).toBeDefined();
    expect(result?.position.x).toBeCloseTo(100);
    expect(result?.position.z).toBeCloseTo(100);
    expect(result?.baseline).toBe(100);
    expect(result?.confidence).toBeGreaterThan(0);
  });

  it("does not claim an intersection from a negligible baseline", () => {
    const sample = {
      origin: {
        x: 0,
        y: 70,
        z: 0,
        dimension: "minecraft:overworld",
      },
      direction: { x: 1, z: 0 },
      observedAt: "2026-01-01T00:00:00.000Z",
      confidence: 1,
    } satisfies BeatGameEyeSample;

    expect(triangulateStronghold([
      sample,
      {
        ...sample,
        origin: { ...sample.origin, z: 2 },
        direction: { x: 0.9, z: 0.1 },
      },
    ])).toBeUndefined();
  });

  it("produces Minecraft yaw and pitch toward a target", () => {
    expect(rotationToward(
      { x: 0, y: 64, z: 0, dimension: "minecraft:overworld" },
      { x: -10, y: 74, z: 0 },
    )).toEqual({ yaw: 90, pitch: -45 });
  });
});
