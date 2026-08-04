import type {
  BeatGameBlockObservation,
  BeatGameCheckpoint,
  BeatGameEntityObservation,
  BeatGameObservation,
  BeatGamePathPolicy,
  BeatGamePosition,
  BeatGameStrategy,
} from "../src/model.js";
import type { BeatGamePlannerDecision } from "../src/planner.js";
import type { BeatGameSurfaceColumn } from "../src/driver.js";

interface DebugVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type SmokePathGoal =
  | Readonly<{
    type: "position";
    position: BeatGamePosition;
    radius: number;
  }>
  | Readonly<{
    type: "xz";
    x: number;
    z: number;
    dimension: string;
    radius: number;
  }>;

export interface SmokeActivePathTrace {
  readonly pathId: string;
  readonly startedAt: string;
  readonly origin: BeatGamePosition;
  readonly goal: SmokePathGoal;
  readonly policy: BeatGamePathPolicy;
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

export interface SmokeDecisionDiagnosticsInput {
  readonly checkpoint: BeatGameCheckpoint;
  readonly observation: BeatGameObservation;
  readonly strategy: BeatGameStrategy;
  readonly nextIfReplanned: BeatGamePlannerDecision;
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

export function buildSmokeActivePathDiagnostics(
  trace: SmokeActivePathTrace,
  currentPosition: BeatGamePosition,
  capturedAt: string,
) {
  const sameDimension = trace.origin.dimension === currentPosition.dimension;
  const elapsedMs = Math.max(
    0,
    Date.parse(capturedAt) - Date.parse(trace.startedAt),
  );
  const goalDimension = trace.goal.type === "position"
    ? trace.goal.position.dimension
    : trace.goal.dimension;
  const distanceToGoal = goalDimension !== currentPosition.dimension
    ? undefined
    : trace.goal.type === "position"
    ? Math.max(
      0,
      distance(currentPosition, trace.goal.position) - trace.goal.radius,
    )
    : Math.max(
      0,
      Math.hypot(
        trace.goal.x - currentPosition.x,
        trace.goal.z - currentPosition.z,
      ) - trace.goal.radius,
    );

  return {
    ...trace,
    status: "active" as const,
    capturedAt,
    elapsedMs,
    currentPosition,
    displacementFromOrigin: sameDimension
      ? distance(trace.origin, currentPosition)
      : undefined,
    distanceToGoal,
  };
}

export function buildSmokeDecisionDiagnostics(
  input: SmokeDecisionDiagnosticsInput,
) {
  const { checkpoint, observation, strategy, nextIfReplanned } = input;
  const { planner } = checkpoint;
  const pendingRequirements = planner.requirements
    .filter(({ satisfied }) => !satisfied)
    .map((requirement) => ({
      key: requirement.key,
      priority: requirement.priority,
      currentCount: requirement.currentCount,
      targetCount: requirement.targetCount,
      missingCount: Math.max(
        0,
        requirement.targetCount - requirement.currentCount,
      ),
    }));
  const rememberedDeaths = [...checkpoint.memory.deathPositions]
    .sort((left, right) =>
      Date.parse(right.observedAt) - Date.parse(left.observedAt)
    )
    .map((entry) => ({
      key: entry.key,
      observedAt: entry.observedAt,
      position: {
        x: entry.value.x,
        y: entry.value.y,
        z: entry.value.z,
        dimension: entry.value.dimension,
      },
      inventoryCounts: entry.value.inventoryCounts ?? {},
    }));
  const activeAction = planner.currentAction === undefined
    ? undefined
    : {
      action: planner.currentAction,
      ...(planner.currentActionId === undefined
        ? {}
        : { actionId: planner.currentActionId }),
      retryCount: planner.retryCount,
      reason: explainCurrentAction(
        planner.currentAction,
        checkpoint,
        observation,
        strategy,
        nextIfReplanned,
      ),
    };

  return {
    phase: {
      current: planner.phase,
      objective: planner.objective,
      status: planner.status,
    },
    activeAction,
    nextIfReplanned: {
      decision: nextIfReplanned,
      reason: explainDecision(nextIfReplanned, checkpoint, observation, strategy),
    },
    signals: {
      dead: observation.player.dead,
      health: observation.player.health,
      minimumHealth: strategy.minimumHealth,
      food: observation.player.food,
      eatBelowFood: strategy.eatBelowFood,
      air: observation.player.air,
      maxAir: observation.player.maxAir,
      dimension: observation.player.position.dimension,
      inventoryRevision: observation.inventory.revision,
      observationRevision: observation.player.revision,
    },
    blockers: {
      pendingRequirements,
      rememberedDeaths,
    },
    progress: {
      lastStableAction: checkpoint.lastStableAction,
      recentlyCompletedActions: planner.completedActions.slice(-12),
    },
  };
}

export function summarizeSmokeSpatialDiagnostics(
  diagnostics: ReturnType<typeof buildSmokeSpatialDiagnostics>,
) {
  return {
    capture: diagnostics.capture,
    blocks: {
      radius: diagnostics.blocks.radius,
      observed: diagnostics.blocks.observed,
      air: diagnostics.blocks.air,
      fluids: diagnostics.blocks.fluids,
      solid: diagnostics.blocks.solid,
      byBlockId: diagnostics.blocks.byBlockId,
      closest: diagnostics.blocks.observations
        .filter(({ blockId }) => blockId !== "minecraft:air")
        .slice(0, 24),
    },
    entities: {
      radius: diagnostics.entities.radius,
      observed: diagnostics.entities.observed,
      hostileCount: diagnostics.entities.hostile.length,
      itemCount: diagnostics.entities.items.length,
      otherCount: diagnostics.entities.other.length,
      closestHostile: diagnostics.entities.hostile.slice(0, 12),
      closestItems: diagnostics.entities.items.slice(0, 12),
      closestOther: diagnostics.entities.other.slice(0, 12),
    },
    surface: {
      radius: diagnostics.surface.radius,
      observed: diagnostics.surface.observed,
      unloaded: diagnostics.surface.unloaded,
      minimumY: diagnostics.surface.minimumY,
      maximumY: diagnostics.surface.maximumY,
      byBlockId: diagnostics.surface.byBlockId,
    },
  };
}

function explainCurrentAction(
  action: string,
  checkpoint: BeatGameCheckpoint,
  observation: BeatGameObservation,
  strategy: BeatGameStrategy,
  nextIfReplanned: BeatGamePlannerDecision,
): string {
  if ("action" in nextIfReplanned && nextIfReplanned.action === action) {
    return explainDecision(nextIfReplanned, checkpoint, observation, strategy);
  }
  if (action === "recover-death") {
    const remembered = checkpoint.memory.deathPositions.length;
    return observation.player.dead
      ? "The player is dead and must respawn before recovery can continue"
      : `The action is recovering ${remembered} remembered death location${
        remembered === 1 ? "" : "s"
      }`;
  }
  if (action.startsWith("satisfy:")) {
    const key = action.slice("satisfy:".length);
    const requirement = checkpoint.planner.requirements.find((candidate) =>
      candidate.key === key
    );
    if (requirement !== undefined) {
      return requirementReason(requirement);
    }
  }
  return `The planner is still executing ${action}; a fresh replan would choose ${
    "action" in nextIfReplanned ? nextIfReplanned.action : nextIfReplanned.type
  }`;
}

function explainDecision(
  decision: BeatGamePlannerDecision,
  checkpoint: BeatGameCheckpoint,
  observation: BeatGameObservation,
  strategy: BeatGameStrategy,
): string {
  switch (decision.type) {
    case "advance-phase":
      return `The ${decision.from} objective is complete, so the planner can advance to ${decision.to}`;
    case "recover-death":
      return observation.player.dead
        ? "The player is dead and must respawn before continuing"
        : `The planner remembers ${checkpoint.memory.deathPositions.length} death location${
          checkpoint.memory.deathPositions.length === 1 ? "" : "s"
        } with potentially recoverable items`;
    case "eat":
      return `Food is ${observation.player.food}, at or below the configured eating threshold of ${strategy.eatBelowFood}, and edible food is available`;
    case "retreat":
      return `Health is ${observation.player.health}, below the configured safety threshold of ${strategy.minimumHealth}`;
    case "satisfy-requirement":
      return requirementReason(decision.requirement);
    case "prepare-equipment":
      return "The Overworld resource requirements are satisfied, but equipment preparation has not completed";
    case "build-and-enter-nether":
      return "The Nether entry requirements are satisfied and the player is still in the Overworld";
    case "return-through-portal":
      return "The Nether resource requirements are satisfied and the player must return to the Overworld";
    case "throw-eye":
      return "The stronghold is not estimated yet and the eye supply requirement is satisfied";
    case "search-stronghold":
      return "A stronghold estimate is available and the planner is ready to search it";
    case "activate-end-portal":
      return "The End portal requirements are satisfied and the player has not entered the End";
    case "fight-ender-dragon":
      return "The dragon-fight requirements are satisfied and the fight remains incomplete";
    case "collect-dragon-egg":
      return "The dragon egg is not in inventory and all collection tools are available";
    case "exit-end":
      return "The dragon egg has been collected and the player remains in the End";
  }
}

function requirementReason(
  requirement: BeatGameCheckpoint["planner"]["requirements"][number],
): string {
  const missing = Math.max(
    0,
    requirement.targetCount - requirement.currentCount,
  );
  return `${requirement.key} is the highest-priority actionable requirement: ${missing} missing (${requirement.currentCount}/${requirement.targetCount}, priority ${requirement.priority})`;
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
