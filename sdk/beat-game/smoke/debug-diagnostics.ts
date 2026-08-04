import type {
  BeatGameBlockObservation,
  BeatGameEntityObservation,
  BeatGamePosition,
} from "../src/model.js";
import type { BeatGameSurfaceColumn } from "../src/driver.js";

interface DebugVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SmokeSpatialDiagnosticsInput {
  readonly origin: BeatGamePosition;
  readonly originVelocity: DebugVector;
  readonly finalPosition: BeatGamePosition;
  readonly localBlockRadius: number;
  readonly entityRadius: number;
  readonly surfaceRadius: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly blocks: readonly BeatGameBlockObservation[];
  readonly entities: readonly BeatGameEntityObservation[];
  readonly surface: readonly BeatGameSurfaceColumn[];
}

const HOSTILE_ENTITY_TYPES = new Set([
  "minecraft:blaze",
  "minecraft:bogged",
  "minecraft:breeze",
  "minecraft:cave_spider",
  "minecraft:creeper",
  "minecraft:drowned",
  "minecraft:elder_guardian",
  "minecraft:endermite",
  "minecraft:evoker",
  "minecraft:ghast",
  "minecraft:guardian",
  "minecraft:hoglin",
  "minecraft:husk",
  "minecraft:magma_cube",
  "minecraft:phantom",
  "minecraft:piglin_brute",
  "minecraft:pillager",
  "minecraft:ravager",
  "minecraft:shulker",
  "minecraft:silverfish",
  "minecraft:skeleton",
  "minecraft:slime",
  "minecraft:spider",
  "minecraft:stray",
  "minecraft:vex",
  "minecraft:vindicator",
  "minecraft:witch",
  "minecraft:wither_skeleton",
  "minecraft:zoglin",
  "minecraft:zombie",
  "minecraft:zombie_villager",
]);

const FLUID_BLOCK_IDS = new Set([
  "minecraft:bubble_column",
  "minecraft:lava",
  "minecraft:water",
]);

export function buildSmokeSpatialDiagnostics(
  input: SmokeSpatialDiagnosticsInput,
) {
  const blocks = input.blocks
    .map((block) => ({
      ...block,
      offset: offset(input.origin, block.position),
      distance: distance(input.origin, block.position),
    }))
    .sort(compareDistance);
  const entities = input.entities
    .map((entity) => {
      const relativePosition = offset(input.origin, entity.position);
      const relativeVelocity = {
        x: entity.velocity.x - input.originVelocity.x,
        y: entity.velocity.y - input.originVelocity.y,
        z: entity.velocity.z - input.originVelocity.z,
      };
      const entityDistance = vectorLength(relativePosition);
      const radialVelocity = entityDistance === 0
        ? 0
        : dot(relativePosition, relativeVelocity) / entityDistance;
      return {
        ...entity,
        category: entity.itemId !== undefined
          ? "item"
          : HOSTILE_ENTITY_TYPES.has(entity.entityType)
          ? "hostile"
          : "other",
        offset: relativePosition,
        distance: entityDistance,
        horizontalDistance: Math.hypot(
          relativePosition.x,
          relativePosition.z,
        ),
        relativeVelocity,
        closingSpeed: Math.max(0, -radialVelocity),
      } as const;
    })
    .sort(compareDistance);
  const loadedSurface = input.surface.filter((column) => column.loaded);
  const surfaceHeights = loadedSurface.flatMap((column) =>
    column.surfaceY === undefined ? [] : [column.surfaceY]
  );
  const durationMs = Math.max(
    0,
    Date.parse(input.completedAt) - Date.parse(input.startedAt),
  );

  return {
    capture: {
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs,
      origin: input.origin,
      finalPosition: input.finalPosition,
      displacement: distance(input.origin, input.finalPosition),
    },
    blocks: {
      radius: input.localBlockRadius,
      observed: blocks.length,
      air: blocks.filter((block) => block.blockId === "minecraft:air").length,
      fluids: blocks.filter((block) => FLUID_BLOCK_IDS.has(block.blockId)).length,
      solid: blocks.filter((block) => block.solid === true).length,
      byBlockId: countsBy(blocks, (block) => block.blockId),
      observations: blocks,
    },
    entities: {
      radius: input.entityRadius,
      observed: entities.length,
      hostile: entities.filter((entity) => entity.category === "hostile"),
      items: entities.filter((entity) => entity.category === "item"),
      other: entities.filter((entity) => entity.category === "other"),
      observations: entities,
    },
    surface: {
      radius: input.surfaceRadius,
      observed: input.surface.length,
      unloaded: input.surface.length - loadedSurface.length,
      minimumY: surfaceHeights.length === 0
        ? undefined
        : Math.min(...surfaceHeights),
      maximumY: surfaceHeights.length === 0
        ? undefined
        : Math.max(...surfaceHeights),
      byBlockId: countsBy(
        loadedSurface,
        (column) => column.blockId ?? "unknown",
      ),
      columns: input.surface.map((column) => ({
        ...column,
        offset: {
          x: column.x - input.origin.x,
          z: column.z - input.origin.z,
        },
      })),
    },
  };
}

function countsBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): readonly Readonly<{ id: string; count: number }>[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const id = key(value);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts]
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) =>
      right.count - left.count || left.id.localeCompare(right.id)
    );
}

function offset(
  origin: BeatGamePosition,
  position: Readonly<{ x: number; y: number; z: number }>,
): DebugVector {
  return {
    x: position.x - origin.x,
    y: position.y - origin.y,
    z: position.z - origin.z,
  };
}

function distance(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
): number {
  return Math.hypot(
    right.x - left.x,
    right.y - left.y,
    right.z - left.z,
  );
}

function vectorLength(vector: DebugVector): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function dot(left: DebugVector, right: DebugVector): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function compareDistance(
  left: Readonly<{ distance: number }>,
  right: Readonly<{ distance: number }>,
): number {
  return left.distance - right.distance;
}
