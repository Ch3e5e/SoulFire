import {
  BeatGamePhase,
  type BeatGameCheckpoint,
  type BeatGameItemRequirement,
  type BeatGameObservation,
  type BeatGamePlannerState,
  type BeatGameStrategy,
} from "./model.js";
import {
  CRITICAL_HUNGER_FOOD_LEVEL,
  EDIBLE_FOOD_ITEM_IDS,
  EMERGENCY_FOOD_ITEM_IDS,
  RAW_FOOD_TO_COOKED,
  URGENT_HUNGER_FOOD_LEVEL,
  requirementsForPhase,
} from "./requirements.js";

const FOOD_RESERVE_REFILL_TOLERANCE = 2;

const COOKABLE_RAW_FOOD_ITEM_IDS = new Set(
  Object.keys(RAW_FOOD_TO_COOKED),
);

export type BeatGamePlannerDecision =
  | {
    readonly type: "advance-phase";
    readonly from: BeatGamePhase;
    readonly to: BeatGamePhase;
    readonly objective: string;
  }
  | {
    readonly type: "recover-death";
    readonly action: "recover-death";
  }
  | {
    readonly type: "eat";
    readonly action: "eat";
  }
  | {
    readonly type: "retreat";
    readonly action: "retreat";
  }
  | {
    readonly type: "prepare-equipment";
    readonly action: "prepare-equipment";
  }
  | {
    readonly type: "satisfy-requirement";
    readonly action: string;
    readonly requirement: BeatGameItemRequirement;
  }
  | {
    readonly type: "build-and-enter-nether";
    readonly action: "build-and-enter-nether";
  }
  | {
    readonly type: "return-through-portal";
    readonly action: "return-through-portal";
  }
  | {
    readonly type: "throw-eye";
    readonly action: "throw-eye";
  }
  | {
    readonly type: "search-stronghold";
    readonly action: "search-stronghold";
  }
  | {
    readonly type: "activate-end-portal";
    readonly action: "activate-end-portal";
  }
  | {
    readonly type: "fight-ender-dragon";
    readonly action: "fight-ender-dragon";
  }
  | {
    readonly type: "collect-dragon-egg";
    readonly action: "collect-dragon-egg";
  }
  | {
    readonly type: "exit-end";
    readonly action: "exit-end";
  };

export interface BeatGamePlannerInput {
  readonly checkpoint: BeatGameCheckpoint;
  readonly observation: BeatGameObservation;
  readonly strategy: BeatGameStrategy;
}

export function decideBeatGameAction(
  input: BeatGamePlannerInput,
): BeatGamePlannerDecision {
  const { checkpoint, observation, strategy } = input;
  const { phase } = checkpoint.planner;
  if (observation.player.dead) {
    return { type: "recover-death", action: "recover-death" };
  }
  if (
    observation.player.food <= strategy.eatBelowFood
    && hasEdibleFood(observation)
    && (
      hasReadyFood(observation)
      || phase !== BeatGamePhase.PREPARE_OVERWORLD
      || observation.player.food <= CRITICAL_HUNGER_FOOD_LEVEL
    )
  ) {
    return { type: "eat", action: "eat" };
  }
  const requirements = requirementsForPhase(
    phase,
    observation.inventory,
    strategy,
  );
  if (observation.player.food <= URGENT_HUNGER_FOOD_LEVEL) {
    const foodSupply = requirementsForPhase(
      BeatGamePhase.PREPARE_OVERWORLD,
      observation.inventory,
      strategy,
    ).find(({ key }) => key === "food-supply");
    if (foodSupply !== undefined && !foodSupply.satisfied) {
      return requirementDecision(foodSupply);
    }
  }
  if (
    phase === BeatGamePhase.PREPARE_OVERWORLD
    && observation.player.food <= strategy.eatBelowFood
    && hasCookableRawFood(observation)
  ) {
    const food = requirements.find(({ key }) => key === "food");
    if (food !== undefined && !food.satisfied) {
      return requirementDecision(food);
    }
  }
  if (observation.player.health < strategy.minimumHealth) {
    const food = requirements.find(({ key }) => key === "food");
    if (
      !hasFood(observation, strategy)
      && food !== undefined
      && !food.satisfied
    ) {
      return requirementDecision(food);
    }
    return { type: "retreat", action: "retreat" };
  }
  const firstMissing = requirements.find(({ satisfied }) => !satisfied);
  const missing = firstMissing !== undefined
      && shouldDeferFoodReserveRefill(firstMissing, observation, strategy)
    ? requirements.find((requirement) =>
      !requirement.satisfied
      && !shouldDeferFoodReserveRefill(requirement, observation, strategy)
    ) ?? firstMissing
    : firstMissing;
  switch (phase) {
    case BeatGamePhase.PREPARE_OVERWORLD:
      if (missing !== undefined) {
        return requirementDecision(missing);
      }
      return checkpoint.planner.completedActions.includes("prepare-equipment")
        ? phaseTransition(phase, BeatGamePhase.ENTER_NETHER)
        : {
          type: "prepare-equipment",
          action: "prepare-equipment",
        };
    case BeatGamePhase.ENTER_NETHER:
      if (isNether(observation.player.position.dimension)) {
        return phaseTransition(
          phase,
          BeatGamePhase.COLLECT_NETHER_RESOURCES,
        );
      }
      return missing === undefined
        ? {
          type: "build-and-enter-nether",
          action: "build-and-enter-nether",
        }
        : requirementDecision(missing);
    case BeatGamePhase.COLLECT_NETHER_RESOURCES:
      return missing === undefined
        ? phaseTransition(phase, BeatGamePhase.RETURN_TO_OVERWORLD)
        : requirementDecision(missing);
    case BeatGamePhase.RETURN_TO_OVERWORLD:
      return isNether(observation.player.position.dimension)
        ? {
          type: "return-through-portal",
          action: "return-through-portal",
        }
        : phaseTransition(phase, BeatGamePhase.LOCATE_STRONGHOLD);
    case BeatGamePhase.LOCATE_STRONGHOLD:
      if (checkpoint.memory.strongholdEstimate !== undefined) {
        return { type: "search-stronghold", action: "search-stronghold" };
      }
      return missing === undefined
        ? { type: "throw-eye", action: "throw-eye" }
        : requirementDecision(missing);
    case BeatGamePhase.ACTIVATE_END_PORTAL:
      if (isEnd(observation.player.position.dimension)) {
        return phaseTransition(phase, BeatGamePhase.FIGHT_ENDER_DRAGON);
      }
      return missing === undefined
        ? {
          type: "activate-end-portal",
          action: "activate-end-portal",
        }
        : requirementDecision(missing);
    case BeatGamePhase.FIGHT_ENDER_DRAGON:
      return missing === undefined
        ? {
        type: "fight-ender-dragon",
        action: "fight-ender-dragon",
        }
        : requirementDecision(missing);
    case BeatGamePhase.COLLECT_DRAGON_EGG: {
      if ((observation.inventory.counts["minecraft:dragon_egg"] ?? 0) > 0) {
        return phaseTransition(phase, BeatGamePhase.EXIT_END);
      }
      const missingTool = requirements.find(({ key, satisfied }) =>
        key !== "dragon-egg" && !satisfied
      );
      return missingTool === undefined
        ? {
          type: "collect-dragon-egg",
          action: "collect-dragon-egg",
        }
        : requirementDecision(missingTool);
    }
    case BeatGamePhase.EXIT_END:
      return isEnd(observation.player.position.dimension)
        ? { type: "exit-end", action: "exit-end" }
        : phaseTransition(phase, BeatGamePhase.COMPLETE);
    case BeatGamePhase.COMPLETE:
      return phaseTransition(phase, phase);
  }
}

function shouldDeferFoodReserveRefill(
  requirement: BeatGameItemRequirement,
  observation: BeatGameObservation,
  strategy: BeatGameStrategy,
): boolean {
  return observation.player.food > strategy.eatBelowFood
    && (
      requirement.key === "food-supply"
      || requirement.key === "food"
    )
    && requirement.currentCount >= Math.max(
      1,
      requirement.targetCount - FOOD_RESERVE_REFILL_TOLERANCE,
    );
}

function hasFood(
  observation: BeatGameObservation,
  strategy: BeatGameStrategy,
): boolean {
  if (observation.player.food >= 18) {
    return true;
  }
  const foodIds = requirementsForPhase(
    BeatGamePhase.PREPARE_OVERWORLD,
    observation.inventory,
    strategy,
  ).find(({ key }) => key === "food")?.itemIds ?? [];
  return [...foodIds, ...EMERGENCY_FOOD_ITEM_IDS].some((itemId) =>
    (observation.inventory.counts[itemId] ?? 0) > 0
  );
}

function hasEdibleFood(observation: BeatGameObservation): boolean {
  return [...EDIBLE_FOOD_ITEM_IDS, ...EMERGENCY_FOOD_ITEM_IDS].some((itemId) =>
    (observation.inventory.counts[itemId] ?? 0) > 0
  );
}

function hasReadyFood(observation: BeatGameObservation): boolean {
  return [...EDIBLE_FOOD_ITEM_IDS, ...EMERGENCY_FOOD_ITEM_IDS].some(
    (itemId) =>
      !COOKABLE_RAW_FOOD_ITEM_IDS.has(itemId)
      && (observation.inventory.counts[itemId] ?? 0) > 0,
  );
}

function hasCookableRawFood(observation: BeatGameObservation): boolean {
  return Object.keys(RAW_FOOD_TO_COOKED).some((itemId) =>
    (observation.inventory.counts[itemId] ?? 0) > 0
  );
}

export function plannerWithObservation(
  planner: BeatGamePlannerState,
  observation: BeatGameObservation,
  strategy: BeatGameStrategy,
): BeatGamePlannerState {
  const now = new Date().toISOString();
  return {
    ...planner,
    requirements: requirementsForPhase(
      planner.phase,
      observation.inventory,
      strategy,
    ),
    updatedAt: now,
  };
}

export function nextPhase(phase: BeatGamePhase): BeatGamePhase {
  switch (phase) {
    case BeatGamePhase.PREPARE_OVERWORLD:
      return BeatGamePhase.ENTER_NETHER;
    case BeatGamePhase.ENTER_NETHER:
      return BeatGamePhase.COLLECT_NETHER_RESOURCES;
    case BeatGamePhase.COLLECT_NETHER_RESOURCES:
      return BeatGamePhase.RETURN_TO_OVERWORLD;
    case BeatGamePhase.RETURN_TO_OVERWORLD:
      return BeatGamePhase.LOCATE_STRONGHOLD;
    case BeatGamePhase.LOCATE_STRONGHOLD:
      return BeatGamePhase.ACTIVATE_END_PORTAL;
    case BeatGamePhase.ACTIVATE_END_PORTAL:
      return BeatGamePhase.FIGHT_ENDER_DRAGON;
    case BeatGamePhase.FIGHT_ENDER_DRAGON:
      return BeatGamePhase.COLLECT_DRAGON_EGG;
    case BeatGamePhase.COLLECT_DRAGON_EGG:
      return BeatGamePhase.EXIT_END;
    case BeatGamePhase.EXIT_END:
    case BeatGamePhase.COMPLETE:
      return BeatGamePhase.COMPLETE;
  }
}

export function objectiveForPhase(phase: BeatGamePhase): string {
  switch (phase) {
    case BeatGamePhase.PREPARE_OVERWORLD:
      return "Prepare food, tools, and portal materials";
    case BeatGamePhase.ENTER_NETHER:
      return "Build, ignite, and enter a Nether portal";
    case BeatGamePhase.COLLECT_NETHER_RESOURCES:
      return "Collect blaze rods, pearls, and supporting resources";
    case BeatGamePhase.RETURN_TO_OVERWORLD:
      return "Return safely to the Overworld";
    case BeatGamePhase.LOCATE_STRONGHOLD:
      return "Triangulate and locate the stronghold";
    case BeatGamePhase.ACTIVATE_END_PORTAL:
      return "Fill the End portal frames and enter the End";
    case BeatGamePhase.FIGHT_ENDER_DRAGON:
      return "Destroy the End crystals and defeat the dragon";
    case BeatGamePhase.COLLECT_DRAGON_EGG:
      return "Collect the dragon egg from the exit portal";
    case BeatGamePhase.EXIT_END:
      return "Enter the exit portal and return from the End";
    case BeatGamePhase.COMPLETE:
      return "The dragon egg is secured and the bot has left the End";
  }
}

export function isNether(dimension: string): boolean {
  return dimension === "minecraft:the_nether"
    || dimension.endsWith(":the_nether");
}

export function isEnd(dimension: string): boolean {
  return dimension === "minecraft:the_end"
    || dimension.endsWith(":the_end");
}

function phaseTransition(
  from: BeatGamePhase,
  to: BeatGamePhase,
): BeatGamePlannerDecision {
  return {
    type: "advance-phase",
    from,
    to,
    objective: objectiveForPhase(to),
  };
}

function requirementDecision(
  requirement: BeatGameItemRequirement,
): BeatGamePlannerDecision {
  return {
    type: "satisfy-requirement",
    action: `satisfy:${requirement.key}`,
    requirement,
  };
}
