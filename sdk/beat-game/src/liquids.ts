import { Effect } from "effect";

import type { BeatGameDriver } from "./driver.js";
import { BeatGameDriverError } from "./errors.js";
import { distanceSquared } from "./geometry.js";
import type {
  BeatGameBlockObservation,
  BeatGameBlockPosition,
  BeatGameObservation,
  BeatGamePathPolicy,
  BeatGamePosition,
} from "./model.js";

export const LIQUID_INTERACTION_REACH = 4;
export const LIQUID_INTERACTION_STAND_RADIUS = 0.75;

const LAVA_SOURCE_CLUSTER_RADIUS = 8;
const PREFERRED_LAVA_SOURCE_CLUSTER_SIZE = 9;
const LAVA_INTERACTION_VOLUME_RADIUS = 4.9;
const LAVA_INTERACTION_VOLUME_MAXIMUM_RESULTS = 500;
const FLUID_BLOCK_IDS = new Set([
  "minecraft:water",
  "minecraft:bubble_column",
  "minecraft:kelp",
  "minecraft:kelp_plant",
  "minecraft:seagrass",
  "minecraft:tall_seagrass",
  "minecraft:lava",
]);

export interface ApproachLavaSourceOptions {
  readonly path: BeatGamePathPolicy;
  readonly requireExposableSource?: boolean;
}

/**
 * Finds a dry, supported stand that can reach one of the supplied lava
 * sources. It first tries existing open space, then permits the pathfinder to
 * excavate a two-block-high approach without ever asking it to enter lava.
 */
export function approachLavaSourceFromSide(
  driver: BeatGameDriver,
  observation: BeatGameObservation,
  sources: readonly BeatGameBlockObservation[],
  options: ApproachLavaSourceOptions,
): Effect.Effect<BeatGameBlockObservation, BeatGameDriverError> {
  return Effect.gen(function* () {
    const nearbySources = [...sources].sort((left, right) =>
      Math.min(
        PREFERRED_LAVA_SOURCE_CLUSTER_SIZE,
        lavaSourceClusterSize(right, sources),
      )
      - Math.min(
        PREFERRED_LAVA_SOURCE_CLUSTER_SIZE,
        lavaSourceClusterSize(left, sources),
      )
      || Math.abs(observation.player.position.y - left.position.y)
      - Math.abs(observation.player.position.y - right.position.y)
      || distanceSquared(observation.player.position, left.position)
      - distanceSquared(observation.player.position, right.position)
    );
    const preparedSources = yield* Effect.forEach(
      nearbySources,
      (source) =>
        queryLavaInteractionVolume(driver, source.position).pipe(
          Effect.map((blocks) => {
            const candidates = lavaInteractionStandCandidates(
              source.position,
            ).sort((left, right) =>
              lavaSightlineObstructionCount(
                blocks,
                left,
                source.position,
              )
                - lavaSightlineObstructionCount(
                  blocks,
                  right,
                  source.position,
                )
              || distanceSquared(observation.player.position, left)
                - distanceSquared(observation.player.position, right)
            );
            return { source, blocks, candidates };
          }),
        ),
      { concurrency: 1 },
    );

    const attemptedDryStands = new Set<string>();
    for (const prepared of preparedSources) {
      for (const candidate of prepared.candidates) {
        const key = positionKey(candidate);
        if (
          attemptedDryStands.has(key)
          || !isSafeLavaInteractionStand(prepared.blocks, candidate)
        ) {
          continue;
        }
        attemptedDryStands.add(key);
        const reached = yield* pathfindToLavaInteractionStand(
          driver,
          candidate,
          options.path,
          false,
        );
        if (
          reached
          && (
            options.requireExposableSource !== true
            || (yield* isLavaSourceExposableFromCurrentPosition(
              driver,
              prepared.source,
            ))
          )
        ) {
          return prepared.source;
        }
      }
    }

    const attemptedExcavationStands = new Set<string>();
    for (const prepared of preparedSources) {
      for (const candidate of prepared.candidates) {
        const key = positionKey(candidate);
        if (
          attemptedExcavationStands.has(key)
          || !isExcavatableLavaInteractionStand(
            prepared.source.position,
            prepared.blocks,
            candidate,
          )
        ) {
          continue;
        }
        attemptedExcavationStands.add(key);
        const reached = yield* pathfindToLavaInteractionStand(
          driver,
          candidate,
          options.path,
          true,
        );
        if (
          reached
          && (
            options.requireExposableSource !== true
            || (yield* isLavaSourceExposableFromCurrentPosition(
              driver,
              prepared.source,
            ))
          )
        ) {
          return prepared.source;
        }
      }
    }
    return yield* Effect.fail(new BeatGameDriverError({
      operation: "approach-lava-source",
      code: "unreachable",
      retryable: true,
      message:
        `Could not reach, excavate, or expose a safe side-on stand beside ${
          nearbySources.length
        } nearby lava source${nearbySources.length === 1 ? "" : "s"}`,
    }));
  });
}

function lavaSourceClusterSize(
  source: BeatGameBlockObservation,
  sources: readonly BeatGameBlockObservation[],
): number {
  return sources.filter((candidate) =>
    candidate.position.dimension === source.position.dimension
    && distanceSquared(candidate.position, source.position)
      <= LAVA_SOURCE_CLUSTER_RADIUS ** 2
  ).length;
}

function isLavaSourceExposableFromCurrentPosition(
  driver: BeatGameDriver,
  source: BeatGameBlockObservation,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.gen(function* () {
    const current = yield* driver.observe;
    const eyePosition = {
      ...current.player.position,
      y: current.player.position.y + 1.62,
    };
    const sourceCenter = blockCenter(source.position);
    const direction = {
      x: sourceCenter.x - eyePosition.x,
      y: sourceCenter.y - eyePosition.y,
      z: sourceCenter.z - eyePosition.z,
    };
    const sourceDistance = Math.sqrt(distanceSquared(
      eyePosition,
      sourceCenter,
    ));
    if (sourceDistance > LIQUID_INTERACTION_REACH) {
      return false;
    }
    const obstruction = (yield* driver.raycast({
      direction,
      maximumDistance: Math.min(
        LIQUID_INTERACTION_REACH,
        sourceDistance + 0.05,
      ),
      includeFluids: false,
    })).block;
    return obstruction === undefined
      || sameBlockPosition(obstruction.position, source.position);
  });
}

function queryLavaInteractionVolume(
  driver: BeatGameDriver,
  source: BeatGameBlockPosition,
): Effect.Effect<
  ReadonlyMap<string, BeatGameBlockObservation>,
  BeatGameDriverError
> {
  return driver.queryBlocks({
    center: blockCenter(source),
    radius: LAVA_INTERACTION_VOLUME_RADIUS,
    selector: {},
    maximumResults: LAVA_INTERACTION_VOLUME_MAXIMUM_RESULTS,
  }).pipe(
    Effect.map((blocks) =>
      new Map(blocks.map((block) => [positionKey(block.position), block]))
    ),
  );
}

function pathfindToLavaInteractionStand(
  driver: BeatGameDriver,
  candidate: BeatGamePosition,
  path: BeatGamePathPolicy,
  allowMining: boolean,
): Effect.Effect<boolean, BeatGameDriverError> {
  return driver.pathfind(
    candidate,
    LIQUID_INTERACTION_STAND_RADIUS,
    {
      ...path,
      allowMining,
      avoidFluids: true,
      maxFallDistance: Math.min(path.maxFallDistance, 1),
    },
  ).pipe(
    Effect.as(true),
    Effect.catchTag("BeatGameDriverError", () => Effect.succeed(false)),
  );
}

function lavaInteractionStandCandidates(
  source: BeatGameBlockPosition,
): BeatGamePosition[] {
  const sourceCenter = blockCenter(source);
  const candidates: BeatGamePosition[] = [];
  const horizontalReach = Math.floor(LIQUID_INTERACTION_REACH);
  for (let xOffset = -horizontalReach; xOffset <= horizontalReach; xOffset++) {
    for (
      let zOffset = -horizontalReach;
      zOffset <= horizontalReach;
      zOffset++
    ) {
      if (xOffset === 0 && zOffset === 0) {
        continue;
      }
      for (let yOffset = -1; yOffset <= 3; yOffset++) {
        const candidate = {
          x: source.x + xOffset + 0.5,
          y: source.y + yOffset,
          z: source.z + zOffset + 0.5,
          dimension: source.dimension,
        };
        const eyePosition = {
          ...candidate,
          y: candidate.y + 1.62,
        };
        if (
          Math.sqrt(distanceSquared(eyePosition, sourceCenter))
            <= LIQUID_INTERACTION_REACH
        ) {
          candidates.push(candidate);
        }
      }
    }
  }
  return candidates;
}

function lavaSightlineObstructionCount(
  blocks: ReadonlyMap<string, BeatGameBlockObservation>,
  candidate: BeatGamePosition,
  source: BeatGameBlockPosition,
): number {
  const eye = { ...candidate, y: candidate.y + 1.62 };
  const target = blockCenter(source);
  const length = Math.sqrt(distanceSquared(eye, target));
  const samples = Math.max(1, Math.ceil(length * 5));
  const visited = new Set<string>();
  let obstructions = 0;
  for (let sample = 1; sample < samples; sample += 1) {
    const progress = sample / samples;
    const position = {
      x: Math.floor(eye.x + (target.x - eye.x) * progress),
      y: Math.floor(eye.y + (target.y - eye.y) * progress),
      z: Math.floor(eye.z + (target.z - eye.z) * progress),
      dimension: source.dimension,
    } satisfies BeatGameBlockPosition;
    if (sameBlockPosition(position, source)) {
      continue;
    }
    const key = positionKey(position);
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    const block = blocks.get(key);
    if (
      block !== undefined
      && !block.replaceable
      && !isFluidBlock(block.blockId)
    ) {
      obstructions += 1;
    }
  }
  return obstructions;
}

function isSafeLavaInteractionStand(
  blocks: ReadonlyMap<string, BeatGameBlockObservation>,
  candidate: BeatGamePosition,
): boolean {
  const body = floorBlockPosition(candidate);
  const feet = blocks.get(positionKey(body));
  const head = blocks.get(positionKey({ ...body, y: body.y + 1 }));
  const support = blocks.get(positionKey({ ...body, y: body.y - 1 }));
  return feet?.replaceable === true
    && head?.replaceable === true
    && isStableSupport(support)
    && ![feet, head, support].some((block) =>
      block !== undefined && isFluidBlock(block.blockId)
    );
}

function isExcavatableLavaInteractionStand(
  source: BeatGameBlockPosition,
  blocks: ReadonlyMap<string, BeatGameBlockObservation>,
  candidate: BeatGamePosition,
): boolean {
  const body = floorBlockPosition(candidate);
  const feet = blocks.get(positionKey(body));
  const head = blocks.get(positionKey({ ...body, y: body.y + 1 }));
  const support = blocks.get(positionKey({ ...body, y: body.y - 1 }));
  const horizontalDistance = Math.max(
    Math.abs(body.x - source.x),
    Math.abs(body.z - source.z),
  );
  return horizontalDistance >= 2
    && isStableSupport(support)
    && [feet, head].every((block) =>
      block !== undefined
      && !isFluidBlock(block.blockId)
      && (
        block.replaceable
        || block.diggable && !isGravityAffectedBlockId(block.blockId)
      )
    );
}

function isStableSupport(
  block: BeatGameBlockObservation | undefined,
): block is BeatGameBlockObservation {
  return block !== undefined
    && block.solid === true
    && !block.replaceable
    && !isGravityAffectedBlockId(block.blockId);
}

function isGravityAffectedBlockId(blockId: string): boolean {
  return blockId === "minecraft:sand"
    || blockId === "minecraft:red_sand"
    || blockId === "minecraft:gravel"
    || blockId === "minecraft:dragon_egg"
    || blockId.endsWith("_concrete_powder")
    || blockId.endsWith("_anvil");
}

function isFluidBlock(blockId: string): boolean {
  return FLUID_BLOCK_IDS.has(blockId);
}

function blockCenter(position: BeatGameBlockPosition): BeatGamePosition {
  return {
    ...position,
    x: position.x + 0.5,
    y: position.y + 0.5,
    z: position.z + 0.5,
  };
}

function floorBlockPosition(
  position: BeatGamePosition,
): BeatGameBlockPosition {
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z),
    dimension: position.dimension,
  };
}

function sameBlockPosition(
  left: BeatGameBlockPosition,
  right: BeatGameBlockPosition,
): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.z === right.z
    && left.dimension === right.dimension;
}

function positionKey(position: BeatGameBlockPosition): string {
  return `${position.dimension}:${position.x}:${position.y}:${position.z}`;
}
