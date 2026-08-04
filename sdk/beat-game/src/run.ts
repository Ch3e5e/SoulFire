import type { SoulFireBot } from "@soulfiremc/sdk";
import {
  Deferred,
  Effect,
  Fiber,
  Ref,
  Stream,
  type Scope,
} from "effect";

import {
  acquire,
  activateEndPortal,
  attackEntity,
  attackNearest,
  buildNetherPortal,
  buildStructure,
  castNetherPortal,
  collectDragonEgg,
  collectBlocks,
  collectNearbyDrops,
  craftItem,
  eatWhenNeeded,
  enterEndPortal,
  enterPortal,
  equipBestArmor,
  exitEnd,
  excavateStaircase,
  explore,
  fish,
  flee,
  fightEnderDragon,
  respawnAndRecover,
  smelt,
  throwEyeOfEnder,
  transferContainerItems,
} from "./behaviors.js";
import { ReplayBroadcast } from "./broadcast.js";
import {
  InMemoryBeatGameCoordinator,
  type BeatGameCoordinator,
} from "./coordinator.js";
import {
  makeSoulFireBeatGameDriver,
  type BeatGameDriver,
  type BeatGameEntitySelector,
  type BeatGameSurfaceColumn,
} from "./driver.js";
import {
  BeatGameActionError,
  BeatGameCancelled,
  BeatGameDriverError,
  BeatGameObservationError,
  BeatGamePathfindingError,
  BeatGameProtocolError,
  BeatGameRequirementError,
  type BeatGameError,
} from "./errors.js";
import {
  createNetherPortalFrame,
  distanceSquared,
  NETHER_PORTAL_FRAME_OBSIDIAN_COUNT,
  rotationToward,
  triangulateStronghold,
} from "./geometry.js";
import {
  BEAT_GAME_CHECKPOINT_SCHEMA_VERSION,
  BeatGamePhase,
  BeatGameRunStatus,
  BeatGameTeamRole,
  PortalStrategy,
  defaultBeatGameStrategy,
  emptyBeatGameWorldMemory,
  type BeatGameBlockPosition,
  type BeatGameBlockObservation,
  type BeatGameCheckpoint,
  type BeatGameClaim,
  type BeatGameEntityObservation,
  type BeatGameEvent,
  type BeatGameExplorationFrontier,
  type BeatGameItemRequirement,
  type BeatGameMemoryEntry,
  type BeatGameObservation,
  type BeatGameOptions,
  type BeatGamePlannerState,
  type BeatGameResult,
  type BeatGamePosition,
  type BeatGameSnapshot,
  type BeatGameStrategy,
  type BeatGameStrategyOptions,
  type BeatGameTeamRunOptions,
} from "./model.js";
import {
  decideBeatGameAction,
  isEnd,
  isNether,
  objectiveForPhase,
  plannerWithObservation,
  type BeatGamePlannerDecision,
} from "./planner.js";
import type {
  BeatGamePolicyContext,
  BeatGameStrategyHooks,
} from "./policy.js";
import {
  COOKED_FOOD_ITEM_IDS,
  CRITICAL_HUNGER_FOOD_LEVEL,
  EDIBLE_FOOD_ITEM_IDS,
  EMERGENCY_FOOD_ITEM_IDS,
  LOG_ITEM_IDS,
  PLANK_ITEM_IDS,
  RAW_FOOD_TO_COOKED,
  URGENT_HUNGER_FOOD_LEVEL,
  requirementCount,
} from "./requirements.js";
import {
  assertValidCheckpoint,
  InMemoryBeatGameCheckpointStore,
  type BeatGameCheckpointStore,
} from "./stores.js";

type EventInput<T extends BeatGameEvent = BeatGameEvent> =
  T extends BeatGameEvent
    ? Omit<T, "sequence" | "timestamp" | "runId" | "instanceId" | "botId"
      | "phase">
    : never;

interface PreparedWorkstation {
  readonly position: BeatGameBlockPosition;
  readonly placed: boolean;
}

const WORKSTATION_REUSE_RADIUS = 32;
const WORKSTATION_APPROACH_RADIUS = 1.5;
const WORKSTATION_REUSE_MAX_VERTICAL_DISTANCE = 8;
const WORKSTATION_REUSE_MAX_SEARCH_TIME_MS = 5_000;
const WORKSTATION_REUSE_TIMEOUT_MS = 12_000;
const FURNACE_RECLAIM_TIMEOUT = "15 seconds";
const SHORE_PATH_MAX_SEARCH_TIME_MS = 5_000;
const SHORE_PATH_TIMEOUT_MS = 10_000;
const DRY_SURFACE_APPROACH_RADIUS = 0.75;
const FURNACE_RECOVERY_RADIUS = 12;
const NEARBY_REQUIREMENT_DROP_RADIUS = 12;
const NEARBY_REQUIREMENT_DROP_MAXIMUM_VERTICAL_DISTANCE = 6;
const URGENT_FOOD_DROP_MAXIMUM_VERTICAL_DISTANCE =
  NEARBY_REQUIREMENT_DROP_RADIUS;
const RESOURCE_COLLECTION_RESERVED_SLOTS = 3;
const REQUIREMENT_NO_PROGRESS_REPLAN_DELAY_MS = 1_000;
const LOCAL_NAVIGATION_RECOVERY_MINIMUM_DISTANCE = 3;
const LOCAL_NAVIGATION_RECOVERY_MAX_SEARCH_TIME_MS = 5_000;
const LOCAL_NAVIGATION_RECOVERY_TIMEOUT_MS = 15_000;
const EXPLORATION_MAXIMUM_LEG_DISTANCE = 32;
const EXPLORATION_MAXIMUM_SURFACE_ELEVATION_CHANGE = 12;
const MAX_SAFE_DEATH_RECOVERY_FAILURES = 3;
const MAX_VALUABLE_DEATH_RECOVERY_PREPARATION_FAILURES = 8;
const DEATH_RECOVERY_PREPARATION_PROGRESS_DISTANCE = 8;
const DISTANT_DEATH_RECOVERY_BOOTSTRAP_DISTANCE = 128;
const ACTIVE_CORPSE_RECOVERY_DISTANCE = 512;
const IMMEDIATE_CORPSE_RECOVERY_DISTANCE = 12;
const DEEP_CORPSE_EXCAVATION_MINIMUM_DEPTH = 32;
const DISTANT_CORPSE_EXCAVATION_MINIMUM_HORIZONTAL_DISTANCE = 64;
const CORPSE_DROP_INSPECTION_DISTANCE = 32;
const CORPSE_DROP_MATCH_RADIUS = 16;
const EMERGENCY_ARMAMENT_LOG_COUNT = 2;
const DEATH_RECOVERY_BOOTSTRAP_LOG_COUNT = 12;
const DEATH_RECOVERY_BOOTSTRAP_BLOCK_COUNT = 16;
const DEATH_RECOVERY_BOOTSTRAP_FOOD_COUNT = 8;
const DEATH_RECOVERY_MINIMUM_FOOD_COUNT = 3;
const DEATH_RECOVERY_AQUATIC_FALLBACK_EXPLORATION_LEGS = 2;
const DEATH_RECOVERY_FOOD_SEARCH_TIMEOUT_MS = 60_000;
const DEATH_RECOVERY_FOOD_SEARCH_PENDING =
  "still searching for enough travel food for distant corpse recovery";
const DISPOSABLE_DEATH_RECOVERY_ITEM_IDS = new Set([
  "minecraft:coarse_dirt",
  "minecraft:dirt",
  "minecraft:grass_block",
  "minecraft:mud",
  "minecraft:mycelium",
  "minecraft:podzol",
  "minecraft:rooted_dirt",
]);
const RENEWABLE_DEATH_RECOVERY_ITEM_IDS = new Set([
  ...DISPOSABLE_DEATH_RECOVERY_ITEM_IDS,
  ...LOG_ITEM_IDS,
  ...PLANK_ITEM_IDS,
  ...EDIBLE_FOOD_ITEM_IDS,
  ...EMERGENCY_FOOD_ITEM_IDS,
  "minecraft:acacia_sapling",
  "minecraft:andesite",
  "minecraft:arrow",
  "minecraft:birch_sapling",
  "minecraft:beetroot_seeds",
  "minecraft:black_wool",
  "minecraft:blue_wool",
  "minecraft:bone",
  "minecraft:brown_mushroom",
  "minecraft:brown_wool",
  "minecraft:charcoal",
  "minecraft:cherry_sapling",
  "minecraft:coal",
  "minecraft:cobbled_deepslate",
  "minecraft:cobblestone",
  "minecraft:crafting_table",
  "minecraft:cyan_wool",
  "minecraft:dark_oak_sapling",
  "minecraft:diorite",
  "minecraft:egg",
  "minecraft:feather",
  "minecraft:flint",
  "minecraft:furnace",
  "minecraft:granite",
  "minecraft:gray_wool",
  "minecraft:gravel",
  "minecraft:green_wool",
  "minecraft:gunpowder",
  "minecraft:ink_sac",
  "minecraft:jungle_sapling",
  "minecraft:leaf_litter",
  "minecraft:leather",
  "minecraft:light_blue_wool",
  "minecraft:light_gray_wool",
  "minecraft:lime_wool",
  "minecraft:magenta_wool",
  "minecraft:mangrove_propagule",
  "minecraft:melon_seeds",
  "minecraft:oak_sapling",
  "minecraft:orange_wool",
  "minecraft:pale_oak_sapling",
  "minecraft:pink_wool",
  "minecraft:pitcher_pod",
  "minecraft:pumpkin_seeds",
  "minecraft:purple_wool",
  "minecraft:raw_copper",
  "minecraft:rabbit_hide",
  "minecraft:red_mushroom",
  "minecraft:red_wool",
  "minecraft:sand",
  "minecraft:slime_ball",
  "minecraft:spider_eye",
  "minecraft:spruce_sapling",
  "minecraft:stick",
  "minecraft:stone",
  "minecraft:stone_axe",
  "minecraft:stone_hoe",
  "minecraft:stone_pickaxe",
  "minecraft:stone_shovel",
  "minecraft:stone_sword",
  "minecraft:string",
  "minecraft:torch",
  "minecraft:torchflower_seeds",
  "minecraft:wheat_seeds",
  "minecraft:white_wool",
  "minecraft:wooden_axe",
  "minecraft:wooden_hoe",
  "minecraft:wooden_pickaxe",
  "minecraft:wooden_shovel",
  "minecraft:wooden_sword",
  "minecraft:yellow_wool",
]);
const COOKABLE_RAW_FOOD_ITEM_IDS = new Set(
  Object.keys(RAW_FOOD_TO_COOKED),
);
const INVENTORY_DISCARD_PRIORITY = [
  "minecraft:leaf_litter",
  "minecraft:tripwire_hook",
  "minecraft:spider_eye",
  "minecraft:pufferfish",
  "minecraft:lily_pad",
  "minecraft:beetroot_seeds",
  "minecraft:melon_seeds",
  "minecraft:pitcher_pod",
  "minecraft:pumpkin_seeds",
  "minecraft:torchflower_seeds",
  "minecraft:wheat_seeds",
  "minecraft:oak_sapling",
  "minecraft:birch_sapling",
  "minecraft:spruce_sapling",
  "minecraft:acacia_sapling",
  "minecraft:cherry_sapling",
  "minecraft:jungle_sapling",
  "minecraft:dark_oak_sapling",
  "minecraft:pale_oak_sapling",
  "minecraft:mangrove_propagule",
  "minecraft:feather",
  "minecraft:sand",
  "minecraft:gravel",
  "minecraft:dirt",
  "minecraft:coarse_dirt",
  "minecraft:grass_block",
  "minecraft:mud",
  "minecraft:mycelium",
  "minecraft:podzol",
  "minecraft:rooted_dirt",
  "minecraft:raw_copper",
  "minecraft:andesite",
  "minecraft:diorite",
  "minecraft:granite",
  "minecraft:tuff",
] as const;
const INVENTORY_BUILDING_BLOCK_RESERVE = 64;
const INVENTORY_EMPTY_SLOT_BUFFER = 2;
const INVENTORY_EMPTY_SLOT_STABILITY_OBSERVATIONS = 12;
const INVENTORY_DISCARD_ESCAPE_DISTANCE = 3;
const INVENTORY_DISCARD_POCKET_DEPTH = 2;
const INVENTORY_DISCARD_SITE_DISTANCE = 6;
const INVENTORY_DISCARD_ESCAPE_MAX_SEARCH_TIME_MS = 3_000;
const LOW_VALUE_DEATH_RECOVERY_ITEM_IDS = new Set([
  ...DISPOSABLE_DEATH_RECOVERY_ITEM_IDS,
  "minecraft:acacia_sapling",
  "minecraft:arrow",
  "minecraft:birch_sapling",
  "minecraft:beetroot_seeds",
  "minecraft:bone",
  "minecraft:cherry_sapling",
  "minecraft:dark_oak_sapling",
  "minecraft:egg",
  "minecraft:feather",
  "minecraft:jungle_sapling",
  "minecraft:ink_sac",
  "minecraft:leaf_litter",
  "minecraft:mangrove_propagule",
  "minecraft:melon_seeds",
  "minecraft:oak_sapling",
  "minecraft:pale_oak_sapling",
  "minecraft:pitcher_pod",
  "minecraft:pumpkin_seeds",
  "minecraft:sand",
  "minecraft:spruce_sapling",
  "minecraft:torchflower_seeds",
  "minecraft:wheat_seeds",
]);
const SUBSTANTIAL_RENEWABLE_DEATH_RECOVERY_ITEM_COUNT = 8;
const SUBSTANTIAL_RENEWABLE_DEATH_RECOVERY_MAX_DISTANCE =
  ACTIVE_CORPSE_RECOVERY_DISTANCE;
const FURNACE_FUEL_SEARCH_RADIUS = 16;
const HUNT_ATTACK_APPROACH_RADIUS = 24;
const AQUATIC_HUNT_ATTACK_APPROACH_RADIUS = 4;
const HUNT_UNREACHABLE_TARGET_RETRY_DISTANCE = 4;
const HUNT_NEARBY_UNREACHABLE_RETRY_DELAY_MS = 5_000;
const HUNT_DISTANT_UNREACHABLE_RETRY_DELAY_MS = 15_000;
const AQUATIC_HUNT_VERTICAL_ROUTE_COST = 4;
const AQUATIC_HUNT_HEALTH_ROUTE_COST = 16;
const AQUATIC_HUNT_DEFAULT_HEALTH = 3;
const HUNT_APPROACH_BUFFER = 4;
const HUNT_APPROACH_GOAL_RADIUS = 2;
const HUNT_MAXIMUM_APPROACH_DISTANCE = 48;
const LAND_HUNT_MAXIMUM_VERTICAL_DISTANCE = 12;
const DIRECTED_HUNT_MAXIMUM_DETOUR = 32;
const DIRECTED_HUNT_DESTINATION_REACHED_RADIUS = 3;
const URGENT_AQUATIC_HUNT_MAXIMUM_HORIZONTAL_DISTANCE = 64;
const URGENT_AQUATIC_HUNT_MAXIMUM_VERTICAL_DISTANCE = 4;
const AQUATIC_HUNT_CHASE_TIMEOUT_MS = 30_000;
const AQUATIC_HUNT_MINIMUM_AIR_TICKS = 120;
const HUNT_DROP_RECOVERY_RADIUS = 48;
const HUNT_DROP_RECOVERY_MAXIMUM_VERTICAL_DISTANCE = 4;
const AQUATIC_HUNT_EMERGENCY_AIR_TICKS = 60;
const AQUATIC_HUNT_MAXIMUM_CHASE_ATTEMPTS = 3;
const WOUNDED_AQUATIC_FALLBACK_FOOD_LEVEL = 16;
const AQUATIC_WATER_ENTRY_SEARCH_RADIUS = 3;
const AQUATIC_WATER_ENTRY_ATTEMPTS = 12;
const MAXIMUM_DAMAGE_FREE_FALL_DISTANCE = 3;
const HUNT_DROP_ITEM_IDS_BY_ENTITY_TYPE: Readonly<
  Record<string, readonly string[]>
> = {
  "minecraft:blaze": ["minecraft:blaze_rod"],
  "minecraft:cave_spider": ["minecraft:string", "minecraft:spider_eye"],
  "minecraft:chicken": ["minecraft:chicken", "minecraft:feather"],
  "minecraft:cod": ["minecraft:cod"],
  "minecraft:cow": ["minecraft:beef", "minecraft:leather"],
  "minecraft:enderman": ["minecraft:ender_pearl"],
  "minecraft:husk": ["minecraft:rotten_flesh"],
  "minecraft:mooshroom": ["minecraft:beef", "minecraft:leather"],
  "minecraft:pig": ["minecraft:porkchop"],
  "minecraft:rabbit": ["minecraft:rabbit", "minecraft:rabbit_hide"],
  "minecraft:salmon": ["minecraft:salmon"],
  "minecraft:sheep": ["minecraft:mutton"],
  "minecraft:spider": ["minecraft:string", "minecraft:spider_eye"],
  "minecraft:zombie": ["minecraft:rotten_flesh"],
  "minecraft:zombie_villager": ["minecraft:rotten_flesh"],
};
const LIQUID_INTERACTION_APPROACH_RADIUS = 3;
const LIQUID_INTERACTION_STAND_RADIUS = 0.75;
// Keep a margin below the protocol interaction limit. A candidate at the
// exact limit can become unreachable after pathfinding settles within radius.
const LIQUID_INTERACTION_REACH = 4;
const FISHING_SHORE_SEARCH_RADIUS = Math.ceil(LIQUID_INTERACTION_REACH);
const FISHING_COLLECTION_BATCH_SIZE = 3;
const FISHING_MAXIMUM_FAILED_CASTS = 4;
const FISHING_MINIMUM_CAST_HORIZONTAL_DISTANCE = 2;
const FISHING_PREFERRED_CAST_HORIZONTAL_DISTANCE = 3;
const FISHING_MAXIMUM_DOWNWARD_CAST_PITCH = 30;
const MAXIMUM_LIQUID_SIGHT_CLEARING_BLOCKS = 4;
const LAVA_RETREAT_DISTANCE = 8;
const LAVA_EMERGENCY_SPRINT_MS = 1_500;
const IRON_SEARCH_Y = 16;
const IRON_SEARCH_MAX_Y = 24;
const IRON_SEARCH_DESCENT_STEP = 12;
const RESOURCE_SEARCH_PICKAXE_DURABILITY_RESERVE = 64;
const RESOURCE_DESCENT_PICKAXE_DURABILITY_RESERVE = 48;
const SURFACE_ESCAPE_PICKAXE_DURABILITY_PER_LEVEL = 3;
const STONE_PICKAXE_MAXIMUM_DURABILITY = 131;
const IRON_PICKAXE_MAXIMUM_DURABILITY = 250;
const DEEP_LAVA_SEARCH_Y = -52;
const DEEP_LAVA_SEARCH_MAX_Y = -48;
const DEEP_LAVA_DESCENT_STEP = 12;
const PORTAL_CASTING_ADDITIONAL_LAVA_SOURCE_COUNT =
  NETHER_PORTAL_FRAME_OBSIDIAN_COUNT - 1;
const EXPLORATION_REANCHOR_DISTANCE = 16;
const EXPLORATION_FRONTIER_LIMIT = 64;
const EXPLORATION_DEATH_DISPLACEMENT_WINDOW_MS = 10 * 60 * 1_000;
const AIR_ESCAPE_SURFACE_SEARCH_RADIUS = 16;
const AIR_ESCAPE_EXTENDED_SURFACE_SEARCH_RADIUS = 96;
const AIR_ESCAPE_EXTENDED_SURFACE_SAMPLE_STEP = 4;
const AIR_ESCAPE_SURFACE_APPROACH_ATTEMPTS = 180;
const AIR_ESCAPE_STAGNANT_OBSERVATIONS = 30;
const AIR_ESCAPE_MAXIMUM_RECOVERY_ATTEMPTS = 3;
const AIR_ESCAPE_DIRECTION_SECTORS = 8;
const AIR_ESCAPE_MAXIMUM_SWIMMABLE_RISE = 2;
const AIR_ESCAPE_MAXIMUM_SHAFT_BLOCKS = 64;
const AIR_ESCAPE_VERTICAL_PROGRESS_ATTEMPTS = 20;
const AIR_ESCAPE_VERTICAL_PROGRESS = 0.75;
const OVERWORLD_LOW_GROUND_MAX_Y = 62;
const OVERWORLD_FORCED_SURFACE_RECOVERY_MAX_Y = 64;
const SURFACE_RESOURCE_MINIMUM_Y_MARGIN = 4;
const SURFACE_RESOURCE_PATH_MINIMUM_Y_MARGIN = 1;
const SURFACE_NEIGHBOR_MAX_HEIGHT_DELTA = 1;
const MINIMUM_STABLE_SURFACE_NEIGHBORS = 2;
const ELEVATED_SURFACE_PATH_TIMEOUT_MS = 15_000;
const COAL_ORE_BLOCK_IDS = [
  "minecraft:coal_ore",
  "minecraft:deepslate_coal_ore",
] as const;
const DEATH_RECOVERY_BUILDING_BLOCK_IDS = [
  "minecraft:dirt",
  "minecraft:grass_block",
  "minecraft:coarse_dirt",
  "minecraft:rooted_dirt",
] as const;
const DEATH_RECOVERY_BUILDING_ITEM_IDS = [
  "minecraft:dirt",
  "minecraft:coarse_dirt",
] as const;
const DEATH_RECOVERY_ADDITIONAL_PLACE_ITEM_IDS = [
  ...LOG_ITEM_IDS,
  ...PLANK_ITEM_IDS,
] as const;
const FURNACE_FUEL_ITEM_IDS = [
  "minecraft:coal",
  "minecraft:charcoal",
] as const;
const MINING_PICKAXE_ITEM_IDS = [
  "minecraft:netherite_pickaxe",
  "minecraft:diamond_pickaxe",
  "minecraft:iron_pickaxe",
  "minecraft:stone_pickaxe",
  "minecraft:wooden_pickaxe",
  "minecraft:golden_pickaxe",
] as const;
const MELEE_WEAPON_ITEM_IDS = [
  "minecraft:netherite_sword",
  "minecraft:diamond_sword",
  "minecraft:iron_sword",
  "minecraft:stone_sword",
  "minecraft:wooden_sword",
] as const;
const STONE_OR_BETTER_MINING_PICKAXE_ITEM_IDS = [
  "minecraft:netherite_pickaxe",
  "minecraft:diamond_pickaxe",
  "minecraft:iron_pickaxe",
  "minecraft:stone_pickaxe",
] as const;
const PLAYER_FLUID_BLOCK_IDS = [
  "minecraft:water",
  "minecraft:bubble_column",
  "minecraft:kelp",
  "minecraft:kelp_plant",
  "minecraft:seagrass",
  "minecraft:tall_seagrass",
  "minecraft:lava",
] as const;
const DURABLE_MINING_PICKAXE_ITEM_IDS = [
  "minecraft:netherite_pickaxe",
  "minecraft:diamond_pickaxe",
  "minecraft:iron_pickaxe",
] as const;
const RESOURCE_COLLECTION_BUFFERS = {
  "blaze-rods": 2,
  cobblestone: 12,
  diamond: 2,
  "ender-pearls": 2,
  food: 4,
  fuel: 2,
  gold: 8,
  iron: 3,
  logs: 4,
} as const;
type BufferedResource = keyof typeof RESOURCE_COLLECTION_BUFFERS;

const FOOD_ANIMAL_ENTITY_TYPES = [
  "minecraft:cow",
  "minecraft:mooshroom",
  "minecraft:pig",
  "minecraft:rabbit",
  "minecraft:sheep",
  "minecraft:chicken",
  "minecraft:cod",
  "minecraft:salmon",
] as const;
const AQUATIC_FOOD_ENTITY_TYPES = new Set([
  "minecraft:cod",
  "minecraft:salmon",
]);
const EMERGENCY_FOOD_ENTITY_TYPES = [
  "minecraft:zombie",
  "minecraft:zombie_villager",
  "minecraft:husk",
] as const;
const EMERGENCY_FOOD_ENTITY_TYPE_SET = new Set<string>(
  EMERGENCY_FOOD_ENTITY_TYPES,
);
const EMERGENCY_FOOD_MAXIMUM_HORIZONTAL_DISTANCE = 16;
const EMERGENCY_FOOD_MAXIMUM_VERTICAL_DISTANCE = 6;
const HIGH_YIELD_FOOD_ANIMAL_TYPES = new Set([
  "minecraft:cow",
  "minecraft:mooshroom",
  "minecraft:pig",
  "minecraft:sheep",
]);
const HIGH_YIELD_FOOD_PREFERENCE_RADIUS = 32;
const SAFE_AQUATIC_FALLBACK_EXPLORATION_LEGS = 12;

const DANGEROUS_NEUTRAL_ENTITY_TYPES = [
  "minecraft:bee",
  "minecraft:dolphin",
  "minecraft:enderman",
  "minecraft:goat",
  "minecraft:iron_golem",
  "minecraft:llama",
  "minecraft:panda",
  "minecraft:polar_bear",
  "minecraft:trader_llama",
  "minecraft:wolf",
] as const;
const PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES = new Set([
  "minecraft:blaze",
  "minecraft:bogged",
  "minecraft:breeze",
  "minecraft:cave_spider",
  "minecraft:drowned",
  "minecraft:elder_guardian",
  "minecraft:endermite",
  "minecraft:evoker",
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
  "minecraft:slime",
  "minecraft:spider",
  "minecraft:stray",
  "minecraft:vex",
  "minecraft:vindicator",
  "minecraft:wither_skeleton",
  "minecraft:zoglin",
  "minecraft:zombie",
  "minecraft:zombie_villager",
]);
const SHIELD_BLOCKING_HOSTILE_ENTITY_TYPES = new Set([
  "minecraft:bogged",
  "minecraft:drowned",
  "minecraft:pillager",
  "minecraft:skeleton",
  "minecraft:stray",
]);
const PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES = new Set([
  "minecraft:bogged",
  "minecraft:pillager",
  "minecraft:skeleton",
  "minecraft:stray",
  "minecraft:witch",
]);
const COMMITTABLE_CLOSE_MELEE_ENTITY_TYPES = new Set([
  "minecraft:cave_spider",
  "minecraft:drowned",
  "minecraft:endermite",
  "minecraft:husk",
  "minecraft:magma_cube",
  "minecraft:silverfish",
  "minecraft:slime",
  "minecraft:spider",
  "minecraft:zombie",
  "minecraft:zombie_villager",
]);
const FAST_MELEE_PURSUER_ENTITY_TYPES = new Set([
  "minecraft:cave_spider",
  "minecraft:spider",
]);
const ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES = new Set([
  "minecraft:creeper",
  "minecraft:witch",
]);
const PROACTIVE_ESCAPE_ONLY_EVASION_RADIUS = 12;
const PROACTIVE_MELEE_DISENGAGEMENT_RADIUS = 12;
const MELEE_ENGAGEMENT_RADIUS = 4;
const CREEPER_PROACTIVE_EVASION_RADIUS = 8;
const CREEPER_EMERGENCY_REEVASION_RADIUS = 6;
const PROACTIVE_RANGED_ENGAGEMENT_RADIUS = 16;
const SHIELDED_AMBUSH_ESCAPE_THRESHOLD = 3;
const PROACTIVE_THREAT_MAXIMUM_VERTICAL_DISTANCE = 6;
const RANGED_THREAT_ESCAPE_TRIGGER_RADIUS = 24;
const RANGED_THREAT_ESCAPE_SAFE_DISTANCE = 32;
const ENDERMAN_WATER_ESCAPE_RADIUS = 16;
const DEFENSIVE_PURSUIT_MAX_DISTANCE = 12;
const EMERGENCY_KNOCKBACK_RANGE = 3.5;
const EMERGENCY_ESCAPE_SPRINT_MS = 1_250;
const EMERGENCY_ESCAPE_FLUID_PROJECTION_DISTANCE = 2;
const EMERGENCY_ESCAPE_SURFACE_PROJECTION_DISTANCE = 10;
const CREEPER_ESCAPE_SPRINT_MS = 2_500;
const CREEPER_ESCAPE_SURFACE_PROJECTION_DISTANCE = 18;
const EMERGENCY_ESCAPE_LAVA_CHECK_RADIUS = 4;
const DEATH_OBSERVATION_DEDUPLICATION_WINDOW_MS = 5_000;
const BAREHANDED_DEFENSE_MINIMUM_HEALTH = 18;
const MELEE_DISENGAGE_HEALTH = 16;
const LETHAL_MELEE_DISENGAGE_HEALTH = 7;
const THREAT_ESCAPE_SAFE_DISTANCE = 24;
const SINGLE_THREAT_MAXIMUM_ESCAPES = 4;
const DURABLE_DEATH_RECOVERY_WINDOW_MS = 8 * 60 * 60 * 1_000;
const CHAINED_DEATH_RESPAWN_BASE_COOLDOWN_MS = 60_000;
const CHAINED_DEATH_RESPAWN_MAXIMUM_COOLDOWN_MS = 8 * 60_000;
const RENEWABLE_DEATH_RECOVERY_MAX_DISTANCE = 64;
const UNKNOWN_DEATH_RECOVERY_MAX_DISTANCE = 64;
const RECOVERY_DURATION_MS = 20_000;
const POST_DEFENSE_RECOVERY_DURATION_MS = 90_000;
const MAXIMUM_RECOVERY_POLL_MS = 500;
const MINIMUM_RECOVERY_POLL_MS = 100;
const MINIMUM_SAFE_AIR_TICKS = 260;
const AIR_ESCAPE_ASCENT_STAGNATION_OBSERVATIONS = 10;
const AIR_ESCAPE_ASCENT_PROGRESS_EPSILON = 0.05;
const AIR_ESCAPE_OPEN_COLUMN_SEARCH_RADIUS = 4;
const AIR_ESCAPE_BREATHING_POCKET_SEARCH_RADIUS = 8;
const AIR_ESCAPE_BREATHING_POCKET_CANDIDATES = 16;
const AIR_ESCAPE_BREATHING_POCKET_PATH_TIMEOUT_MS = 4_000;

export interface BeatGameRun {
  readonly id: string;
  readonly teamId: string;
  readonly instanceId: string;
  readonly botId: string;
  readonly events: Stream.Stream<BeatGameEvent, BeatGameError>;
  readonly snapshots: Stream.Stream<BeatGameSnapshot, BeatGameError>;
  readonly awaitCompletion: Effect.Effect<BeatGameResult, BeatGameError>;
  readonly pause: Effect.Effect<void, BeatGameError>;
  readonly resume: Effect.Effect<void, BeatGameError>;
  readonly stop: Effect.Effect<void, BeatGameError>;
  readonly snapshot: Effect.Effect<BeatGameSnapshot, BeatGameError>;
}

export interface BeatGameTeamRun {
  readonly teamId: string;
  readonly runs: readonly BeatGameRun[];
  readonly awaitCompletion: Effect.Effect<
    readonly BeatGameResult[],
    BeatGameError
  >;
  readonly pause: Effect.Effect<void, BeatGameError>;
  readonly resume: Effect.Effect<void, BeatGameError>;
  readonly stop: Effect.Effect<void, BeatGameError>;
}

interface RunState {
  readonly driver: BeatGameDriver;
  readonly store: BeatGameCheckpointStore;
  readonly coordinator: BeatGameCoordinator;
  readonly strategy: BeatGameStrategy;
  readonly hooks: BeatGameStrategyHooks;
  readonly checkpoint: Ref.Ref<BeatGameCheckpoint>;
  readonly observation: Ref.Ref<BeatGameObservation>;
  readonly lastLivingObservation: Ref.Ref<BeatGameObservation>;
  readonly pendingDeaths: Ref.Ref<readonly PendingDeath[]>;
  readonly deathRecoveryFailures: Ref.Ref<ReadonlyMap<string, number>>;
  readonly explorationFrontiers: Ref.Ref<
    Readonly<Record<string, BeatGameExplorationFrontier>>
  >;
  readonly checkedRecoveryContainers: Ref.Ref<ReadonlySet<string>>;
  readonly paused: Ref.Ref<boolean>;
  readonly stopped: Deferred.Deferred<void>;
  readonly checkpointMutex: Effect.Semaphore;
  readonly eventMutex: Effect.Semaphore;
  readonly events: ReplayBroadcast<BeatGameEvent>;
  readonly snapshots: ReplayBroadcast<BeatGameSnapshot>;
  readonly sequence: Ref.Ref<bigint>;
  readonly startedAtMs: number;
}

interface PendingDeath {
  readonly observedAt: string;
  readonly position: BeatGamePosition;
  readonly recoverItems: boolean;
  readonly inventoryCounts?: Readonly<Record<string, number>>;
  readonly message?: string;
}

interface ActionResult {
  readonly checkpoint?: (
    checkpoint: BeatGameCheckpoint,
  ) => BeatGameCheckpoint;
  readonly phase?: BeatGamePhase;
  readonly replanReason?: string;
  readonly replanDelayMs?: number;
  readonly defenseTarget?: BeatGameEntityObservation;
  readonly escapeTarget?: BeatGameEntityObservation;
  readonly airEscapePosition?: BeatGamePosition;
  readonly travelMealRequested?: boolean;
  readonly completedPendingDeath?: string;
}

interface ImmediateThreat {
  readonly target: BeatGameEntityObservation;
  readonly response: "attack" | "flee";
}

export function beatGame(
  bot: SoulFireBot,
  options: BeatGameOptions = {},
): Effect.Effect<BeatGameRun, BeatGameError, Scope.Scope> {
  return beatGameWithDriver(makeSoulFireBeatGameDriver(bot), options);
}

export function beatGameWithDriver(
  driver: BeatGameDriver,
  options: BeatGameOptions = {},
): Effect.Effect<BeatGameRun, BeatGameError, Scope.Scope> {
  return Effect.gen(function* () {
    const runId = options.runId ?? crypto.randomUUID();
    const teamId = options.team?.teamId ?? runId;
    const store = options.checkpointStore
      ?? new InMemoryBeatGameCheckpointStore();
    const coordinator = options.coordinator
      ?? new InMemoryBeatGameCoordinator();
    const strategy = yield* Effect.try({
      try: () => mergeStrategy(options.strategy),
      catch: (cause) =>
        new BeatGameProtocolError({
          runId,
          instanceId: driver.instanceId,
          botId: driver.botId,
          phase: BeatGamePhase.PREPARE_OVERWORLD,
          action: "configure",
          retryable: false,
          message: cause instanceof Error
            ? cause.message
            : "Beat-game strategy configuration is invalid",
          cause,
        }),
    });
    const observation = yield* driver.observe.pipe(
      Effect.mapError((cause) =>
        observationError(
          runId,
          driver,
          BeatGamePhase.PREPARE_OVERWORLD,
          cause,
        )
      ),
    );
    const restored = yield* store.load(runId);
    yield* Effect.try({
      try: () => validateRestoredCheckpoint(restored, driver, teamId),
      catch: (cause) =>
        new BeatGameProtocolError({
          runId,
          instanceId: driver.instanceId,
          botId: driver.botId,
          phase: BeatGamePhase.PREPARE_OVERWORLD,
          action: "restore-checkpoint",
          retryable: false,
          message: cause instanceof Error
            ? cause.message
            : "The restored checkpoint is invalid",
          cause,
        }),
    });
    const member = yield* coordinator.register({
      teamId,
      instanceId: driver.instanceId,
      botId: driver.botId,
      ...(options.team?.role === undefined
        ? {}
        : { requestedRole: options.team.role }),
    });
    const initial = restored === undefined
      ? createInitialCheckpoint(
        runId,
        teamId,
        driver,
        member.role,
        observation,
        strategy,
      )
      : adoptRestoredCheckpoint(
        restored,
        driver,
        member.role,
        observation,
      );
    const stored = yield* store.save(
      initial,
      restored?.revision,
    );
    const checkpointRef = yield* Ref.make(stored);
    const observationRef = yield* Ref.make(observation);
    const lastLivingObservation = yield* Ref.make(observation);
    const pendingDeaths = yield* Ref.make<readonly PendingDeath[]>(
      restored === undefined
        ? []
        : restorePendingDeaths(stored, observation),
    );
    const deathRecoveryFailures = yield* Ref.make<ReadonlyMap<string, number>>(
      new Map(),
    );
    const explorationFrontiers = yield* Ref.make<
      Readonly<Record<string, BeatGameExplorationFrontier>>
    >(stored.memory.explorationFrontiers ?? {});
    const checkedRecoveryContainers = yield* Ref.make<ReadonlySet<string>>(
      new Set(),
    );
    const paused = yield* Ref.make(false);
    const stopped = yield* Deferred.make<void>();
    const checkpointMutex = yield* Effect.makeSemaphore(1);
    const eventMutex = yield* Effect.makeSemaphore(1);
    const events = new ReplayBroadcast<BeatGameEvent>(128);
    const snapshots = new ReplayBroadcast<BeatGameSnapshot>(1);
    const sequence = yield* Ref.make(0n);
    const state: RunState = {
      driver,
      store,
      coordinator,
      strategy,
      hooks: options.hooks ?? {},
      checkpoint: checkpointRef,
      observation: observationRef,
      lastLivingObservation,
      pendingDeaths,
      deathRecoveryFailures,
      explorationFrontiers,
      checkedRecoveryContainers,
      paused,
      stopped,
      checkpointMutex,
      eventMutex,
      events,
      snapshots,
      sequence,
      startedAtMs: Date.now(),
    };
    yield* publishSnapshot(state);
    yield* emit(state, restored === undefined
      ? { type: "run-started" }
      : { type: "checkpoint-restored", revision: stored.revision });
    if (restored !== undefined) {
      yield* emit(state, { type: "run-started" });
    }
    yield* emit(state, {
      type: "team-role-changed",
      role: member.role,
    });
    for (const requirement of stored.planner.requirements) {
      yield* emit(state, {
        type: "requirement-discovered",
        requirement,
      });
    }

    yield* Effect.forkScoped(monitorDriverEvents(state));
    const runtime = runLoop(state).pipe(
      Effect.ensuring(
        Effect.all([
          coordinator.unregister(teamId, driver.botId).pipe(Effect.ignore),
          events.end(),
          snapshots.end(),
        ], { discard: true }),
      ),
    );
    const fiber = yield* Effect.forkScoped(runtime);

    const changeStatus = (
      status: BeatGameRunStatus,
      event: EventInput,
    ): Effect.Effect<void, BeatGameError> =>
      Effect.gen(function* () {
        const checkpoint = yield* persist(state, (current) => ({
          ...current,
          planner: {
            ...current.planner,
            status,
            updatedAt: new Date().toISOString(),
          },
        }));
        yield* coordinator.updateMember(
          teamId,
          driver.botId,
          checkpoint.planner.phase,
          status,
        );
        yield* emit(state, event);
      });

    return {
      id: runId,
      teamId,
      instanceId: driver.instanceId,
      botId: driver.botId,
      events: events.stream,
      snapshots: snapshots.stream,
      awaitCompletion: Fiber.join(fiber),
      pause: Ref.get(paused).pipe(
        Effect.flatMap((isPaused) =>
          isPaused
            ? Effect.void
            : Ref.set(paused, true).pipe(
              Effect.zipRight(changeStatus(
                BeatGameRunStatus.PAUSED,
                { type: "run-paused" },
              )),
            )
        ),
      ),
      resume: Ref.get(paused).pipe(
        Effect.flatMap((isPaused) =>
          !isPaused
            ? Effect.void
            : Ref.set(paused, false).pipe(
              Effect.zipRight(changeStatus(
                BeatGameRunStatus.RUNNING,
                { type: "run-resumed" },
              )),
            )
        ),
      ),
      stop: Deferred.isDone(stopped).pipe(
        Effect.flatMap((isStopped) =>
          isStopped
            ? Effect.void
            : Ref.set(paused, false).pipe(
              Effect.zipRight(changeStatus(
                BeatGameRunStatus.STOPPED,
                { type: "run-stopped" },
              )),
              Effect.zipRight(Deferred.succeed(stopped, undefined)),
              Effect.asVoid,
            )
        ),
      ),
      snapshot: currentSnapshot(state),
    };
  });
}

export function beatGameTeam(
  bots: readonly SoulFireBot[],
  options: BeatGameTeamRunOptions = {},
): Effect.Effect<BeatGameTeamRun, BeatGameError, Scope.Scope> {
  return beatGameTeamWithDrivers(
    bots.map(makeSoulFireBeatGameDriver),
    options,
  );
}

export function beatGameTeamWithDrivers(
  drivers: readonly BeatGameDriver[],
  options: BeatGameTeamRunOptions = {},
): Effect.Effect<BeatGameTeamRun, BeatGameError, Scope.Scope> {
  if (drivers.length === 0) {
    return Effect.die(
      new RangeError("beatGameTeamWithDrivers needs at least one driver"),
    );
  }
  return Effect.gen(function* () {
    const teamId = options.teamId ?? crypto.randomUUID();
    const store = options.checkpointStore
      ?? new InMemoryBeatGameCheckpointStore();
    const coordinator = options.coordinator
      ?? new InMemoryBeatGameCoordinator();
    const runs = yield* Effect.all(
      drivers.map((driver, index) =>
        beatGameWithDriver(driver, {
          runId: `${teamId}-${driver.botId}`,
          team: {
            teamId,
            role: roleForIndex(index),
          },
          ...(options.strategy === undefined
            ? {}
            : { strategy: options.strategy }),
          checkpointStore: store,
          coordinator,
          ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
        })
      ),
      { concurrency: "unbounded" },
    );
    return {
      teamId,
      runs,
      awaitCompletion: Effect.all(
        runs.map(({ awaitCompletion }) => awaitCompletion),
        { concurrency: "unbounded" },
      ),
      pause: Effect.all(runs.map(({ pause }) => pause), {
        concurrency: "unbounded",
        discard: true,
      }),
      resume: Effect.all(runs.map(({ resume }) => resume), {
        concurrency: "unbounded",
        discard: true,
      }),
      stop: Effect.all(runs.map(({ stop }) => stop), {
        concurrency: "unbounded",
        discard: true,
      }),
    };
  });
}

function runLoop(
  state: RunState,
): Effect.Effect<BeatGameResult, BeatGameError> {
  return Effect.gen(function* () {
    yield* persist(state, (checkpoint) => ({
      ...checkpoint,
      planner: {
        ...checkpoint.planner,
        status: BeatGameRunStatus.RUNNING,
        updatedAt: new Date().toISOString(),
      },
    }));
    for (;;) {
      yield* awaitRunnable(state);
      const observation = yield* cancellable(
        state,
        observeWithRecovery(state),
      );
      let checkpoint = yield* Ref.get(state.checkpoint);
      const previousRequirements = new Map(
        checkpoint.planner.requirements.map((requirement) => [
          requirement.key,
          requirement,
        ]),
      );
      checkpoint = yield* persist(state, (current) => ({
        ...current,
        connectionEpoch: observation.player.connectionEpoch,
        planner: plannerWithObservation(
          current.planner,
          observation,
          state.strategy,
        ),
      }));
      yield* emit(state, {
        type: "observation-recorded",
        observedAt: observation.observedAt,
        connectionEpoch: observation.player.connectionEpoch,
        playerRevision: observation.player.revision.toString(),
        inventoryRevision: observation.inventory.revision.toString(),
      });
      checkpoint = yield* mergeSharedDiscoveries(state, checkpoint);
      for (const requirement of checkpoint.planner.requirements) {
        const previous = previousRequirements.get(requirement.key);
        if (
          previous?.currentCount !== requirement.currentCount
          || previous?.targetCount !== requirement.targetCount
          || previous?.satisfied !== requirement.satisfied
        ) {
          yield* emit(
            state,
            {
              type: previous === undefined
                ? "requirement-discovered"
                : requirement.satisfied && !previous.satisfied
                ? "requirement-satisfied"
                : "requirement-updated",
              requirement,
            },
          );
        }
        yield* state.coordinator.publishRequirement(
          checkpoint.teamId,
          checkpoint.botId,
          requirement.key,
          Math.max(0, requirement.targetCount - requirement.currentCount),
        );
      }
      if (checkpoint.planner.phase === BeatGamePhase.COMPLETE) {
        return yield* completeRun(state);
      }
      const decision = decideBeatGameAction({
        checkpoint,
        observation,
        strategy: state.strategy,
      });
      if (decision.type === "advance-phase") {
        yield* advancePhase(state, decision.to);
        continue;
      }
      const claim = yield* claimAction(state, decision);
      if (claim === undefined) {
        yield* Effect.sleep(state.strategy.observationPollMs);
        continue;
      }
      yield* runDecisionWithRetry(state, decision, observation).pipe(
        Effect.ensuring(releaseActionClaim(state, claim)),
      );
    }
    return yield* Effect.die(
      new Error("The beat-game loop ended without a terminal phase"),
    );
  }).pipe(
    Effect.catchAll((
      error,
    ): Effect.Effect<never, BeatGameError> =>
      error instanceof BeatGameCancelled
        ? Effect.fail(error)
        : markFailed(state, error).pipe(
          Effect.zipRight(Effect.fail(error)),
        )
    ),
  );
}

function runDecisionWithRetry(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  firstObservation: BeatGameObservation,
): Effect.Effect<void, BeatGameError> {
  const action = decision.action;
  const maximumAttempts = state.strategy.maximumActionRetries + 1;
  const attempt = (
    number: number,
    observation: BeatGameObservation,
  ): Effect.Effect<void, BeatGameError> =>
    Effect.gen(function* () {
      yield* emit(state, {
        type: number === 1 ? "action-started" : "action-retried",
        action,
        attempt: number,
      });
      const actionCheckpoint = yield* persist(state, (checkpoint) => ({
        ...checkpoint,
        planner: {
          ...checkpoint.planner,
          currentAction: action,
          currentActionId:
            number === 1
              && checkpoint.planner.currentAction === action
              && checkpoint.planner.currentActionId !== undefined
              ? checkpoint.planner.currentActionId
              : crypto.randomUUID(),
          retryCount: number - 1,
          updatedAt: new Date().toISOString(),
        },
      }));
      const result = yield* cancellable(
        state,
        executeDecision(
          state,
          decision,
          observation,
          actionCheckpoint,
        ),
      ).pipe(
        Effect.timeoutFail({
          duration: state.strategy.actionTimeoutMs,
          onTimeout: () => actionError(
            actionCheckpoint,
            `Action ${action} timed out`,
            true,
          ),
        }),
        Effect.catchAll((error) =>
          number < maximumAttempts && retryable(error)
            ? Effect.gen(function* () {
              yield* emit(state, {
                type: "action-failed",
                action,
                attempt: number,
                detail: error.message,
              });
              yield* Effect.sleep(backoffDuration(number));
              const fresh = yield* observeFresh(state);
              if (actionObservedComplete(
                decision,
                fresh,
                state.strategy,
              )) {
                yield* persist(state, (checkpoint) => ({
                  ...checkpoint,
                  connectionEpoch: fresh.player.connectionEpoch,
                  lastStableAction: stableActionResult(
                    action,
                    actionCheckpoint,
                    fresh,
                    "OBSERVATION_AFTER_UNCERTAIN_RESULT",
                  ),
                  planner: withoutCurrentAction({
                    ...plannerWithObservation(
                      checkpoint.planner,
                      fresh,
                      state.strategy,
                    ),
                    retryCount: 0,
                    completedActions: [
                      ...checkpoint.planner.completedActions,
                      action,
                    ].slice(-128),
                  }),
                }));
                yield* emit(state, {
                  type: "action-succeeded",
                  action,
                  attempt: number,
                  detail:
                    "A fresh observation confirmed the action before retry",
                });
                return;
              }
              return yield* attempt(number + 1, fresh);
            })
            : Effect.fail(error)
        ),
      );
      if (result === undefined) {
        return;
      }
      if (result.replanReason !== undefined) {
        if (result.completedPendingDeath !== undefined) {
          yield* completePendingDeath(
            state,
            result.completedPendingDeath,
          );
        }
        yield* persist(state, (checkpoint) => ({
          ...(result.completedPendingDeath === undefined
            ? checkpoint
            : forgetDeathPosition(
              checkpoint,
              result.completedPendingDeath,
            )),
          planner: withoutCurrentAction({
            ...checkpoint.planner,
            retryCount: 0,
            updatedAt: new Date().toISOString(),
          }),
        }));
        yield* emit(state, {
          type: "action-failed",
          action,
          attempt: number,
          detail: `Interrupted for replanning: ${result.replanReason}`,
        });
        if (result.replanDelayMs !== undefined) {
          yield* Effect.sleep(result.replanDelayMs);
        }
        return;
      }
      if (result.phase !== undefined) {
        yield* advancePhase(state, result.phase);
      }
      if (decision.type === "recover-death") {
        yield* completePendingDeath(state, observation.observedAt);
      }
      const latestObservation = yield* Ref.get(state.observation);
      yield* persist(state, (checkpoint) => {
        const transformed = result.checkpoint?.(checkpoint) ?? checkpoint;
        return {
          ...transformed,
          lastStableAction: stableActionResult(
            action,
            actionCheckpoint,
            latestObservation,
            result.phase === undefined ? "TASK_RESULT" : "OBSERVED_STATE",
          ),
          planner: withoutCurrentAction({
            ...transformed.planner,
            retryCount: 0,
            completedActions: [
              ...transformed.planner.completedActions,
              action,
            ].slice(-128),
            updatedAt: new Date().toISOString(),
          }),
        };
      });
      yield* emit(state, {
        type: "action-succeeded",
        action,
        attempt: number,
      });
    });
  return attempt(1, firstObservation);
}

function executeDecision(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  observation: BeatGameObservation,
  actionCheckpoint: BeatGameCheckpoint,
): Effect.Effect<ActionResult, BeatGameError> {
  state = {
    ...state,
    driver: withTaskIdempotency(
      state.driver,
      actionCheckpoint.planner.currentActionId ?? crypto.randomUUID(),
      new Date(Date.now() + state.strategy.actionTimeoutMs),
      stableFingerprint({
        connectionEpoch: observation.player.connectionEpoch,
        playerRevision: observation.player.revision.toString(),
        inventoryRevision: observation.inventory.revision.toString(),
      }),
    ),
  };
  const policyContext = policyContextFor(
    state,
    observation,
    actionCheckpoint,
  );
  const execute: Effect.Effect<
    ActionResult,
    unknown
  > = (() => {
    switch (decision.type) {
      case "recover-death": {
        return Effect.gen(function* () {
          const [pendingDeaths, lastLivingObservation] = yield* Effect.all([
            Ref.get(state.pendingDeaths),
            Ref.get(state.lastLivingObservation),
          ]);
          const pendingDeath = pendingDeaths.find((candidate) =>
            candidate.observedAt === observation.observedAt
          ) ?? {
            observedAt: observation.observedAt,
            position: observation.player.position,
            recoverItems: hasMeaningfulRecoveryInventory(
              lastLivingObservation,
            ),
            inventoryCounts: lastLivingObservation.inventory.counts,
          };
          yield* enqueuePendingDeath(state, pendingDeath);
          const rememberedDeathKey = `death:${pendingDeath.observedAt}`;
          const deathWasAlreadyRemembered =
            actionCheckpoint.memory.deathPositions.some(({ key }) =>
              key === rememberedDeathKey
            );
          if (!deathWasAlreadyRemembered) {
            yield* persist(state, (checkpoint) =>
              rememberDeathPosition(checkpoint, pendingDeath)
            );
            yield* Effect.all([
              emit(state, {
                type: "death-observed",
                detail: positionKey(pendingDeath.position),
              }),
              state.coordinator.publishDiscovery(
                actionCheckpoint.teamId,
                {
                  key:
                    `death:${actionCheckpoint.botId}:${pendingDeath.observedAt}`,
                  kind: "death",
                  botId: actionCheckpoint.botId,
                  position: pendingDeath.position,
                  observedAt: pendingDeath.observedAt,
                  confidence: 1,
                },
              ),
            ], { discard: true });
          }
          const customRecovery = state.hooks.recoverDeath;
          let recoveryAttempted = pendingDeath.recoverItems;
          if (customRecovery !== undefined) {
            yield* customRecovery(policyContext);
          } else {
            const beforeRespawn = yield* observeDriverFresh(state);
            const recoverableDeaths = (yield* Ref.get(state.pendingDeaths))
              .filter((candidate) =>
                isPendingDeathRecoverable(candidate)
                && candidate.recoverItems
                && classifyDeathRecoveryInventory(
                  candidate.inventoryCounts,
                ) !== "trivial"
              );
            if (
              beforeRespawn.player.dead
              && recoverableDeaths.length > 1
            ) {
              const cooldownMs = chainedDeathRespawnCooldown(
                recoverableDeaths.length,
              );
              yield* emit(state, {
                type: "diagnostic",
                message:
                  "Delaying respawn after a chained corpse-recovery death",
                data: {
                  cooldownMs,
                  pendingDeaths: recoverableDeaths.length,
                },
              });
              yield* Effect.sleep(cooldownMs);
            }
            yield* respawnAndRecover(state.driver, {
              path: state.strategy.path,
            });
            let respawned = yield* observeDriverFresh(state);
            if (
              respawned.player.health < state.strategy.minimumHealth
            ) {
              yield* retreatAndRecover(
                state,
                POST_DEFENSE_RECOVERY_DURATION_MS,
              );
              respawned = yield* observeDriverFresh(state);
            }
            if (
              respawned.player.food <= state.strategy.eatBelowFood
              && hasUsableFood(respawned)
            ) {
              yield* eatWhenNeeded(state.driver, {
                foodItemIds: preferredUsableFoodItemIds(respawned),
                foodLevel: Math.min(
                  20,
                  Math.max(18, state.strategy.eatBelowFood + 2),
                ),
                maximumMeals: 1,
                completeWhenNoFood: true,
                path: state.strategy.path,
              });
              respawned = yield* observeDriverFresh(state);
            }
            recoveryAttempted = pendingDeath.recoverItems
              && shouldAttemptDeathRecovery(
                pendingDeath,
                respawned.player.position,
              );
            if (recoveryAttempted) {
              const nearbyCorpseDrops = yield* inspectNearbyCorpseDrops(
                state,
                pendingDeath,
                respawned,
              );
              if (nearbyCorpseDrops?.length === 0) {
                return yield* abandonPendingDeath(
                  state,
                  pendingDeath,
                  respawned,
                  "Abandoned a stale corpse after confirming no drops remain nearby",
                );
              }
              if (nearbyCorpseDrops !== undefined) {
                yield* emit(state, {
                  type: "diagnostic",
                  message:
                    "Attempting nearby corpse recovery before gathering more travel supplies",
                  data: { drops: nearbyCorpseDrops.length },
                });
              }
              const corpseIsImmediatelyReachable = distanceSquared(
                respawned.player.position,
                pendingDeath.position,
              ) <= CORPSE_DROP_INSPECTION_DISTANCE ** 2;
              const preparationPending =
                nearbyCorpseDrops !== undefined
                  && corpseIsImmediatelyReachable
                  ? undefined
                  : yield* prepareForDistantDeathRecovery(
                    state,
                    pendingDeath,
                    respawned,
                  );
              if (preparationPending !== undefined) {
                const current = yield* state.driver.observe;
                const preparationFailures =
                  madeMeaningfulDeathRecoveryApproach(
                      pendingDeath.position,
                      respawned.player.position,
                      current.player.position,
                    )
                    ? yield* clearDeathRecoveryFailure(
                      state,
                      pendingDeath.observedAt,
                      "preparation",
                    ).pipe(Effect.as(0))
                    : yield* recordDeathRecoveryFailure(
                      state,
                      pendingDeath.observedAt,
                      "preparation",
                    );
                const recoveryClass = classifyDeathRecoveryInventory(
                  pendingDeath.inventoryCounts,
                );
                if (
                  preparationFailures
                    >= MAX_SAFE_DEATH_RECOVERY_FAILURES
                  && recoveryClass !== "valuable"
                ) {
                  return yield* abandonPendingDeath(
                    state,
                    pendingDeath,
                    current,
                    "Abandoned a distant corpse after three bounded preparation attempts",
                  );
                }
                if (
                  preparationFailures >= MAX_SAFE_DEATH_RECOVERY_FAILURES
                  && recoveryClass === "valuable"
                ) {
                  if (
                    preparationFailures
                      >= MAX_VALUABLE_DEATH_RECOVERY_PREPARATION_FAILURES
                  ) {
                    yield* emit(state, {
                      type: "diagnostic",
                      message:
                        "Attempting valuable corpse recovery after bounded preparation",
                      data: {
                        preparationFailures,
                        reason: preparationPending,
                      },
                    });
                  } else {
                    yield* emit(state, {
                      type: "diagnostic",
                      message:
                        "Continuing preparation for a valuable distant corpse",
                      data: {
                        preparationFailures,
                        reason: preparationPending,
                      },
                    });
                  }
                }
                if (
                  recoveryClass !== "valuable"
                  || preparationFailures
                    < MAX_VALUABLE_DEATH_RECOVERY_PREPARATION_FAILURES
                ) {
                  return {
                    replanReason: preparationPending,
                  } satisfies ActionResult;
                }
              }
              respawned = yield* observeDriverFresh(state);
              yield* retreatAndRecover(
                state,
                POST_DEFENSE_RECOVERY_DURATION_MS,
              );
              yield* respawnAndRecover(state.driver, {
                deathPosition: pendingDeath.position,
                retryThroughFluids: true,
                path: {
                  ...state.strategy.path,
                  allowMining: hasMiningPickaxe(respawned),
                  avoidFluids: true,
                  additionalPlaceItemIds:
                    DEATH_RECOVERY_ADDITIONAL_PLACE_ITEM_IDS,
                },
              });
            } else if (pendingDeath.recoverItems) {
              yield* emit(state, {
                type: "items-recovered",
                detail:
                  "Skipped a distant corpse containing only renewable or unknown items",
              });
              return {
                checkpoint: (checkpoint) =>
                  forgetDeathPosition(
                    checkpoint,
                    pendingDeath.observedAt,
                  ),
                completedPendingDeath: pendingDeath.observedAt,
              } satisfies ActionResult;
            }
          }
          if (recoveryAttempted) {
            yield* sweepRemainingDeathDrops(
              state,
              pendingDeath.inventoryCounts,
            ).pipe(
              Effect.catchTag("BeatGameDriverError", () => Effect.void),
            );
          }
          if (
            recoveryAttempted
            && !(yield* waitForDeathRecoveryInventory(
              state,
              pendingDeath.inventoryCounts,
              5,
            ))
          ) {
            const current = yield* state.driver.observe;
            const inspectedCorpseDrops = yield* inspectNearbyCorpseDrops(
              state,
              pendingDeath,
              current,
            );
            const closeEnoughToInspectDrops =
              inspectedCorpseDrops !== undefined;
            const remainingCorpseDrops = inspectedCorpseDrops ?? [];
            if (
              closeEnoughToInspectDrops
              && remainingCorpseDrops.length === 0
            ) {
              yield* emit(state, {
                type: "items-recovered",
                detail:
                  "No corpse drops remain after the safe recovery attempt",
              });
              return {
                checkpoint: (checkpoint) =>
                  resetAfterCatastrophicInventoryLoss(
                    forgetDeathPosition(
                      checkpoint,
                      pendingDeath.observedAt,
                    ),
                    current,
                  ),
                completedPendingDeath: pendingDeath.observedAt,
              } satisfies ActionResult;
            }
            const recoveryFailures = yield* recordDeathRecoveryFailure(
              state,
              pendingDeath.observedAt,
              "pickup",
            );
            const recoveryClass = classifyDeathRecoveryInventory(
              pendingDeath.inventoryCounts,
            );
            if (
              recoveryFailures >= MAX_SAFE_DEATH_RECOVERY_FAILURES
              && recoveryClass !== "valuable"
            ) {
              return yield* abandonPendingDeath(
                state,
                pendingDeath,
                current,
                "Abandoned an unrecoverable corpse after three safe recovery attempts",
              );
            }
            if (
              recoveryFailures >= MAX_SAFE_DEATH_RECOVERY_FAILURES
              && recoveryClass === "valuable"
            ) {
              yield* emit(state, {
                type: "diagnostic",
                message:
                  "Keeping a valuable corpse pending after failed recovery attempts",
                data: {
                  closeEnoughToInspectDrops,
                  recoveryFailures,
                  remainingDrops: remainingCorpseDrops.length,
                },
              });
            }
            if (
              (yield* needsOverworldSurfaceRecovery(
                state,
                current.player.position,
              ))
              && remainingCorpseDrops.length === 0
            ) {
              yield* escapeToOverworldSurface(
                state,
                current.player.position,
              ).pipe(Effect.catchTag("BeatGameDriverError", () => Effect.void));
            }
            return {
              replanReason:
                "the corpse inventory was not recovered and remains pending",
            } satisfies ActionResult;
          }
          yield* emit(state, {
            type: "items-recovered",
            detail: pendingDeath.recoverItems
              ? "Death recovery completed"
              : "Respawn completed without a risky corpse recovery",
          });
          return {
            checkpoint: (checkpoint) =>
              forgetDeathPosition(
                checkpoint,
                pendingDeath.observedAt,
              ),
            completedPendingDeath: pendingDeath.observedAt,
          } satisfies ActionResult;
        });
      }
      case "eat":
        return (
          state.hooks.eat?.(policyContext)
            ?? eatWhenNeeded(state.driver, {
              foodItemIds: preferredUsableFoodItemIds(observation),
              foodLevel: state.strategy.eatBelowFood,
              maximumMeals: 1,
              path: state.strategy.path,
            })
        ).pipe(Effect.as({} satisfies ActionResult));
      case "retreat":
        return (
          state.hooks.retreat?.(policyContext)
            ?? retreatAndRecover(state)
        ).pipe(Effect.as({} satisfies ActionResult));
      case "prepare-equipment":
        return (
          state.hooks.prepareEquipment?.(policyContext)
            ?? equipBestArmor(state.driver, {
              path: state.strategy.path,
            })
        ).pipe(Effect.as({} satisfies ActionResult));
      case "satisfy-requirement": {
        const satisfy = state.hooks.satisfyRequirement === undefined
          ? satisfyRequirement(
            state,
            decision.requirement,
            observation,
          )
          : state.hooks.satisfyRequirement({
            ...policyContext,
            requirement: decision.requirement,
          });
        return satisfy.pipe(
          Effect.zipRight(state.driver.observe),
          Effect.map((current) =>
            requirementActionResult(
              decision.requirement,
              observation,
              current,
            )
          ),
          Effect.catchAll((error) =>
            error instanceof BeatGameDriverError
                && error.code === "resource-exhausted"
              ? Effect.succeed({
                replanReason:
                  `resource acquisition remains incomplete while satisfying ${
                    decision.requirement.key
                  }: ${error.message}`,
                replanDelayMs: REQUIREMENT_NO_PROGRESS_REPLAN_DELAY_MS,
              } satisfies ActionResult)
              : Effect.fail(error)
          ),
        );
      }
      case "build-and-enter-nether": {
        if (state.hooks.buildAndEnterNether !== undefined) {
          return state.hooks.buildAndEnterNether(policyContext).pipe(
            Effect.as({} satisfies ActionResult),
          );
        }
        const useCastPortal =
          state.strategy.portalStrategy === PortalStrategy.CAST
          || (
            state.strategy.portalStrategy === PortalStrategy.AUTO
            && (
              observation.inventory.counts["minecraft:obsidian"] ?? 0
            ) < state.strategy.targetObsidianCount
          );
        return enterKnownPortal(
          state,
          actionCheckpoint,
          observation,
        ).pipe(
          Effect.flatMap((knownPortal): Effect.Effect<
            ActionResult,
            BeatGameError | BeatGameDriverError
          > =>
            knownPortal
              ? Effect.succeed({})
              : (
                useCastPortal
                  ? preparePortalCastingLavaPool(state, observation)
                  : Effect.succeed(true)
              ).pipe(
                Effect.flatMap((ready) =>
                  ready
                    ? state.driver.observe.pipe(
                      Effect.flatMap((current) =>
                        resolvePortalBuildOrigin(
                          state.driver,
                          current,
                        )
                      ),
                      Effect.flatMap((origin) =>
                        useCastPortal
                          ? castNetherPortal(state.driver, {
                            origin,
                            path: {
                              ...state.strategy.path,
                              avoidFluids: true,
                            },
                          })
                          : buildNetherPortal(state.driver, {
                            origin,
                            path: state.strategy.path,
                          })
                      ),
                      Effect.tap((frame) => {
                        const observedAt = new Date().toISOString();
                        return state.coordinator.publishDiscovery(
                          actionCheckpoint.teamId,
                          {
                            key: `portal:${positionKey(frame.origin)}`,
                            kind: "portal",
                            botId: actionCheckpoint.botId,
                            position: frame.origin,
                            observedAt,
                            confidence: 0.9,
                          },
                        );
                      }),
                      Effect.flatMap((frame) =>
                        enterPortal(state.driver, {
                          portal: frame.interior[0] ?? frame.origin,
                          path: state.strategy.path,
                        }).pipe(Effect.as(frame))
                      ),
                      Effect.map((frame): ActionResult => ({
                        checkpoint: (checkpoint) => ({
                          ...checkpoint,
                          memory: {
                            ...checkpoint.memory,
                            portals: [
                              ...checkpoint.memory.portals,
                              {
                                key: `portal:${positionKey(frame.origin)}`,
                                value: {
                                  blockId: "minecraft:nether_portal",
                                  position: frame.origin,
                                  properties: {},
                                  diggable: false,
                                  replaceable: false,
                                  interactive: false,
                                  observedAt: new Date().toISOString(),
                                },
                                observedAt: new Date().toISOString(),
                                confidence: 0.9,
                              },
                            ].slice(-32),
                          },
                        }),
                      })),
                    )
                    : Effect.succeed({} satisfies ActionResult)
                ),
              )
          ),
        );
      }
      case "return-through-portal":
        if (state.hooks.returnThroughPortal !== undefined) {
          return state.hooks.returnThroughPortal(policyContext).pipe(
            Effect.as({} satisfies ActionResult),
          );
        }
        return enterKnownPortal(
          state,
          actionCheckpoint,
          observation,
        ).pipe(
          Effect.flatMap((entered) =>
            entered
              ? Effect.void
              : enterPortal(state.driver, {
                path: state.strategy.path,
              })
          ),
          Effect.as({} satisfies ActionResult),
        );
      case "throw-eye":
        return moveToEyeBaseline(state).pipe(
          Effect.zipRight(
            state.hooks.throwEye?.(policyContext)
              ?? throwEyeOfEnder(state.driver),
          ),
          Effect.flatMap((sample) => {
            const eyeSamples = [
              ...actionCheckpoint.memory.eyeSamples,
              sample,
            ].slice(-16);
            const estimate = triangulateStronghold(eyeSamples);
            return Effect.all([
              state.coordinator.publishDiscovery(
                actionCheckpoint.teamId,
                {
                  key:
                    `eye:${actionCheckpoint.botId}:${sample.observedAt}`,
                  kind: "eye-sample",
                  botId: actionCheckpoint.botId,
                  position: sample.origin,
                  observedAt: sample.observedAt,
                  confidence: sample.confidence,
                  metadata: {
                    directionX: sample.direction.x,
                    directionZ: sample.direction.z,
                  },
                },
              ),
              estimate === undefined
                ? Effect.void
                : state.coordinator.publishDiscovery(
                  actionCheckpoint.teamId,
                  {
                    key: "stronghold:estimate",
                    kind: "stronghold",
                    botId: actionCheckpoint.botId,
                    position: estimate.position,
                    observedAt: sample.observedAt,
                    confidence: estimate.confidence,
                    metadata: {
                      baseline: estimate.baseline,
                      angleDegrees: estimate.angleDegrees,
                    },
                  },
                ),
            ], { discard: true }).pipe(
              Effect.as({
                checkpoint: (
                  checkpoint: BeatGameCheckpoint,
                ): BeatGameCheckpoint => ({
                  ...checkpoint,
                  memory: {
                    ...checkpoint.memory,
                    eyeSamples,
                    ...(estimate === undefined
                      ? {}
                      : { strongholdEstimate: estimate.position }),
                  },
                }),
              } satisfies ActionResult),
            );
          }),
        );
      case "search-stronghold":
        return (
          state.hooks.searchStronghold?.(policyContext)
            ?? searchStronghold(state)
        ).pipe(
          Effect.tap((found) =>
            !found
              ? Effect.void
              : state.coordinator.publishDiscovery(
                actionCheckpoint.teamId,
                {
                  key: "stronghold:portal-room",
                  kind: "stronghold",
                  botId: actionCheckpoint.botId,
                  position:
                    actionCheckpoint.memory.strongholdEstimate
                      ?? observation.player.position,
                  observedAt: new Date().toISOString(),
                  confidence: 1,
                },
              )
          ),
          Effect.map((found): ActionResult =>
            found
              ? { phase: BeatGamePhase.ACTIVATE_END_PORTAL }
              : {}
          ),
        );
      case "activate-end-portal":
        if (state.hooks.activateEndPortal !== undefined) {
          return state.hooks.activateEndPortal(policyContext).pipe(
            Effect.as({} satisfies ActionResult),
          );
        }
        return activateEndPortal(state.driver, {
          path: state.strategy.path,
        }).pipe(
          Effect.zipRight(enterEndPortal(state.driver, {
            path: state.strategy.path,
          })),
          Effect.as({
            phase: BeatGamePhase.FIGHT_ENDER_DRAGON,
          } satisfies ActionResult),
        );
      case "fight-ender-dragon":
        if (state.hooks.fightEnderDragon !== undefined) {
          return state.hooks.fightEnderDragon(policyContext).pipe(
            Effect.map((defeated): ActionResult =>
              defeated ? { phase: BeatGamePhase.COLLECT_DRAGON_EGG } : {}
            ),
          );
        }
        return fightDragon(state);
      case "collect-dragon-egg":
        return (
          state.hooks.collectDragonEgg?.(policyContext)
            ?? collectDragonEgg(state.driver, {
              path: state.strategy.path,
            })
        ).pipe(Effect.as({} satisfies ActionResult));
      case "exit-end":
        return (
          state.hooks.exitEnd?.(policyContext)
            ?? exitEnd(state.driver, {
              path: state.strategy.path,
            })
        ).pipe(Effect.as({} satisfies ActionResult));
    }
  })();
  const executeWithSafety = (
    safetyObservation: BeatGameObservation,
  ): Effect.Effect<ActionResult, unknown> =>
    findImmediateActionThreat(state, decision, safetyObservation).pipe(
      Effect.flatMap((initialThreat) =>
        initialThreat === undefined
          ? Effect.raceFirst(
            execute,
            monitorActionSafety(
              state,
              decision,
              observation,
              safetyObservation,
            ),
          )
          : Effect.succeed(initialThreat)
      ),
      Effect.flatMap((result) => {
      const response = result.airEscapePosition !== undefined
        ? emergencyAirAscent(
          state,
          result.airEscapePosition,
          {
            seekDrySurfaceAfterRecovery:
              !shouldResumeUrgentAquaticFoodHunt(
                decision,
                safetyObservation,
              ),
          },
        )
        : result.escapeTarget !== undefined
        ? decision.type === "recover-death"
          ? escapeFromTarget(state, result.escapeTarget, {
            continueEscapingWhenHit: true,
          })
          : escapeFromTarget(state, result.escapeTarget).pipe(
            Effect.zipRight(
              retreatAndRecover(state, POST_DEFENSE_RECOVERY_DURATION_MS),
            ),
          )
        : result.defenseTarget !== undefined
        ? defendAndRecover(state, result.defenseTarget)
        : result.travelMealRequested === true
        ? state.driver.observe.pipe(
          Effect.flatMap((latest) =>
            eatWhenNeeded(state.driver, {
              foodItemIds: preferredUsableFoodItemIds(latest),
              foodLevel: Math.min(
                20,
                Math.max(18, state.strategy.eatBelowFood + 2),
              ),
              maximumMeals: 1,
              completeWhenNoFood: true,
              path: state.strategy.path,
            })
          ),
        )
        : Effect.void;
      const interruptedForSafety =
        result.airEscapePosition !== undefined
        || result.escapeTarget !== undefined
        || result.defenseTarget !== undefined
        || result.travelMealRequested === true;
      const handledResponse = result.airEscapePosition === undefined
        ? response.pipe(
          Effect.catchTag("BeatGameDriverError", () => Effect.void),
        )
        : response;
      return handledResponse.pipe(
        Effect.flatMap(() =>
          decision.type === "recover-death" && interruptedForSafety
            ? Effect.all([
              observeDriverFresh(state),
              Ref.get(state.pendingDeaths),
            ]).pipe(
              Effect.flatMap(([latest, pendingDeaths]) => {
                const latestDeath = pendingDeaths.at(-1);
                return latest.player.dead
                    || (
                      latestDeath !== undefined
                      && latestDeath.observedAt !== observation.observedAt
                    )
                  ? Effect.succeed({
                    replanReason: "bot died again during recovery",
                  } satisfies ActionResult)
                  : Effect.succeed(result);
              }),
            )
            : Effect.succeed(result)
        ),
      );
      }),
    );
  return executeWithSafety(observation).pipe(
    Effect.mapError((error) =>
      error instanceof BeatGameDriverError
        ? error.operation === "pathfind"
          ? pathfindingError(actionCheckpoint, error)
          : actionError(
            actionCheckpoint,
            error.message,
            error.retryable,
            error,
          )
        : isBeatGameError(error)
        ? error
        : actionError(
          actionCheckpoint,
          error instanceof Error
            ? error.message
            : `Action ${decision.action} failed`,
          false,
          error,
        )
    ),
  );
}

function findImmediateActionThreat(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  observation: BeatGameObservation,
): Effect.Effect<ActionResult | undefined, BeatGameDriverError> {
  if (
    decision.type === "retreat"
    || decision.type === "fight-ender-dragon"
    || observation.player.dead
  ) {
    return Effect.succeed(undefined);
  }
  return findImmediateThreat(state, observation).pipe(
    Effect.map((threat) => {
      if (threat === undefined) {
        return undefined;
      }
      return {
        replanReason: decision.type === "recover-death"
          ? threat.response === "flee"
            ? "paused item recovery to evade an immediate hostile"
            : "paused item recovery to defend against an immediate hostile"
          : threat.response === "flee"
          ? "delayed an action to evade an immediate threat"
          : "delayed an action to preempt a nearby hostile",
        ...(
          threat.response === "flee"
            ? { escapeTarget: threat.target }
            : { defenseTarget: threat.target }
        ),
      } satisfies ActionResult;
    }),
  );
}

function monitorActionSafety(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  actionObservation: BeatGameObservation,
  initialSafetyObservation: BeatGameObservation = actionObservation,
): Effect.Effect<ActionResult, BeatGameError | BeatGameDriverError> {
  const monitor = (
    previousObservation: BeatGameObservation,
  ): Effect.Effect<ActionResult, BeatGameError | BeatGameDriverError> =>
    Effect.sleep(Math.max(100, state.strategy.observationPollMs)).pipe(
      Effect.zipRight(Ref.get(state.paused)),
      Effect.flatMap((paused) =>
        paused
          ? Effect.succeed({
            replanReason: "run paused",
          } satisfies ActionResult)
          : Ref.get(state.pendingDeaths).pipe(
            Effect.flatMap((pendingDeath) =>
              decision.type === "recover-death"
                && pendingDeath.at(-1) !== undefined
                && pendingDeath.at(-1)?.observedAt
                  !== actionObservation.observedAt
                ? Effect.succeed({
                  replanReason: "bot died again during recovery",
                } satisfies ActionResult)
                : observeDriverFresh(state).pipe(
                  Effect.flatMap((observation) => {
              if (
                decision.type !== "recover-death"
                && observation.player.dead
              ) {
                return Effect.succeed({
                  replanReason: "bot died",
                } satisfies ActionResult);
              }
              if (
                decision.type !== "retreat"
                && decision.type !== "fight-ender-dragon"
                && !observation.player.dead
              ) {
                if (hasUnsafeAirDuringAction(decision, observation)) {
                  return Effect.succeed({
                    replanReason: "air fell below the safety threshold",
                    airEscapePosition: observation.player.position,
                  } satisfies ActionResult);
                }
                return findImmediateThreat(state, observation).pipe(
                  Effect.flatMap((threat) => {
                    if (threat === undefined) {
                      return monitorObservedSafety(
                        state,
                        decision,
                        previousObservation,
                        observation,
                        monitor,
                      );
                    }
                    const response = threat.response;
                    return Effect.succeed({
                        replanReason: decision.type === "recover-death"
                          ? response === "flee"
                            ? "interrupted item recovery to evade a hostile"
                            : "interrupted item recovery to defend against a hostile"
                          : response === "flee"
                          ? "interrupted an action to evade an immediate threat"
                          : "interrupted an action to preempt a nearby hostile",
                        ...(
                          response === "flee"
                          ? { escapeTarget: threat.target }
                          : { defenseTarget: threat.target }
                        ),
                      } satisfies ActionResult);
                  }),
                );
              }
              return monitorObservedSafety(
                state,
                decision,
                previousObservation,
                observation,
                monitor,
              );
                  }),
                )
            ),
          )
      ),
    );
  return Effect.suspend(() => monitor(initialSafetyObservation));
}

function monitorObservedSafety(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  previousObservation: BeatGameObservation,
  observation: BeatGameObservation,
  monitor: (
    previousObservation: BeatGameObservation,
  ) => Effect.Effect<ActionResult, BeatGameError | BeatGameDriverError>,
): Effect.Effect<ActionResult, BeatGameError | BeatGameDriverError> {
  if (
    decision.type === "recover-death"
    && !previousObservation.player.dead
    && observation.player.dead
  ) {
    return Effect.succeed({
      replanReason: "bot died again during recovery",
    } satisfies ActionResult);
  }
  if (
    !observation.player.dead
    && hasUnsafeAirDuringAction(decision, observation)
  ) {
    return Effect.succeed({
      replanReason: "air fell below the safety threshold",
      airEscapePosition: observation.player.position,
    } satisfies ActionResult);
  }
  if (
    decision.type !== "fight-ender-dragon"
    && observation.player.health < previousObservation.player.health
  ) {
    return findNearbyAttackThreat(state, observation).pipe(
      Effect.flatMap((threat) => {
        if (threat === undefined) {
          if (decision.type === "recover-death") {
            return Effect.succeed({
              replanReason:
                "environmental damage was observed without a nearby attacker",
            } satisfies ActionResult);
          }
          return Effect.suspend(() => monitor(observation));
        }
        const response = threat.response;
        return Effect.succeed({
          replanReason: decision.type === "recover-death"
            ? response === "flee"
              ? "interrupted item recovery to escape an attacker"
              : "interrupted item recovery to fight an attacker"
            : response === "flee"
            ? "interrupted an action to escape a dangerous attacker"
            : "interrupted an action to defend against an attacker",
          ...(
            response === "flee"
            ? { escapeTarget: threat.target }
            : { defenseTarget: threat.target }
          ),
        } satisfies ActionResult);
      }),
    );
  }
  if (
    decision.type === "satisfy-requirement"
    && actionObservedComplete(
      decision,
      observation,
      state.strategy,
      state.hooks.satisfyRequirement === undefined,
  )
  ) {
    return Effect.succeed({});
  }
  if (
    decision.type !== "recover-death"
    && decision.type !== "retreat"
    && decision.type !== "eat"
    && observation.player.health < state.strategy.minimumHealth
    && !(
      decision.type === "satisfy-requirement"
      && (
        (
          (
            decision.requirement.key === "food"
            || decision.requirement.key === "food-supply"
          )
          && !hasRecoveryFood(observation)
        )
        || decision.requirement.key === "lava-bucket"
      )
    )
  ) {
    return Effect.succeed({
      replanReason: "health fell below the safety threshold",
    } satisfies ActionResult);
  }
  if (
    !observation.player.dead
    && decision.type !== "eat"
    && (
      decision.type !== "recover-death"
      || observation.player.food <= CRITICAL_HUNGER_FOOD_LEVEL
    )
    && observation.player.food <= URGENT_HUNGER_FOOD_LEVEL
    && !hasUsableFood(observation)
    && !(
      decision.type === "satisfy-requirement"
      && (
        decision.requirement.key === "food"
        || decision.requirement.key === "food-supply"
      )
    )
  ) {
    return Effect.succeed({
      replanReason: "hunger became urgent without available food",
    } satisfies ActionResult);
  }
  if (
    decision.type !== "recover-death"
    && decision.type !== "eat"
    && observation.player.food <= state.strategy.eatBelowFood
    && shouldInterruptForMeal(decision, observation)
  ) {
    return Effect.succeed({
      replanReason: "hunger fell below the eating threshold",
    } satisfies ActionResult);
  }
  if (
    decision.type === "recover-death"
    && observation.player.food <= state.strategy.eatBelowFood
    && hasUsableFood(observation)
    && (
      observation.player.food <= CRITICAL_HUNGER_FOOD_LEVEL
      || deathRecoveryTravelFoodCount(observation)
        > DEATH_RECOVERY_MINIMUM_FOOD_COUNT
    )
    && (
      previousObservation.player.food > state.strategy.eatBelowFood
      || !hasUsableFood(previousObservation)
    )
  ) {
    return Effect.succeed({
      replanReason: "paused corpse recovery for a travel meal",
      travelMealRequested: true,
    } satisfies ActionResult);
  }
  return Effect.suspend(() => monitor(observation));
}

function findImmediateThreat(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<ImmediateThreat | undefined, BeatGameDriverError> {
  const origin = {
    ...observation.player.position,
    y: observation.player.position.y + 1.62,
  };
  return Effect.all([
    state.driver.queryEntities({
      origin,
      radius: 24,
      selector: {
        categories: [2],
        alive: true,
        requireLineOfSight: true,
      },
      maximumResults: 32,
    }),
    state.driver.queryEntities({
      origin,
      radius: PROACTIVE_ESCAPE_ONLY_EVASION_RADIUS,
      selector: {
        entityTypes: [...ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES],
        alive: true,
      },
      maximumResults: 8,
    }),
    state.driver.queryEntities({
      origin,
      radius: PROACTIVE_RANGED_ENGAGEMENT_RADIUS,
      selector: {
        entityTypes: DANGEROUS_NEUTRAL_ENTITY_TYPES,
        alive: true,
      },
      maximumResults: 8,
    }),
  ]).pipe(
    Effect.map(([
      visibleHostiles,
      nearbyEscapeOnlyThreats,
      nearbyDangerousNeutralMobs,
    ]) => {
      const hostiles = new Map(
        [
          ...visibleHostiles,
          ...nearbyEscapeOnlyThreats,
          ...nearbyDangerousNeutralMobs.filter(isAggressiveNeutralMob),
        ].map((entity) => [
          `${entity.connectionEpoch}:${entity.networkId}`,
          entity,
        ]),
      );
      const candidates = [...hostiles.values()]
        .filter((target) =>
          Math.abs(
            target.position.y - observation.player.position.y,
          ) <= PROACTIVE_THREAT_MAXIMUM_VERTICAL_DISTANCE
        )
        .map((target) => ({
          target,
          distanceSquared: distanceSquared(
            observation.player.position,
            target.position,
          ),
        }))
        .sort((left, right) => left.distanceSquared - right.distanceSquared);
      const escapeOnlyThreat = candidates.find(
        ({ target, distanceSquared }) =>
          ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(target.entityType)
        && distanceSquared
          <= proactiveEscapeOnlyEvasionRadius(target) ** 2,
      );
      if (escapeOnlyThreat !== undefined) {
        return { target: escapeOnlyThreat.target, response: "flee" };
      }
      const aggressiveEnderman = candidates.find(({ target }) =>
        target.entityType === "minecraft:enderman"
        && isAggressiveNeutralMob(target)
      );
      if (aggressiveEnderman !== undefined) {
        return { target: aggressiveEnderman.target, response: "flee" };
      }
      const melee = candidates.find(({ target, distanceSquared }) => {
        if (
          !PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(target.entityType)
          || PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
        ) {
          return false;
        }
        const responseRadius = shouldDisengageFromThreat(
          state,
          observation,
          target,
        )
          ? PROACTIVE_MELEE_DISENGAGEMENT_RADIUS
          : MELEE_ENGAGEMENT_RADIUS;
        return distanceSquared <= responseRadius ** 2;
      });
      if (melee !== undefined) {
        const nearbyThreats = candidates.filter(({ distanceSquared }) =>
          distanceSquared
            <= PROACTIVE_RANGED_ENGAGEMENT_RADIUS
              * PROACTIVE_RANGED_ENGAGEMENT_RADIUS
        );
        const hasShield =
          (observation.inventory.counts["minecraft:shield"] ?? 0) > 0;
        const unshieldedAmbush = !hasShield && nearbyThreats.length > 1;
        const shieldedAmbush = hasShield
          && nearbyThreats.length >= SHIELDED_AMBUSH_ESCAPE_THRESHOLD;
        const armedClosePursuer = shouldCommitToCaughtMeleePursuerFight(
          observation,
          melee.target,
        );
        const shouldFleeMelee = shieldedAmbush
          || (unshieldedAmbush && !armedClosePursuer)
          || shouldDisengageFromThreat(
          state,
          observation,
          melee.target,
        );
        return {
          target: melee.target,
          response: shouldFleeMelee ? "flee" : "attack",
        };
      }
      const ranged = candidates.find(({ target, distanceSquared }) =>
        PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
        && distanceSquared
          <= PROACTIVE_RANGED_ENGAGEMENT_RADIUS
            * PROACTIVE_RANGED_ENGAGEMENT_RADIUS
      );
      if (ranged !== undefined) {
        const nearbyThreats = candidates.filter(({ distanceSquared }) =>
          distanceSquared
            <= PROACTIVE_RANGED_ENGAGEMENT_RADIUS
              * PROACTIVE_RANGED_ENGAGEMENT_RADIUS
        );
        const overwhelmingAmbush = isOverwhelmingAmbush(
          observation,
          nearbyThreats.map(({ target }) => target),
        );
        return {
          target: ranged.target,
          response: overwhelmingAmbush || shouldDisengageFromThreat(
              state,
              observation,
              ranged.target,
            )
            ? "flee"
            : "attack",
        };
      }
      return undefined;
    }),
  );
}

function shouldDisengageFromThreat(
  state: RunState,
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  if (ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(target.entityType)) {
    return true;
  }
  if (
    target.entityType === "minecraft:enderman"
    && isAggressiveNeutralMob(target)
  ) {
    return true;
  }
  if (shouldCommitToCloseRangedFight(observation, target)) {
    return false;
  }
  if (shouldCommitToRangedFight(observation, target)) {
    return false;
  }
  if (shouldCommitToFastMeleePursuerFight(observation, target)) {
    return false;
  }
  if (observation.player.health <= LETHAL_MELEE_DISENGAGE_HEALTH) {
    return true;
  }
  if (shouldCommitToMeleeFight(observation, target)) {
    return false;
  }
  if (
    FAST_MELEE_PURSUER_ENTITY_TYPES.has(target.entityType)
    && !hasMeleeWeapon(observation)
  ) {
    return true;
  }
  if (PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)) {
    return !shouldEngageRangedFight(state, observation, target);
  }
  if (PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(target.entityType)) {
    return observation.player.health < state.strategy.minimumHealth;
  }
  if (
    observation.player.health
      <= Math.min(state.strategy.minimumHealth, MELEE_DISENGAGE_HEALTH)
  ) {
    return true;
  }
  return false;
}

function proactiveEscapeOnlyEvasionRadius(
  target: BeatGameEntityObservation,
): number {
  return target.entityType === "minecraft:creeper"
    ? CREEPER_PROACTIVE_EVASION_RADIUS
    : PROACTIVE_ESCAPE_ONLY_EVASION_RADIUS;
}

function escapeThreatSelector(
  target: BeatGameEntityObservation,
  includeHostileGroup = false,
): BeatGameEntitySelector {
  if (
    target.entityType === "minecraft:creeper"
    || !includeHostileGroup
  ) {
    return { networkId: target.networkId, alive: true };
  }
  const escapeFromHostileGroup =
    ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(target.entityType)
    || PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(target.entityType)
    || PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType);
  return escapeFromHostileGroup
    ? { categories: [2], alive: true }
    : { networkId: target.networkId, alive: true };
}

function shouldEngageRangedFight(
  state: RunState,
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return shouldCommitToRangedFight(observation, target)
    || shouldCommitToUndergroundRangedFight(observation, target)
    || isReadyForBarehandedDefense(observation)
    || (
      hasMeleeWeapon(observation)
      && observation.player.health >= state.strategy.minimumHealth
    );
}

function shouldCommitToRangedFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
    && (
      (observation.inventory.counts["minecraft:shield"] ?? 0) > 0
      || shouldCommitToUnshieldedRangedFight(observation, target)
    );
}

function shouldCommitToUnshieldedRangedFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
    && hasMeleeWeapon(observation)
    && observation.player.health >= MELEE_DISENGAGE_HEALTH
    && observation.player.food > URGENT_HUNGER_FOOD_LEVEL;
}

function shouldCommitToUndergroundRangedFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return observation.player.position.y <= OVERWORLD_LOW_GROUND_MAX_Y
    && PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
    && hasMeleeWeapon(observation)
    && observation.player.health > LETHAL_MELEE_DISENGAGE_HEALTH
    && observation.player.food > CRITICAL_HUNGER_FOOD_LEVEL;
}

function shouldCommitToShieldedUndergroundRangedFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return observation.player.position.y <= OVERWORLD_LOW_GROUND_MAX_Y
    && PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
    && (observation.inventory.counts["minecraft:shield"] ?? 0) > 0;
}

function shouldCommitToCloseRangedFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
    && distanceSquared(observation.player.position, target.position)
      <= EMERGENCY_KNOCKBACK_RANGE ** 2
    && (
      (observation.inventory.counts["minecraft:shield"] ?? 0) > 0
      || isReadyForBarehandedDefense(observation)
    );
}

function shouldCommitToCaughtRangedFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
    && hasMeleeWeapon(observation)
    && distanceSquared(observation.player.position, target.position)
      <= EMERGENCY_KNOCKBACK_RANGE ** 2;
}

function shouldCommitToCloseMeleeFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return COMMITTABLE_CLOSE_MELEE_ENTITY_TYPES.has(target.entityType)
    && distanceSquared(observation.player.position, target.position)
      <= EMERGENCY_KNOCKBACK_RANGE ** 2
    && (
      (
        hasMeleeWeapon(observation)
        && observation.player.health >= MELEE_DISENGAGE_HEALTH
      )
      || observation.player.health >= BAREHANDED_DEFENSE_MINIMUM_HEALTH
    );
}

function shouldCommitToUndergroundMeleeFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return observation.player.position.y <= OVERWORLD_LOW_GROUND_MAX_Y
    && target.entityType !== "minecraft:drowned"
    && shouldCommitToCloseMeleeFight(observation, target);
}

function shouldCommitToFastMeleePursuerFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return FAST_MELEE_PURSUER_ENTITY_TYPES.has(target.entityType)
    && (
      (
        hasMeleeWeapon(observation)
        && observation.player.health > LETHAL_MELEE_DISENGAGE_HEALTH
      )
      || (
        observation.player.health >= BAREHANDED_DEFENSE_MINIMUM_HEALTH
        && observation.player.food >= 18
      )
    );
}

function shouldCommitToCaughtMeleePursuerFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return COMMITTABLE_CLOSE_MELEE_ENTITY_TYPES.has(target.entityType)
    && hasMeleeWeapon(observation)
    && observation.player.health > LETHAL_MELEE_DISENGAGE_HEALTH
    && distanceSquared(observation.player.position, target.position)
      <= EMERGENCY_KNOCKBACK_RANGE ** 2;
}

function shouldCommitToBarehandedCaughtFastPursuerFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return FAST_MELEE_PURSUER_ENTITY_TYPES.has(target.entityType)
    && !hasMeleeWeapon(observation)
    && observation.player.health > LETHAL_MELEE_DISENGAGE_HEALTH
    && observation.player.food > CRITICAL_HUNGER_FOOD_LEVEL
    && distanceSquared(observation.player.position, target.position)
      <= EMERGENCY_KNOCKBACK_RANGE ** 2;
}

function isReadyForBarehandedDefense(
  observation: BeatGameObservation,
): boolean {
  return observation.player.health >= BAREHANDED_DEFENSE_MINIMUM_HEALTH
    && observation.player.food > URGENT_HUNGER_FOOD_LEVEL;
}

function shouldCommitToMeleeFight(
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): boolean {
  return shouldCommitToCloseMeleeFight(observation, target)
    || shouldCommitToUndergroundMeleeFight(observation, target)
    || shouldCommitToFastMeleePursuerFight(observation, target)
    || shouldCommitToCaughtMeleePursuerFight(observation, target)
    || shouldCommitToBarehandedCaughtFastPursuerFight(observation, target);
}

function escapeFromTarget(
  state: RunState,
  target: BeatGameEntityObservation,
  options: {
    readonly continueEscapingWhenHit?: boolean;
  } = {},
): Effect.Effect<void, BeatGameDriverError> {
  const escapePath = {
    ...state.strategy.path,
    sprint: true,
    maxSearchTimeMs: Math.min(
      state.strategy.path.maxSearchTimeMs,
      3_000,
    ),
  };
  return Effect.gen(function* () {
    const observation = yield* state.driver.observe;
    if (observation.player.dead) {
      return;
    }
    let directEscapeSucceeded = false;
    if (
      target.entityType === "minecraft:creeper"
      || PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
      || PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(target.entityType)
      || shouldDisengageFromThreat(state, observation, target)
    ) {
      directEscapeSucceeded = yield* knockBackAndSprintAway(
        state,
        observation,
        target,
      );
    }
    const latest = yield* state.driver.observe;
    if (latest.player.dead) {
      return;
    }
    const needsRecovery = yield* needsOverworldSurfaceRecovery(
      state,
      latest.player.position,
    );
    const currentlyInFluid = yield* isPlayerInFluid(
      state.driver,
      latest.player.position,
    );
    const endermanWaterEscapeTarget = target.entityType
        === "minecraft:enderman"
      ? yield* findEndermanWaterEscapeTarget(
        state,
        latest.player.position,
      )
      : undefined;
    const dryEscapeTarget = target.entityType === "minecraft:creeper"
      ? undefined
      : yield* findDryThreatEscapeTarget(
        state,
        latest.player.position,
        target.position,
        currentlyInFluid
          ? AIR_ESCAPE_SURFACE_SEARCH_RADIUS
          : MAXIMUM_DAMAGE_FREE_FALL_DISTANCE,
      );
    const escapeTarget = dryEscapeTarget ?? surfaceEscapeTarget(
      latest.player.position,
      target.position,
    );
    const rangedThreat = PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(
      target.entityType,
    );
    const fluidFallbackAllowed = target.entityType === "minecraft:creeper"
      && !directEscapeSucceeded
      && (yield* state.driver.queryBlocks({
        center: latest.player.position,
        radius: EMERGENCY_ESCAPE_LAVA_CHECK_RADIUS,
        selector: { blockIds: ["minecraft:lava"] },
        maximumResults: 1,
      })).length === 0;
    const dynamicEscape = flee(state.driver, {
      selector: escapeThreatSelector(target, true),
      triggerRadius: rangedThreat
        ? RANGED_THREAT_ESCAPE_TRIGGER_RADIUS
        : PROACTIVE_ESCAPE_ONLY_EVASION_RADIUS,
      safeDistance: rangedThreat
        ? RANGED_THREAT_ESCAPE_SAFE_DISTANCE
        : THREAT_ESCAPE_SAFE_DISTANCE,
      completeWhenSafe: true,
      maximumEscapes: SINGLE_THREAT_MAXIMUM_ESCAPES,
      path: {
        ...escapePath,
        allowMining: needsRecovery && !rangedThreat,
        allowPlacing: false,
        avoidFluids: !(
          currentlyInFluid
          || fluidFallbackAllowed
        ),
        maxFallDistance: Math.min(
          escapePath.maxFallDistance,
          MAXIMUM_DAMAGE_FREE_FALL_DISTANCE,
        ),
      },
    });
    const requiresDynamicEscape = ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(
      target.entityType,
    )
      || rangedThreat
      || PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(target.entityType);
    const shouldPreferDryEscape = dryEscapeTarget !== undefined
      && (currentlyInFluid || !requiresDynamicEscape);
    const navigation = endermanWaterEscapeTarget !== undefined
      ? state.driver.pathfind(
        endermanWaterEscapeTarget,
        0.75,
        {
          ...escapePath,
          allowMining: false,
          allowPlacing: false,
          avoidFluids: false,
          maxFallDistance: Math.min(
            escapePath.maxFallDistance,
            MAXIMUM_DAMAGE_FREE_FALL_DISTANCE,
          ),
        },
      )
      : shouldPreferDryEscape
      ? state.driver.pathfind(
        dryEscapeTarget,
        1.5,
        {
          ...escapePath,
          allowMining: false,
          allowPlacing: false,
          avoidFluids: !currentlyInFluid,
          maxFallDistance: Math.min(
            escapePath.maxFallDistance,
            MAXIMUM_DAMAGE_FREE_FALL_DISTANCE,
          ),
        },
      )
      : requiresDynamicEscape
      ? dynamicEscape
      : needsRecovery
      ? state.driver.pathfind(
        escapeTarget,
        17,
        {
          ...escapePath,
          allowMining: true,
          allowPlacing: false,
          avoidFluids: true,
          maxFallDistance: Math.min(
            escapePath.maxFallDistance,
            MAXIMUM_DAMAGE_FREE_FALL_DISTANCE,
          ),
        },
      )
      : latest.player.position.dimension === "minecraft:overworld"
          && latest.player.position.y > OVERWORLD_LOW_GROUND_MAX_Y
      ? state.driver.pathfindXZ(
        escapeTarget.x,
        escapeTarget.z,
        latest.player.position.dimension,
        4,
        {
          ...escapePath,
          allowMining: false,
          allowPlacing: false,
          avoidFluids: true,
          maxFallDistance: Math.min(
            escapePath.maxFallDistance,
            MAXIMUM_DAMAGE_FREE_FALL_DISTANCE,
          ),
        },
      )
      : dynamicEscape;
    type EscapeNavigationFallback =
      | { readonly type: "escape-route-failed" }
      | { readonly type: "defended" };
    const mustContinueEscaping =
      ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(target.entityType)
      || (
        PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
        && !shouldCommitToRangedFight(latest, target)
      )
      || (
        PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(target.entityType)
        && !shouldCommitToMeleeFight(latest, target)
      )
      || shouldDisengageFromThreat(state, latest, target);
    const safeNavigation = navigation.pipe(
      Effect.as({ type: "escaped" } as const),
      Effect.catchAll(
        (): Effect.Effect<
          EscapeNavigationFallback,
          BeatGameDriverError
        > =>
          mustContinueEscaping
            ? knockBackAndSprintAway(state, latest, target).pipe(
              Effect.as({ type: "escape-route-failed" }),
            )
            : defendAgainstTarget(state, target).pipe(
              Effect.as({ type: "defended" }),
            ),
      ),
    );
    const outcome = yield* Effect.raceFirst(
      safeNavigation,
      monitorEscapeSafety(
        state,
        target,
        latest,
        options.continueEscapingWhenHit ?? false,
        directEscapeSucceeded,
      ),
    );
    if (outcome.type === "unsafe-air") {
      const current = yield* state.driver.observe;
      yield* emergencyAirAscent(state, current.player.position);
      return;
    }
    if (outcome.type === "escape-route-failed") {
      const current = yield* state.driver.observe;
      yield* recoverLocalNavigationTrap(
        state,
        current.player.position,
      );
      return;
    }
    if (outcome.type === "defend") {
      yield* defendAndRecover(state, outcome.target);
      return;
    }
    if (outcome.type === "knockback") {
      const current = yield* state.driver.observe;
      if (!current.player.dead) {
        yield* state.driver.withControl(
          performKnockbackStrike(state, current, outcome.target),
        );
        yield* escapeFromTarget(state, target, options);
      }
      return;
    }
    if (outcome.type === "escape") {
      yield* escapeFromTarget(state, outcome.target, options);
    }
  });
}

function findEndermanWaterEscapeTarget(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<BeatGamePosition | undefined, BeatGameDriverError> {
  return state.driver.queryBlocks({
    center: position,
    radius: ENDERMAN_WATER_ESCAPE_RADIUS,
    selector: { blockIds: ["minecraft:water"] },
    maximumResults: 64,
  }).pipe(
    Effect.map((water) =>
      [...water]
        .filter((block) =>
          block.position.dimension === position.dimension
          && Math.abs(block.position.y - position.y) <= 4
        )
        .sort((left, right) =>
          distanceSquared(left.position, position)
          - distanceSquared(right.position, position)
        )
        .map((block) => blockCenter(block.position))[0]
    ),
  );
}

function monitorEscapeSafety(
  state: RunState,
  target: BeatGameEntityObservation,
  previousObservation: BeatGameObservation,
  continueEscapingWhenHit: boolean,
  directEscapeSucceeded: boolean,
): Effect.Effect<
  | { readonly type: "dead" | "safe" | "unsafe-air" }
  | {
    readonly type: "defend" | "escape" | "knockback";
    readonly target: BeatGameEntityObservation;
  },
  BeatGameDriverError
> {
  const monitoringRadius = PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(
    target.entityType,
  )
    ? RANGED_THREAT_ESCAPE_SAFE_DISTANCE
    : THREAT_ESCAPE_SAFE_DISTANCE;
  const pollInterval = target.entityType === "minecraft:creeper"
      || FAST_MELEE_PURSUER_ENTITY_TYPES.has(target.entityType)
    ? MINIMUM_RECOVERY_POLL_MS
    : Math.max(
      MINIMUM_RECOVERY_POLL_MS,
      state.strategy.observationPollMs,
    );
  return Effect.sleep(
    pollInterval,
  ).pipe(
    Effect.zipRight(state.driver.observe),
    Effect.flatMap((observation) => {
      if (observation.player.dead) {
        return Effect.succeed({ type: "dead" } as const);
      }
      if (hasUnsafeAir(observation)) {
        return Effect.succeed({ type: "unsafe-air" } as const);
      }
      return state.driver.queryEntities({
        origin: observation.player.position,
        radius: monitoringRadius,
        selector: escapeThreatSelector(target),
        maximumResults: 1,
      }).pipe(
        Effect.zip(findImmediateThreat(state, observation)),
        Effect.flatMap(([[currentTarget], immediateThreat]) => {
          const urgentCreeper = immediateThreat?.response === "flee"
              && immediateThreat.target.entityType === "minecraft:creeper"
              && distanceSquared(
                  observation.player.position,
                  immediateThreat.target.position,
                ) <= CREEPER_EMERGENCY_REEVASION_RADIUS ** 2
            ? immediateThreat.target
            : currentTarget?.entityType === "minecraft:creeper"
                && distanceSquared(
                    observation.player.position,
                    currentTarget.position,
                  ) <= CREEPER_EMERGENCY_REEVASION_RADIUS ** 2
            ? currentTarget
            : undefined;
          if (
            directEscapeSucceeded
            && urgentCreeper !== undefined
          ) {
            return Effect.succeed({
              type: "escape",
              target: urgentCreeper,
            } as const);
          }
          if (
            immediateThreat !== undefined
            && immediateThreat.response === "flee"
            && shouldPreemptEscapeTarget(
              target,
              immediateThreat.target,
            )
          ) {
            return Effect.succeed({
              type: "escape",
              target: immediateThreat.target,
            } as const);
          }
          if (currentTarget === undefined) {
            return Effect.succeed({ type: "safe" } as const);
          }
          const caughtMeleeAttacker =
            PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(
              currentTarget.entityType,
            )
            && !PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(
              currentTarget.entityType,
            )
            && distanceSquared(
              observation.player.position,
              currentTarget.position,
            ) <= EMERGENCY_KNOCKBACK_RANGE ** 2;
          if (
            caughtMeleeAttacker
            && currentTarget.entityType === "minecraft:drowned"
            && !shouldCommitToMeleeFight(observation, currentTarget)
          ) {
            return Effect.succeed({
              type: "knockback",
              target: currentTarget,
            } as const);
          }
          if (
            shouldCommitToCaughtRangedFight(observation, currentTarget)
            || (
              shouldCommitToMeleeFight(observation, currentTarget)
              && hasMeleeWeapon(observation)
              && immediateThreat?.response !== "flee"
            )
          ) {
            return Effect.succeed({
              type: "defend",
              target: currentTarget,
            } as const);
          }
          if (
            FAST_MELEE_PURSUER_ENTITY_TYPES.has(currentTarget.entityType)
            && distanceSquared(
                observation.player.position,
                currentTarget.position,
              ) <= EMERGENCY_KNOCKBACK_RANGE ** 2
          ) {
            const shouldFightCaughtPursuer = shouldCommitToMeleeFight(
              observation,
              currentTarget,
            ) && (
              hasMeleeWeapon(observation)
              || observation.player.health
                < previousObservation.player.health
            );
            return Effect.succeed({
              type: shouldFightCaughtPursuer
                ? "defend"
                : "escape",
              target: currentTarget,
            } as const);
          }
          const secondaryMeleeAttacker = immediateThreat?.target;
          if (
            ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(target.entityType)
            && secondaryMeleeAttacker !== undefined
            && !isSameEntityTarget(target, secondaryMeleeAttacker)
            && PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(
              secondaryMeleeAttacker.entityType,
            )
            && !PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(
              secondaryMeleeAttacker.entityType,
            )
            && distanceSquared(
                observation.player.position,
                secondaryMeleeAttacker.position,
              ) <= EMERGENCY_KNOCKBACK_RANGE ** 2
          ) {
            return Effect.succeed({
              type: "knockback",
              target: secondaryMeleeAttacker,
            } as const);
          }
          if (observation.player.health >= previousObservation.player.health) {
            return monitorEscapeSafety(
              state,
              target.entityType === "minecraft:creeper"
                ? target
                : currentTarget,
              observation,
              continueEscapingWhenHit,
              directEscapeSucceeded,
            );
          }
          return findNearbyAttackThreat(state, observation).pipe(
            Effect.flatMap((threat) => {
              if (threat === undefined) {
                return monitorEscapeSafety(
                  state,
                  currentTarget,
                  observation,
                  continueEscapingWhenHit,
                  directEscapeSucceeded,
                );
              }
              if (
                ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(target.entityType)
                && !isSameEntityTarget(target, threat.target)
              ) {
                const closeMeleeAttacker =
                  PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(
                    threat.target.entityType,
                  )
                  && !PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(
                    threat.target.entityType,
                  )
                  && distanceSquared(
                      observation.player.position,
                      threat.target.position,
                    ) <= EMERGENCY_KNOCKBACK_RANGE ** 2;
                return closeMeleeAttacker
                  ? Effect.succeed({
                    type: "knockback",
                    target: threat.target,
                  } as const)
                  : monitorEscapeSafety(
                    state,
                    target,
                    observation,
                    continueEscapingWhenHit,
                    directEscapeSucceeded,
                  );
              }
              const caughtByCloseMeleePursuer =
                PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(
                  threat.target.entityType,
                )
                && !PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(
                  threat.target.entityType,
                )
                && distanceSquared(
                    observation.player.position,
                    threat.target.position,
                  ) <= EMERGENCY_KNOCKBACK_RANGE ** 2;
              if (
                caughtByCloseMeleePursuer
                && isSameEntityTarget(target, threat.target)
              ) {
                const shouldFightCaughtPursuer =
                  shouldCommitToMeleeFight(
                    observation,
                    threat.target,
                  );
                if (
                  !shouldFightCaughtPursuer
                  && continueEscapingWhenHit
                ) {
                  return monitorEscapeSafety(
                    state,
                    currentTarget,
                    observation,
                    continueEscapingWhenHit,
                    directEscapeSucceeded,
                  );
                }
                return Effect.succeed({
                  type: shouldFightCaughtPursuer
                    ? "defend"
                    : "escape",
                  target: threat.target,
                } as const);
              }
              const shouldKeepEscaping = continueEscapingWhenHit
                && !shouldCommitToMeleeFight(observation, threat.target);
              if (
                PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(
                  threat.target.entityType,
                )
                && threat.response === "flee"
                && isSameEntityTarget(target, threat.target)
              ) {
                return Effect.succeed({
                  type: "escape",
                  target: threat.target,
                } as const);
              }
              if (
                (shouldKeepEscaping || threat.response === "flee")
                && isSameEntityTarget(target, threat.target)
              ) {
                return monitorEscapeSafety(
                  state,
                  currentTarget,
                  observation,
                  continueEscapingWhenHit,
                  directEscapeSucceeded,
                );
              }
              return Effect.succeed({
                type: shouldKeepEscaping || threat.response === "flee"
                  ? "escape"
                  : "defend",
                target: threat.target,
              } as const);
            }),
          );
        }),
      );
    }),
  );
}

function shouldPreemptEscapeTarget(
  currentTarget: BeatGameEntityObservation,
  candidate: BeatGameEntityObservation,
): boolean {
  if (isSameEntityTarget(currentTarget, candidate)) {
    return false;
  }
  if (candidate.entityType === "minecraft:creeper") {
    return currentTarget.entityType !== "minecraft:creeper";
  }
  return ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(candidate.entityType)
    && !ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(currentTarget.entityType);
}

function isSameEntityTarget(
  left: BeatGameEntityObservation,
  right: BeatGameEntityObservation,
): boolean {
  return left.connectionEpoch === right.connectionEpoch
    && left.networkId === right.networkId;
}

function knockBackAndSprintAway(
  state: RunState,
  observation: BeatGameObservation,
  threat: BeatGameEntityObservation,
): Effect.Effect<boolean, BeatGameDriverError> {
  const playerPosition = observation.player.position;
  const distance = Math.sqrt(distanceSquared(
    playerPosition,
    threat.position,
  ));
  return Effect.gen(function* () {
    const nearbyLava = yield* state.driver.queryBlocks({
      center: playerPosition,
      radius: EMERGENCY_ESCAPE_LAVA_CHECK_RADIUS,
      selector: { blockIds: ["minecraft:lava"] },
      maximumResults: 1,
    });
    const currentlyInFluid = yield* isPlayerInFluid(
      state.driver,
      playerPosition,
    );
    const directAquaticEvasion = currentlyInFluid
      && (
        PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(threat.entityType)
        || threat.entityType === "minecraft:drowned"
      );
    const directSprintDistance = threat.entityType === "minecraft:creeper"
      ? CREEPER_ESCAPE_SURFACE_PROJECTION_DISTANCE
      : EMERGENCY_ESCAPE_SURFACE_PROJECTION_DISTANCE;
    const escapeSurface = yield* state.driver.sampleSurface(
      playerPosition,
      directSprintDistance,
      1,
    );
    const preferredTarget = surfaceEscapeTarget(
      playerPosition,
      threat.position,
    );
    const preferredDirection = {
      x: preferredTarget.x - playerPosition.x,
      z: preferredTarget.z - playerPosition.z,
    };
    const nearbyThreats = yield* state.driver.queryEntities({
      origin: playerPosition,
      radius: PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(threat.entityType)
        ? RANGED_THREAT_ESCAPE_SAFE_DISTANCE
        : THREAT_ESCAPE_SAFE_DISTANCE,
      selector: { categories: [2], alive: true },
      maximumResults: 32,
    });
    const escapeThreats = deduplicateEntityTargets([
      threat,
      ...nearbyThreats,
    ]).filter((candidate) =>
      candidate.position.dimension === playerPosition.dimension
    );
    const dryDirection = selectSafeDirectEscapeDirection(
      escapeSurface,
      playerPosition,
      preferredDirection,
      escapeThreats,
      directSprintDistance,
      PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(threat.entityType) ? 2 : 0,
    );
    const direction = dryDirection
      ?? (threat.entityType === "minecraft:creeper"
        ? selectSafeDirectEscapeDirection(
          escapeSurface,
          playerPosition,
          preferredDirection,
          escapeThreats,
          directSprintDistance,
          0,
          true,
        )
        : undefined);
    const projectedPosition = direction === undefined
      ? playerPosition
      : {
        x: playerPosition.x
          + direction.x * EMERGENCY_ESCAPE_FLUID_PROJECTION_DISTANCE,
        y: playerPosition.y,
        z: playerPosition.z
          + direction.z * EMERGENCY_ESCAPE_FLUID_PROJECTION_DISTANCE,
        dimension: playerPosition.dimension,
      };
    const projectedIntoFluid = threat.entityType !== "minecraft:creeper"
      && (yield* isPlayerInFluid(state.driver, projectedPosition));
    return yield* state.driver.withControl(Effect.gen(function* () {
      if (distance <= EMERGENCY_KNOCKBACK_RANGE) {
        yield* performKnockbackStrike(state, observation, threat);
      }
      if (
        nearbyLava.length > 0
        || (projectedIntoFluid && !directAquaticEvasion)
        || (direction === undefined && !directAquaticEvasion)
      ) {
        return false;
      }
      const escapeDirection = direction ?? normalizeHorizontalDirection(
        preferredDirection,
      );
      const rotation = rotationToward(playerPosition, {
        x: playerPosition.x + escapeDirection.x,
        y: playerPosition.y,
        z: playerPosition.z + escapeDirection.z,
      });
      yield* state.driver.act({
        type: "look",
        yaw: rotation.yaw,
        pitch: 0,
      });
      yield* state.driver.act({
        type: "set-movement",
        forward: true,
        jump: true,
        sprint: true,
      });
      const sprintDuration = threat.entityType === "minecraft:creeper"
        ? CREEPER_ESCAPE_SPRINT_MS
        : EMERGENCY_ESCAPE_SPRINT_MS;
      if (PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(threat.entityType)) {
        const strafeDuration = Math.floor(sprintDuration / 5);
        for (let step = 0; step < 5; step += 1) {
          const left = step % 2 === 0;
          yield* state.driver.act({
            type: "set-movement",
            left,
            right: !left,
          });
          yield* Effect.sleep(strafeDuration);
        }
      } else {
        yield* Effect.sleep(sprintDuration);
      }
      return true;
    }).pipe(
      Effect.ensuring(
        state.driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
      ),
    ));
  });
}

function performKnockbackStrike(
  state: RunState,
  observation: BeatGameObservation,
  threat: BeatGameEntityObservation,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    if (hasMeleeWeapon(observation)) {
      yield* state.driver.act({
        type: "select-item",
        selector: { itemIds: MELEE_WEAPON_ITEM_IDS },
      });
    }
    const toward = rotationToward(
      observation.player.position,
      threat.position,
    );
    yield* state.driver.act({
      type: "look",
      yaw: toward.yaw,
      pitch: toward.pitch,
    });
    yield* state.driver.act({
      type: "attack-entity",
      connectionEpoch: threat.connectionEpoch,
      networkId: threat.networkId,
      sprinting: true,
    });
  });
}

function deduplicateEntityTargets(
  entities: readonly BeatGameEntityObservation[],
): readonly BeatGameEntityObservation[] {
  return [...new Map(entities.map((entity) => [
    `${entity.connectionEpoch}:${entity.networkId}`,
    entity,
  ])).values()];
}

function selectSafeDirectEscapeDirection(
  columns: readonly BeatGameSurfaceColumn[],
  player: BeatGamePosition,
  preferredDirection: Readonly<{ x: number; z: number }>,
  threats: readonly BeatGameEntityObservation[],
  distance: number,
  lateralHalfWidth: number,
  allowSwimmableSurface = false,
): Readonly<{ x: number; z: number }> | undefined {
  const preferred = normalizeHorizontalDirection(preferredDirection);
  const directions = [
    preferred,
    ...Array.from({ length: 32 }, (_, index) => {
      const angle = index / 32 * Math.PI * 2;
      return { x: Math.cos(angle), z: Math.sin(angle) };
    }),
  ];
  let best:
    | {
      readonly direction: Readonly<{ x: number; z: number }>;
      readonly minimumThreatDistanceSquared: number;
      readonly preferredAlignment: number;
    }
    | undefined;
  for (const direction of directions) {
    if (
      !hasSafeDirectEscapeCorridor(
        columns,
        player,
        direction.x,
        direction.z,
        distance,
        lateralHalfWidth,
        allowSwimmableSurface,
      )
    ) {
      continue;
    }
    const endpoint = {
      ...player,
      x: player.x + direction.x * distance,
      z: player.z + direction.z * distance,
    };
    const minimumThreatDistanceSquared = threats.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...threats.map((candidate) =>
        distanceSquared(endpoint, candidate.position)
      ));
    const preferredAlignment = direction.x * preferred.x
      + direction.z * preferred.z;
    if (
      best === undefined
      || minimumThreatDistanceSquared
          > best.minimumThreatDistanceSquared + 0.001
      || (
        Math.abs(
          minimumThreatDistanceSquared - best.minimumThreatDistanceSquared,
        ) <= 0.001
        && preferredAlignment > best.preferredAlignment
      )
    ) {
      best = {
        direction,
        minimumThreatDistanceSquared,
        preferredAlignment,
      };
    }
  }
  return best?.direction;
}

function normalizeHorizontalDirection(
  direction: Readonly<{ x: number; z: number }>,
): Readonly<{ x: number; z: number }> {
  const length = Math.hypot(direction.x, direction.z);
  return length > 0.001
    ? { x: direction.x / length, z: direction.z / length }
    : { x: 1, z: 0 };
}

function findDryThreatEscapeTarget(
  state: RunState,
  player: BeatGamePosition,
  threat: BeatGamePosition,
  maximumVerticalDistance = MAXIMUM_DAMAGE_FREE_FALL_DISTANCE,
): Effect.Effect<BeatGamePosition | undefined, BeatGameDriverError> {
  if (
    player.dimension !== "minecraft:overworld"
    || threat.dimension !== player.dimension
  ) {
    return Effect.succeed(undefined);
  }
  return state.driver.sampleSurface(
    player,
    AIR_ESCAPE_SURFACE_SEARCH_RADIUS,
    1,
  ).pipe(
    Effect.map((columns) =>
      selectStableThreatEscapeColumn(
        columns,
        player,
        threat,
        maximumVerticalDistance,
      )
    ),
    Effect.map((surface) =>
      surface === undefined
        ? undefined
        : {
          x: surface.x + 0.5,
          y: surface.surfaceY + 1,
          z: surface.z + 0.5,
          dimension: player.dimension,
        }
    ),
  );
}

function hasSafeDirectEscapeCorridor(
  columns: readonly BeatGameSurfaceColumn[],
  player: BeatGamePosition,
  directionX: number,
  directionZ: number,
  distance: number,
  lateralHalfWidth: number,
  allowSwimmableSurface = false,
): boolean {
  const safeColumns = new Map(
    columns.flatMap((column) =>
      column.loaded
        && column.surfaceY !== undefined
        && (
          !isUnsafeSurfaceBlock(column.blockId)
          || allowSwimmableSurface && isSwimmableSurfaceBlock(column.blockId)
        )
        ? [[`${column.x}:${column.z}`, column.surfaceY] as const]
        : []
    ),
  );
  let previousStandingY = player.y;
  for (let offset = 1; offset <= Math.ceil(distance); offset += 1) {
    const x = Math.floor(player.x + directionX * offset);
    const z = Math.floor(player.z + directionZ * offset);
    const surfaceY = safeColumns.get(`${x}:${z}`);
    if (surfaceY === undefined) {
      return false;
    }
    const standingY = surfaceY + 1;
    if (
      Math.abs(standingY - previousStandingY)
        > SURFACE_NEIGHBOR_MAX_HEIGHT_DELTA
    ) {
      return false;
    }
    for (
      let lateralOffset = -lateralHalfWidth;
      lateralOffset <= lateralHalfWidth;
      lateralOffset += 1
    ) {
      const lateralX = Math.floor(
        player.x + directionX * offset - directionZ * lateralOffset,
      );
      const lateralZ = Math.floor(
        player.z + directionZ * offset + directionX * lateralOffset,
      );
      const lateralSurfaceY = safeColumns.get(`${lateralX}:${lateralZ}`);
      if (
        lateralSurfaceY === undefined
        || Math.abs(lateralSurfaceY + 1 - standingY)
          > SURFACE_NEIGHBOR_MAX_HEIGHT_DELTA
      ) {
        return false;
      }
    }
    previousStandingY = standingY;
  }
  return true;
}

function surfaceEscapeTarget(
  player: BeatGamePosition,
  threat: BeatGamePosition,
  targetY = 80,
): BeatGamePosition {
  const deltaX = player.x - threat.x;
  const deltaZ = player.z - threat.z;
  const horizontalDistance = Math.hypot(deltaX, deltaZ);
  const directionX = horizontalDistance > 0.001
    ? deltaX / horizontalDistance
    : 1;
  const directionZ = horizontalDistance > 0.001
    ? deltaZ / horizontalDistance
    : 0;
  return {
    x: player.x + directionX * 24,
    y: targetY,
    z: player.z + directionZ * 24,
    dimension: player.dimension,
  };
}

function hasUsableFood(observation: BeatGameObservation): boolean {
  return preferredUsableFoodItemIds(observation).length > 0;
}

function deathRecoveryTravelFoodCount(
  observation: BeatGameObservation,
): number {
  return [...EDIBLE_FOOD_ITEM_IDS, ...EMERGENCY_FOOD_ITEM_IDS].reduce(
    (total, itemId) =>
      total + (observation.inventory.counts[itemId] ?? 0),
    0,
  );
}

function shouldInterruptForMeal(
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  observation: BeatGameObservation,
): boolean {
  if (!hasUsableFood(observation)) {
    return false;
  }
  const hasReadyFood = [...EDIBLE_FOOD_ITEM_IDS, ...EMERGENCY_FOOD_ITEM_IDS]
    .some((itemId) =>
      !COOKABLE_RAW_FOOD_ITEM_IDS.has(itemId)
      && (observation.inventory.counts[itemId] ?? 0) > 0
    );
  if (
    hasReadyFood
    || observation.player.food <= CRITICAL_HUNGER_FOOD_LEVEL
  ) {
    return true;
  }
  return decision.type !== "satisfy-requirement"
    || (
      decision.requirement.key !== "food"
      && decision.requirement.key !== "food-supply"
    );
}

function hasRecoveryFood(observation: BeatGameObservation): boolean {
  return observation.player.food >= 18
    || [...COOKED_FOOD_ITEM_IDS, ...EMERGENCY_FOOD_ITEM_IDS].some((itemId) =>
      (observation.inventory.counts[itemId] ?? 0) > 0
    );
}

function preferredUsableFoodItemIds(
  observation: BeatGameObservation,
): readonly string[] {
  const readyFood = EDIBLE_FOOD_ITEM_IDS.filter((itemId) =>
    !COOKABLE_RAW_FOOD_ITEM_IDS.has(itemId)
    && (observation.inventory.counts[itemId] ?? 0) > 0
  );
  if (readyFood.length > 0) {
    return readyFood;
  }
  const emergencyFood = EMERGENCY_FOOD_ITEM_IDS.filter((itemId) =>
    (observation.inventory.counts[itemId] ?? 0) > 0
  );
  if (emergencyFood.length > 0) {
    return emergencyFood;
  }
  return EDIBLE_FOOD_ITEM_IDS.filter((itemId) =>
    COOKABLE_RAW_FOOD_ITEM_IDS.has(itemId)
    && (observation.inventory.counts[itemId] ?? 0) > 0
  );
}

function hasUnsafeAir(observation: BeatGameObservation): boolean {
  return observation.player.maxAir > 0
    && observation.player.air
      <= Math.min(MINIMUM_SAFE_AIR_TICKS, observation.player.maxAir * 2 / 3);
}

function hasUnsafeAirDuringAction(
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  observation: BeatGameObservation,
): boolean {
  const provisioningFood = decision.type === "satisfy-requirement"
    && (
      decision.requirement.key === "food"
      || decision.requirement.key === "food-supply"
    );
  if (!provisioningFood) {
    return hasUnsafeAir(observation);
  }
  return observation.player.maxAir > 0
    && observation.player.air
      <= Math.min(
        AQUATIC_HUNT_EMERGENCY_AIR_TICKS,
        observation.player.maxAir / 5,
      );
}

function shouldResumeUrgentAquaticFoodHunt(
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  observation: BeatGameObservation,
): boolean {
  return decision.type === "satisfy-requirement"
    && (
      decision.requirement.key === "food"
      || decision.requirement.key === "food-supply"
    )
    && observation.player.food <= URGENT_HUNGER_FOOD_LEVEL;
}

function waitForUnsafeAir(
  state: RunState,
): Effect.Effect<"dead" | "unsafe-air", BeatGameDriverError> {
  const poll = (): Effect.Effect<
    "dead" | "unsafe-air",
    BeatGameDriverError
  > =>
    Effect.sleep(Math.max(100, state.strategy.observationPollMs)).pipe(
      Effect.zipRight(state.driver.observe),
      Effect.flatMap((observation) =>
        observation.player.dead
          ? Effect.succeed("dead" as const)
          : hasUnsafeAir(observation)
          ? Effect.succeed("unsafe-air" as const)
          : Effect.suspend(poll)
      ),
    );
  return Effect.suspend(poll);
}

function emergencyAirAscent(
  state: RunState,
  position: BeatGamePosition,
  options: {
    readonly attemptsRemaining?: number;
    readonly seekDrySurfaceAfterRecovery?: boolean;
  } = {},
): Effect.Effect<void, BeatGameDriverError> {
  const attemptsRemaining = options.attemptsRemaining
    ?? AIR_ESCAPE_MAXIMUM_RECOVERY_ATTEMPTS;
  const seekDrySurfaceAfterRecovery =
    options.seekDrySurfaceAfterRecovery ?? true;
  return state.driver.observe.pipe(
    Effect.flatMap((observation) =>
      observation.player.dead
        ? Effect.void
        : isPlayerInFluid(
          state.driver,
          observation.player.position,
        ).pipe(
          Effect.flatMap((inFluid) =>
            inFluid
              ? Effect.raceFirst(
                recoverFromFluid(
                  state,
                  position,
                  attemptsRemaining,
                  observation,
                  seekDrySurfaceAfterRecovery,
                ).pipe(
                  Effect.as({ type: "recovered" } as const),
                ),
                monitorAirRecoveryThreat(state).pipe(
                  Effect.map((threat) => ({
                    type: "threat",
                    threat,
                  } as const)),
                ),
              ).pipe(
                Effect.flatMap((result) =>
                  result.type === "threat"
                    ? respondToAirRecoveryThreat(state, result.threat)
                    : Effect.void
                ),
              )
              : Effect.void
          ),
        )
    ),
  );
}

function monitorAirRecoveryThreat(
  state: RunState,
): Effect.Effect<ImmediateThreat, BeatGameDriverError> {
  const poll = (): Effect.Effect<ImmediateThreat, BeatGameDriverError> =>
    Effect.sleep(Math.max(100, state.strategy.observationPollMs)).pipe(
      Effect.zipRight(state.driver.observe),
      Effect.flatMap((observation) =>
        observation.player.dead
          ? Effect.never
          : hasUnsafeAir(observation)
          ? Effect.suspend(poll)
          : findImmediateThreat(state, observation).pipe(
            Effect.flatMap((threat) =>
              threat === undefined
                ? Effect.suspend(poll)
                : Effect.succeed(threat)
            ),
          )
      ),
    );
  return Effect.suspend(poll);
}

function respondToAirRecoveryThreat(
  state: RunState,
  threat: ImmediateThreat,
): Effect.Effect<void, BeatGameDriverError> {
  return threat.response === "flee"
    ? escapeFromTarget(state, threat.target)
    : defendAgainstTarget(state, threat.target).pipe(
      Effect.catchTag(
        "BeatGameDriverError",
        (error) =>
          error.operation === "task.attack-entity"
              || error.operation === "task.attack-nearest"
              || error.code === "not_found"
              || error.code === "unreachable"
            ? recoverFromFailedDefense(state, threat.target)
            : Effect.fail(error),
      ),
    );
}

function recoverFromFailedDefense(
  state: RunState,
  target: BeatGameEntityObservation,
): Effect.Effect<void, BeatGameDriverError> {
  return state.driver.observe.pipe(
    Effect.flatMap((observation) => {
      if (PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)) {
        return needsOverworldSurfaceRecovery(
          state,
          observation.player.position,
        ).pipe(
          Effect.flatMap((needsRecovery) =>
            needsRecovery
              ? recoverLocalNavigationTrap(
                state,
                observation.player.position,
              ).pipe(
                Effect.flatMap((recovered) =>
                  recovered
                    ? Effect.void
                    : escapeFromTarget(state, target)
                ),
              )
              : escapeFromTarget(state, target)
          ),
        );
      }
      if (shouldCommitToMeleeFight(observation, target)) {
        return knockBackAndSprintAway(state, observation, target);
      }
      return escapeFromTarget(state, target);
    }),
  );
}

function recoverFromFluid(
  state: RunState,
  originalPosition: BeatGamePosition,
  attemptsRemaining: number,
  observation: BeatGameObservation,
  seekDrySurfaceAfterRecovery: boolean,
): Effect.Effect<void, BeatGameDriverError> {
  return state.driver.withControl(
    state.driver.act({
      type: "look",
      yaw: observation.player.rotation.yaw,
      pitch: -90,
    }).pipe(
      Effect.zipRight(state.driver.act({
        type: "set-movement",
        forward: true,
        jump: true,
        sprint: observation.player.food > CRITICAL_HUNGER_FOOD_LEVEL,
      })),
      Effect.zipRight(waitForAirRecovery(
        state,
        60,
        observation.player.position.y,
        observation.player.air,
      )),
      Effect.ensuring(
        state.driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
      ),
    ),
  ).pipe(
    Effect.flatMap((recovered) =>
      recovered && !seekDrySurfaceAfterRecovery
        ? Effect.succeed(true)
        : swimToNearbyDrySurface(state, !recovered).pipe(
          Effect.flatMap((reachedDrySurface) =>
            reachedDrySurface
              ? Effect.succeed(true)
              : state.driver.observe.pipe(
                Effect.flatMap((latest) =>
                  escapeNearbyBreathingPocket(state, latest)
                ),
              )
          ),
        )
    ),
    Effect.flatMap((reachedDrySurface) =>
      reachedDrySurface
        ? Effect.void
        : state.driver.observe.pipe(
          Effect.flatMap((latest) =>
            hasUnsafeAir(latest)
              ? escapeNearbyOpenAirColumn(state, latest).pipe(
                Effect.flatMap((escaped) =>
                  escaped ? Effect.void : excavateAirEscapeShaft(state)
                ),
              )
              : escapeToOverworldSurface(state, originalPosition)
          ),
          Effect.either,
          Effect.flatMap(() => state.driver.observe),
          Effect.flatMap((latest) =>
            latest.player.dead
              ? Effect.void
              : isPlayerInFluid(
                state.driver,
                latest.player.position,
              ).pipe(
                Effect.flatMap((inFluid) =>
                  !inFluid
                    ? Effect.void
                    : attemptsRemaining > 1
                    ? emergencyAirAscent(
                      state,
                      latest.player.position,
                      {
                        attemptsRemaining: attemptsRemaining - 1,
                        seekDrySurfaceAfterRecovery,
                      },
                    )
                    : Effect.fail(new BeatGameDriverError({
                      operation: "recover-air",
                      code: "unreachable",
                      retryable: true,
                      message:
                        "The bot could not reach a stable dry surface before exhausting its air-recovery attempts",
                    }))
                ),
              )
          ),
        )
    ),
  );
}

function escapeNearbyBreathingPocket(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<boolean, BeatGameDriverError> {
  if (
    observation.player.dead
    || observation.player.maxAir <= 0
    || observation.player.air >= observation.player.maxAir
  ) {
    return Effect.succeed(
      !observation.player.dead
        && observation.player.air >= observation.player.maxAir,
    );
  }
  const origin = observation.player.position;
  return state.driver.queryBlocks({
    center: origin,
    radius: AIR_ESCAPE_BREATHING_POCKET_SEARCH_RADIUS,
    selector: {
      blockIds: ["minecraft:air", "minecraft:cave_air", "minecraft:void_air"],
    },
    maximumResults: 128,
  }).pipe(
    Effect.map((blocks) =>
      blocks
        .map((block) => ({
          target: {
            x: block.position.x + 0.5,
            y: block.position.y - 1,
            z: block.position.z + 0.5,
            dimension: block.position.dimension,
          } satisfies BeatGamePosition,
        }))
        .filter(({ target }) =>
          target.dimension === origin.dimension
          && target.y <= origin.y + AIR_ESCAPE_MAXIMUM_SWIMMABLE_RISE
        )
        .sort((left, right) =>
          distanceSquared(left.target, origin)
            - distanceSquared(right.target, origin)
        )
        .slice(0, AIR_ESCAPE_BREATHING_POCKET_CANDIDATES)
    ),
    Effect.flatMap((candidates) =>
      tryBreathingPocketCandidates(state, candidates, 0)
    ),
  );
}

function tryBreathingPocketCandidates(
  state: RunState,
  candidates: readonly Readonly<{
    target: BeatGamePosition;
  }>[],
  index: number,
): Effect.Effect<boolean, BeatGameDriverError> {
  const candidate = candidates[index];
  if (candidate === undefined) {
    return Effect.succeed(false);
  }
  const feet = {
    x: Math.floor(candidate.target.x),
    y: Math.floor(candidate.target.y),
    z: Math.floor(candidate.target.z),
    dimension: candidate.target.dimension,
  } satisfies BeatGameBlockPosition;
  return queryExactBlock(state.driver, feet).pipe(
    Effect.flatMap((feetBlock) =>
      feetBlock !== undefined && !feetBlock.replaceable
        ? Effect.succeed(false)
        : state.driver.pathfind(
          candidate.target,
          0.75,
          {
            ...state.strategy.path,
            allowMining: false,
            allowPlacing: false,
            avoidFluids: false,
            maxSearchTimeMs: Math.min(
              state.strategy.path.maxSearchTimeMs,
              AIR_ESCAPE_BREATHING_POCKET_PATH_TIMEOUT_MS,
            ),
          },
        ).pipe(
          Effect.timeoutFail({
            duration: AIR_ESCAPE_BREATHING_POCKET_PATH_TIMEOUT_MS,
            onTimeout: () => new BeatGameDriverError({
              operation: "pathfind",
              code: "unreachable",
              retryable: true,
              message: `Timed out reaching breathing pocket at ${
                positionKey(candidate.target)
              }`,
            }),
          }),
          Effect.zipRight(state.driver.observe),
          Effect.flatMap((current) =>
            hasBreathableHeadSpace(
              state.driver,
              current.player.position,
            )
          ),
          Effect.catchTag("BeatGameDriverError", () => Effect.succeed(false)),
        )
    ),
    Effect.flatMap((reached) =>
      reached
        ? Effect.succeed(true)
        : tryBreathingPocketCandidates(state, candidates, index + 1)
    ),
  );
}

function hasBreathableHeadSpace(
  driver: BeatGameDriver,
  position: BeatGamePosition,
): Effect.Effect<boolean, BeatGameDriverError> {
  return queryExactBlock(driver, {
    x: Math.floor(position.x),
    y: Math.floor(position.y + 1.62),
    z: Math.floor(position.z),
    dimension: position.dimension,
  }).pipe(
    Effect.map((block) => block !== undefined && isAirBlock(block.blockId)),
  );
}

function waitForAirRecovery(
  state: RunState,
  attemptsRemaining: number,
  highestY: number,
  highestAir: number,
  stagnantObservations = 0,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.sleep(100).pipe(
    Effect.zipRight(state.driver.observe),
    Effect.flatMap((observation) => {
      if (
        observation.player.dead
        || observation.player.maxAir <= 0
        || observation.player.air >= observation.player.maxAir
        || observation.player.air > highestAir
      ) {
        return Effect.succeed(true);
      }
      const nextY = observation.player.position.y;
      const madeProgress = nextY
          > highestY + AIR_ESCAPE_ASCENT_PROGRESS_EPSILON
        || observation.player.air > highestAir;
      const nextStagnantObservations = madeProgress
        ? 0
        : stagnantObservations + 1;
      if (
        attemptsRemaining <= 1
        || nextStagnantObservations
          >= AIR_ESCAPE_ASCENT_STAGNATION_OBSERVATIONS
      ) {
        return Effect.succeed(false);
      }
      return waitForAirRecovery(
        state,
        attemptsRemaining - 1,
        Math.max(highestY, nextY),
        Math.max(highestAir, observation.player.air),
        nextStagnantObservations,
      );
    }),
  );
}

function swimToNearbyDrySurface(
  state: RunState,
  swimDirectly = false,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.gen(function* () {
    const observation = yield* state.driver.observe;
    if (observation.player.dead) {
      return true;
    }
    const surfaces = (yield* findDrySurfaceEscapeColumns(
      state,
      observation.player.position,
    )).filter((surface) =>
      surface.surfaceY - observation.player.position.y
        <= AIR_ESCAPE_MAXIMUM_SWIMMABLE_RISE
    );
    if (surfaces.length === 0) {
      return false;
    }
    for (const surface of surfaces) {
      const support = yield* queryExactBlock(state.driver, {
        x: surface.x,
        y: surface.surfaceY,
        z: surface.z,
        dimension: observation.player.position.dimension,
      });
      if (
        support !== undefined
        && (
          support.replaceable
          || isUnsafeSurfaceBlock(support.blockId)
        )
      ) {
        continue;
      }
      const target = {
        x: surface.x + 0.5,
        y: surface.surfaceY + 1,
        z: surface.z + 0.5,
        dimension: observation.player.position.dimension,
      };
      if (!swimDirectly) {
        yield* state.driver.pathfind(
          target,
          DRY_SURFACE_APPROACH_RADIUS,
          {
            ...survivalPathPolicy(
              state.strategy.path,
              observation.player.health,
              state.strategy.minimumHealth,
            ),
            allowMining: false,
            allowPlacing: false,
            avoidFluids: false,
            sprint: observation.player.food > CRITICAL_HUNGER_FOOD_LEVEL,
            maxSearchTimeMs: Math.min(
              state.strategy.path.maxSearchTimeMs,
              SHORE_PATH_MAX_SEARCH_TIME_MS,
            ),
          },
        ).pipe(
          Effect.timeoutFail({
            duration: SHORE_PATH_TIMEOUT_MS,
            onTimeout: () => new BeatGameDriverError({
              operation: "pathfind",
              code: "unreachable",
              retryable: true,
              message: `Timed out pathfinding toward dry surface at ${
                positionKey(target)
              }`,
            }),
          }),
          Effect.either,
        );
      }
      const current = yield* state.driver.observe;
      if (current.player.dead) {
        return true;
      }
      if (!(yield* isPlayerInFluid(
        state.driver,
        current.player.position,
      ))) {
        return true;
      }
      const reached = yield* swimTowardDrySurface(state, surface);
      if (reached) {
        return true;
      }
    }
    return false;
  });
}

function findDrySurfaceEscapeColumns(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<
  readonly { readonly x: number; readonly z: number; readonly surfaceY: number }[],
  BeatGameDriverError
> {
  return state.driver.sampleSurface(
    position,
    AIR_ESCAPE_SURFACE_SEARCH_RADIUS,
    1,
  ).pipe(
    Effect.map((columns) =>
      selectStableSurfaceEscapeColumns(columns, position)
    ),
    Effect.flatMap((nearbySurfaces) =>
      nearbySurfaces.length > 0
        ? Effect.succeed(nearbySurfaces)
        : state.driver.sampleSurface(
          position,
          AIR_ESCAPE_EXTENDED_SURFACE_SEARCH_RADIUS,
          AIR_ESCAPE_EXTENDED_SURFACE_SAMPLE_STEP,
        ).pipe(
          Effect.map((columns) =>
            selectSurfaceEscapeColumns(columns, position)
          ),
        )
    ),
  );
}

function escapeToOverworldSurface(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<void, BeatGameDriverError> {
  return returnToOverworldSurface(state, position).pipe(
    Effect.catchIf(
      (cause) => cause.operation === "pathfind",
      () => excavateAirEscapeShaft(state),
    ),
  );
}

function excavateAirEscapeShaft(
  state: RunState,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    for (
      let clearedBlocks = 0;
      clearedBlocks < AIR_ESCAPE_MAXIMUM_SHAFT_BLOCKS;
      clearedBlocks += 1
    ) {
      const observation = yield* state.driver.observe;
      if (observation.player.dead) {
        return;
      }
      const surface = yield* nearestAirEscapeSurface(
        state,
        observation.player.position,
      );
      if (
        surface !== undefined
        && observation.player.position.y >= surface.surfaceY + 0.75
      ) {
        return;
      }
      const overhead = overheadEscapeBlock(observation.player.position);
      const obstruction = yield* queryExactBlock(state.driver, overhead);
      if (obstruction !== undefined && !obstruction.replaceable) {
        if (!obstruction.diggable) {
          return yield* Effect.fail(new BeatGameDriverError({
            operation: "escape-submerged-cavity",
            code: "unreachable",
            retryable: true,
            message: `The overhead escape route is blocked by ${
              obstruction.blockId
            } at ${positionKey(overhead)}`,
          }));
        }
        yield* digAirEscapeObstruction(state, observation, overhead);
      }
      const rose = yield* swimUpOneLevel(
        state,
        observation.player.position.y,
      );
      if (!rose) {
        return yield* Effect.fail(new BeatGameDriverError({
          operation: "escape-submerged-cavity",
          code: "unreachable",
          retryable: true,
          message: `The bot could not rise through the cleared block at ${
            positionKey(overhead)
          }`,
        }));
      }
      const current = yield* state.driver.observe;
      if (current.player.dead) {
        return;
      }
      if (!(yield* isPlayerInFluid(state.driver, current.player.position))) {
        return;
      }
    }
    return yield* Effect.fail(new BeatGameDriverError({
      operation: "escape-submerged-cavity",
      code: "unreachable",
      retryable: true,
      message:
        `The bot did not reach the surface after clearing ${AIR_ESCAPE_MAXIMUM_SHAFT_BLOCKS} overhead blocks`,
    }));
  });
}

function digAirEscapeObstruction(
  state: RunState,
  observation: BeatGameObservation,
  obstruction: BeatGameBlockPosition,
): Effect.Effect<void, BeatGameDriverError> {
  const dig = Effect.gen(function* () {
    if (hasMiningPickaxe(observation)) {
      yield* state.driver.act({
        type: "select-item",
        selector: { itemIds: MINING_PICKAXE_ITEM_IDS },
      });
    }
    yield* state.driver.act({
      type: "dig-block",
      position: obstruction,
    });
  });
  return isPlayerInFluid(state.driver, observation.player.position).pipe(
    Effect.flatMap((inFluid) =>
      !inFluid
        ? dig
        : state.driver.withControl(
          state.driver.act({
            type: "set-movement",
            jump: true,
          }).pipe(
            Effect.zipRight(dig),
            Effect.ensuring(
              state.driver.act({ type: "reset-movement" }).pipe(
                Effect.ignore,
              ),
            ),
          ),
        )
    ),
  );
}

function nearestAirEscapeSurface(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<
  Readonly<{ x: number; z: number; surfaceY: number }> | undefined,
  BeatGameDriverError
> {
  return state.driver.sampleSurface(
    position,
    AIR_ESCAPE_SURFACE_SEARCH_RADIUS,
    1,
  ).pipe(
    Effect.map((columns) => selectSurfaceColumn(columns, position)),
  );
}

function escapeNearbyOpenAirColumn(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.gen(function* () {
    const origin = observation.player.position;
    const blockX = Math.floor(origin.x);
    const blockY = Math.floor(origin.y);
    const blockZ = Math.floor(origin.z);
    const directions = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ] as const;
    for (
      let distance = 1;
      distance <= AIR_ESCAPE_OPEN_COLUMN_SEARCH_RADIUS;
      distance += 1
    ) {
      for (const direction of directions) {
        let corridorOpen = true;
        for (let step = 1; step <= distance; step += 1) {
          for (const y of [blockY, blockY + 1]) {
            const block = yield* queryExactBlock(state.driver, {
              x: blockX + direction.x * step,
              y,
              z: blockZ + direction.z * step,
              dimension: origin.dimension,
            });
            if (block !== undefined && !block.replaceable) {
              corridorOpen = false;
              break;
            }
          }
          if (!corridorOpen) {
            break;
          }
        }
        if (!corridorOpen) {
          continue;
        }
        const openAir = yield* queryExactBlock(state.driver, {
          x: blockX + direction.x * distance,
          y: blockY + 2,
          z: blockZ + direction.z * distance,
          dimension: origin.dimension,
        });
        if (openAir === undefined || !isAirBlock(openAir.blockId)) {
          continue;
        }
        return yield* swimTowardOpenAirColumn(state, observation, {
          x: openAir.position.x + 0.5,
          y: origin.y,
          z: openAir.position.z + 0.5,
          dimension: origin.dimension,
        });
      }
    }
    return false;
  });
}

function swimTowardOpenAirColumn(
  state: RunState,
  observation: BeatGameObservation,
  target: BeatGamePosition,
): Effect.Effect<boolean, BeatGameDriverError> {
  const rotation = rotationToward(observation.player.position, target);
  return state.driver.withControl(
    state.driver.act({
      type: "look",
      yaw: rotation.yaw,
      pitch: -20,
    }).pipe(
      Effect.zipRight(state.driver.act({
        type: "set-movement",
        forward: true,
        jump: true,
        sprint: observation.player.food > CRITICAL_HUNGER_FOOD_LEVEL,
      })),
      Effect.zipRight(waitForOpenAirColumn(
        state,
        target,
        30,
      )),
      Effect.ensuring(
        state.driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
      ),
    ),
  );
}

function waitForOpenAirColumn(
  state: RunState,
  target: BeatGamePosition,
  attemptsRemaining: number,
  previousDistanceSquared?: number,
  stagnantObservations = 0,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.sleep(100).pipe(
    Effect.zipRight(state.driver.observe),
    Effect.flatMap((observation) => {
      if (observation.player.dead) {
        return Effect.succeed(false);
      }
      if (
        observation.player.maxAir <= 0
        || observation.player.air >= observation.player.maxAir
      ) {
        return Effect.succeed(true);
      }
      const distance = horizontalDistanceSquared(
        observation.player.position,
        target,
      );
      const madeProgress = previousDistanceSquared === undefined
        || distance < previousDistanceSquared - 0.01;
      const nextStagnantObservations = madeProgress
        ? 0
        : stagnantObservations + 1;
      if (
        attemptsRemaining <= 1
        || nextStagnantObservations
          >= AIR_ESCAPE_ASCENT_STAGNATION_OBSERVATIONS
      ) {
        return Effect.succeed(false);
      }
      return waitForOpenAirColumn(
        state,
        target,
        attemptsRemaining - 1,
        distance,
        nextStagnantObservations,
      );
    }),
  );
}

function isAirBlock(blockId: string): boolean {
  return blockId === "minecraft:air"
    || blockId === "minecraft:cave_air"
    || blockId === "minecraft:void_air";
}

function overheadEscapeBlock(
  position: BeatGamePosition,
): BeatGameBlockPosition {
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y) + 2,
    z: Math.floor(position.z),
    dimension: position.dimension,
  };
}

function queryExactBlock(
  driver: BeatGameDriver,
  position: BeatGameBlockPosition,
): Effect.Effect<BeatGameBlockObservation | undefined, BeatGameDriverError> {
  return driver.queryBlocks({
    center: blockCenter(position),
    radius: 0.25,
    selector: {},
    maximumResults: 1,
  }).pipe(
    Effect.map((blocks) =>
      blocks.find((block) => sameBlockPosition(block.position, position))
    ),
  );
}

function hasMiningPickaxe(observation: BeatGameObservation): boolean {
  return MINING_PICKAXE_ITEM_IDS.some((itemId) =>
    (observation.inventory.counts[itemId] ?? 0) > 0
  );
}

function swimUpOneLevel(
  state: RunState,
  startingY: number,
): Effect.Effect<boolean, BeatGameDriverError> {
  return state.driver.withControl(
    state.driver.act({
      type: "set-movement",
      jump: true,
    }).pipe(
      Effect.zipRight(waitForVerticalProgress(
        state,
        startingY,
        AIR_ESCAPE_VERTICAL_PROGRESS_ATTEMPTS,
      )),
      Effect.ensuring(
        state.driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
      ),
    ),
  );
}

function waitForVerticalProgress(
  state: RunState,
  startingY: number,
  attemptsRemaining: number,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.sleep(100).pipe(
    Effect.zipRight(state.driver.observe),
    Effect.flatMap((observation) =>
      observation.player.dead
        || observation.player.position.y
          >= startingY + AIR_ESCAPE_VERTICAL_PROGRESS
        ? Effect.succeed(true)
        : attemptsRemaining <= 1
        ? Effect.succeed(false)
        : waitForVerticalProgress(
          state,
          startingY,
          attemptsRemaining - 1,
        )
    ),
  );
}

function isPlayerInFluid(
  driver: BeatGameDriver,
  position: BeatGamePosition,
): Effect.Effect<boolean, BeatGameDriverError> {
  return isPlayerInBlocks(driver, position, PLAYER_FLUID_BLOCK_IDS);
}

function isPlayerInLava(
  driver: BeatGameDriver,
  position: BeatGamePosition,
): Effect.Effect<boolean, BeatGameDriverError> {
  return isPlayerInBlocks(driver, position, ["minecraft:lava"]);
}

function isPlayerInBlocks(
  driver: BeatGameDriver,
  position: BeatGamePosition,
  blockIds: readonly string[],
): Effect.Effect<boolean, BeatGameDriverError> {
  const playerBlock = {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z),
    dimension: position.dimension,
  };
  const headBlock = {
    ...playerBlock,
    y: Math.floor(position.y + 1.62),
  };
  return Effect.all([playerBlock, headBlock].map((block) =>
    driver.queryBlocks({
      center: blockCenter(block),
      radius: 0.25,
      selector: { blockIds },
      maximumResults: 1,
    })
  )).pipe(
    Effect.map((results) => results.some((blocks) => blocks.length > 0)),
  );
}

function swimTowardDrySurface(
  state: RunState,
  surface: Readonly<{ x: number; z: number; surfaceY: number }>,
): Effect.Effect<boolean, BeatGameDriverError> {
  return state.driver.observe.pipe(
    Effect.flatMap((observation) => {
      if (observation.player.dead) {
        return Effect.succeed(true);
      }
      const target = {
        x: surface.x + 0.5,
        y: surface.surfaceY + 1,
        z: surface.z + 0.5,
        dimension: observation.player.position.dimension,
      };
      const rotation = rotationToward(
        observation.player.position,
        {
          ...target,
          y: observation.player.position.y,
        },
      );
      return state.driver.withControl(
        state.driver.act({
          type: "look",
          yaw: rotation.yaw,
          pitch: -20,
        }).pipe(
          Effect.zipRight(state.driver.act({
            type: "set-movement",
            forward: true,
            jump: true,
            sprint: observation.player.food > CRITICAL_HUNGER_FOOD_LEVEL,
          })),
          Effect.zipRight(waitForDrySurfaceApproach(
            state,
            target,
            AIR_ESCAPE_SURFACE_APPROACH_ATTEMPTS,
            rotation.yaw,
          )),
          Effect.ensuring(
            state.driver.act({ type: "reset-movement" }).pipe(
              Effect.ignore,
            ),
          ),
        ),
      );
    }),
  );
}

function waitForDrySurfaceApproach(
  state: RunState,
  target: BeatGamePosition,
  attemptsRemaining: number,
  targetYaw: number,
  recoveringAir = false,
  previousDistanceSquared?: number,
  stagnantObservations = 0,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.sleep(100).pipe(
    Effect.zipRight(state.driver.observe),
    Effect.flatMap((observation) => {
      const position = observation.player.position;
      const distanceToTarget = horizontalDistanceSquared(position, target);
      const reachedSurface = distanceToTarget <= 1.5 * 1.5
        && position.y >= target.y - 0.25
        && observation.player.onGround;
      if (observation.player.dead) {
        return Effect.succeed(true);
      }
      if (reachedSurface) {
        return isPlayerInFluid(state.driver, position).pipe(
          Effect.flatMap((inFluid) =>
            !inFluid
              ? Effect.succeed(true)
              : attemptsRemaining <= 1
              ? Effect.succeed(false)
              : waitForDrySurfaceApproach(
                state,
                target,
                attemptsRemaining - 1,
                targetYaw,
                recoveringAir,
                distanceToTarget,
                0,
              )
          ),
        );
      }
      const hasRecoveredAir = observation.player.maxAir <= 0
        || observation.player.air >= observation.player.maxAir;
      if (recoveringAir && hasRecoveredAir) {
        return state.driver.act({
          type: "look",
          yaw: targetYaw,
          pitch: -20,
        }).pipe(
          Effect.zipRight(waitForDrySurfaceApproach(
            state,
            target,
            attemptsRemaining - 1,
            targetYaw,
            false,
            distanceToTarget,
            0,
          )),
        );
      }
      if (!recoveringAir && hasUnsafeAir(observation)) {
        return state.driver.act({
          type: "look",
          yaw: observation.player.rotation.yaw,
          pitch: -90,
        }).pipe(
          Effect.zipRight(waitForDrySurfaceApproach(
            state,
            target,
            attemptsRemaining - 1,
            targetYaw,
            true,
            distanceToTarget,
            0,
          )),
        );
      }
      const madeProgress = previousDistanceSquared === undefined
        || distanceToTarget < previousDistanceSquared - 0.05;
      const nextStagnantObservations = madeProgress
        ? 0
        : stagnantObservations + 1;
      return attemptsRemaining <= 1
          || nextStagnantObservations >= AIR_ESCAPE_STAGNANT_OBSERVATIONS
        ? Effect.succeed(false)
        : waitForDrySurfaceApproach(
          state,
          target,
          attemptsRemaining - 1,
          targetYaw,
          recoveringAir,
          distanceToTarget,
          nextStagnantObservations,
        );
    }),
  );
}

function isAggressiveNeutralMob(
  entity: BeatGameEntityObservation,
): boolean {
  return entity.target !== undefined;
}

function isOverwhelmingAmbush(
  observation: BeatGameObservation,
  nearbyThreats: readonly BeatGameEntityObservation[],
): boolean {
  const threshold =
    (observation.inventory.counts["minecraft:shield"] ?? 0) > 0
      ? SHIELDED_AMBUSH_ESCAPE_THRESHOLD
      : 2;
  return nearbyThreats.length >= threshold;
}

function findNearbyAttackThreat(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<
  ImmediateThreat | undefined,
  BeatGameDriverError
> {
  const radius = 16;
  return Effect.all([
    state.driver.queryEntities({
      origin: observation.player.position,
      radius,
      selector: {
        categories: [2],
        alive: true,
      },
      maximumResults: 8,
    }),
    state.driver.queryEntities({
      origin: observation.player.position,
      radius,
      selector: {
        entityTypes: DANGEROUS_NEUTRAL_ENTITY_TYPES,
        alive: true,
      },
      maximumResults: 8,
    }),
  ]).pipe(
    Effect.map(([hostiles, dangerousNeutralMobs]) => {
      const threats = new Map(
        [
          ...hostiles,
          ...dangerousNeutralMobs.filter(isAggressiveNeutralMob),
        ].map((entity) => [
          `${entity.connectionEpoch}:${entity.networkId}`,
          entity,
        ]),
      );
      const candidates = [...threats.values()].sort(
        (left, right) =>
          distanceSquared(observation.player.position, left.position)
          - distanceSquared(observation.player.position, right.position),
      );
      const escapeOnlyThreat = candidates.find((candidate) =>
        ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(candidate.entityType)
        && distanceSquared(
            observation.player.position,
            candidate.position,
          ) <= proactiveEscapeOnlyEvasionRadius(candidate) ** 2
      );
      const rangedAttacker = candidates.find((candidate) =>
        PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(candidate.entityType)
      );
      const closeMeleeAttacker = candidates.find((candidate) =>
        PROACTIVE_MELEE_HOSTILE_ENTITY_TYPES.has(candidate.entityType)
        && !PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(candidate.entityType)
        && distanceSquared(
            observation.player.position,
            candidate.position,
          ) <= 4 ** 2
      );
      const nearbyPursuer = candidates.find((candidate) =>
        distanceSquared(
          observation.player.position,
          candidate.position,
        ) <= (
          ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(candidate.entityType)
            ? proactiveEscapeOnlyEvasionRadius(candidate)
            : PROACTIVE_ESCAPE_ONLY_EVASION_RADIUS
        ) ** 2
      );
      const nearest = escapeOnlyThreat
        ?? closeMeleeAttacker
        ?? rangedAttacker
        ?? nearbyPursuer;
      if (nearest === undefined) {
        return undefined;
      }
      const nearbyThreats = candidates.filter((candidate) =>
        distanceSquared(
          observation.player.position,
          candidate.position,
        ) <= PROACTIVE_RANGED_ENGAGEMENT_RADIUS ** 2
      );
      const overwhelmingAmbush = isOverwhelmingAmbush(
        observation,
        nearbyThreats,
      );
      const shouldEscape =
        ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(nearest.entityType)
        || overwhelmingAmbush
        || shouldDisengageFromThreat(state, observation, nearest);
      return {
        target: nearest,
        response: shouldEscape ? "flee" as const : "attack" as const,
      };
    }),
  );
}

function defendAgainstTarget(
  state: RunState,
  target: BeatGameEntityObservation,
): Effect.Effect<void, BeatGameDriverError> {
  const defensivePath = {
    ...state.strategy.path,
    allowMining: false,
    allowPlacing: false,
    avoidFluids: true,
    maxSearchTimeMs: Math.min(
      state.strategy.path.maxSearchTimeMs,
      3_000,
    ),
  };
  return state.driver.observe.pipe(
    Effect.flatMap((observation) => {
      const canBlockWithShield =
        SHIELD_BLOCKING_HOSTILE_ENTITY_TYPES.has(target.entityType)
        && (observation.inventory.counts["minecraft:shield"] ?? 0) > 0;
      const attack = attackEntity(state.driver, {
        target,
        sprinting: true,
        targetUnavailableTimeoutSeconds: 3,
        selectBestWeapon: true,
        useOffhandShield: canBlockWithShield,
        path: defensivePath,
      });
      const prepareShield = canBlockWithShield
        ? state.driver.withControl(Effect.gen(function* () {
          if (
            observation.player.equipment.offhand !== "minecraft:shield"
          ) {
            yield* state.driver.act({
              type: "equip-item",
              selector: { itemIds: ["minecraft:shield"] },
              equipmentSlot: "offhand",
            });
          }
        }))
        : Effect.void;
      const commitThroughWound =
        shouldCommitToUnshieldedRangedFight(observation, target)
        || shouldCommitToUndergroundRangedFight(observation, target)
        || (
          PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
          && isReadyForBarehandedDefense(observation)
        )
        || shouldCommitToCaughtMeleePursuerFight(observation, target)
        || shouldCommitToBarehandedCaughtFastPursuerFight(
          observation,
          target,
        );
      const commitThroughLethalWound =
        shouldCommitToCloseRangedFight(observation, target)
        || shouldCommitToCaughtRangedFight(observation, target)
        || shouldCommitToShieldedUndergroundRangedFight(
          observation,
          target,
        )
        || shouldCommitToFastMeleePursuerFight(observation, target);
      const guardedAttack = Effect.raceFirst(
        attack.pipe(Effect.as("defended" as const)),
        monitorDefenseHealth(
          state,
          observation.player.health,
          observation.player.position,
          !(
            (
              canBlockWithShield
              && PROACTIVE_RANGED_HOSTILE_ENTITY_TYPES.has(target.entityType)
            )
            || shouldCommitToUndergroundRangedFight(observation, target)
            || shouldCommitToCloseRangedFight(observation, target)
            || shouldCommitToFastMeleePursuerFight(observation, target)
            || shouldCommitToCaughtMeleePursuerFight(observation, target)
          ),
          {
            commitThroughWound,
            commitThroughLethalWound,
          },
        ),
      ).pipe(
        Effect.flatMap((outcome) =>
          outcome === "defended"
            ? Effect.void
            : outcome === "unsafe-air"
            ? state.driver.observe.pipe(
              Effect.flatMap((latest) =>
                emergencyAirAscent(state, latest.player.position)
              ),
            )
            : escapeFromTarget(state, target, {
              continueEscapingWhenHit: true,
            })
        ),
      );
      return prepareShield.pipe(Effect.zipRight(guardedAttack));
    }),
  );
}

function monitorDefenseHealth(
  state: RunState,
  engagementHealth: number,
  engagementPosition: BeatGamePosition,
  disengageWhenWounded = true,
  options: {
    readonly commitThroughWound?: boolean;
    readonly commitThroughLethalWound?: boolean;
  } = {},
): Effect.Effect<"disengage" | "unsafe-air", BeatGameDriverError> {
  return Effect.sleep(
    Math.max(MINIMUM_RECOVERY_POLL_MS, state.strategy.observationPollMs),
  ).pipe(
    Effect.zipRight(state.driver.observe),
    Effect.flatMap((observation) => {
      if (observation.player.dead) {
        return Effect.succeed("disengage" as const);
      }
      if (hasUnsafeAir(observation)) {
        return Effect.succeed("unsafe-air" as const);
      }
      if (
        observation.player.position.dimension !== engagementPosition.dimension
        || (
          disengageWhenWounded
          && distanceSquared(
            observation.player.position,
            engagementPosition,
          ) > DEFENSIVE_PURSUIT_MAX_DISTANCE ** 2
        )
      ) {
        return Effect.succeed("disengage" as const);
      }
      if (
        options.commitThroughLethalWound !== true
        && observation.player.health <= LETHAL_MELEE_DISENGAGE_HEALTH
      ) {
        return Effect.succeed("disengage" as const);
      }
      return state.driver.queryEntities({
        origin: observation.player.position,
        radius: PROACTIVE_RANGED_ENGAGEMENT_RADIUS,
        selector: { categories: [2], alive: true },
        maximumResults: SHIELDED_AMBUSH_ESCAPE_THRESHOLD,
      }).pipe(
        Effect.flatMap((nearbyThreats) => {
          if (isOverwhelmingAmbush(observation, nearbyThreats)) {
            return Effect.succeed("disengage" as const);
          }
          if (
            !disengageWhenWounded
            || options.commitThroughWound === true
            || options.commitThroughLethalWound === true
            || (
              observation.player.health >= state.strategy.minimumHealth
              || observation.player.health >= engagementHealth
            )
          ) {
            return monitorDefenseHealth(
              state,
              engagementHealth,
              engagementPosition,
              disengageWhenWounded,
              options,
            );
          }
          return Effect.succeed("disengage" as const);
        }),
      );
    }),
  );
}

function defendAndRecover(
  state: RunState,
  target: BeatGameEntityObservation,
): Effect.Effect<void, BeatGameDriverError> {
  return defendAgainstTarget(state, target).pipe(
    Effect.zipRight(
      retreatAndRecover(state, POST_DEFENSE_RECOVERY_DURATION_MS),
    ),
    Effect.zipRight(
      collectNearbyDrops(state.driver, {
        radius: 8,
        maximumDrops: 16,
        settleDelayMs: 500,
        path: {
          ...state.strategy.path,
          allowPlacing: false,
          avoidFluids: true,
        },
      }),
    ),
    Effect.catchTag(
      "BeatGameDriverError",
      (error) =>
        error.operation === "task.attack-entity"
            || error.operation === "task.attack-nearest"
          ? recoverFromFailedDefense(state, target)
          : Effect.fail(error),
    ),
  );
}

function extinguishFire(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameDriverError> {
  if (observation.player.dead || observation.player.fireTicks <= 0) {
    return Effect.void;
  }
  return Effect.gen(function* () {
    let current = observation;
    if (
      !isNether(current.player.position.dimension)
      && (current.inventory.counts["minecraft:water_bucket"] ?? 0) > 0
    ) {
      yield* state.driver.withControl(Effect.gen(function* () {
        yield* state.driver.act({
          type: "select-item",
          selector: { itemIds: ["minecraft:water_bucket"] },
        });
        yield* state.driver.act({
          type: "look",
          yaw: current.player.rotation.yaw,
          pitch: 90,
        });
        yield* waitForViewRotation(
          state.driver,
          current.player.rotation.yaw,
          90,
          20,
        );
        yield* state.driver.act({ type: "use-item", hand: "main" });
        yield* Effect.sleep(100);
      }).pipe(
        Effect.ensuring(
          state.driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
        ),
      ));
      current = yield* state.driver.observe;
      if (current.player.dead || current.player.fireTicks <= 0) {
        return;
      }
    }

    const water = [...(yield* state.driver.queryBlocks({
      center: current.player.position,
      radius: 8,
      selector: { blockIds: ["minecraft:water"] },
      maximumResults: 32,
    }))].sort((left, right) =>
      distanceSquared(left.position, current.player.position)
      - distanceSquared(right.position, current.player.position)
    )[0];
    if (water === undefined) {
      return;
    }
    yield* state.driver.pathfind(blockCenter(water.position), 0.75, {
      ...state.strategy.path,
      allowMining: false,
      allowPlacing: false,
      avoidFluids: false,
      maxFallDistance: Math.min(state.strategy.path.maxFallDistance, 1),
      maxSearchTimeMs: Math.min(
        state.strategy.path.maxSearchTimeMs,
        5_000,
      ),
    }).pipe(
      Effect.catchTag("BeatGameDriverError", () => Effect.void),
    );
    yield* Effect.sleep(100);
  });
}

function escapeLava(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameDriverError> {
  return isPlayerInLava(
    state.driver,
    observation.player.position,
  ).pipe(
    Effect.flatMap((inLava) => {
      if (!inLava) {
        return Effect.void;
      }
      const placeWater =
        (observation.inventory.counts["minecraft:water_bucket"] ?? 0) > 0
          ? state.driver.withControl(Effect.gen(function* () {
            yield* state.driver.act({
              type: "select-item",
              selector: { itemIds: ["minecraft:water_bucket"] },
            });
            yield* state.driver.act({
              type: "look",
              yaw: observation.player.rotation.yaw,
              pitch: 90,
            });
            yield* waitForViewRotation(
              state.driver,
              observation.player.rotation.yaw,
              90,
              20,
            );
            yield* state.driver.act({ type: "use-item", hand: "main" });
            yield* Effect.sleep(100);
          }).pipe(
            Effect.ensuring(
              state.driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
            ),
          ))
          : Effect.void;
      return placeWater.pipe(
        Effect.zipRight(state.driver.observe),
        Effect.flatMap((latest) =>
          isPlayerInLava(state.driver, latest.player.position).pipe(
            Effect.flatMap((stillInLava) => {
              if (!stillInLava || latest.player.dead) {
                return Effect.void;
              }
              return state.driver.queryBlocks({
                center: latest.player.position,
                radius: 6,
                selector: { blockIds: ["minecraft:lava"] },
                maximumResults: 16,
              }).pipe(
                Effect.flatMap((lava) => {
                  const nearest = [...lava].sort((left, right) =>
                    distanceSquared(
                      left.position,
                      latest.player.position,
                    ) - distanceSquared(
                      right.position,
                      latest.player.position,
                    )
                  )[0];
                  const away = nearest === undefined
                    ? {
                      ...latest.player.position,
                      x: latest.player.position.x + LAVA_RETREAT_DISTANCE,
                    }
                    : positionAwayFrom(
                      latest.player.position,
                      nearest.position,
                      LAVA_RETREAT_DISTANCE,
                    );
                  const rotation = rotationToward(
                    latest.player.position,
                    away,
                  );
                  return state.driver.withControl(Effect.gen(function* () {
                    yield* state.driver.act({
                      type: "look",
                      yaw: rotation.yaw,
                      pitch: 0,
                    });
                    yield* state.driver.act({
                      type: "set-movement",
                      forward: true,
                      jump: true,
                      sprint: true,
                    });
                    yield* Effect.sleep(LAVA_EMERGENCY_SPRINT_MS);
                  }).pipe(
                    Effect.ensuring(
                      state.driver.act({ type: "reset-movement" }).pipe(
                        Effect.ignore,
                      ),
                    ),
                  ));
                }),
              );
            }),
          )
        ),
      );
    }),
  );
}

function positionAwayFrom(
  position: BeatGamePosition,
  hazard: BeatGamePosition,
  distance: number,
): BeatGamePosition {
  const deltaX = position.x - hazard.x;
  const deltaZ = position.z - hazard.z;
  const horizontalDistance = Math.hypot(deltaX, deltaZ);
  const directionX = horizontalDistance > 0.001
    ? deltaX / horizontalDistance
    : 1;
  const directionZ = horizontalDistance > 0.001
    ? deltaZ / horizontalDistance
    : 0;
  return {
    ...position,
    x: position.x + directionX * distance,
    z: position.z + directionZ * distance,
  };
}

function retreatAndRecover(
  state: RunState,
  recoveryDurationMs = RECOVERY_DURATION_MS,
): Effect.Effect<void, BeatGameDriverError> {
  const escapePath = {
    ...state.strategy.path,
    sprint: true,
    maxSearchTimeMs: Math.min(
      state.strategy.path.maxSearchTimeMs,
      3_000,
    ),
  };
  const fleeFromNearbyNeutralThreat = state.driver.observe.pipe(
    Effect.flatMap((observation) => {
      if (
        observation.player.dead
        || observation.player.health >= state.strategy.minimumHealth
      ) {
        return Effect.void;
      }
      return state.driver.queryEntities({
        origin: observation.player.position,
        radius: 24,
        selector: {
          entityTypes: DANGEROUS_NEUTRAL_ENTITY_TYPES,
          alive: true,
        },
        maximumResults: 8,
      }).pipe(
        Effect.map((entities) => entities.find(isAggressiveNeutralMob)),
        Effect.flatMap((threat) =>
          threat === undefined
            ? Effect.void
            : flee(state.driver, {
              selector: {
                networkId: threat.networkId,
                alive: true,
              },
              triggerRadius: 24,
              safeDistance: 32,
              completeWhenSafe: true,
              maximumEscapes: 2,
              path: escapePath,
            })
        ),
      );
    }),
    Effect.catchTag("BeatGameDriverError", () => Effect.void),
  );
  const recoveryPollMs = Math.max(
    MINIMUM_RECOVERY_POLL_MS,
    Math.min(MAXIMUM_RECOVERY_POLL_MS, state.strategy.observationPollMs),
  );
  const recoverUntilSafe = (
    attemptsRemaining: number,
  ): Effect.Effect<void, BeatGameDriverError> =>
    state.driver.observe.pipe(
      Effect.flatMap((observation) => {
        if (
          observation.player.dead
          || attemptsRemaining === 0
        ) {
          return Effect.void;
        }
        if (hasUnsafeAir(observation)) {
          return emergencyAirAscent(
            state,
            observation.player.position,
          ).pipe(
            Effect.zipRight(
              recoverUntilSafe(attemptsRemaining - 1),
            ),
          );
        }
        return findNearbyAttackThreat(state, observation).pipe(
          Effect.flatMap((threat) => {
            if (threat === undefined) {
              if (
                observation.player.health >= state.strategy.minimumHealth
              ) {
                return Effect.void;
              }
              if (
                observation.player.food < 18
                && !hasUsableFood(observation)
              ) {
                return Effect.void;
              }
              if (
                observation.player.food < 20
                && hasUsableFood(observation)
              ) {
                return eatWhenNeeded(state.driver, {
                  foodItemIds: preferredUsableFoodItemIds(observation),
                  foodLevel: 20,
                  maximumMeals: 1,
                  completeWhenNoFood: true,
                  path: state.strategy.path,
                }).pipe(
                  Effect.zipRight(Effect.sleep(recoveryPollMs)),
                  Effect.zipRight(
                    recoverUntilSafe(attemptsRemaining - 1),
                  ),
                );
              }
              return Effect.sleep(recoveryPollMs).pipe(
                Effect.zipRight(
                  recoverUntilSafe(attemptsRemaining - 1),
                ),
              );
            }
            const escaping = threat.response === "flee";
            const response = escaping
              ? escapeFromTarget(state, threat.target)
              : defendAgainstTarget(state, threat.target);
            return response.pipe(
              Effect.catchTag(
                "BeatGameDriverError",
                (error) => {
                  if (escaping) {
                    if (
                      ESCAPE_ONLY_DEFENSIVE_ENTITY_TYPES.has(
                        threat.target.entityType,
                      )
                    ) {
                      return Effect.void;
                    }
                    return defendAgainstTarget(state, threat.target).pipe(
                      Effect.catchTag("BeatGameDriverError", () => Effect.void),
                    );
                  }
                  if (
                    error.operation === "task.attack-entity"
                    || error.operation === "task.attack-nearest"
                    || error.code === "not_found"
                    || error.code === "unreachable"
                  ) {
                    return recoverFromFailedDefense(
                      state,
                      threat.target,
                    ).pipe(
                      Effect.catchTag("BeatGameDriverError", () => Effect.void),
                    );
                  }
                  return Effect.fail(error);
                },
              ),
              Effect.zipRight(Effect.sleep(recoveryPollMs)),
              Effect.zipRight(
                recoverUntilSafe(attemptsRemaining - 1),
              ),
            );
          }),
        );
      }),
    );
  const escapeEnvironmentalHazard = state.driver.observe.pipe(
    Effect.flatMap((observation) => extinguishFire(state, observation)),
    Effect.zipRight(state.driver.observe),
    Effect.flatMap((observation) => escapeLava(state, observation)),
  );
  return escapeEnvironmentalHazard.pipe(
    Effect.zipRight(fleeFromNearbyNeutralThreat),
    Effect.zipRight(
      recoverUntilSafe(Math.ceil(recoveryDurationMs / recoveryPollMs)),
    ),
  );
}

function policyContextFor(
  state: RunState,
  observation: BeatGameObservation,
  checkpoint: BeatGameCheckpoint,
): BeatGamePolicyContext {
  return {
    driver: state.driver,
    checkpoint,
    observation,
    strategy: state.strategy,
  };
}

function requirementActionResult(
  requirement: BeatGameItemRequirement,
  before: BeatGameObservation,
  after: BeatGameObservation,
): ActionResult {
  const afterRequirementCount = requirementCount(
    after.inventory,
    requirement,
  );
  const requirementProgressed = afterRequirementCount
    > requirementCount(before.inventory, requirement);
  const inventoryChanged = inventoryCountsChanged(
    before.inventory.counts,
    after.inventory.counts,
  );
  const moved = before.player.position.dimension
      !== after.player.position.dimension
    || distanceSquared(before.player.position, after.player.position) >= 0.25;
  if (
    afterRequirementCount >= requirement.targetCount
    || requirementProgressed
    || inventoryChanged
    || moved
  ) {
    return {};
  }
  return {
    replanReason:
      `no observable progress while satisfying ${requirement.key}`,
    replanDelayMs: REQUIREMENT_NO_PROGRESS_REPLAN_DELAY_MS,
  };
}

function inventoryCountsChanged(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
): boolean {
  const itemIds = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...itemIds].some((itemId) =>
    (before[itemId] ?? 0) !== (after[itemId] ?? 0)
  );
}

function satisfyRequirement(
  state: RunState,
  requirement: BeatGameItemRequirement,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  return recoverNearbyRequirementDrops(
    state,
    requirement,
    observation,
  ).pipe(
    Effect.flatMap((recovered) =>
      recovered
        ? Effect.void
        : satisfyRequirementFromWorld(state, requirement, observation)
    ),
  );
}

function recoverNearbyRequirementDrops(
  state: RunState,
  requirement: BeatGameItemRequirement,
  observation: BeatGameObservation,
): Effect.Effect<boolean, BeatGameDriverError> {
  const foodRequirement = requirement.key === "food"
    || requirement.key === "food-supply";
  const shouldCrossFluids = (
    foodRequirement
  ) && (
    observation.player.health >= state.strategy.minimumHealth
    || (
      observation.player.food <= CRITICAL_HUNGER_FOOD_LEVEL
      && observation.player.health > LETHAL_MELEE_DISENGAGE_HEALTH
    )
  );
  const maximumVerticalDistance = foodRequirement
      && observation.player.food <= URGENT_HUNGER_FOOD_LEVEL
    ? URGENT_FOOD_DROP_MAXIMUM_VERTICAL_DISTANCE
    : NEARBY_REQUIREMENT_DROP_MAXIMUM_VERTICAL_DISTANCE;
  const itemIds = [...new Set(
    requirement.key === "food"
      ? [
        ...requirement.itemIds,
        ...Object.keys(RAW_FOOD_TO_COOKED),
        ...EMERGENCY_FOOD_ITEM_IDS,
      ]
      : requirement.itemIds,
  )];
  if (itemIds.length === 0) {
    return Effect.succeed(false);
  }
  const itemIdSet = new Set(itemIds);
  const count = (value: BeatGameObservation): number =>
    itemIds.reduce(
      (total, itemId) => total + (value.inventory.counts[itemId] ?? 0),
      0,
    );
  const before = count(observation);
  return state.driver.queryEntities({
    origin: observation.player.position,
    radius: NEARBY_REQUIREMENT_DROP_RADIUS,
    selector: {
      entityTypes: ["minecraft:item"],
      alive: true,
    },
    maximumResults: 32,
  }).pipe(
    Effect.flatMap((entities) =>
      entities.some((entity) =>
          entity.itemId !== undefined
          && itemIdSet.has(entity.itemId)
          && Math.abs(
            entity.position.y - observation.player.position.y,
          ) <= maximumVerticalDistance
        )
        ? collectNearbyDrops(state.driver, {
          itemIds,
          radius: NEARBY_REQUIREMENT_DROP_RADIUS,
          maximumDrops: 32,
          settleDelayMs: 0,
          maximumVerticalDistance,
          path: {
            ...state.strategy.path,
            allowPlacing: false,
            avoidFluids: !shouldCrossFluids,
          },
        }).pipe(
          Effect.zipRight(state.driver.observe),
          Effect.map((current) => count(current) > before),
        )
        : Effect.succeed(false)
    ),
  );
}

function satisfyRequirementFromWorld(
  state: RunState,
  requirement: BeatGameItemRequirement,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  const missing = Math.max(
    1,
    requirement.targetCount - requirement.currentCount,
  );
  switch (requirement.key) {
    case "food-supply":
      return satisfyFoodSupplyRequirement(
        state,
        requirement,
        observation,
      );
    case "food":
      return satisfyFoodRequirement(
        state,
        requirement,
        observation,
      );
    case "logs":
      return collectBlocksOrExplore(state, observation, {
        blockIds: requirement.itemIds,
        tags: requirement.tags,
        count: bufferedCollectionCount("logs", missing),
        progressItemIds: requirement.itemIds,
        purpose: "find-logs",
        avoidSubmergedTargets: true,
        requireLineOfSight: true,
        requireSurfaceTargets: true,
      });
    case "cobblestone":
      return collectBlocksOrExplore(state, observation, {
        blockIds: ["minecraft:stone"],
        count: bufferedCollectionCount("cobblestone", missing),
        progressItemIds: ["minecraft:cobblestone"],
        purpose: "find-stone",
        avoidSubmergedTargets: true,
        avoidFluids: true,
        prepareAttempt: (current) =>
          ensureMiningPickaxe(
            state,
            current,
            "minecraft:wooden_pickaxe",
            MINING_PICKAXE_ITEM_IDS,
          ),
      });
    case "basic-melee-weapon":
      return craftWithTable(
        state,
        observation,
        "minecraft:wooden_sword",
        1,
      );
    case "melee-weapon":
      return craftWithTable(
        state,
        observation,
        "minecraft:stone_sword",
        1,
      );
    case "obsidian":
      return acquire(state.driver, requirement, {
        searchRadius: state.strategy.blockSearchRadius,
        path: state.strategy.path,
      });
    case "iron": {
      return satisfyIronRequirement(state, observation, missing);
    }
    case "pickaxe":
      return craftWithTable(
        state,
        observation,
        (observation.inventory.counts["minecraft:iron_ingot"] ?? 0) >= 3
          ? "minecraft:iron_pickaxe"
          : "minecraft:stone_pickaxe",
        1,
      );
    case "diamond-pickaxe": {
      const diamonds =
        observation.inventory.counts["minecraft:diamond"] ?? 0;
      if (diamonds < 3) {
        return collectBlocks(state.driver, {
          blockIds: [
            "minecraft:diamond_ore",
            "minecraft:deepslate_diamond_ore",
          ],
          count: bufferedCollectionCount("diamond", 3 - diamonds),
          searchRadius: state.strategy.blockSearchRadius,
          path: state.strategy.path,
        });
      }
      return craftWithTable(
        state,
        observation,
        "minecraft:diamond_pickaxe",
        1,
      );
    }
    case "water-bucket":
      return fillLiquidBucket(state, observation, "water");
    case "lava-bucket":
      return fillLiquidBucket(state, observation, "lava");
    case "ignition":
      return ensureFlint(state, observation).pipe(
        Effect.zipRight(craftItem(state.driver, {
          resultItemId: "minecraft:flint_and_steel",
          count: 1,
          path: state.strategy.path,
        })),
      );
    case "shield":
      return craftWithTable(
        state,
        observation,
        "minecraft:shield",
        1,
      );
    case "blaze-rods":
      return huntOrExplore(
        state,
        observation,
        { entityTypes: ["minecraft:blaze"], alive: true },
        bufferedCollectionCount("blaze-rods", missing),
        "find-nether-fortress",
      );
    case "ender-pearls":
      return acquireEnderPearls(
        state,
        observation,
        bufferedCollectionCount("ender-pearls", missing),
      );
    case "gold":
      return collectBlocks(state.driver, {
        blockIds: [
          "minecraft:nether_gold_ore",
          "minecraft:gold_ore",
          "minecraft:deepslate_gold_ore",
        ],
        count: bufferedCollectionCount("gold", missing),
        searchRadius: state.strategy.blockSearchRadius,
        path: state.strategy.path,
      });
    case "eyes-of-ender":
      return craftItem(state.driver, {
        resultItemId: "minecraft:ender_eye",
        count: missing,
        path: state.strategy.path,
      });
    case "ranged-weapon":
      return ensureString(state, observation, 3).pipe(
        Effect.zipRight(craftWithTable(
          state,
          observation,
          "minecraft:bow",
          1,
        )),
      );
    case "arrows":
      return ensureArrowIngredients(state, observation, missing).pipe(
        Effect.zipRight(craftWithTable(
          state,
          observation,
          "minecraft:arrow",
          missing,
        )),
      );
    case "torch":
      return craftItem(state.driver, {
        resultItemId: "minecraft:torch",
        count: missing,
        path: state.strategy.path,
      });
    default:
      return acquire(state.driver, requirement, {
        searchRadius: state.strategy.blockSearchRadius,
        path: state.strategy.path,
      }).pipe(
        Effect.catchTag("BeatGameDriverError", (cause) =>
          Effect.fail(new BeatGameRequirementError({
            runId: "",
            instanceId: state.driver.instanceId,
            botId: state.driver.botId,
            phase: BeatGamePhase.PREPARE_OVERWORLD,
            action: `satisfy:${requirement.key}`,
            retryable: cause.retryable,
            message: `No acquisition strategy succeeded for ${requirement.key}`,
            requirement: requirement.key,
            cause,
          }))
        ),
      );
  }
}

function satisfyFoodSupplyRequirement(
  state: RunState,
  requirement: BeatGameItemRequirement,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  return recoverNearbyFurnaceContents(state, observation).pipe(
    Effect.flatMap(({ observation: current, recovered }) => {
      if (recovered) {
        return Effect.void;
      }
      const currentFoodCount = requirementCount(
        current.inventory,
        requirement,
      );
      const missing = Math.max(0, requirement.targetCount - currentFoodCount);
      if (missing === 0) {
        return Effect.void;
      }
      return tryForageNearbyFood(state, current).pipe(
        Effect.flatMap((foraged) =>
          foraged
            ? Effect.void
            : tryFishForFood(state, current).pipe(
              Effect.flatMap((fished) =>
                fished
                  ? Effect.void
                  : huntForFoodRequirement(
                    state,
                    current,
                    bufferedCollectionCount("food", missing),
                  )
              ),
            )
        ),
      );
    }),
  );
}

const FORAGEABLE_FOOD_BLOCK_IDS = [
  "minecraft:beetroots",
  "minecraft:carrots",
  "minecraft:cave_vines",
  "minecraft:cave_vines_plant",
  "minecraft:melon",
  "minecraft:potatoes",
  "minecraft:sweet_berry_bush",
] as const;

function tryForageNearbyFood(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<boolean, BeatGameDriverError> {
  const foodCount = (current: BeatGameObservation): number =>
    EDIBLE_FOOD_ITEM_IDS.reduce(
      (total, itemId) => total + (current.inventory.counts[itemId] ?? 0),
      0,
    );
  const before = foodCount(observation);
  return state.driver.queryBlocks({
    center: observation.player.position,
    radius: state.strategy.blockSearchRadius,
    selector: {
      blockIds: FORAGEABLE_FOOD_BLOCK_IDS,
      requireLineOfSight: true,
    },
    maximumResults: 64,
  }).pipe(
    Effect.map((blocks) =>
      blocks.filter(isReadyForageBlock).sort((left, right) =>
        distanceSquared(left.position, observation.player.position)
          - distanceSquared(right.position, observation.player.position)
      )[0]
    ),
    Effect.flatMap((block) => {
      if (block === undefined) {
        return Effect.succeed(false);
      }
      const path = {
        ...survivalPathPolicy(
          state.strategy.path,
          observation.player.health,
          state.strategy.minimumHealth,
        ),
        allowPlacing: false,
        avoidFluids: true,
      };
      const harvest = block.blockId === "minecraft:sweet_berry_bush"
          || block.blockId === "minecraft:cave_vines"
          || block.blockId === "minecraft:cave_vines_plant"
        ? state.driver.act({
          type: "interact-block",
          position: block.position,
          face: "up",
        })
        : state.driver.act({
          type: "dig-block",
          position: block.position,
        });
      return state.driver.pathfind(block.position, 3, path).pipe(
        Effect.zipRight(harvest),
        Effect.zipRight(collectNearbyDrops(state.driver, {
          itemIds: EDIBLE_FOOD_ITEM_IDS,
          radius: 8,
          maximumDrops: 16,
          settleDelayMs: 250,
          path,
        })),
        Effect.zipRight(state.driver.observe),
        Effect.map((current) => foodCount(current) > before),
      );
    }),
  );
}

function isReadyForageBlock(block: BeatGameBlockObservation): boolean {
  switch (block.blockId) {
    case "minecraft:beetroots":
      return block.properties.age === "3";
    case "minecraft:carrots":
    case "minecraft:potatoes":
      return block.properties.age === "7";
    case "minecraft:cave_vines":
    case "minecraft:cave_vines_plant":
      return block.properties.berries === "true";
    case "minecraft:melon":
      return block.diggable;
    case "minecraft:sweet_berry_bush":
      return Number(block.properties.age) >= 2;
    default:
      return false;
  }
}

function satisfyFoodRequirement(
  state: RunState,
  requirement: BeatGameItemRequirement,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  const rawFood = Object.entries(RAW_FOOD_TO_COOKED)
    .map(([rawItemId, cookedItemId]) => ({
      rawItemId,
      cookedItemId,
      count: observation.inventory.counts[rawItemId] ?? 0,
    }))
    .filter(({ count }) => count > 0);
  const rawFoodCount = rawFood.reduce(
    (total, { count }) => total + count,
    0,
  );
  const rawFoodStillNeeded = Math.max(
    0,
    requirement.targetCount - requirement.currentCount - rawFoodCount,
  );
  if (
    rawFoodStillNeeded > 0
    && observation.player.food > state.strategy.eatBelowFood
    && (
      observation.player.health >= state.strategy.minimumHealth
      || rawFoodCount === 0
    )
  ) {
    return recoverNearbyFurnaceContents(state, observation).pipe(
      Effect.flatMap(({ observation: current, recovered }) => {
        if (recovered) {
          return Effect.void;
        }
        const currentCookedFoodCount = requirement.itemIds.reduce(
          (total, itemId) =>
            total + (current.inventory.counts[itemId] ?? 0),
          0,
        );
        const currentRawFoodCount = Object.keys(RAW_FOOD_TO_COOKED).reduce(
          (total, itemId) =>
            total + (current.inventory.counts[itemId] ?? 0),
          0,
        );
        const remainingRawFood = Math.max(
          0,
          requirement.targetCount
            - currentCookedFoodCount
            - currentRawFoodCount,
        );
        if (remainingRawFood === 0) {
          return Effect.void;
        }
        return tryFishForFood(state, current).pipe(
          Effect.flatMap((fished) =>
            fished
              ? Effect.void
              : huntForFoodRequirement(
                state,
                current,
                current.player.health >= state.strategy.minimumHealth
                  ? bufferedCollectionCount("food", remainingRawFood)
                  : 1,
              )
          ),
        );
      }),
    );
  }
  if (rawFoodCount === 0) {
    return recoverNearbyFurnaceContents(state, observation).pipe(
      Effect.flatMap(({ observation: current, recovered }) =>
        recovered
          ? Effect.void
          : huntForFoodRequirement(state, current, 1)
      ),
    );
  }
  const batch = rawFood[0];
  if (batch === undefined) {
    return Effect.void;
  }
  if (observation.player.health < state.strategy.minimumHealth) {
    return state.driver.queryBlocks({
      center: observation.player.position,
      radius: WORKSTATION_REUSE_RADIUS,
      selector: { blockIds: ["minecraft:furnace"] },
      maximumResults: 1,
    }).pipe(
      Effect.flatMap((furnaces) =>
        furnaces.length > 0
          || (observation.inventory.counts["minecraft:furnace"] ?? 0) > 0
          ? cookRawFoodBatch(state, observation, batch)
          : eatWhenNeeded(state.driver, {
            foodItemIds: [batch.rawItemId],
            foodLevel: Math.max(18, state.strategy.eatBelowFood),
            maximumMeals: batch.count,
            completeWhenNoFood: true,
            path: state.strategy.path,
          }).pipe(Effect.zipRight(retreatAndRecover(state)))
      ),
    );
  }
  return cookRawFoodBatch(state, observation, batch);
}

function huntForFoodRequirement(
  state: RunState,
  observation: BeatGameObservation,
  maximumTargets: number,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  return huntOrExplore(
    state,
    observation,
    {
      entityTypes: foodHuntEntityTypes(
        observation.player.food,
        observation.player.health >= state.strategy.minimumHealth,
      ),
      alive: true,
    },
    maximumTargets,
    "find-food-animals",
    {
      preferredEntityTypes: HIGH_YIELD_FOOD_ANIMAL_TYPES,
      preferredRadius: HIGH_YIELD_FOOD_PREFERENCE_RADIUS,
      allowCriticalAquaticTargets: true,
      maximumSafeAquaticFoodLevel: Math.max(
        state.strategy.eatBelowFood,
        WOUNDED_AQUATIC_FALLBACK_FOOD_LEVEL,
      ),
      requireHealthRecoveryForSafeAquaticTargets: true,
      safeAquaticFallbackAfterExplorationLegs:
        SAFE_AQUATIC_FALLBACK_EXPLORATION_LEGS,
      allowFluidFallback:
        observation.player.health >= state.strategy.minimumHealth,
      path: {
        ...state.strategy.path,
        avoidFluids: true,
      },
    },
  );
}

function tryFishForFood(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.gen(function* () {
    let current = observation;
    yield* ensureInventorySpace(
      state,
      current,
      RESOURCE_COLLECTION_RESERVED_SLOTS,
    );
    current = yield* state.driver.observe;
    if (
      (current.inventory.counts["minecraft:fishing_rod"] ?? 0) === 0
      && (
        (current.inventory.counts["minecraft:string"] ?? 0) < 2
        || (current.inventory.counts["minecraft:stick"] ?? 0) < 3
      )
    ) {
      return false;
    }
    const caughtFoodCount = (value: BeatGameObservation): number =>
      (value.inventory.counts["minecraft:cod"] ?? 0)
      + (value.inventory.counts["minecraft:salmon"] ?? 0);
    const caughtFoodBeforeCollection = caughtFoodCount(current);
    yield* collectNearbyDrops(state.driver, {
      itemIds: ["minecraft:cod", "minecraft:salmon"],
      radius: 8,
      maximumDrops: 16,
      settleDelayMs: 250,
      path: state.strategy.path,
    });
    current = yield* state.driver.observe;
    if (caughtFoodCount(current) > caughtFoodBeforeCollection) {
      return true;
    }
    let water = yield* queryFishingWater(state, current.player.position);
    if (water.length === 0) {
      return false;
    }
    if ((current.inventory.counts["minecraft:fishing_rod"] ?? 0) === 0) {
      const preparation = yield* Effect.gen(function* () {
        const workstation = yield* ensureWorkstation(
          state,
          current,
          "minecraft:crafting_table",
        );
        yield* craftItem(state.driver, {
          resultItemId: "minecraft:fishing_rod",
          count: 1,
          station: workstation.position,
          path: state.strategy.path,
        });
      }).pipe(Effect.either);
      if (preparation._tag === "Left") {
        if (preparation.left.code === "resource-exhausted") {
          return false;
        }
        return yield* Effect.fail(preparation.left);
      }
      current = yield* state.driver.observe;
      if ((current.inventory.counts["minecraft:fishing_rod"] ?? 0) === 0) {
        return false;
      }
      water = yield* queryFishingWater(state, current.player.position);
      if (water.length === 0) {
        return false;
      }
    }
    const highestWaterByColumn = new Map<string, BeatGameBlockObservation>();
    for (const candidate of water) {
      const key =
        `${candidate.position.dimension}:${candidate.position.x}:${candidate.position.z}`;
      const previous = highestWaterByColumn.get(key);
      if (
        previous === undefined
        || candidate.position.y > previous.position.y
      ) {
        highestWaterByColumn.set(key, candidate);
      }
    }
    const candidates = [...highestWaterByColumn.values()]
      .filter(({ position }) =>
        position.dimension === current.player.position.dimension
        && position.y >= current.player.position.y - 4
        && position.y <= current.player.position.y + 4
      )
      .sort((left, right) =>
        distanceSquared(left.position, current.player.position)
        - distanceSquared(right.position, current.player.position)
      )
      .slice(0, 8);
    for (const candidate of candidates) {
      const above = {
        ...candidate.position,
        y: candidate.position.y + 1,
      };
      const exposed = (yield* state.driver.queryBlocks({
        center: blockCenter(above),
        radius: 0.25,
        selector: { replaceable: true },
        maximumResults: 1,
      })).some((block) =>
        sameBlockPosition(block.position, above)
        && !PLAYER_FLUID_BLOCK_IDS.includes(
          block.blockId as typeof PLAYER_FLUID_BLOCK_IDS[number],
        )
      );
      if (!exposed) {
        continue;
      }
      const waterTarget = blockCenter(candidate.position);
      const surfaceColumns = yield* state.driver.sampleSurface(
        waterTarget,
        FISHING_SHORE_SEARCH_RADIUS,
        1,
      );
      const castingPositions = stableSurfaceColumns(surfaceColumns)
        .flatMap((surface) => {
          const position = {
            x: surface.x + 0.5,
            y: surface.surfaceY + 1,
            z: surface.z + 0.5,
            dimension: candidate.position.dimension,
          };
          const horizontalDistance = Math.hypot(
            position.x - waterTarget.x,
            position.z - waterTarget.z,
          );
          const withinCastingRange = horizontalDistance
              >= FISHING_MINIMUM_CAST_HORIZONTAL_DISTANCE
            && distanceSquared(position, waterTarget)
              <= LIQUID_INTERACTION_REACH ** 2;
          return withinCastingRange
            ? [{ position, horizontalDistance }]
            : [];
        })
        .sort((left, right) =>
          Math.abs(
            left.horizontalDistance
              - FISHING_PREFERRED_CAST_HORIZONTAL_DISTANCE,
          )
            - Math.abs(
              right.horizontalDistance
                - FISHING_PREFERRED_CAST_HORIZONTAL_DISTANCE,
            )
            || distanceSquared(left.position, current.player.position)
              - distanceSquared(right.position, current.player.position)
        )
        .map(({ position }) => position);
      for (const castingPosition of castingPositions) {
        const approached = yield* state.driver.pathfind(
          castingPosition,
          DRY_SURFACE_APPROACH_RADIUS,
          {
            ...state.strategy.path,
            allowMining: false,
            avoidFluids: true,
          },
        ).pipe(
          Effect.as(true),
          Effect.catchTag("BeatGameDriverError", () => Effect.succeed(false)),
        );
        if (!approached) {
          continue;
        }
        current = yield* state.driver.observe;
        if (yield* isPlayerInFluid(state.driver, current.player.position)) {
          yield* emergencyAirAscent(
            state,
            current.player.position,
            {
              attemptsRemaining: AIR_ESCAPE_MAXIMUM_RECOVERY_ATTEMPTS,
            },
          );
          continue;
        }
        const eyePosition = {
          ...current.player.position,
          y: current.player.position.y + 1.62,
        };
        const target = {
          x: candidate.position.x + 0.5,
          y: candidate.position.y + 0.75,
          z: candidate.position.z + 0.5,
        };
        const targetRotation = rotationToward(eyePosition, target);
        const rotation = {
          ...targetRotation,
          pitch: Math.min(
            targetRotation.pitch,
            FISHING_MAXIMUM_DOWNWARD_CAST_PITCH,
          ),
        };
        yield* state.driver.act({
          type: "look",
          yaw: rotation.yaw,
          pitch: rotation.pitch,
        });
        yield* waitForViewRotation(
          state.driver,
          rotation.yaw,
          rotation.pitch,
          40,
        );
        yield* fish(state.driver, {
          maximumCatches: FISHING_COLLECTION_BATCH_SIZE,
          maximumFailedCasts: FISHING_MAXIMUM_FAILED_CASTS,
          path: state.strategy.path,
        });
        yield* Effect.yieldNow();
        yield* collectNearbyDrops(state.driver, {
          itemIds: ["minecraft:cod", "minecraft:salmon"],
          radius: 8,
          maximumDrops: 16,
          settleDelayMs: 500,
          path: state.strategy.path,
        });
        current = yield* state.driver.observe;
        if (caughtFoodCount(current) > caughtFoodBeforeCollection) {
          return true;
        }
      }
    }
    return false;
  });
}

function queryFishingWater(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<
  readonly BeatGameBlockObservation[],
  BeatGameDriverError
> {
  return state.driver.queryBlocks({
    center: position,
    radius: state.strategy.blockSearchRadius,
    selector: {
      blockIds: ["minecraft:water"],
      properties: { level: "0" },
    },
    maximumResults: 256,
  });
}

function foodHuntEntityTypes(
  foodLevel: number,
  allowHostileEmergencyFood: boolean,
): readonly string[] {
  return foodLevel <= 6 && allowHostileEmergencyFood
    ? [...FOOD_ANIMAL_ENTITY_TYPES, ...EMERGENCY_FOOD_ENTITY_TYPES]
    : FOOD_ANIMAL_ENTITY_TYPES;
}

function recoverNearbyFurnaceContents(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<{
  readonly observation: BeatGameObservation;
  readonly recovered: boolean;
}, BeatGameDriverError> {
  return state.driver.queryBlocks({
    center: observation.player.position,
    radius: Math.min(
      FURNACE_RECOVERY_RADIUS,
      state.strategy.blockSearchRadius,
    ),
    selector: { blockIds: ["minecraft:furnace"] },
    maximumResults: 16,
  }).pipe(
    Effect.flatMap((furnaces) =>
      Ref.get(state.checkedRecoveryContainers).pipe(
        Effect.map((checked) =>
          [...furnaces]
            .filter((furnace) =>
              furnace.position.dimension
                === observation.player.position.dimension
              && distanceSquared(
                  furnace.position,
                  observation.player.position,
                ) <= FURNACE_RECOVERY_RADIUS ** 2
              && !checked.has(positionKey(furnace.position))
            )
            .sort((left, right) =>
              distanceSquared(
                left.position,
                observation.player.position,
              )
              - distanceSquared(
                right.position,
                observation.player.position,
              )
            )[0]
        ),
      )
    ),
    Effect.flatMap((furnace) => {
      if (furnace === undefined) {
        return Effect.succeed({ observation, recovered: false });
      }
      const initialItemCount = inventoryItemCount(observation);
      return Ref.update(
        state.checkedRecoveryContainers,
        (checked) => new Set([...checked, positionKey(furnace.position)]),
      ).pipe(
        Effect.zipRight(
          transferContainerItems(state.driver, {
            direction: "withdraw",
            container: furnace.position,
            operations: [{
              selector: {},
              count: 192,
              allowPartial: true,
            }],
            path: state.strategy.path,
          }),
        ),
        Effect.zipRight(state.driver.observe),
        Effect.map((current) => ({
          observation: current,
          recovered: inventoryItemCount(current) > initialItemCount,
        })),
        Effect.catchTag("BeatGameDriverError", () =>
          Effect.succeed({ observation, recovered: false })
        ),
      );
    }),
  );
}

function inventoryItemCount(observation: BeatGameObservation): number {
  return Object.values(observation.inventory.counts).reduce(
    (total, count) => total + count,
    0,
  );
}

function drainFurnaceContents(
  state: RunState,
  station: BeatGameBlockPosition,
): Effect.Effect<BeatGameObservation, BeatGameDriverError> {
  return transferContainerItems(state.driver, {
    direction: "withdraw",
    container: station,
    operations: [{
      selector: {},
      count: 192,
      allowPartial: true,
    }],
    path: state.strategy.path,
  }).pipe(
    Effect.zipRight(state.driver.observe),
  );
}

function cookRawFoodBatch(
  state: RunState,
  observation: BeatGameObservation,
  batch: {
    readonly rawItemId: string;
    readonly cookedItemId: string;
    readonly count: number;
  },
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  return ensureFurnaceForCooking(
    state,
    observation,
  ).pipe(
    Effect.flatMap((workstation) =>
      Ref.make(workstation).pipe(
        Effect.flatMap((activeWorkstation) =>
          drainFurnaceContents(state, workstation.position).pipe(
            Effect.flatMap((current) => {
              const currentRawFoodCount =
                current.inventory.counts[batch.rawItemId] ?? 0;
              const currentBatchCount = Math.min(
                currentRawFoodCount,
                batch.count,
              );
              if (currentBatchCount === 0) {
                return Effect.void;
              }
              return preferDirectWoodFurnaceFuel(
                state,
                current,
                currentBatchCount,
              ).pipe(
                Effect.flatMap((directWoodFuel) =>
                  directWoodFuel !== undefined
                    ? smelt(state.driver, {
                      input: { itemIds: [batch.rawItemId] },
                      count: currentBatchCount,
                      fuel: { itemIds: directWoodFuel },
                      station: workstation.position,
                      path: state.strategy.path,
                    })
                    : ensureEfficientFurnaceFuel(
                      state,
                      current,
                      workstation,
                      currentBatchCount,
                    ).pipe(
                      Effect.tap((currentWorkstation) =>
                        Ref.set(activeWorkstation, currentWorkstation)
                      ),
                      Effect.flatMap((currentWorkstation) =>
                        smelt(state.driver, {
                          input: { itemIds: [batch.rawItemId] },
                          count: currentBatchCount,
                          fuel: {
                            itemIds: ["minecraft:coal", "minecraft:charcoal"],
                          },
                          station: currentWorkstation.position,
                          path: state.strategy.path,
                        })
                      ),
                    )
                ),
              );
            }),
            Effect.ensuring(
              Ref.get(activeWorkstation).pipe(
                Effect.flatMap((currentWorkstation) =>
                  reclaimPlacedFurnace(state, currentWorkstation)
                ),
                Effect.ignore,
              ),
            ),
          )
        ),
      )
    ),
  );
}

function directWoodFurnaceFuelItemIds(
  observation: BeatGameObservation,
  outputCount: number,
): readonly string[] | undefined {
  if (furnaceFuelCount(observation) > 0) {
    return undefined;
  }
  const requiredWoodFuel = Math.ceil(outputCount / 1.5);
  if (requiredWoodFuel > 2) {
    return undefined;
  }
  const countItems = (itemIds: readonly string[]): number =>
    itemIds.reduce(
      (count, itemId) =>
        count + (observation.inventory.counts[itemId] ?? 0),
      0,
    );
  if (countItems(PLANK_ITEM_IDS) >= requiredWoodFuel) {
    return PLANK_ITEM_IDS;
  }
  return countItems(LOG_ITEM_IDS) >= requiredWoodFuel
    ? LOG_ITEM_IDS
    : undefined;
}

function preferDirectWoodFurnaceFuel(
  state: RunState,
  observation: BeatGameObservation,
  outputCount: number,
): Effect.Effect<readonly string[] | undefined, BeatGameDriverError> {
  const directWoodFuel = directWoodFurnaceFuelItemIds(
    observation,
    outputCount,
  );
  return directWoodFuel === undefined
    ? Effect.succeed(undefined)
    : queryNearbyCoal(state, observation, 1).pipe(
      Effect.map((coal) => coal.length === 0 ? directWoodFuel : undefined),
    );
}

function queryNearbyCoal(
  state: RunState,
  observation: BeatGameObservation,
  maximumResults: number,
): Effect.Effect<readonly BeatGameBlockObservation[], BeatGameDriverError> {
  return state.driver.queryBlocks({
    center: observation.player.position,
    radius: Math.min(
      FURNACE_FUEL_SEARCH_RADIUS,
      state.strategy.blockSearchRadius,
    ),
    selector: {
      blockIds: COAL_ORE_BLOCK_IDS,
      diggable: true,
    },
    maximumResults,
  });
}

function ensureFurnaceForCooking(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<
  PreparedWorkstation,
  BeatGameError | BeatGameDriverError
> {
  return state.driver.queryBlocks({
    center: observation.player.position,
    radius: WORKSTATION_REUSE_RADIUS,
    selector: { blockIds: ["minecraft:furnace"] },
    maximumResults: 1,
  }).pipe(
    Effect.flatMap((furnaces) => {
      const cobblestoneCount =
        observation.inventory.counts["minecraft:cobblestone"] ?? 0;
      if (
        furnaces.length > 0
        || (observation.inventory.counts["minecraft:furnace"] ?? 0) > 0
        || cobblestoneCount >= 8
      ) {
        return ensureWorkstation(state, observation, "minecraft:furnace");
      }
      const missingCobblestone = 8 - cobblestoneCount;
      return collectBlocksOrExplore(state, observation, {
        blockIds: ["minecraft:stone"],
        count: bufferedCollectionCount(
          "cobblestone",
          missingCobblestone,
        ),
        progressItemIds: ["minecraft:cobblestone"],
        purpose: "prepare-food-furnace",
        avoidSubmergedTargets: true,
        avoidFluids: true,
        prepareAttempt: (current) =>
          ensureMiningPickaxe(
            state,
            current,
            "minecraft:wooden_pickaxe",
            MINING_PICKAXE_ITEM_IDS,
          ),
      }).pipe(
        Effect.zipRight(state.driver.observe),
        Effect.flatMap((current) =>
          ensureWorkstation(state, current, "minecraft:furnace")
        ),
      );
    }),
  );
}

function reclaimPlacedFurnace(
  state: RunState,
  workstation: PreparedWorkstation,
): Effect.Effect<void, BeatGameDriverError> {
  if (!workstation.placed) {
    return Effect.void;
  }
  return state.driver.observe.pipe(
    Effect.flatMap((observation) =>
      ensureMiningPickaxe(
        state,
        observation,
        "minecraft:wooden_pickaxe",
        MINING_PICKAXE_ITEM_IDS,
      )
    ),
    Effect.zipRight(state.driver.act({
      type: "select-item",
      selector: { itemIds: MINING_PICKAXE_ITEM_IDS },
    })),
    Effect.zipRight(state.driver.act({
      type: "dig-block",
      position: workstation.position,
    })),
    Effect.zipRight(collectNearbyDrops(state.driver, {
      itemIds: ["minecraft:furnace"],
      radius: 4,
      maximumDrops: 4,
      settleDelayMs: 500,
      path: state.strategy.path,
    })),
    // Reclaiming a temporary workstation is cleanup. A lost container drop or
    // control lease must not suspend the main planner indefinitely. This can
    // run as an ensuring finalizer, so restore interruptibility before racing
    // the cleanup against its deadline.
    Effect.interruptible,
    Effect.timeout(FURNACE_RECLAIM_TIMEOUT),
    Effect.catchTag("TimeoutException", () => Effect.void),
  );
}

function ensureEfficientFurnaceFuel(
  state: RunState,
  observation: BeatGameObservation,
  workstation: PreparedWorkstation,
  outputCount: number,
): Effect.Effect<PreparedWorkstation, BeatGameDriverError> {
  return Effect.gen(function* () {
    const requiredFuel = Math.ceil(outputCount / 8);
    let currentObservation = observation;
    let activeWorkstation = workstation;
    let missingFuel = Math.max(
      0,
      requiredFuel - furnaceFuelCount(currentObservation),
    );
    if (missingFuel === 0) {
      return activeWorkstation;
    }

    currentObservation = yield* state.driver.observe;
    missingFuel = Math.max(
      0,
      requiredFuel - furnaceFuelCount(currentObservation),
    );
    if (missingFuel === 0) {
      return activeWorkstation;
    }

    const nearbyCoal = yield* queryNearbyCoal(
      state,
      currentObservation,
      bufferedCollectionCount("fuel", missingFuel),
    );
    if (nearbyCoal.length > 0) {
      yield* collectBlocks(state.driver, {
        blockIds: COAL_ORE_BLOCK_IDS,
        count: bufferedCollectionCount("fuel", missingFuel),
        searchRadius: FURNACE_FUEL_SEARCH_RADIUS,
        path: state.strategy.path,
      });
      yield* collectNearbyDrops(state.driver, {
        itemIds: FURNACE_FUEL_ITEM_IDS,
        radius: 8,
        maximumDrops: 16,
        path: state.strategy.path,
      });
      currentObservation = yield* state.driver.observe;
      activeWorkstation = yield* ensureAccessibleFurnaceForBatch(
        state,
        currentObservation,
        activeWorkstation,
      );
      missingFuel = Math.max(
        0,
        requiredFuel - furnaceFuelCount(currentObservation),
      );
      if (missingFuel === 0) {
        return activeWorkstation;
      }
    }

    const charcoalCount = bufferedCollectionCount("fuel", missingFuel);
    const starterFuelItems = Math.ceil(charcoalCount / 1.5);
    const countItems = (
      current: BeatGameObservation,
      itemIds: readonly string[],
    ): number =>
      itemIds.reduce(
        (count, itemId) =>
          count + (current.inventory.counts[itemId] ?? 0),
        0,
      );
    const hasEnoughCharcoalMaterials = (
      current: BeatGameObservation,
    ): boolean => {
      const plankCount = countItems(current, PLANK_ITEM_IDS);
      const logCount = countItems(current, LOG_ITEM_IDS);
      return plankCount >= starterFuelItems
        ? logCount >= charcoalCount
        : logCount >= charcoalCount + starterFuelItems;
    };
    if (!hasEnoughCharcoalMaterials(currentObservation)) {
      const plankCount = countItems(currentObservation, PLANK_ITEM_IDS);
      const logCount = countItems(currentObservation, LOG_ITEM_IDS);
      const requiredLogs = charcoalCount
        + (plankCount >= starterFuelItems ? 0 : starterFuelItems);
      yield* collectBlocksOrExplore(state, currentObservation, {
        blockIds: LOG_ITEM_IDS,
        count: bufferedCollectionCount(
          "logs",
          Math.max(1, requiredLogs - logCount),
        ),
        progressItemIds: LOG_ITEM_IDS,
        purpose: "find-furnace-fuel",
        avoidSubmergedTargets: true,
        requireLineOfSight: true,
        requireSurfaceTargets: true,
      });
      currentObservation = yield* state.driver.observe;
      activeWorkstation = yield* ensureAccessibleFurnaceForBatch(
        state,
        currentObservation,
        activeWorkstation,
      );
    }
    if (!hasEnoughCharcoalMaterials(currentObservation)) {
      return yield* Effect.fail(new BeatGameDriverError({
        operation: "task.smelt",
        code: "resource-exhausted",
        retryable: true,
        message:
          "Not enough distinct logs and starter fuel are available to make charcoal",
      }));
    }

    const charcoalFuelItemIds =
      countItems(currentObservation, PLANK_ITEM_IDS) >= starterFuelItems
        ? PLANK_ITEM_IDS
        : LOG_ITEM_IDS;
    yield* smelt(state.driver, {
      input: { itemIds: LOG_ITEM_IDS },
      count: charcoalCount,
      fuel: { itemIds: charcoalFuelItemIds },
      station: activeWorkstation.position,
      path: state.strategy.path,
    });
    return activeWorkstation;
  });
}

function ensureAccessibleFurnaceForBatch(
  state: RunState,
  observation: BeatGameObservation,
  previous: PreparedWorkstation,
): Effect.Effect<PreparedWorkstation, BeatGameDriverError> {
  return ensureWorkstation(
    state,
    observation,
    "minecraft:furnace",
  ).pipe(
    Effect.map((current) =>
      sameBlockPosition(current.position, previous.position)
        ? previous
        : current
    ),
  );
}

function furnaceFuelCount(observation: BeatGameObservation): number {
  return FURNACE_FUEL_ITEM_IDS.reduce(
    (count, itemId) =>
      count + (observation.inventory.counts[itemId] ?? 0),
    0,
  );
}

function bufferedCollectionCount(
  resource: BufferedResource,
  missing: number,
): number {
  return Math.max(1, missing) + RESOURCE_COLLECTION_BUFFERS[resource];
}

function ensureMiningPickaxe(
  state: RunState,
  observation: BeatGameObservation,
  resultItemId:
    | "minecraft:wooden_pickaxe"
    | "minecraft:stone_pickaxe"
    | "minecraft:iron_pickaxe",
  usableItemIds: readonly string[],
  minimumRemainingDurability = 1,
): Effect.Effect<void, BeatGameDriverError> {
  const availableItemIds = usableItemIds.filter((itemId) =>
    (observation.inventory.counts[itemId] ?? 0) > 0
  );
  const reportedDurability = observation.inventory.remainingDurability;
  const hasDurabilityReserve = reportedDurability === undefined
    || availableItemIds.reduce(
        (total, itemId) => total + (reportedDurability[itemId] ?? 0),
        0,
      ) >= minimumRemainingDurability;
  return availableItemIds.length > 0 && hasDurabilityReserve
    ? Effect.void
    : craftWithTable(state, observation, resultItemId, 1);
}

function collectBlocksOrExplore(
  state: RunState,
  observation: BeatGameObservation,
  options: {
    readonly blockIds: readonly string[];
    readonly tags?: readonly string[];
    readonly count: number;
    readonly progressItemIds: readonly string[];
    readonly purpose: string;
    readonly avoidSubmergedTargets?: boolean;
    readonly requireLineOfSight?: boolean;
    readonly requireSurfaceTargets?: boolean;
    readonly preferSurfaceExploration?: boolean;
    readonly avoidFluids?: boolean;
    readonly path?: BeatGameStrategy["path"];
    readonly explorationTarget?: BeatGamePosition;
    readonly prepareAttempt?: (
      observation: BeatGameObservation,
    ) => Effect.Effect<void, BeatGameDriverError>;
  },
): Effect.Effect<void, BeatGameDriverError> {
  const countItems = (current: BeatGameObservation): number =>
    options.progressItemIds.reduce(
      (total, itemId) => total + (current.inventory.counts[itemId] ?? 0),
      0,
    );
  return Effect.gen(function* () {
    let current = observation;
    const targetCount = countItems(observation) + options.count;
    const requestedPath = options.path ?? state.strategy.path;
    const baseCollectionPath = options.avoidFluids === true
        || options.avoidSubmergedTargets === true
      ? { ...requestedPath, avoidFluids: true }
      : requestedPath;
    const collectionPathFor = (
      position: BeatGamePosition,
    ): Effect.Effect<BeatGameStrategy["path"], BeatGameDriverError> =>
      baseCollectionPath.avoidFluids !== true
        ? Effect.succeed(baseCollectionPath)
        : isPlayerInFluid(state.driver, position).pipe(
          Effect.map((inFluid) =>
            inFluid
              ? { ...baseCollectionPath, avoidFluids: false }
              : baseCollectionPath
          ),
        );
    const explorationPath = {
      ...(options.avoidFluids === true ? baseCollectionPath : requestedPath),
      allowMining: false,
    };
    const preferSurfaceExploration =
      options.preferSurfaceExploration ?? true;
    if (
      options.avoidFluids === true
      && (yield* isPlayerInFluid(state.driver, current.player.position))
    ) {
      yield* emergencyAirAscent(state, current.player.position);
      current = yield* state.driver.observe;
    }
    while (countItems(current) < targetCount) {
      yield* ensureInventorySpace(
        state,
        current,
        RESOURCE_COLLECTION_RESERVED_SLOTS,
      );
      current = yield* state.driver.observe;
      if (
        options.requireSurfaceTargets === true
        && current.player.position.dimension === "minecraft:overworld"
        && (yield* needsOverworldSurfaceRecovery(
          state,
          current.player.position,
        ))
      ) {
        yield* escapeToOverworldSurface(
          state,
          current.player.position,
        );
        current = yield* state.driver.observe;
      }
      const fluidAwareCollectionPath = yield* collectionPathFor(
        current.player.position,
      );
      const collectionPath = options.requireSurfaceTargets === true
          && current.player.position.dimension === "minecraft:overworld"
        ? {
          ...fluidAwareCollectionPath,
          minimumY: Math.floor(current.player.position.y)
            - SURFACE_RESOURCE_PATH_MINIMUM_Y_MARGIN,
        }
        : fluidAwareCollectionPath;
      const dropCollectionPath = options.avoidFluids === true
        ? collectionPath
        : { ...collectionPath, avoidFluids: false };
      yield* collectNearbyDrops(state.driver, {
        itemIds: options.progressItemIds,
        radius: 12,
        maximumDrops: 32,
        settleDelayMs: 100,
        maximumVerticalDistance: 3,
        path: dropCollectionPath,
      });
      current = yield* state.driver.observe;
      if (countItems(current) >= targetCount) {
        break;
      }
      if (options.prepareAttempt !== undefined) {
        yield* options.prepareAttempt(current);
        current = yield* state.driver.observe;
      }
      const beforeAttempt = countItems(current);
      const collectAttempt = collectBlocks(state.driver, {
        blockIds: options.blockIds,
        ...(options.tags === undefined ? {} : { tags: options.tags }),
        count: targetCount - beforeAttempt,
        searchRadius: state.strategy.blockSearchRadius,
        avoidSubmergedTargets: options.avoidSubmergedTargets ?? false,
        requireLineOfSight: options.requireLineOfSight ?? false,
        ...(options.requireSurfaceTargets === true
            && current.player.position.dimension === "minecraft:overworld"
          ? {
            targetYRange: {
              minimum: Math.floor(current.player.position.y)
                - SURFACE_RESOURCE_MINIMUM_Y_MARGIN,
            },
          }
          : {}),
        path: collectionPath,
      });
      const waitForInventoryTarget = Effect.gen(function* () {
        while (true) {
          const observed = yield* state.driver.observe;
          if (countItems(observed) >= targetCount) {
            return;
          }
          yield* Effect.sleep(
            Math.max(50, state.strategy.observationPollMs),
          );
        }
      });
      yield* Effect.raceFirst(collectAttempt, waitForInventoryTarget);
      yield* collectNearbyDrops(state.driver, {
        itemIds: options.progressItemIds,
        radius: 12,
        maximumDrops: 32,
        settleDelayMs: 500,
        maximumVerticalDistance: 3,
        path: dropCollectionPath,
      });
      current = yield* state.driver.observe;
      for (
        let attempt = 0;
        attempt < 5 && countItems(current) <= beforeAttempt;
        attempt += 1
      ) {
        yield* Effect.sleep(Math.max(50, state.strategy.observationPollMs));
        current = yield* state.driver.observe;
      }
      if (countItems(current) <= beforeAttempt) {
        if (
          preferSurfaceExploration
          && (yield* needsOverworldSurfaceRecovery(
            state,
            current.player.position,
          ))
        ) {
          yield* escapeToOverworldSurface(
            state,
            current.player.position,
          );
          return;
        }
        if (
          preferSurfaceExploration
          && (yield* climbToHigherOverworldGround(
            state,
            current.player.position,
          ))
        ) {
          return;
        }
        const frontierPath = preferSurfaceExploration
          ? explorationPath
          : baseCollectionPath;
        if (
          frontierPath.allowMining !== false
          && options.prepareAttempt !== undefined
        ) {
          yield* options.prepareAttempt(current);
          current = yield* state.driver.observe;
        }
        const directedTarget =
          options.explorationTarget?.dimension
              === current.player.position.dimension
            && horizontalDistanceSquared(
                options.explorationTarget,
                current.player.position,
              ) > DIRECTED_HUNT_DESTINATION_REACHED_RADIUS ** 2
          ? options.explorationTarget
          : undefined;
        yield* (directedTarget === undefined
          ? advanceExplorationFrontier(
            state,
            current.player.position,
            options.purpose,
            state.strategy.blockSearchRadius,
            frontierPath,
            preferSurfaceExploration,
          )
          : pathfindExplorationTarget(
            state,
            current.player.position,
            directedTarget,
            2,
            frontierPath,
            preferSurfaceExploration,
            false,
          )).pipe(
            Effect.catchTag("BeatGameDriverError", (error) =>
              error.operation === "pathfind"
                  || error.operation === "pathfindXZ"
                ? Effect.void
                : Effect.fail(error)
            ),
          );
        return;
      }
    }
  });
}

function fillLiquidBucket(
  state: RunState,
  observation: BeatGameObservation,
  liquid: "water" | "lava",
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    let current = observation;
    if (
      liquid === "lava"
      && (yield* isPlayerInLava(state.driver, current.player.position))
    ) {
      yield* emergencyAirAscent(state, current.player.position);
      return;
    }
    if ((observation.inventory.counts["minecraft:bucket"] ?? 0) === 0) {
      const ironIngots =
        observation.inventory.counts["minecraft:iron_ingot"] ?? 0;
      if (ironIngots < 3) {
        yield* satisfyIronRequirement(
          state,
          observation,
          3 - ironIngots,
        );
        return;
      }
      yield* craftWithTable(
        state,
        observation,
        "minecraft:bucket",
        1,
      );
      current = yield* state.driver.observe;
    }
    let liquidSources = yield* state.driver.queryBlocks({
      center: current.player.position,
      radius: state.strategy.blockSearchRadius,
      selector: {
        blockIds: [`minecraft:${liquid}`],
        properties: { level: "0" },
      },
      maximumResults: liquid === "lava" ? 32 : 1,
    });
    const waterloggedSources = liquid === "water"
      ? yield* state.driver.queryBlocks({
        center: current.player.position,
        radius: state.strategy.blockSearchRadius,
        selector: { properties: { waterlogged: "true" } },
        maximumResults: 8,
      })
      : [];
    let sources: readonly BeatGameBlockObservation[] = [
      ...liquidSources,
      ...waterloggedSources,
    ];
    const useCastPortal = state.strategy.portalStrategy === PortalStrategy.CAST
      || (
        state.strategy.portalStrategy === PortalStrategy.AUTO
        && (current.inventory.counts["minecraft:obsidian"] ?? 0)
          < state.strategy.targetObsidianCount
      );
    if (
      liquid === "lava"
      && useCastPortal
      && sources.length > 0
      && sources.length < PORTAL_CASTING_ADDITIONAL_LAVA_SOURCE_COUNT
      && current.player.position.dimension === "minecraft:overworld"
      && current.player.position.y > DEEP_LAVA_SEARCH_MAX_Y
    ) {
      yield* preparePortalCastingLavaPool(state, current);
      return;
    }
    let source = sources[0];
    if (source === undefined) {
      if (liquid === "lava") {
        const canCraftIronPickaxe =
          (current.inventory.counts["minecraft:iron_ingot"] ?? 0) >= 3;
        yield* ensureMiningPickaxe(
          state,
          current,
          canCraftIronPickaxe
            ? "minecraft:iron_pickaxe"
            : "minecraft:stone_pickaxe",
          canCraftIronPickaxe
            ? DURABLE_MINING_PICKAXE_ITEM_IDS
            : MINING_PICKAXE_ITEM_IDS,
        );
        current = yield* state.driver.observe;
        if (
          current.player.position.dimension === "minecraft:overworld"
          && current.player.position.y > DEEP_LAVA_SEARCH_MAX_Y
        ) {
          while (current.player.position.y > DEEP_LAVA_SEARCH_MAX_Y) {
            const beforeDescent = current.player.position;
            const targetY = Math.max(
              DEEP_LAVA_SEARCH_Y,
              Math.floor(beforeDescent.y) - DEEP_LAVA_DESCENT_STEP,
            );
            yield* excavateResourceSearchStaircase(
              state,
              beforeDescent,
              targetY,
            );
            current = yield* state.driver.observe;
            if (current.player.position.y > beforeDescent.y + 0.5) {
              return;
            }
            if (current.player.position.y >= beforeDescent.y - 0.5) {
              return yield* Effect.fail(new BeatGameDriverError({
                operation: "find-deep-lava",
                code: "unreachable",
                retryable: true,
                message: `The lava descent made no vertical progress from Y${
                  beforeDescent.y.toFixed(1)
                }`,
              }));
            }
            liquidSources = yield* state.driver.queryBlocks({
              center: current.player.position,
              radius: state.strategy.blockSearchRadius,
              selector: {
                blockIds: ["minecraft:lava"],
                properties: { level: "0" },
              },
              maximumResults: 32,
            });
            if (liquidSources.length > 0) {
              sources = liquidSources;
              source = liquidSources[0];
              break;
            }
          }
        }
        if (source === undefined) {
          const canCraftReplacementIronPickaxe =
            (current.inventory.counts["minecraft:iron_ingot"] ?? 0) >= 3;
          yield* ensureMiningPickaxe(
            state,
            current,
            canCraftReplacementIronPickaxe
              ? "minecraft:iron_pickaxe"
              : "minecraft:stone_pickaxe",
            canCraftReplacementIronPickaxe
              ? DURABLE_MINING_PICKAXE_ITEM_IDS
              : MINING_PICKAXE_ITEM_IDS,
          );
          current = yield* state.driver.observe;
          return yield* advanceExplorationFrontier(
            state,
            current.player.position,
            "find-deep-lava",
            state.strategy.blockSearchRadius,
            state.strategy.path,
            false,
          );
        }
      }
      if (source === undefined) {
        return yield* explore(state.driver, {
          origin: current.player.position,
          radius: discoveryHopRadius(
            state,
            state.strategy.blockSearchRadius,
          ),
          maximumWaypoints: 1,
          purpose: explorationPurpose(
            `find-${liquid}`,
            observation.player.position,
          ),
          path: state.strategy.path,
        });
      }
    }
    const approachOrigin = current.player.position;
    const ensureApproachPickaxe = (
      approachObservation: BeatGameObservation,
    ): Effect.Effect<void, BeatGameDriverError> => {
      const canCraftDurablePickaxe =
        liquid === "lava"
        && (approachObservation.inventory.counts["minecraft:iron_ingot"] ?? 0)
          >= 3;
      return ensureMiningPickaxe(
        state,
        approachObservation,
        canCraftDurablePickaxe
          ? "minecraft:iron_pickaxe"
          : "minecraft:stone_pickaxe",
        canCraftDurablePickaxe
          ? DURABLE_MINING_PICKAXE_ITEM_IDS
          : MINING_PICKAXE_ITEM_IDS,
        liquid === "lava" ? RESOURCE_SEARCH_PICKAXE_DURABILITY_RESERVE : 1,
      );
    };
    yield* ensureApproachPickaxe(current);
    current = yield* state.driver.observe;
    if (liquid === "lava") {
      const onlyVisibleSourcesAreDeep = sources.length > 0
        && sources.every(({ position }) =>
          position.dimension === current.player.position.dimension
          && position.y < current.player.position.y - 4
        );
      if (
        onlyVisibleSourcesAreDeep
        && current.player.position.dimension === "minecraft:overworld"
        && current.player.position.y > DEEP_LAVA_SEARCH_MAX_Y
      ) {
        const targetY = Math.max(
          DEEP_LAVA_SEARCH_Y,
          Math.floor(current.player.position.y) - DEEP_LAVA_DESCENT_STEP,
        );
        yield* excavateResourceSearchStaircase(
          state,
          current.player.position,
          targetY,
        );
        return;
      }
      const approach = yield* approachLavaSourceFromSide(
        state,
        current,
        sources,
        { requireExposableSource: true },
      ).pipe(Effect.either);
      if (approach._tag === "Left") {
        const visibleSourceIsBelow = sources.some(({ position }) =>
          position.dimension === current.player.position.dimension
          && position.y < current.player.position.y - 4
        );
        if (
          approach.left.operation === "approach-lava-source"
          && visibleSourceIsBelow
          && current.player.position.dimension === "minecraft:overworld"
          && current.player.position.y > DEEP_LAVA_SEARCH_MAX_Y
        ) {
          const targetY = Math.max(
            DEEP_LAVA_SEARCH_Y,
            Math.floor(current.player.position.y) - DEEP_LAVA_DESCENT_STEP,
          );
          yield* excavateResourceSearchStaircase(
            state,
            current.player.position,
            targetY,
          );
          return;
        }
        return yield* Effect.fail(approach.left);
      }
      source = approach.right;
    } else {
      yield* state.driver.pathfind(
        source.position,
        LIQUID_INTERACTION_APPROACH_RADIUS,
        state.strategy.path,
      );
    }
    current = yield* state.driver.observe;
    yield* ensureApproachPickaxe(current);
    yield* state.driver.withControl(Effect.gen(function* () {
      for (
        let clearedBlocks = 0;
        clearedBlocks <= MAXIMUM_LIQUID_SIGHT_CLEARING_BLOCKS;
        clearedBlocks += 1
      ) {
        const current = yield* state.driver.observe;
        const eyePosition = {
          ...current.player.position,
          y: current.player.position.y + 1.62,
        };
        const sourceCenter = {
          x: source.position.x + 0.5,
          y: source.position.y + 0.5,
          z: source.position.z + 0.5,
        };
        const direction = {
          x: sourceCenter.x - eyePosition.x,
          y: sourceCenter.y - eyePosition.y,
          z: sourceCenter.z - eyePosition.z,
        };
        const sourceDistance = Math.sqrt(
          direction.x * direction.x
            + direction.y * direction.y
            + direction.z * direction.z,
        );
        if (sourceDistance > LIQUID_INTERACTION_REACH) {
          return yield* Effect.fail(new BeatGameDriverError({
            operation: `fill-${liquid}-bucket`,
            retryable: true,
            message: `The ${liquid} source remained ${sourceDistance.toFixed(
              2,
            )} blocks away after pathfinding`,
          }));
        }
        const rotation = rotationToward(eyePosition, sourceCenter);
        yield* state.driver.act({
          type: "look",
          yaw: rotation.yaw,
          pitch: rotation.pitch,
        });
        yield* waitForViewRotation(
          state.driver,
          rotation.yaw,
          rotation.pitch,
          40,
        );
        const obstruction = (yield* state.driver.raycast({
          direction,
          maximumDistance: Math.min(
            LIQUID_INTERACTION_REACH,
            sourceDistance + 0.05,
          ),
          includeFluids: false,
        })).block;
        if (
          obstruction === undefined
          || sameBlockPosition(obstruction.position, source.position)
        ) {
          const liveSources = yield* state.driver.queryBlocks({
            center: {
              x: source.position.x + 0.5,
              y: source.position.y + 0.5,
              z: source.position.z + 0.5,
              dimension: source.position.dimension,
            },
            radius: 0.25,
            selector: liquid === "water"
              ? {}
              : {
                blockIds: ["minecraft:lava"],
                properties: { level: "0" },
              },
            maximumResults: 1,
          });
          if (!liveSources.some((candidate) =>
            sameBlockPosition(candidate.position, source.position)
            && (
              candidate.blockId === `minecraft:${liquid}`
                && candidate.properties.level === "0"
              || liquid === "water"
                && candidate.properties.waterlogged === "true"
            )
          )) {
            return yield* Effect.fail(new BeatGameDriverError({
              operation: `fill-${liquid}-bucket`,
              retryable: true,
              message: `The selected ${liquid} source at ${
                positionKey(source.position)
              } changed while the bot approached it`,
            }));
          }
          yield* state.driver.act({
            type: "select-item",
            selector: { itemIds: ["minecraft:bucket"] },
          });
          yield* state.driver.act({
            type: "use-item",
            hand: "main",
          }).pipe(
            Effect.mapError((cause) =>
              new BeatGameDriverError({
                operation: `fill-${liquid}-bucket`,
                ...(cause.code === undefined ? {} : { code: cause.code }),
                retryable: true,
                message: `Could not collect the ${liquid} source at ${
                  positionKey(source.position)
                }: ${cause.message}`,
                cause,
              })
            ),
          );
          return;
        }
        if (
          liquid === "lava"
          || !obstruction.diggable
          || isPlayerStabilityBlock(
            current.player.position,
            obstruction.position,
          )
          || clearedBlocks === MAXIMUM_LIQUID_SIGHT_CLEARING_BLOCKS
        ) {
          return yield* Effect.fail(new BeatGameDriverError({
            operation: `expose-${liquid}-source`,
            retryable: true,
            message: isPlayerStabilityBlock(
                current.player.position,
                obstruction.position,
              )
              ? `Refused to expose the ${liquid} source by mining the player's footing at ${
                positionKey(obstruction.position)
              }`
              : `Could not expose the ${liquid} source through ${
                obstruction.blockId
              } at ${positionKey(obstruction.position)}`,
          }));
        }
        yield* state.driver.act({
          type: "select-item",
          selector: {
            itemIds: MINING_PICKAXE_ITEM_IDS,
          },
        });
        yield* state.driver.act({
          type: "dig-block",
          position: obstruction.position,
        });
      }
    }));
    if (liquid === "lava") {
      yield* retreatAfterLavaCollection(
        state,
        source.position,
        approachOrigin,
      );
    }
  });
}

function satisfyIronRequirement(
  state: RunState,
  observation: BeatGameObservation,
  missing: number,
): Effect.Effect<void, BeatGameDriverError> {
  const rawIron = observation.inventory.counts["minecraft:raw_iron"] ?? 0;
  if (rawIron >= missing) {
    const batchCount = Math.min(
      rawIron,
      bufferedCollectionCount("iron", missing),
    );
    return ensureWorkstation(
      state,
      observation,
      "minecraft:furnace",
    ).pipe(
      Effect.flatMap((workstation) =>
        ensureEfficientFurnaceFuel(
          state,
          observation,
          workstation,
          batchCount,
        ).pipe(
          Effect.flatMap((activeWorkstation) =>
            smelt(state.driver, {
              input: { itemIds: ["minecraft:raw_iron"] },
              count: batchCount,
              fuel: {
                itemIds: ["minecraft:coal", "minecraft:charcoal"],
              },
              station: activeWorkstation.position,
              path: state.strategy.path,
            }).pipe(
              Effect.zipRight(
                reclaimPlacedFurnace(state, activeWorkstation),
              ),
            )
          ),
        )
      ),
    );
  }
  if (
    observation.player.position.dimension === "minecraft:overworld"
    && observation.player.position.y > IRON_SEARCH_MAX_Y
  ) {
    return Effect.gen(function* () {
      yield* ensureMiningPickaxe(
        state,
        observation,
        "minecraft:stone_pickaxe",
        STONE_OR_BETTER_MINING_PICKAXE_ITEM_IDS,
        RESOURCE_DESCENT_PICKAXE_DURABILITY_RESERVE,
      );
      const current = yield* state.driver.observe;
      if (
        current.player.position.dimension !== "minecraft:overworld"
        || current.player.position.y <= IRON_SEARCH_MAX_Y
      ) {
        return;
      }
      const targetY = Math.max(
        IRON_SEARCH_Y,
        Math.floor(current.player.position.y) - IRON_SEARCH_DESCENT_STEP,
      );
      yield* excavateResourceSearchStaircase(
        state,
        current.player.position,
        targetY,
      );
    });
  }
  return collectBlocksOrExplore(state, observation, {
    blockIds: [
      "minecraft:iron_ore",
      "minecraft:deepslate_iron_ore",
    ],
    count: bufferedCollectionCount("iron", missing - rawIron),
    progressItemIds: ["minecraft:raw_iron"],
    purpose: "find-iron",
    avoidSubmergedTargets: true,
    avoidFluids: true,
    preferSurfaceExploration: false,
    prepareAttempt: (current) =>
      ensureMiningPickaxe(
        state,
        current,
        "minecraft:stone_pickaxe",
        STONE_OR_BETTER_MINING_PICKAXE_ITEM_IDS,
        RESOURCE_SEARCH_PICKAXE_DURABILITY_RESERVE,
      ),
  });
}

function preparePortalCastingLavaPool(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.gen(function* () {
    const sources = yield* state.driver.queryBlocks({
      center: observation.player.position,
      radius: state.strategy.blockSearchRadius,
      selector: {
        blockIds: ["minecraft:lava"],
        properties: { level: "0" },
      },
      maximumResults: PORTAL_CASTING_ADDITIONAL_LAVA_SOURCE_COUNT,
    });
    if (sources.length >= PORTAL_CASTING_ADDITIONAL_LAVA_SOURCE_COUNT) {
      yield* approachLavaSourceFromSide(
        state,
        observation,
        sources,
      );
      return true;
    }

    const canCraftDurablePickaxe =
      (observation.inventory.counts["minecraft:iron_ingot"] ?? 0) >= 3;
    yield* ensureMiningPickaxe(
      state,
      observation,
      canCraftDurablePickaxe
        ? "minecraft:iron_pickaxe"
        : "minecraft:stone_pickaxe",
      canCraftDurablePickaxe
        ? DURABLE_MINING_PICKAXE_ITEM_IDS
        : MINING_PICKAXE_ITEM_IDS,
      RESOURCE_DESCENT_PICKAXE_DURABILITY_RESERVE,
    );
    const current = yield* state.driver.observe;
    const searchPath = {
      ...state.strategy.path,
      avoidFluids: true,
    };
    if (
      current.player.position.dimension === "minecraft:overworld"
      && current.player.position.y > DEEP_LAVA_SEARCH_MAX_Y
    ) {
      const targetY = Math.max(
        DEEP_LAVA_SEARCH_Y,
        Math.floor(current.player.position.y) - DEEP_LAVA_DESCENT_STEP,
      );
      yield* excavateResourceSearchStaircase(
        state,
        current.player.position,
        targetY,
      );
      return false;
    }

    yield* advanceExplorationFrontier(
      state,
      current.player.position,
      "find-portal-lava-pool",
      state.strategy.blockSearchRadius,
      searchPath,
      false,
    );
    return false;
  });
}

function excavateResourceSearchStaircase(
  state: RunState,
  position: BeatGamePosition,
  targetY: number,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const origin = yield* findStableResourceSearchStaircaseOrigin(
      state,
      position,
    ).pipe(Effect.either);
    if (origin._tag === "Left") {
      if (origin.left.operation !== "find-resource-staircase-origin") {
        return yield* Effect.fail(origin.left);
      }
      yield* escapeToOverworldSurface(state, position);
      return;
    }
    const from = origin.right;
    const to = yield* selectResourceSearchStaircaseDestination(
      state.driver,
      from,
      targetY,
    );
    const excavation = yield* excavateStaircase(state.driver, {
      from,
      to,
      path: {
        ...state.strategy.path,
        avoidFluids: true,
      },
    }).pipe(Effect.either);
    if (excavation._tag === "Right") {
      return;
    }
    if (excavation.left.code !== "fluid_exposed") {
      return yield* Effect.fail(excavation.left);
    }

    const floodedApproach = yield* state.driver.observe;
    yield* emergencyAirAscent(
      state,
      floodedApproach.player.position,
    );
    const recovered = yield* state.driver.observe;
    yield* escapeToOverworldSurface(state, recovered.player.position);
    const surfaced = yield* state.driver.observe;
    yield* advanceExplorationFrontier(
      state,
      surfaced.player.position,
      explorationPurpose(
        "avoid-flooded-resource-staircase",
        surfaced.player.position,
      ),
      24,
      {
        ...state.strategy.path,
        avoidFluids: true,
      },
      true,
      false,
    );
  });
}

function findStableResourceSearchStaircaseOrigin(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<BeatGameBlockPosition, BeatGameDriverError> {
  return Effect.gen(function* () {
    const current = floorBlockPosition(position);
    const currentSupport = yield* queryExactBlockAt(state.driver, {
      ...current,
      y: current.y - 1,
    });
    if (isStableStaircaseAnchor(currentSupport)) {
      return current;
    }

    const supports = (yield* state.driver.queryBlocks({
      center: position,
      radius: 12,
      selector: { solid: true, requireLineOfSight: true },
      maximumResults: 512,
    }))
      .filter((block) =>
        block.position.dimension === position.dimension
        && isStableStaircaseAnchor(block)
        && Math.abs(block.position.y + 1 - position.y) <= 4
      )
      .sort((left, right) =>
        distanceSquared(
          { ...left.position, y: left.position.y + 1 },
          position,
        )
        - distanceSquared(
          { ...right.position, y: right.position.y + 1 },
          position,
        )
      )
      .slice(0, 64);
    for (const support of supports) {
      const stand = {
        ...support.position,
        y: support.position.y + 1,
      };
      const [body, head] = yield* Effect.all([
        queryExactBlockAt(state.driver, stand),
        queryExactBlockAt(state.driver, { ...stand, y: stand.y + 1 }),
      ]);
      if (
        body?.replaceable !== true
        || head?.replaceable !== true
        || [body, head].some(({ blockId }) => isPlayerFluidBlock(blockId))
      ) {
        continue;
      }
      const reached = yield* state.driver.pathfind(
        {
          x: stand.x + 0.5,
          y: stand.y,
          z: stand.z + 0.5,
          dimension: stand.dimension,
        },
        0.75,
        {
          ...state.strategy.path,
          allowMining: false,
          allowPlacing: false,
          avoidFluids: true,
          maxSearchTimeMs: Math.min(
            state.strategy.path.maxSearchTimeMs,
            5_000,
          ),
        },
      ).pipe(Effect.either);
      if (reached._tag === "Left") {
        continue;
      }
      const staged = floorBlockPosition(
        (yield* state.driver.observe).player.position,
      );
      const stagedSupport = yield* queryExactBlockAt(state.driver, {
        ...staged,
        y: staged.y - 1,
      });
      if (isStableStaircaseAnchor(stagedSupport)) {
        return staged;
      }
    }
    return yield* Effect.fail(new BeatGameDriverError({
      operation: "find-resource-staircase-origin",
      code: "unreachable",
      retryable: true,
      message:
        "No reachable dry ground with stable footing is available for a resource-search staircase",
    }));
  });
}

function selectResourceSearchStaircaseDestination(
  driver: BeatGameDriver,
  from: BeatGameBlockPosition,
  targetY: number,
): Effect.Effect<BeatGameBlockPosition, BeatGameDriverError> {
  return Effect.gen(function* () {
    const depth = Math.max(1, from.y - targetY);
    const directions = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
    ] as const;
    for (const direction of directions) {
      const firstStep = {
        ...from,
        x: from.x + direction.x,
        y: from.y - 1,
        z: from.z + direction.z,
      };
      const [head, tread, support] = yield* Effect.all([
        queryExactBlockAt(driver, { ...firstStep, y: firstStep.y + 1 }),
        queryExactBlockAt(driver, firstStep),
        queryExactBlockAt(driver, { ...firstStep, y: firstStep.y - 1 }),
      ]);
      if (
        head === undefined
        || tread === undefined
        || support === undefined
        || [head, tread, support].some(({ blockId }) =>
          isPlayerFluidBlock(blockId)
        )
      ) {
        continue;
      }
      return {
        ...from,
        x: from.x + direction.x * depth,
        y: targetY,
        z: from.z + direction.z * depth,
      };
    }
    return {
      ...from,
      x: from.x + depth,
      y: targetY,
    };
  });
}

function isStableStaircaseAnchor(
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

function isPlayerFluidBlock(blockId: string): boolean {
  return PLAYER_FLUID_BLOCK_IDS.includes(
    blockId as (typeof PLAYER_FLUID_BLOCK_IDS)[number],
  );
}

function queryExactBlockAt(
  driver: BeatGameDriver,
  position: BeatGameBlockPosition,
): Effect.Effect<BeatGameBlockObservation | undefined, BeatGameDriverError> {
  return driver.queryBlocks({
    center: blockCenter(position),
    radius: 0.25,
    selector: {},
    maximumResults: 1,
  }).pipe(
    Effect.map((blocks) =>
      blocks.find(({ position: observed }) =>
        sameBlockPosition(observed, position)
      )
    ),
  );
}

function approachLavaSourceFromSide(
  state: RunState,
  observation: BeatGameObservation,
  sources: readonly BeatGameBlockObservation[],
  options: {
    readonly requireExposableSource?: boolean;
  } = {},
): Effect.Effect<BeatGameBlockObservation, BeatGameDriverError> {
  return Effect.gen(function* () {
    const nearbySources = [...sources].sort((left, right) =>
      distanceSquared(observation.player.position, left.position)
      - distanceSquared(observation.player.position, right.position)
    );
    const preparedSources = yield* Effect.forEach(
      nearbySources,
      (source) =>
        queryLavaInteractionVolume(state.driver, source.position).pipe(
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
          state,
          candidate,
          false,
        );
        if (
          reached
          && (
            options.requireExposableSource !== true
            || (yield* isLavaSourceExposableFromCurrentPosition(
              state.driver,
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
          state,
          candidate,
          true,
        );
        if (
          reached
          && (
            options.requireExposableSource !== true
            || (yield* isLavaSourceExposableFromCurrentPosition(
              state.driver,
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
    const sourceDistance = Math.sqrt(
      direction.x * direction.x
        + direction.y * direction.y
        + direction.z * direction.z,
    );
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
    radius: 4.9,
    selector: {},
    maximumResults: 500,
  }).pipe(
    Effect.map((blocks) =>
      new Map(blocks.map((block) => [positionKey(block.position), block]))
    ),
  );
}

function pathfindToLavaInteractionStand(
  state: RunState,
  candidate: BeatGamePosition,
  allowMining: boolean,
): Effect.Effect<boolean, BeatGameDriverError> {
  return state.driver.pathfind(
    candidate,
    LIQUID_INTERACTION_STAND_RADIUS,
    {
      ...state.strategy.path,
      allowMining,
      avoidFluids: true,
      maxFallDistance: Math.min(state.strategy.path.maxFallDistance, 1),
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
      && !isPlayerFluidBlock(block.blockId)
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
    && isStableStaircaseAnchor(support)
    && ![feet, head, support].some((block) =>
      block !== undefined && isPlayerFluidBlock(block.blockId)
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
    && isStableStaircaseAnchor(support)
    && [feet, head].every((block) =>
      block !== undefined
      && !isPlayerFluidBlock(block.blockId)
      && (block.replaceable
        || block.diggable
          && !isGravityAffectedBlockId(block.blockId))
    );
}

function isPlayerStabilityBlock(
  player: BeatGamePosition,
  block: BeatGameBlockPosition,
): boolean {
  if (player.dimension !== block.dimension) {
    return false;
  }
  const playerX = Math.floor(player.x);
  const playerY = Math.floor(player.y);
  const playerZ = Math.floor(player.z);
  return block.x === playerX
    && block.z === playerZ
    && block.y >= playerY - 1
    && block.y <= playerY + 1;
}

function retreatAfterLavaCollection(
  state: RunState,
  source: BeatGameBlockPosition,
  approachOrigin: BeatGamePosition,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    let current = yield* state.driver.observe;
    yield* escapeLava(state, current);
    current = yield* state.driver.observe;
    if (current.player.dead) {
      return;
    }
    const canReturnAlongApproach = approachOrigin.dimension
        === current.player.position.dimension
      && distanceSquared(approachOrigin, current.player.position)
        >= LAVA_RETREAT_DISTANCE * LAVA_RETREAT_DISTANCE / 4;
    const target = canReturnAlongApproach
      ? approachOrigin
      : positionAwayFrom(
        current.player.position,
        source,
        LAVA_RETREAT_DISTANCE,
      );
    yield* state.driver.pathfind(target, 2, {
      ...state.strategy.path,
      avoidFluids: true,
      maxSearchTimeMs: Math.min(
        state.strategy.path.maxSearchTimeMs,
        15_000,
      ),
    }).pipe(
      Effect.catchTag("BeatGameDriverError", () => Effect.void),
    );
    current = yield* state.driver.observe;
    yield* escapeLava(state, current);
  });
}

function waitForViewRotation(
  driver: BeatGameDriver,
  yaw: number,
  pitch: number,
  attempts: number,
): Effect.Effect<void, BeatGameDriverError> {
  return driver.observe.pipe(
    Effect.flatMap((observation) => {
      const rotation = observation.player.rotation;
      if (
        Math.abs(wrappedDegrees(rotation.yaw - yaw)) <= 4
        && Math.abs(rotation.pitch - pitch) <= 4
      ) {
        return Effect.void;
      }
      if (attempts <= 1) {
        return Effect.fail(new BeatGameDriverError({
          operation: "wait-for-view-rotation",
          retryable: true,
          message: `The bot did not finish facing yaw ${yaw.toFixed(1)}, pitch ${
            pitch.toFixed(1)
          }`,
        }));
      }
      return Effect.sleep(50).pipe(
        Effect.zipRight(waitForViewRotation(
          driver,
          yaw,
          pitch,
          attempts - 1,
        )),
      );
    }),
  );
}

function wrappedDegrees(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function ensureFlint(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    let current = observation;
    if ((current.inventory.counts["minecraft:flint"] ?? 0) > 0) {
      return;
    }
    if ((current.inventory.counts["minecraft:gravel"] ?? 0) === 0) {
      yield* collectBlocksOrExplore(state, current, {
        blockIds: ["minecraft:gravel"],
        count: 8,
        progressItemIds: ["minecraft:gravel", "minecraft:flint"],
        purpose: "find-gravel",
        avoidSubmergedTargets: true,
        avoidFluids: true,
      });
      current = yield* state.driver.observe;
    }
    if ((current.inventory.counts["minecraft:flint"] ?? 0) > 0) {
      return;
    }
    if ((current.inventory.counts["minecraft:gravel"] ?? 0) === 0) {
      return yield* Effect.fail(new BeatGameDriverError({
        operation: "acquire-flint",
        retryable: true,
        message: "Breaking nearby gravel produced neither gravel nor flint",
      }));
    }

    for (let attempt = 0; attempt < 64; attempt += 1) {
      current = yield* state.driver.observe;
      if ((current.inventory.counts["minecraft:flint"] ?? 0) > 0) {
        return;
      }
      if ((current.inventory.counts["minecraft:gravel"] ?? 0) === 0) {
        yield* collectNearbyDrops(state.driver, {
          radius: 4,
          maximumDrops: 8,
          settleDelayMs: 100,
          path: state.strategy.path,
        });
        current = yield* state.driver.observe;
        if ((current.inventory.counts["minecraft:flint"] ?? 0) > 0) {
          return;
        }
        if ((current.inventory.counts["minecraft:gravel"] ?? 0) === 0) {
          return yield* Effect.fail(new BeatGameDriverError({
            operation: "acquire-flint",
            retryable: true,
            message: "The recycled gravel item could not be recovered",
          }));
        }
      }

      const targets = yield* findWorkstationTargets(
        state.driver,
        current.player.position,
      );
      let target: BeatGameBlockPosition | undefined;
      for (const candidate of targets) {
        const approached = yield* state.driver.pathfind(
          blockCenter(candidate),
          3,
          {
            ...state.strategy.path,
            allowMining: false,
            allowPlacing: false,
            avoidFluids: true,
          },
        ).pipe(Effect.either);
        if (approached._tag === "Left") {
          continue;
        }
        const approachedObservation = yield* state.driver.observe;
        if (
          yield* isPlayerInFluid(
            state.driver,
            approachedObservation.player.position,
          )
        ) {
          yield* emergencyAirAscent(
            state,
            approachedObservation.player.position,
          );
          continue;
        }
        target = candidate;
        break;
      }
      if (target === undefined) {
        return yield* Effect.fail(new BeatGameDriverError({
          operation: "acquire-flint",
          retryable: true,
          message:
            "No dry supported position is available for recycling gravel",
        }));
      }
      yield* state.driver.act({
        type: "select-item",
        selector: { itemIds: ["minecraft:gravel"] },
      });
      yield* state.driver.act({
        type: "place-block",
        against: { ...target, y: target.y - 1 },
        face: "up",
        hand: "main",
      });
      const placed = yield* waitForExactBlockId(
        state.driver,
        target,
        "minecraft:gravel",
      );
      if (!placed) {
        return yield* Effect.fail(new BeatGameDriverError({
          operation: "acquire-flint",
          retryable: true,
          message: "Gravel placement was not confirmed by the server",
        }));
      }
      yield* state.driver.act({ type: "dig-block", position: target });
      yield* collectNearbyDrops(state.driver, {
        radius: 4,
        maximumDrops: 8,
        settleDelayMs: 100,
        path: state.strategy.path,
      });
    }

    return yield* Effect.fail(new BeatGameDriverError({
      operation: "acquire-flint",
      retryable: true,
      message: "Recycling gravel did not produce flint after 64 attempts",
    }));
  });
}

function waitForExactBlockId(
  driver: BeatGameDriver,
  target: BeatGameBlockPosition,
  blockId: string,
  attempts = 20,
): Effect.Effect<boolean, BeatGameDriverError> {
  return driver.queryBlocks({
    center: blockCenter(target),
    radius: 0.25,
    selector: { blockIds: [blockId] },
    maximumResults: 1,
  }).pipe(
    Effect.flatMap((blocks) =>
      blocks.some(({ position }) => sameBlockPosition(position, target))
        ? Effect.succeed(true)
        : attempts <= 1
        ? Effect.succeed(false)
        : Effect.sleep(50).pipe(
          Effect.zipRight(
            waitForExactBlockId(driver, target, blockId, attempts - 1),
          ),
        )
    ),
  );
}

function ensureString(
  state: RunState,
  observation: BeatGameObservation,
  count: number,
): Effect.Effect<void, BeatGameDriverError | BeatGameError> {
  const missing = Math.max(
    0,
    count - (observation.inventory.counts["minecraft:string"] ?? 0),
  );
  return missing === 0
    ? Effect.void
    : huntOrExplore(
      state,
      observation,
      {
        entityTypes: ["minecraft:spider", "minecraft:cave_spider"],
        alive: true,
      },
      missing,
      "find-spiders",
    );
}

function ensureArrowIngredients(
  state: RunState,
  observation: BeatGameObservation,
  arrowCount: number,
): Effect.Effect<void, BeatGameDriverError | BeatGameError> {
  const operations = Math.ceil(arrowCount / 4);
  const flintMissing = Math.max(
    0,
    operations - (observation.inventory.counts["minecraft:flint"] ?? 0),
  );
  const featherMissing = Math.max(
    0,
    operations - (observation.inventory.counts["minecraft:feather"] ?? 0),
  );
  return Effect.gen(function* () {
    if (flintMissing > 0) {
      yield* collectBlocks(state.driver, {
        blockIds: ["minecraft:gravel"],
        count: flintMissing * 4,
        searchRadius: state.strategy.blockSearchRadius,
        path: state.strategy.path,
      });
    }
    if (featherMissing > 0) {
      yield* huntOrExplore(
        state,
        observation,
        {
          entityTypes: ["minecraft:chicken"],
          alive: true,
        },
        featherMissing,
        "find-chickens",
      );
    }
  });
}

interface HuntTargetPreference {
  readonly preferredEntityTypes: ReadonlySet<string>;
  readonly preferredRadius: number;
  readonly allowCriticalAquaticTargets?: boolean;
  readonly maximumSafeAquaticFoodLevel?: number;
  readonly requireHealthRecoveryForSafeAquaticTargets?: boolean;
  readonly safeAquaticFallbackAfterExplorationLegs?: number;
  readonly maximumExplorationHops?: number;
  readonly path?: BeatGameStrategy["path"];
  readonly explorationTarget?: BeatGamePosition;
  readonly allowFluidFallback?: boolean;
  readonly fallbackToLocalExploration?: boolean;
}

function huntOrExplore(
  state: RunState,
  observation: BeatGameObservation,
  selector: Parameters<BeatGameDriver["queryEntities"]>[0]["selector"],
  maximumTargets: number,
  purpose: string,
  targetPreference?: HuntTargetPreference,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  return Effect.gen(function* () {
    const expectedDropItemIds = [
      ...new Set(
        selector.entityTypes?.flatMap((entityType) =>
          HUNT_DROP_ITEM_IDS_BY_ENTITY_TYPE[entityType] ?? []
        ) ?? [],
      ),
    ];
    const expectedDropCount = (value: BeatGameObservation): number =>
      expectedDropItemIds.reduce(
        (total, itemId) => total + (value.inventory.counts[itemId] ?? 0),
        0,
      );
    const expectedFoodDrops = expectedDropItemIds.some((itemId) =>
      EDIBLE_FOOD_ITEM_IDS.includes(itemId)
      || EMERGENCY_FOOD_ITEM_IDS.some((foodItemId) => foodItemId === itemId)
    );
    const initialExpectedDropCount = expectedDropCount(observation);
    const maximumExplorationHops = Math.max(
      0,
      Math.floor(targetPreference?.maximumExplorationHops ?? 1),
    );
    const attemptedTargets = new Set<string>();
    const aquaticChaseAttempts = new Map<string, number>();
    const locallyUnreachable = new Set<string>();
    let confirmedVisibleTarget: BeatGameEntityObservation | undefined;
    let aquaticRetryTargetId: string | undefined;
    let strandedAquaticFallback = false;
    let aquaticPursuitActive = false;
    let attacked = 0;
    let explorationHops = 0;
    while (true) {
      let current = yield* state.driver.observe;
      const collected = expectedDropCount(current) - initialExpectedDropCount;
      if (
        expectedDropItemIds.length > 0
          ? collected >= maximumTargets
          : attacked >= maximumTargets
      ) {
        return;
      }
      yield* ensureInventorySpace(
        state,
        current,
        RESOURCE_COLLECTION_RESERVED_SLOTS,
      );
      current = yield* state.driver.observe;
      const checkpoint = yield* Ref.get(state.checkpoint);
      const explorationLegs = completedExplorationLegs(
        checkpoint,
        current.player.position.dimension,
        purpose,
      );
      const aquaticHuntAllowed = strandedAquaticFallback
        || shouldAllowAquaticHunt(
          current,
          state.strategy.minimumHealth,
          targetPreference,
          explorationLegs,
        );
      const overworldHunt =
        current.player.position.dimension === "minecraft:overworld";
      if (
        overworldHunt
        && !aquaticHuntAllowed
        && !aquaticPursuitActive
        && (yield* isPlayerInFluid(state.driver, current.player.position))
      ) {
        yield* emergencyAirAscent(state, current.player.position);
        return;
      }
      const survivalPath = survivalPathPolicy(
        targetPreference?.path ?? state.strategy.path,
        current.player.health,
        state.strategy.minimumHealth,
      );
      const huntingPath = aquaticHuntAllowed
        ? { ...survivalPath, avoidFluids: false }
        : survivalPath;
      const explorationPath = {
        ...huntingPath,
        allowMining: false,
        allowPlacing: false,
        sprint: false,
      };
      if (yield* needsOverworldSurfaceRecovery(state, current.player.position)) {
        yield* escapeToOverworldSurface(state, current.player.position);
        if (aquaticRetryTargetId !== undefined) {
          continue;
        }
        return;
      }
      if (expectedDropItemIds.length > 0) {
        yield* collectNearbyDrops(state.driver, {
          itemIds: expectedDropItemIds,
          radius: Math.min(
            HUNT_DROP_RECOVERY_RADIUS,
            state.strategy.entitySearchRadius,
          ),
          maximumDrops: Math.min(32, Math.max(16, maximumTargets)),
          settleDelayMs: 0,
          maximumVerticalDistance:
            HUNT_DROP_RECOVERY_MAXIMUM_VERTICAL_DISTANCE,
          path: expectedFoodDrops
              && current.player.position.dimension === "minecraft:overworld"
            ? { ...huntingPath, avoidFluids: false }
            : huntingPath,
        });
        current = yield* state.driver.observe;
        if (
          expectedDropCount(current) - initialExpectedDropCount
            >= maximumTargets
        ) {
          return;
        }
      }
      const now = Date.now();
      const rememberedUnreachableTargets = new Map(
        checkpoint.memory.unreachable
          .filter(({ expiresAt }) =>
            expiresAt === undefined || Date.parse(expiresAt) > now
          )
          .map((entry) => [entry.key, entry] as const),
      );
      const observedTargets = yield* state.driver.queryEntities({
        origin: current.player.position,
        radius: state.strategy.entitySearchRadius,
        selector,
        maximumResults: Math.min(
          256,
          Math.max(64, maximumTargets + attemptedTargets.size),
        ),
      });
      const targets = confirmedVisibleTarget === undefined
        ? observedTargets
        : [
          confirmedVisibleTarget,
          ...observedTargets.filter((target) =>
            target.connectionEpoch !== confirmedVisibleTarget?.connectionEpoch
            || target.networkId !== confirmedVisibleTarget.networkId
          ),
        ];
      confirmedVisibleTarget = undefined;
      const candidates = targets.filter((target) =>
        !isHuntingTargetUnreachable(
          target,
          current.player.position,
          locallyUnreachable,
          rememberedUnreachableTargets,
          now,
        )
        && !attemptedTargets.has(
          `${target.connectionEpoch}:${target.networkId}`,
        )
        && isEligibleHuntingTarget(
          target,
          current,
          targetPreference,
          aquaticHuntAllowed,
        )
      );
      const preferredCandidates = targetPreference === undefined
        ? []
        : candidates.filter((candidate) =>
          targetPreference.preferredEntityTypes.has(candidate.entityType)
          && horizontalDistanceSquared(
              candidate.position,
              current.player.position,
            ) <= targetPreference.preferredRadius ** 2
        );
      const recoveringHealth =
        current.player.health < state.strategy.minimumHealth;
      const rankedCandidates = recoveringHealth
        ? candidates
        : preferredCandidates.length > 0
        ? preferredCandidates
        : candidates;
      const retryTarget = aquaticRetryTargetId === undefined
        ? undefined
        : rankedCandidates.find((candidate) =>
          `${candidate.connectionEpoch}:${candidate.networkId}`
            === aquaticRetryTargetId
        );
      aquaticRetryTargetId = undefined;
      const target = retryTarget ?? rankedCandidates.reduce<
          BeatGameEntityObservation | undefined
        >(
          (nearest, candidate) =>
            nearest === undefined
              || huntingTargetRouteCost(
                  candidate,
                  current.player.position,
                  recoveringHealth
                    ? undefined
                    : targetPreference?.explorationTarget,
                )
                  < huntingTargetRouteCost(
                    nearest,
                    current.player.position,
                    recoveringHealth
                      ? undefined
                      : targetPreference?.explorationTarget,
                  )
              ? candidate
              : nearest,
          undefined,
        );
      aquaticPursuitActive = target !== undefined
        && AQUATIC_FOOD_ENTITY_TYPES.has(target.entityType);
      if (target === undefined) {
        if (explorationHops >= maximumExplorationHops) {
          return;
        }
        explorationHops += 1;
        if (
          yield* needsOverworldSurfaceRecovery(
            state,
            current.player.position,
          )
        ) {
          yield* escapeToOverworldSurface(
            state,
            current.player.position,
          );
        } else {
          const frontierScanRadius =
            current.player.health < state.strategy.minimumHealth
              ? Math.min(32, state.strategy.entitySearchRadius)
              : state.strategy.entitySearchRadius;
          const directedExplorationTarget =
            targetPreference?.explorationTarget?.dimension
                === current.player.position.dimension
              && horizontalDistanceSquared(
                  targetPreference.explorationTarget,
                  current.player.position,
                ) > DIRECTED_HUNT_DESTINATION_REACHED_RADIUS ** 2
              ? targetPreference.explorationTarget
              : undefined;
          const allowFluidFallback =
            targetPreference?.allowFluidFallback
              ?? (
                current.player.health >= state.strategy.minimumHealth
                && current.player.food > CRITICAL_HUNGER_FOOD_LEVEL
              );
          const advance = directedExplorationTarget === undefined
            ? advanceExplorationFrontier(
              state,
              current.player.position,
              purpose,
              frontierScanRadius,
              explorationPath,
              true,
              allowFluidFallback,
            )
            : pathfindExplorationTarget(
              state,
              current.player.position,
              directedExplorationTarget,
              2,
              explorationPath,
              true,
              allowFluidFallback,
            );
          const explorationOutcome = yield* Effect.raceFirst(
            advance.pipe(
              Effect.as({ type: "advanced" } as const),
              Effect.catchAll((cause) =>
                cause.operation === "pathfind"
                    || cause.operation === "pathfindXZ"
                  ? Effect.succeed({ type: "route-failed" } as const)
                  : Effect.fail(cause)
              ),
            ),
            waitForVisibleHuntingTarget(
              state,
              selector,
              attemptedTargets,
              locallyUnreachable,
              rememberedUnreachableTargets,
              targetPreference,
              aquaticHuntAllowed,
            ).pipe(
              Effect.map((target) => ({
                type: "target-visible" as const,
                target,
              })),
            ),
          );
          if (explorationOutcome.type === "target-visible") {
            confirmedVisibleTarget = explorationOutcome.target;
          }
          if (
            explorationOutcome.type === "route-failed"
            && targetPreference?.fallbackToLocalExploration === true
          ) {
            yield* advanceExplorationFrontier(
              state,
              current.player.position,
              `${purpose}-local`,
              frontierScanRadius,
              explorationPath,
              true,
              true,
            ).pipe(
              Effect.catchAll((cause) =>
                cause.operation === "pathfind"
                    || cause.operation === "pathfindXZ"
                  ? Effect.void
                  : Effect.fail(cause)
              ),
            );
          } else if (explorationOutcome.type === "route-failed") {
            const latest = yield* state.driver.observe;
            const recovered = yield* recoverLocalNavigationTrap(
              state,
              latest.player.position,
            );
            if (
              !recovered
              && !strandedAquaticFallback
              && targetPreference?.allowCriticalAquaticTargets === true
            ) {
              strandedAquaticFallback = true;
              explorationHops = 0;
            }
          }
        }
        continue;
      }
      const targetId = `${target.connectionEpoch}:${target.networkId}`;
      const targetKey = `target:${targetId}`;
      const aquaticTarget = AQUATIC_FOOD_ENTITY_TYPES.has(target.entityType);
      const targetHuntingPath = aquaticTarget
        ? {
          ...survivalPath,
          allowMining: false,
          allowPlacing: false,
          avoidFluids: false,
          sprint: true,
        }
        : huntingPath;
      const targetExplorationPath = {
        ...targetHuntingPath,
        allowMining: false,
        allowPlacing: false,
        sprint: aquaticTarget,
      };
      const targetDistanceSquared = aquaticTarget
        ? distanceSquared(target.position, current.player.position)
        : horizontalDistanceSquared(target.position, current.player.position);
      if (
        aquaticTarget
        && targetDistanceSquared
          > AQUATIC_HUNT_ATTACK_APPROACH_RADIUS ** 2
      ) {
        const approachOutcome = yield* Effect.raceFirst(
          state.driver.pathfind(
            target.position,
            AQUATIC_HUNT_ATTACK_APPROACH_RADIUS,
            targetExplorationPath,
          ).pipe(
            Effect.as("approached" as const),
            Effect.catchAll((cause) =>
              cause.operation === "pathfind"
                  || cause.operation === "pathfindXZ"
                ? Effect.succeed("route-failed" as const)
                : Effect.fail(cause)
            ),
          ),
          waitForUnsafeAquaticHunt(state).pipe(
            Effect.catchTag("BeatGameDriverError", (cause) =>
              cause.code === "aquatic_air_low"
                ? Effect.succeed("air-low" as const)
                : Effect.fail(cause)
            ),
          ),
        );
        if (approachOutcome === "air-low") {
          aquaticRetryTargetId = targetId;
          const latest = yield* state.driver.observe;
          yield* emergencyAirAscent(
            state,
            latest.player.position,
            { seekDrySurfaceAfterRecovery: false },
          );
          continue;
        }
        if (approachOutcome === "route-failed") {
          const enteredWater = aquaticHuntAllowed
            ? yield* enterWaterTowardAquaticTarget(state, current, target)
            : false;
          if (enteredWater) {
            continue;
          }
          locallyUnreachable.add(targetKey);
          yield* persist(state, (currentCheckpoint) => ({
            ...currentCheckpoint,
            memory: {
              ...currentCheckpoint.memory,
              unreachable: [
                ...currentCheckpoint.memory.unreachable,
                {
                  key: targetKey,
                  value: target.position,
                  observedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 600_000).toISOString(),
                  confidence: 1,
                },
              ].slice(-64),
            },
          }));
          continue;
        }
      }
      if (
        !aquaticTarget
        && targetDistanceSquared
          > HUNT_ATTACK_APPROACH_RADIUS ** 2
      ) {
        const targetDistance = Math.sqrt(targetDistanceSquared);
        const maximumApproachDistance =
          current.player.health < state.strategy.minimumHealth
            ? 12
            : HUNT_MAXIMUM_APPROACH_DISTANCE;
        const approachDistance = Math.min(
          maximumApproachDistance,
          targetDistance
            - (HUNT_ATTACK_APPROACH_RADIUS - HUNT_APPROACH_BUFFER),
        );
        const approachRatio = approachDistance / targetDistance;
        const approachTarget = {
          x: current.player.position.x
            + (target.position.x - current.player.position.x)
              * approachRatio,
          z: current.player.position.z
            + (target.position.z - current.player.position.z)
              * approachRatio,
        };
        const approach = state.driver.pathfindXZ(
          approachTarget.x,
          approachTarget.z,
          current.player.position.dimension,
          HUNT_APPROACH_GOAL_RADIUS,
          targetExplorationPath,
        );
        const approached = yield* approach.pipe(
          Effect.as(true),
          Effect.catchAll((cause) =>
            cause.operation === "pathfind"
                || cause.operation === "pathfindXZ"
              ? Effect.succeed(false)
              : Effect.fail(cause)
          ),
        );
        if (!approached) {
          locallyUnreachable.add(targetKey);
          yield* persist(state, (currentCheckpoint) => ({
            ...currentCheckpoint,
            memory: {
              ...currentCheckpoint.memory,
              unreachable: [
                ...currentCheckpoint.memory.unreachable,
                {
                  key: targetKey,
                  value: target.position,
                  observedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 600_000).toISOString(),
                  confidence: 1,
                },
              ].slice(-64),
            },
          }));
          continue;
        }
        continue;
      }
      attemptedTargets.add(targetId);
      const claim = yield* state.coordinator.claim({
        teamId: checkpoint.teamId,
        runId: checkpoint.runId,
        botId: checkpoint.botId,
        key: targetKey,
        purpose,
        ttlMs: Math.max(
          state.strategy.claimTtlMs,
          state.strategy.actionTimeoutMs + 5_000,
        ),
      });
      if (claim === undefined) {
        continue;
      }
      yield* emit(state, {
        type: "team-claim-changed",
        claim,
        released: false,
      });
      yield* state.coordinator.publishDiscovery(
        checkpoint.teamId,
        {
          key:
            `resource:${target.entityType}:${target.connectionEpoch}:${target.networkId}`,
          kind: "resource",
          botId: checkpoint.botId,
          position: target.position,
          observedAt: target.observedAt,
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
          confidence: 1,
          metadata: {
            entityType: target.entityType,
            connectionEpoch: target.connectionEpoch,
            networkId: target.networkId,
          },
        },
      );
      const attack = attackEntity(state.driver, {
        target,
        targetUnavailableTimeoutSeconds: 3,
        selectBestWeapon: true,
        sprinting: true,
        path: targetHuntingPath,
      });
      const boundedAttack = aquaticTarget
        ? Effect.raceFirst(
          attack.pipe(
            Effect.timeoutFail({
              duration: AQUATIC_HUNT_CHASE_TIMEOUT_MS,
              onTimeout: () => new BeatGameDriverError({
                operation: "task.attack-entity",
                code: "aquatic_chase_timeout",
                retryable: true,
                message:
                  `Stopped chasing moving aquatic target ${target.networkId}`,
              }),
            }),
          ),
          waitForUnsafeAquaticHunt(state),
        )
        : attack;
      const defeated = yield* boundedAttack.pipe(
        Effect.tapError((cause) =>
          cause.code === "aquatic_chase_timeout"
              || cause.code === "aquatic_air_low"
            ? Effect.void
            : persist(state, (current) => ({
            ...current,
            memory: {
              ...current.memory,
              unreachable: [
                ...current.memory.unreachable,
                {
                  key: targetKey,
                  value: target.position,
                  observedAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 600_000).toISOString(),
                  confidence: 1,
                },
              ].slice(-64),
            },
            })).pipe(Effect.ignore)
        ),
        Effect.as(true),
        Effect.catchTag("BeatGameDriverError", (cause) => {
          if (
            cause.code === "aquatic_chase_timeout"
            || cause.code === "aquatic_air_low"
          ) {
            const attempts = (aquaticChaseAttempts.get(targetId) ?? 0) + 1;
            aquaticChaseAttempts.set(targetId, attempts);
            if (attempts < AQUATIC_HUNT_MAXIMUM_CHASE_ATTEMPTS) {
              const retry = Effect.sync(() => {
                attemptedTargets.delete(targetId);
                aquaticRetryTargetId = targetId;
              });
              return (cause.code === "aquatic_air_low"
                  ? retry.pipe(
                    Effect.zipRight(state.driver.observe),
                    Effect.flatMap((observation) =>
                      emergencyAirAscent(
                        state,
                        observation.player.position,
                        { seekDrySurfaceAfterRecovery: false },
                      )
                    ),
                  )
                  : retry).pipe(Effect.as(false));
            }
          }
          return cause.code === "not_found"
              || cause.operation === "task.attack-entity"
            ? Effect.sync(() => {
              locallyUnreachable.add(targetKey);
            }).pipe(
              Effect.zipRight(
                current.player.position.dimension === "minecraft:overworld"
                    && target.position.y - current.player.position.y > 6
                  ? escapeToOverworldSurface(
                    state,
                    current.player.position,
                  )
                  : Effect.void,
              ),
              Effect.as(false),
            )
            : Effect.fail(cause);
        }),
        Effect.ensuring(releaseActionClaim(state, claim)),
      );
      if (!defeated) {
        continue;
      }
      const shouldCrossFluidsForFoodDrops = expectedFoodDrops
        && current.player.position.dimension === "minecraft:overworld";
      yield* collectNearbyDrops(state.driver, {
        ...(expectedDropItemIds.length === 0
          ? {}
          : { itemIds: expectedDropItemIds }),
        radius: 8,
        maximumDrops: 16,
        settleDelayMs: 500,
        path: shouldCrossFluidsForFoodDrops
          ? { ...targetHuntingPath, avoidFluids: false }
          : targetHuntingPath,
      });
      attacked += 1;
    }
  });
}

function waitForUnsafeAquaticHunt(
  state: RunState,
): Effect.Effect<never, BeatGameDriverError> {
  const poll = (): Effect.Effect<never, BeatGameDriverError> =>
    Effect.sleep(Math.max(100, state.strategy.observationPollMs)).pipe(
      Effect.zipRight(state.driver.observe),
      Effect.flatMap((observation) => {
        if (observation.player.dead) {
          return Effect.fail(new BeatGameDriverError({
            operation: "task.attack-entity",
            code: "bot-dead",
            retryable: true,
            message: "The bot died while hunting an aquatic target",
          }));
        }
        if (
          observation.player.maxAir > 0
          && observation.player.air
            <= Math.min(
              AQUATIC_HUNT_MINIMUM_AIR_TICKS,
              observation.player.maxAir * 2 / 5,
            )
        ) {
          return Effect.fail(new BeatGameDriverError({
            operation: "task.attack-entity",
            code: "aquatic_air_low",
            retryable: true,
            message: "Surfacing before continuing the aquatic hunt",
          }));
        }
        return Effect.suspend(poll);
      }),
    );
  return Effect.suspend(poll);
}

function enterWaterTowardAquaticTarget(
  state: RunState,
  observation: BeatGameObservation,
  target: BeatGameEntityObservation,
): Effect.Effect<boolean, BeatGameDriverError> {
  const player = observation.player.position;
  return state.driver.queryBlocks({
    center: player,
    radius: AQUATIC_WATER_ENTRY_SEARCH_RADIUS,
    selector: { blockIds: ["minecraft:water"] },
    maximumResults: 64,
  }).pipe(
    Effect.map((blocks) => {
      const targetDeltaX = target.position.x - player.x;
      const targetDeltaZ = target.position.z - player.z;
      const targetDistance = Math.hypot(targetDeltaX, targetDeltaZ);
      const targetDirectionX = targetDistance === 0
        ? 0
        : targetDeltaX / targetDistance;
      const targetDirectionZ = targetDistance === 0
        ? 0
        : targetDeltaZ / targetDistance;
      return blocks
        .filter((block) => {
          const center = blockCenter(block.position);
          const horizontalDistance = Math.hypot(
            center.x - player.x,
            center.z - player.z,
          );
          return block.position.dimension === player.dimension
            && horizontalDistance >= 0.35
            && horizontalDistance <= AQUATIC_WATER_ENTRY_SEARCH_RADIUS
            && center.y >= player.y - 2
            && center.y <= player.y + 1;
        })
        .map((block) => {
          const center = blockCenter(block.position);
          const deltaX = center.x - player.x;
          const deltaZ = center.z - player.z;
          const horizontalDistance = Math.hypot(deltaX, deltaZ);
          const alignment = horizontalDistance === 0
            ? -1
            : (deltaX / horizontalDistance) * targetDirectionX
              + (deltaZ / horizontalDistance) * targetDirectionZ;
          return {
            center,
            score: (1 - alignment) * AQUATIC_WATER_ENTRY_SEARCH_RADIUS
              + horizontalDistance,
          };
        })
        .sort((left, right) => left.score - right.score)[0]?.center;
    }),
    Effect.flatMap((water) => {
      if (water === undefined) {
        return Effect.succeed(false);
      }
      const rotation = rotationToward(player, {
        ...water,
        y: player.y,
      });
      return state.driver.withControl(
        state.driver.act({
          type: "look",
          yaw: rotation.yaw,
          pitch: 0,
        }).pipe(
          Effect.zipRight(state.driver.act({
            type: "set-movement",
            forward: true,
            jump: true,
            sprint: false,
          })),
          Effect.zipRight(waitForWaterEntry(
            state,
            AQUATIC_WATER_ENTRY_ATTEMPTS,
          )),
          Effect.ensuring(
            state.driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
          ),
        ),
      );
    }),
  );
}

function waitForWaterEntry(
  state: RunState,
  attemptsRemaining: number,
): Effect.Effect<boolean, BeatGameDriverError> {
  return Effect.sleep(100).pipe(
    Effect.zipRight(state.driver.observe),
    Effect.flatMap((observation) =>
      observation.player.dead
        ? Effect.succeed(false)
        : isPlayerInFluid(state.driver, observation.player.position).pipe(
          Effect.flatMap((inFluid) =>
            inFluid
              ? Effect.succeed(true)
              : attemptsRemaining <= 1
              ? Effect.succeed(false)
              : waitForWaterEntry(state, attemptsRemaining - 1)
          ),
        )
    ),
  );
}

function waitForVisibleHuntingTarget(
  state: RunState,
  selector: Parameters<BeatGameDriver["queryEntities"]>[0]["selector"],
  attemptedTargets: ReadonlySet<string>,
  locallyUnreachable: ReadonlySet<string>,
  rememberedUnreachableTargets: ReadonlyMap<
    string,
    BeatGameMemoryEntry<BeatGamePosition>
  >,
  targetPreference?: HuntTargetPreference,
  aquaticHuntAllowed = false,
): Effect.Effect<BeatGameEntityObservation, BeatGameDriverError> {
  const poll = (
    previouslyVisibleTargets: ReadonlySet<string>,
  ): Effect.Effect<BeatGameEntityObservation, BeatGameDriverError> =>
    Effect.sleep(Math.max(100, state.strategy.observationPollMs)).pipe(
      Effect.zipRight(state.driver.observe),
      Effect.flatMap((observation) =>
        state.driver.queryEntities({
          origin: observation.player.position,
          radius: state.strategy.entitySearchRadius,
          selector,
          maximumResults: 64,
        }).pipe(
          Effect.flatMap((targets) => {
            const visibleTargets = targets.filter((target) =>
              !isHuntingTargetUnreachable(
                target,
                observation.player.position,
                locallyUnreachable,
                rememberedUnreachableTargets,
                Date.now(),
              )
              && !attemptedTargets.has(
                `${target.connectionEpoch}:${target.networkId}`,
              )
              && isEligibleHuntingTarget(
                target,
                observation,
                targetPreference,
                aquaticHuntAllowed,
              )
            );
            const confirmed = visibleTargets.find((target) =>
              previouslyVisibleTargets.has(
                `${target.connectionEpoch}:${target.networkId}`,
              )
            );
            return confirmed === undefined
              ? Effect.suspend(() =>
                poll(new Set(visibleTargets.map((target) =>
                  `${target.connectionEpoch}:${target.networkId}`
                )))
              )
              : Effect.succeed(confirmed);
          }),
        )
      ),
    );
  return Effect.suspend(() => poll(new Set()));
}

function isHuntingTargetUnreachable(
  target: BeatGameEntityObservation,
  playerPosition: BeatGamePosition,
  locallyUnreachable: ReadonlySet<string>,
  rememberedUnreachableTargets: ReadonlyMap<
    string,
    BeatGameMemoryEntry<BeatGamePosition>
  >,
  now: number,
): boolean {
  const key = `target:${target.connectionEpoch}:${target.networkId}`;
  if (locallyUnreachable.has(key)) {
    return true;
  }
  const remembered = rememberedUnreachableTargets.get(key);
  if (remembered === undefined) {
    return false;
  }
  if (
    remembered.value.dimension !== target.position.dimension
    || distanceSquared(remembered.value, target.position)
      > HUNT_UNREACHABLE_TARGET_RETRY_DISTANCE ** 2
  ) {
    return false;
  }
  const approachRadius = AQUATIC_FOOD_ENTITY_TYPES.has(target.entityType)
    ? AQUATIC_HUNT_ATTACK_APPROACH_RADIUS
    : HUNT_ATTACK_APPROACH_RADIUS;
  const observedAt = Date.parse(remembered.observedAt);
  if (!Number.isFinite(observedAt)) {
    return true;
  }
  const retryDelay = distanceSquared(playerPosition, target.position)
      > approachRadius ** 2
    ? HUNT_DISTANT_UNREACHABLE_RETRY_DELAY_MS
    : HUNT_NEARBY_UNREACHABLE_RETRY_DELAY_MS;
  return now - observedAt < retryDelay;
}

function isEligibleHuntingTarget(
  target: BeatGameEntityObservation,
  observation: BeatGameObservation,
  targetPreference?: HuntTargetPreference,
  aquaticHuntAllowed = false,
): boolean {
  const aquaticTarget = AQUATIC_FOOD_ENTITY_TYPES.has(target.entityType);
  return isHuntingTargetWithinReach(
    target,
    observation,
    aquaticHuntAllowed,
  )
    && (
      !aquaticTarget
      || aquaticHuntAllowed
    )
    && (
      observation.player.health <= LETHAL_MELEE_DISENGAGE_HEALTH
      || isWithinDirectedHuntDetour(
        observation.player.position,
        target.position,
        targetPreference?.explorationTarget,
      )
    );
}

function isHuntingTargetWithinReach(
  target: BeatGameEntityObservation,
  observation: BeatGameObservation,
  aquaticHuntAllowed = false,
): boolean {
  if (EMERGENCY_FOOD_ENTITY_TYPE_SET.has(target.entityType)) {
    return Math.abs(target.position.y - observation.player.position.y)
        <= EMERGENCY_FOOD_MAXIMUM_VERTICAL_DISTANCE
      && horizontalDistanceSquared(
          target.position,
          observation.player.position,
        ) <= EMERGENCY_FOOD_MAXIMUM_HORIZONTAL_DISTANCE ** 2;
  }
  if (AQUATIC_FOOD_ENTITY_TYPES.has(target.entityType)) {
    return aquaticHuntAllowed
      && Math.abs(target.position.y - observation.player.position.y)
        <= URGENT_AQUATIC_HUNT_MAXIMUM_VERTICAL_DISTANCE
      && horizontalDistanceSquared(
        target.position,
        observation.player.position,
      ) <= URGENT_AQUATIC_HUNT_MAXIMUM_HORIZONTAL_DISTANCE ** 2;
  }
  return Math.abs(target.position.y - observation.player.position.y)
    <= LAND_HUNT_MAXIMUM_VERTICAL_DISTANCE;
}

function shouldAllowAquaticHunt(
  observation: BeatGameObservation,
  minimumHealth: number,
  targetPreference?: HuntTargetPreference,
  completedDryExplorationLegs = 0,
): boolean {
  if (targetPreference?.allowCriticalAquaticTargets !== true) {
    return false;
  }
  if (observation.player.food <= CRITICAL_HUNGER_FOOD_LEVEL) {
    return observation.player.health > LETHAL_MELEE_DISENGAGE_HEALTH;
  }
  const minimumSafeHealth = Math.max(
    LETHAL_MELEE_DISENGAGE_HEALTH + 1,
    minimumHealth - 6,
  );
  const exhaustedDrySearch =
    targetPreference.safeAquaticFallbackAfterExplorationLegs !== undefined
    && completedDryExplorationLegs
      >= targetPreference.safeAquaticFallbackAfterExplorationLegs;
  if (exhaustedDrySearch) {
    const maximumFallbackFoodLevel =
      targetPreference.maximumSafeAquaticFoodLevel
        ?? URGENT_HUNGER_FOOD_LEVEL;
    return observation.player.health >= minimumHealth
      || (
        observation.player.food <= maximumFallbackFoodLevel
        && observation.player.health > LETHAL_MELEE_DISENGAGE_HEALTH
      );
  }
  return observation.player.health >= minimumSafeHealth
    && (
      targetPreference.requireHealthRecoveryForSafeAquaticTargets !== true
      || observation.player.health < minimumHealth
      || exhaustedDrySearch
    )
    && targetPreference.maximumSafeAquaticFoodLevel !== undefined
    && observation.player.food
      <= targetPreference.maximumSafeAquaticFoodLevel;
}

function completedExplorationLegs(
  checkpoint: BeatGameCheckpoint,
  dimension: string,
  purpose: string,
): number {
  const frontier = checkpoint.memory.explorationFrontiers?.[
    `${dimension}:${purpose}`
  ];
  return frontier?.totalAdvances
    ?? Math.max(0, (frontier?.nextIndex ?? 1) - 1);
}

function survivalPathPolicy(
  path: BeatGameStrategy["path"],
  health: number,
  minimumHealth: number,
): BeatGameStrategy["path"] {
  return health < minimumHealth
    ? {
      ...path,
      avoidFluids: true,
      maxFallDistance: Math.min(
        path.maxFallDistance,
        MAXIMUM_DAMAGE_FREE_FALL_DISTANCE,
      ),
    }
    : path;
}

function needsOverworldSurfaceRecovery(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<boolean, BeatGameDriverError> {
  if (
    position.dimension !== "minecraft:overworld"
    || position.y > OVERWORLD_FORCED_SURFACE_RECOVERY_MAX_Y
  ) {
    return Effect.succeed(false);
  }
  return state.driver.sampleSurface(position, 4, 1).pipe(
    Effect.map((columns) =>
      selectSurfaceColumn(columns, position)
        ?? selectSwimmableSurfaceEscapeColumns(columns, position, 1)[0]
    ),
    Effect.map((surface) =>
      surface !== undefined && surface.surfaceY - position.y > 2
    ),
  );
}

function returnToOverworldSurface(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const columns = yield* state.driver.sampleSurface(
      position,
      AIR_ESCAPE_SURFACE_SEARCH_RADIUS,
      1,
    );
    const drySurfaces = selectSurfaceEscapeColumns(columns, position);
    const surfaces = drySurfaces.length > 0
      ? drySurfaces
      : selectSwimmableSurfaceEscapeColumns(columns, position);
    if (surfaces.length === 0) {
      return yield* Effect.fail(new BeatGameDriverError({
        operation: "pathfind",
        code: "unreachable",
        retryable: true,
        message: "No loaded traversable surface is available for recovery",
      }));
    }
    const targets: readonly BeatGamePosition[] = surfaces.map((surface) => ({
      x: surface.x + 0.5,
      y: surface.surfaceY + 1,
      z: surface.z + 0.5,
      dimension: position.dimension,
    }));
    yield* prepareSurfaceEscapePickaxe(state, position, targets);
    yield* pathfindToFirstReachableSurface(
      state,
      targets,
      0,
      undefined,
      {
        ...state.strategy.path,
        allowMining: true,
        allowPlacing: true,
        avoidFluids: drySurfaces.length > 0,
      },
    );
  });
}

function prepareSurfaceEscapePickaxe(
  state: RunState,
  position: BeatGamePosition,
  targets: readonly BeatGamePosition[],
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const verticalRise = targets.reduce(
      (maximum, target) => Math.max(maximum, target.y - position.y),
      0,
    );
    if (verticalRise <= 2) {
      return;
    }

    const observation = yield* state.driver.observe;
    if (
      observation.player.dead
      || (yield* isPlayerInFluid(state.driver, observation.player.position))
    ) {
      return;
    }

    const useIronPickaxe =
      (observation.inventory.counts["minecraft:iron_ingot"] ?? 0) >= 3;
    const maximumDurability = useIronPickaxe
      ? IRON_PICKAXE_MAXIMUM_DURABILITY
      : STONE_PICKAXE_MAXIMUM_DURABILITY;
    yield* ensureMiningPickaxe(
      state,
      observation,
      useIronPickaxe
        ? "minecraft:iron_pickaxe"
        : "minecraft:stone_pickaxe",
      useIronPickaxe
        ? DURABLE_MINING_PICKAXE_ITEM_IDS
        : STONE_OR_BETTER_MINING_PICKAXE_ITEM_IDS,
      Math.min(
        maximumDurability,
        Math.ceil(
          verticalRise * SURFACE_ESCAPE_PICKAXE_DURABILITY_PER_LEVEL,
        ),
      ),
    ).pipe(
      Effect.catchTag("BeatGameDriverError", () => Effect.void),
    );
  });
}

function climbToHigherOverworldGround(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<boolean, BeatGameDriverError> {
  if (
    position.dimension !== "minecraft:overworld"
    || position.y > OVERWORLD_LOW_GROUND_MAX_Y
  ) {
    return Effect.succeed(false);
  }
  return state.driver.sampleSurface(
    position,
    AIR_ESCAPE_SURFACE_SEARCH_RADIUS,
    1,
  ).pipe(
    Effect.map((columns) =>
      selectElevatedSurfaceColumns(columns, position).map((surface) => ({
        x: surface.x + 0.5,
        y: surface.surfaceY + 1,
        z: surface.z + 0.5,
        dimension: position.dimension,
      }))
    ),
    Effect.flatMap((targets) =>
      targets.length === 0
        ? Effect.succeed(false)
        : pathfindToFirstReachableSurface(
          state,
          targets,
          0,
          ELEVATED_SURFACE_PATH_TIMEOUT_MS,
        ).pipe(
          Effect.as(true),
          Effect.catchAll((cause) =>
            cause.operation === "pathfind"
              ? Effect.succeed(false)
              : Effect.fail(cause)
          ),
        )
    ),
  );
}

function recoverLocalNavigationTrap(
  state: RunState,
  position: BeatGamePosition,
): Effect.Effect<boolean, BeatGameDriverError> {
  if (position.dimension !== "minecraft:overworld") {
    return Effect.succeed(false);
  }
  return state.driver.sampleSurface(
    position,
    AIR_ESCAPE_SURFACE_SEARCH_RADIUS,
    1,
  ).pipe(
    Effect.map((columns) => {
      const stableColumns = selectStableSurfaceEscapeColumns(
        columns,
        position,
      );
      const safeColumns = selectSurfaceEscapeColumns(columns, position);
      const nonTrivial = (surface: (typeof safeColumns)[number]) => {
        const deltaY = surface.surfaceY + 1 - position.y;
        return surfaceHorizontalDistanceSquared(surface, position)
            + deltaY * deltaY
          > 1.5 ** 2;
      };
      const separated = (surface: (typeof safeColumns)[number]) =>
        surfaceHorizontalDistanceSquared(surface, position)
          >= LOCAL_NAVIGATION_RECOVERY_MINIMUM_DISTANCE ** 2;
      const orderedColumns = [
        ...stableColumns.filter(nonTrivial).filter(separated),
        ...safeColumns.filter(nonTrivial).filter(separated),
        ...stableColumns.filter(nonTrivial),
        ...safeColumns.filter(nonTrivial),
      ];
      const uniqueColumns = new Map(
        orderedColumns.map((surface) => [
          `${surface.x}:${surface.surfaceY}:${surface.z}`,
          surface,
        ]),
      );
      return [...uniqueColumns.values()].map((surface) => ({
          x: surface.x + 0.5,
          y: surface.surfaceY + 1,
          z: surface.z + 0.5,
          dimension: position.dimension,
        }));
    }),
    Effect.flatMap((targets) =>
      targets.length === 0
        ? Effect.succeed(false)
        : pathfindToFirstReachableSurface(
          state,
          targets,
          0,
          LOCAL_NAVIGATION_RECOVERY_TIMEOUT_MS,
          {
            ...state.strategy.path,
            allowMining: true,
            allowPlacing: true,
            avoidFluids: true,
            sprint: false,
            maxSearchTimeMs: Math.min(
              state.strategy.path.maxSearchTimeMs,
              LOCAL_NAVIGATION_RECOVERY_MAX_SEARCH_TIME_MS,
            ),
          },
        ).pipe(
          Effect.as(true),
          Effect.catchAll((cause) =>
            cause.operation === "pathfind"
              ? Effect.succeed(false)
              : Effect.fail(cause)
          ),
        )
    ),
  );
}

function pathfindToFirstReachableSurface(
  state: RunState,
  targets: readonly BeatGamePosition[],
  index = 0,
  attemptTimeoutMs?: number,
  path: BeatGameStrategy["path"] = {
    ...state.strategy.path,
    allowMining: true,
    allowPlacing: true,
    avoidFluids: true,
  },
): Effect.Effect<void, BeatGameDriverError> {
  const target = targets[index];
  if (target === undefined) {
    return Effect.void;
  }
  const pathfind = state.driver.pathfind(
    target,
    1.5,
    path,
  );
  const boundedPathfind = attemptTimeoutMs === undefined
    ? pathfind
    : pathfind.pipe(
      Effect.timeoutFail({
        duration: attemptTimeoutMs,
        onTimeout: () => new BeatGameDriverError({
          operation: "pathfind",
          code: "unreachable",
          retryable: true,
          message: `Timed out climbing toward ${target.x}, ${target.y}, ${target.z}`,
        }),
      }),
    );
  const airSafePathfind = Effect.raceFirst(
    boundedPathfind,
    waitForUnsafeAir(state).pipe(
      Effect.flatMap((outcome) =>
        Effect.fail(new BeatGameDriverError({
          operation: "pathfind",
          code: outcome === "dead" ? "bot-dead" : "unsafe-air",
          retryable: true,
          message: outcome === "dead"
            ? "The bot died while pathfinding toward the surface"
            : "Pathfinding toward the surface was cancelled before the bot ran out of air",
        }))
      ),
    ),
  );
  return airSafePathfind.pipe(
    Effect.catchAll((cause) =>
      cause.operation === "pathfind"
          && cause.code === "unreachable"
          && index + 1 < targets.length
        ? pathfindToFirstReachableSurface(
          state,
          targets,
          index + 1,
          attemptTimeoutMs,
          path,
        )
        : Effect.fail(cause)
    ),
  );
}

function selectSurfaceColumn(
  columns: readonly {
    readonly x: number;
    readonly z: number;
    readonly loaded: boolean;
    readonly surfaceY?: number;
    readonly blockId?: string;
  }[],
  position: BeatGamePosition,
): { readonly x: number; readonly z: number; readonly surfaceY: number }
  | undefined {
  return selectSurfaceEscapeColumns(columns, position, 1)[0];
}

function selectSurfaceEscapeColumns(
  columns: readonly {
    readonly x: number;
    readonly z: number;
    readonly loaded: boolean;
    readonly surfaceY?: number;
    readonly blockId?: string;
  }[],
  position: BeatGamePosition,
  maximumResults = AIR_ESCAPE_DIRECTION_SECTORS,
): readonly {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
}[] {
  const candidates = columns.flatMap((column) =>
    column.loaded
      && column.surfaceY !== undefined
      && !isUnsafeSurfaceBlock(column.blockId)
      ? [{ x: column.x, z: column.z, surfaceY: column.surfaceY }]
      : []
  ).sort((left, right) =>
    surfaceHorizontalDistanceSquared(left, position)
      - surfaceHorizontalDistanceSquared(right, position)
  );
  return selectDirectionalSurfaceColumns(candidates, position, maximumResults);
}

function selectSwimmableSurfaceEscapeColumns(
  columns: readonly {
    readonly x: number;
    readonly z: number;
    readonly loaded: boolean;
    readonly surfaceY?: number;
    readonly blockId?: string;
  }[],
  position: BeatGamePosition,
  maximumResults = AIR_ESCAPE_DIRECTION_SECTORS,
): readonly {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
}[] {
  const candidates = columns.flatMap((column) =>
    column.loaded
      && column.surfaceY !== undefined
      && isSwimmableSurfaceBlock(column.blockId)
      ? [{ x: column.x, z: column.z, surfaceY: column.surfaceY }]
      : []
  ).sort((left, right) =>
    surfaceHorizontalDistanceSquared(left, position)
      - surfaceHorizontalDistanceSquared(right, position)
  );
  return selectDirectionalSurfaceColumns(candidates, position, maximumResults);
}

function selectDirectionalSurfaceColumns(
  candidates: readonly {
    readonly x: number;
    readonly z: number;
    readonly surfaceY: number;
  }[],
  position: BeatGamePosition,
  maximumResults: number,
): readonly {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
}[] {
  const selected = new Map<number, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const angle = Math.atan2(
      candidate.z + 0.5 - position.z,
      candidate.x + 0.5 - position.x,
    );
    const normalizedAngle = (angle + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.floor(
      normalizedAngle / (Math.PI * 2 / AIR_ESCAPE_DIRECTION_SECTORS),
    );
    if (!selected.has(sector)) {
      selected.set(sector, candidate);
    }
    if (selected.size >= maximumResults) {
      break;
    }
  }
  return [...selected.values()];
}

function selectStableSurfaceEscapeColumns(
  columns: readonly BeatGameSurfaceColumn[],
  position: BeatGamePosition,
): readonly {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
}[] {
  return selectSurfaceEscapeColumns(
    stableSurfaceColumns(columns),
    position,
  );
}

function selectStableThreatEscapeColumn(
  columns: readonly BeatGameSurfaceColumn[],
  player: BeatGamePosition,
  threat: BeatGamePosition,
  maximumVerticalDistance = MAXIMUM_DAMAGE_FREE_FALL_DISTANCE,
): {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
} | undefined {
  const awayX = player.x - threat.x;
  const awayZ = player.z - threat.z;
  const awayLength = Math.hypot(awayX, awayZ);
  const directionX = awayLength > 0.001 ? awayX / awayLength : 1;
  const directionZ = awayLength > 0.001 ? awayZ / awayLength : 0;
  const currentThreatDistanceSquared = distanceSquared(player, threat);
  return stableSurfaceColumns(columns).flatMap((candidate) => {
    const candidateX = candidate.x + 0.5;
    const candidateY = candidate.surfaceY + 1;
    const candidateZ = candidate.z + 0.5;
    const movementX = candidateX - player.x;
    const movementZ = candidateZ - player.z;
    const movementDistance = Math.hypot(movementX, movementZ);
    const alignment = movementDistance > 0.001
      ? (movementX * directionX + movementZ * directionZ) / movementDistance
      : -1;
    const threatDistanceSquared = distanceSquared(
      {
        x: candidateX,
        y: candidateY,
        z: candidateZ,
      },
      threat,
    );
    return movementDistance >= 3
        && alignment >= 0.25
        && Math.abs(candidateY - player.y) <= maximumVerticalDistance
        && threatDistanceSquared > currentThreatDistanceSquared + 4
      ? [{
        ...candidate,
        alignment,
        threatDistanceSquared,
        movementDistance,
      }]
      : [];
  }).sort((left, right) =>
    right.threatDistanceSquared - left.threatDistanceSquared
      || right.alignment - left.alignment
      || left.movementDistance - right.movementDistance
  )[0];
}

function stableSurfaceColumns(
  columns: readonly BeatGameSurfaceColumn[],
): readonly (BeatGameSurfaceColumn & { readonly surfaceY: number })[] {
  const safeColumns = columns.flatMap((column) =>
    column.loaded
      && column.surfaceY !== undefined
      && !isUnsafeSurfaceBlock(column.blockId)
      ? [{ ...column, surfaceY: column.surfaceY }]
      : []
  );
  const columnsByPosition = new Map(
    safeColumns.map((column) => [`${column.x}:${column.z}`, column]),
  );
  return safeColumns.filter((candidate) => {
    let stableNeighbors = 0;
    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      for (let deltaZ = -1; deltaZ <= 1; deltaZ += 1) {
        if (deltaX === 0 && deltaZ === 0) {
          continue;
        }
        const neighbor = columnsByPosition.get(
          `${candidate.x + deltaX}:${candidate.z + deltaZ}`,
        );
        if (
          neighbor !== undefined
          && Math.abs(neighbor.surfaceY - candidate.surfaceY)
            <= SURFACE_NEIGHBOR_MAX_HEIGHT_DELTA
        ) {
          stableNeighbors += 1;
        }
      }
    }
    return stableNeighbors >= MINIMUM_STABLE_SURFACE_NEIGHBORS;
  });
}

function selectElevatedSurfaceColumns(
  columns: readonly {
    readonly x: number;
    readonly z: number;
    readonly loaded: boolean;
    readonly surfaceY?: number;
    readonly blockId?: string;
  }[],
  position: BeatGamePosition,
): readonly {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
}[] {
  const safeColumns = columns.flatMap((column) =>
    column.loaded
      && column.surfaceY !== undefined
      && !isUnsafeSurfaceBlock(column.blockId)
      ? [{ x: column.x, z: column.z, surfaceY: column.surfaceY }]
      : []
  );
  return safeColumns.filter((candidate) =>
    candidate.surfaceY - position.y > 2
    && safeColumns.filter((neighbor) =>
        neighbor !== candidate
        && Math.abs(neighbor.x - candidate.x) <= 1
        && Math.abs(neighbor.z - candidate.z) <= 1
        && Math.abs(neighbor.surfaceY - candidate.surfaceY)
          <= SURFACE_NEIGHBOR_MAX_HEIGHT_DELTA
      ).length >= MINIMUM_STABLE_SURFACE_NEIGHBORS
  ).sort((left, right) =>
    right.surfaceY - left.surfaceY
      || surfaceHorizontalDistanceSquared(left, position)
        - surfaceHorizontalDistanceSquared(right, position)
  ).slice(0, AIR_ESCAPE_DIRECTION_SECTORS);
}

function surfaceHorizontalDistanceSquared(
  surface: { readonly x: number; readonly z: number },
  position: BeatGamePosition,
): number {
  const deltaX = surface.x + 0.5 - position.x;
  const deltaZ = surface.z + 0.5 - position.z;
  return deltaX * deltaX + deltaZ * deltaZ;
}

function isUnsafeSurfaceBlock(blockId: string | undefined): boolean {
  return blockId === undefined
    || (PLAYER_FLUID_BLOCK_IDS as readonly string[]).includes(blockId)
    || blockId === "minecraft:lily_pad"
    || blockId === "minecraft:powder_snow"
    || blockId.endsWith("_leaves");
}

function isSwimmableSurfaceBlock(blockId: string | undefined): boolean {
  return blockId !== undefined
    && blockId !== "minecraft:lava"
    && (PLAYER_FLUID_BLOCK_IDS as readonly string[]).includes(blockId);
}

function explorationPurpose(
  purpose: string,
  position: BeatGamePosition,
  rotation?: number,
): string {
  const cellX = Math.floor(position.x / 32);
  const cellZ = Math.floor(position.z / 32);
  const prefix = `${purpose.slice(0, 40)}:${cellX}:${cellZ}`;
  return rotation === undefined
    ? prefix
    : `${purpose.slice(0, 24)}:${cellX}:${cellZ}:${rotation}`;
}

function advanceExplorationFrontier(
  state: RunState,
  position: BeatGamePosition,
  purpose: string,
  scanRadius: number,
  path: BeatGameStrategy["path"],
  preferSurface = true,
  allowFluidFallback = true,
): Effect.Effect<void, BeatGameDriverError> {
  const key = `${position.dimension}:${purpose}`;
  const hop = discoveryHopRadius(state, scanRadius);
  return Ref.get(state.checkpoint).pipe(
    Effect.flatMap((checkpoint) =>
      Ref.modify(state.explorationFrontiers, (frontiers) => {
        const existing = frontiers[key];
        const wasExternallyDisplaced = existing?.lastPosition !== undefined
          && horizontalDistanceSquared(existing.lastPosition, position)
            > EXPLORATION_REANCHOR_DISTANCE
              * EXPLORATION_REANCHOR_DISTANCE;
        const shouldReanchor = wasExternallyDisplaced
          && !isRecentDeathDisplacement(
            existing.lastPosition,
            checkpoint.memory.latestDeath,
          );
        const totalAdvances = existing?.totalAdvances
          ?? Math.max(0, (existing?.nextIndex ?? 1) - 1);
        const nextIndex = Math.max(
          existing?.nextIndex ?? 1,
          totalAdvances + 1,
        );
        const frontier = existing?.origin.dimension === position.dimension
            && !shouldReanchor
          ? { ...existing, nextIndex, totalAdvances }
          : { origin: position, nextIndex, totalAdvances };
        const offset = squareSpiralOffset(frontier.nextIndex);
        const target = {
          x: frontier.origin.x + offset.x * hop,
          z: frontier.origin.z + offset.z * hop,
        };
        return [
          target,
          retainExplorationFrontier(frontiers, key, {
            origin: frontier.origin,
            nextIndex: frontier.nextIndex + 1,
            totalAdvances: frontier.totalAdvances + 1,
          }),
        ] as const;
      })
    ),
    Effect.flatMap((target) =>
      pathfindExplorationTarget(
        state,
        position,
        target,
        2,
        path,
        preferSurface,
        allowFluidFallback,
      ).pipe(
        Effect.catchAll((cause) =>
          preferSurface
            && (
              cause.operation === "pathfind"
              || cause.operation === "pathfindXZ"
            )
            ? recoverSurfaceAfterExplorationFailure(state, cause)
            : Effect.fail(cause)
        ),
        Effect.ensuring(
          state.driver.observe.pipe(
            Effect.flatMap((observation) =>
              Ref.modify(state.explorationFrontiers, (frontiers) => {
                const frontier = frontiers[key];
                return frontier === undefined
                  ? [frontiers, frontiers] as const
                  : (() => {
                    const updated = retainExplorationFrontier(
                      frontiers,
                      key,
                      {
                        ...frontier,
                        lastPosition: observation.player.position,
                      },
                    );
                    return [updated, updated] as const;
                  })();
              })
            ),
            Effect.flatMap((frontiers) =>
              persist(state, (checkpoint) => ({
                ...checkpoint,
                memory: {
                  ...checkpoint.memory,
                  explorationFrontiers: frontiers,
                },
              }))
            ),
            Effect.ignore,
          ),
        ),
      )
    ),
  );
}

function retainExplorationFrontier(
  frontiers: Readonly<Record<string, BeatGameExplorationFrontier>>,
  key: string,
  frontier: BeatGameExplorationFrontier,
): Readonly<Record<string, BeatGameExplorationFrontier>> {
  const entries = Object.entries(frontiers)
    .filter(([candidate]) => candidate !== key)
    .slice(-(EXPLORATION_FRONTIER_LIMIT - 1));
  return Object.fromEntries([...entries, [key, frontier]]);
}

function isRecentDeathDisplacement(
  previousPosition: BeatGamePosition,
  latestDeath: BeatGameMemoryEntry<BeatGamePosition> | undefined,
): boolean {
  if (
    latestDeath === undefined
    || latestDeath.value.dimension !== previousPosition.dimension
    || horizontalDistanceSquared(latestDeath.value, previousPosition)
      > EXPLORATION_REANCHOR_DISTANCE ** 2
  ) {
    return false;
  }
  const deathAgeMs = Date.now() - Date.parse(latestDeath.observedAt);
  return Number.isFinite(deathAgeMs)
    && deathAgeMs >= 0
    && deathAgeMs <= EXPLORATION_DEATH_DISPLACEMENT_WINDOW_MS;
}

function pathfindExplorationTarget(
  state: RunState,
  position: BeatGamePosition,
  target: { readonly x: number; readonly z: number },
  radius: number,
  path: BeatGameStrategy["path"],
  preferSurface: boolean,
  allowFluidFallback = true,
): Effect.Effect<void, BeatGameDriverError> {
  const deltaX = target.x - position.x;
  const deltaZ = target.z - position.z;
  const targetDistance = Math.hypot(deltaX, deltaZ);
  const legRatio = targetDistance <= EXPLORATION_MAXIMUM_LEG_DISTANCE
    ? 1
    : EXPLORATION_MAXIMUM_LEG_DISTANCE / targetDistance;
  const legTarget = {
    x: position.x + deltaX * legRatio,
    z: position.z + deltaZ * legRatio,
  };
  const navigate = (
    policy: BeatGameStrategy["path"],
  ): Effect.Effect<void, BeatGameDriverError> => {
    if (!preferSurface) {
      return state.driver.pathfind(
        {
          x: legTarget.x,
          y: position.y,
          z: legTarget.z,
          dimension: position.dimension,
        },
        radius,
        policy,
      );
    }
    if (position.dimension !== "minecraft:overworld") {
      return state.driver.pathfindXZ(
        legTarget.x,
        legTarget.z,
        position.dimension,
        radius,
        policy,
      );
    }
    const targetCenter = {
      x: legTarget.x,
      y: position.y,
      z: legTarget.z,
      dimension: position.dimension,
    };
    return state.driver.sampleSurface(targetCenter, 4, 1).pipe(
      Effect.map((columns) =>
        selectSurfaceColumn(
          columns.filter((column) =>
            Math.abs(column.x + 0.5 - legTarget.x) <= 4
            && Math.abs(column.z + 0.5 - legTarget.z) <= 4
          ),
          targetCenter,
        )
      ),
      Effect.flatMap((surface) =>
        surface === undefined
            || Math.abs(surface.surfaceY + 1 - position.y)
              > EXPLORATION_MAXIMUM_SURFACE_ELEVATION_CHANGE
          ? state.driver.pathfindXZ(
            legTarget.x,
            legTarget.z,
            position.dimension,
            radius,
            policy,
          )
          : state.driver.pathfind(
            {
              x: surface.x + 0.5,
              y: surface.surfaceY + 1,
              z: surface.z + 0.5,
              dimension: position.dimension,
            },
            radius,
            policy,
          )
      ),
    );
  };
  const preferredRoute = navigate(path);
  return path.avoidFluids === true && allowFluidFallback
    ? preferredRoute.pipe(
      Effect.catchTag("BeatGameDriverError", (cause) =>
        cause.operation === "pathfind"
            || cause.operation === "pathfindXZ"
          ? navigate({ ...path, avoidFluids: false })
          : Effect.fail(cause)
      ),
    )
    : preferredRoute;
}

function recoverSurfaceAfterExplorationFailure(
  state: RunState,
  routeFailure: BeatGameDriverError,
): Effect.Effect<void, BeatGameDriverError> {
  return state.driver.observe.pipe(
    Effect.flatMap((observation) =>
      needsOverworldSurfaceRecovery(
        state,
        observation.player.position,
      ).pipe(
        Effect.flatMap((needsRecovery) =>
          needsRecovery
            ? escapeToOverworldSurface(state, observation.player.position)
            : isPlayerInFluid(
              state.driver,
              observation.player.position,
            ).pipe(
              Effect.flatMap((inFluid) =>
                inFluid
                  ? swimToNearbyDrySurface(state).pipe(Effect.asVoid)
                  : Effect.fail(new BeatGameDriverError({
                    operation: routeFailure.operation,
                    ...(routeFailure.code === undefined
                      ? {}
                      : { code: routeFailure.code }),
                    retryable: true,
                    message: routeFailure.message,
                    cause: routeFailure,
                  }))
              ),
            )
        ),
      )
    ),
  );
}

function squareSpiralOffset(index: number): {
  readonly x: number;
  readonly z: number;
} {
  if (index <= 0) {
    return { x: 0, z: 0 };
  }
  let x = 0;
  let z = 0;
  let deltaX = 1;
  let deltaZ = 0;
  let segmentLength = 1;
  let segmentProgress = 0;
  let segmentsAtLength = 0;
  for (let step = 0; step < index; step += 1) {
    x += deltaX;
    z += deltaZ;
    segmentProgress += 1;
    if (segmentProgress < segmentLength) {
      continue;
    }
    segmentProgress = 0;
    [deltaX, deltaZ] = [-deltaZ, deltaX];
    segmentsAtLength += 1;
    if (segmentsAtLength === 2) {
      segmentsAtLength = 0;
      segmentLength += 1;
    }
  }
  return { x, z };
}

function discoveryHopRadius(
  state: RunState,
  scanRadius: number,
): number {
  return Math.max(
    8,
    Math.min(
      64,
      state.strategy.explorationRadius,
      Math.floor(scanRadius / 2),
    ),
  );
}

function acquireEnderPearls(
  state: RunState,
  observation: BeatGameObservation,
  missing: number,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  return Effect.gen(function* () {
    const endermen = yield* state.driver.queryEntities({
      origin: observation.player.position,
      radius: state.strategy.entitySearchRadius,
      selector: {
        entityTypes: ["minecraft:enderman"],
        alive: true,
      },
      maximumResults: Math.max(1, missing),
    });
    if (endermen.length > 0) {
      yield* huntOrExplore(
        state,
        observation,
        {
          entityTypes: ["minecraft:enderman"],
          alive: true,
        },
        missing,
        "hunt-endermen",
      );
      return;
    }

    const goldIngots =
      observation.inventory.counts["minecraft:gold_ingot"] ?? 0;
    if (goldIngots > 0) {
      const piglins = yield* state.driver.queryEntities({
        origin: observation.player.position,
        radius: state.strategy.entitySearchRadius,
        selector: {
          entityTypes: ["minecraft:piglin"],
          alive: true,
        },
        maximumResults: 1,
      });
      const piglin = piglins[0];
      if (piglin === undefined) {
        yield* explore(state.driver, {
          origin: observation.player.position,
          radius: discoveryHopRadius(
            state,
            state.strategy.entitySearchRadius,
          ),
          maximumWaypoints: 1,
          purpose: "find-bartering-piglin",
          path: state.strategy.path,
        });
        return;
      }
      yield* barterWithPiglin(
        state,
        piglin,
        Math.min(goldIngots, Math.max(1, missing * 2), 8),
      );
      return;
    }

    const nuggets =
      observation.inventory.counts["minecraft:gold_nugget"] ?? 0;
    if (nuggets >= 9) {
      yield* craftWithTable(
        state,
        observation,
        "minecraft:gold_ingot",
        Math.floor(nuggets / 9),
      );
      return;
    }

    yield* collectBlocks(state.driver, {
      blockIds: ["minecraft:nether_gold_ore"],
      count: Math.max(1, Math.min(
        state.strategy.targetGoldCount,
        Math.max(8, missing * 4),
      )),
      searchRadius: state.strategy.blockSearchRadius,
      path: state.strategy.path,
    });
  });
}

function barterWithPiglin(
  state: RunState,
  piglin: BeatGameEntityObservation,
  trades: number,
): Effect.Effect<void, BeatGameDriverError> {
  return state.driver.withControl(
    Effect.gen(function* () {
      yield* state.driver.pathfind(
        piglin.position,
        3,
        state.strategy.path,
      );
      yield* state.driver.act({
        type: "select-item",
        selector: { itemIds: ["minecraft:gold_ingot"] },
      });
      for (let trade = 0; trade < trades; trade += 1) {
        yield* state.driver.act({
          type: "interact-entity",
          connectionEpoch: piglin.connectionEpoch,
          networkId: piglin.networkId,
          hand: "main",
        });
        yield* Effect.sleep(6_500);
        const drops = yield* state.driver.queryEntities({
          origin: piglin.position,
          radius: 12,
          selector: {
            categories: [6],
            alive: true,
          },
          maximumResults: 64,
        });
        for (
          const pearl of drops.filter(({ itemId }) =>
            itemId === "minecraft:ender_pearl"
          )
        ) {
          yield* state.driver.pathfind(
            pearl.position,
            1,
            state.strategy.path,
          );
        }
      }
    }).pipe(
      Effect.ensuring(
        state.driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
      ),
    ),
  );
}

function craftWithTable(
  state: RunState,
  observation: BeatGameObservation,
  resultItemId: string,
  count: number,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const workstation = yield* ensureWorkstation(
      state,
      observation,
      "minecraft:crafting_table",
    );
    const current = yield* state.driver.observe;
    yield* ensureInventorySpace(state, current);
    yield* craftItem(state.driver, {
      resultItemId,
      count,
      station: workstation.position,
      path: state.strategy.path,
    });
  });
}

function ensureWorkstation(
  state: RunState,
  observation: BeatGameObservation,
  blockId: "minecraft:crafting_table" | "minecraft:furnace",
): Effect.Effect<
  PreparedWorkstation,
  BeatGameDriverError
> {
  return Effect.gen(function* () {
    if (
      yield* isPlayerInFluid(
        state.driver,
        observation.player.position,
      )
    ) {
      yield* emergencyAirAscent(state, observation.player.position);
      const recovered = yield* state.driver.observe;
      if (
        yield* isPlayerInFluid(
          state.driver,
          recovered.player.position,
        )
      ) {
        return yield* Effect.fail(new BeatGameDriverError({
          operation: "ensure-workstation",
          code: "unreachable",
          retryable: true,
          message: `The bot is still in fluid and cannot safely use a ${blockId}`,
        }));
      }
      return yield* ensureWorkstation(state, recovered, blockId);
    }
    const existing = (yield* state.driver.queryBlocks({
      center: observation.player.position,
      radius: WORKSTATION_REUSE_RADIUS,
      selector: { blockIds: [blockId] },
      maximumResults: 8,
    }))
      .filter(({ position }) =>
        position.dimension === observation.player.position.dimension
        && Math.abs(position.y - observation.player.position.y)
          <= WORKSTATION_REUSE_MAX_VERTICAL_DISTANCE
      )
      .sort((left, right) =>
        distanceSquared(left.position, observation.player.position)
        - distanceSquared(right.position, observation.player.position)
      );
    for (const candidate of existing) {
      const approached = yield* state.driver.pathfind(
        {
          x: candidate.position.x + 0.5,
          y: candidate.position.y,
          z: candidate.position.z + 0.5,
          dimension: candidate.position.dimension,
        },
        WORKSTATION_APPROACH_RADIUS,
        {
          ...state.strategy.path,
          allowMining: false,
          allowPlacing: false,
          avoidFluids: true,
          maxSearchTimeMs: Math.min(
            state.strategy.path.maxSearchTimeMs,
            WORKSTATION_REUSE_MAX_SEARCH_TIME_MS,
          ),
        },
      ).pipe(
        Effect.timeoutFail({
          duration: WORKSTATION_REUSE_TIMEOUT_MS,
          onTimeout: () => new BeatGameDriverError({
            operation: "pathfind",
            code: "unreachable",
            retryable: true,
            message: `Timed out approaching ${blockId} at ${candidate.position.x}, ${candidate.position.y}, ${candidate.position.z}`,
          }),
        }),
        Effect.either,
      );
      if (approached._tag === "Right") {
        const approachedObservation = yield* state.driver.observe;
        if (
          !(yield* isPlayerInFluid(
            state.driver,
            approachedObservation.player.position,
          ))
        ) {
          return {
            position: candidate.position,
            placed: false,
          };
        }
      }
    }
    const current = yield* state.driver.observe;
    const craftingTable = blockId === "minecraft:furnace"
      ? yield* ensureWorkstation(
        state,
        current,
        "minecraft:crafting_table",
      )
      : undefined;
    const placementObservation = craftingTable === undefined
      ? current
      : yield* state.driver.observe;
    const targets = yield* findWorkstationTargets(
      state.driver,
      placementObservation.player.position,
    );
    if ((placementObservation.inventory.counts[blockId] ?? 0) === 0) {
      yield* ensureInventorySpace(state, placementObservation);
      yield* craftItem(state.driver, {
        resultItemId: blockId,
        count: 1,
        ...(craftingTable === undefined
          ? {}
          : { station: craftingTable.position }),
        path: state.strategy.path,
      });
    }
    for (const target of targets) {
      const built = yield* buildStructure(state.driver, {
        origin: target,
        blocks: [{
          offset: { x: 0, y: 0, z: 0 },
          blockId,
        }],
        path: {
          ...state.strategy.path,
          avoidFluids: true,
        },
      }).pipe(Effect.either);
      if (built._tag === "Left") {
        continue;
      }
      let placed = yield* queryExactWorkstation(
        state.driver,
        target,
        blockId,
      );
      if (placed === undefined) {
        yield* placeWorkstationDirectly(
          state.driver,
          target,
          blockId,
        ).pipe(Effect.ignore);
        placed = yield* waitForWorkstation(
          state.driver,
          target,
          blockId,
        );
      }
      if (
        placed !== undefined
        && placed.position.x === target.x
        && placed.position.y === target.y
        && placed.position.z === target.z
        && placed.position.dimension === target.dimension
      ) {
        return {
          position: placed.position,
          placed: true,
        };
      }
    }
    return yield* Effect.fail(new BeatGameDriverError({
      operation: "ensure-workstation",
      retryable: true,
      message: `${blockId} could not be placed on any nearby support`,
    }));
  });
}

function ensureInventorySpace(
  state: RunState,
  observation: BeatGameObservation,
  minimumEmptySlots = 1,
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    let current = observation;
    const discardPath = (allowMining: boolean) => ({
      ...state.strategy.path,
      allowMining,
      allowPlacing: false,
      avoidFluids: true,
      maxSearchTimeMs: Math.min(
        state.strategy.path.maxSearchTimeMs,
        INVENTORY_DISCARD_ESCAPE_MAX_SEARCH_TIME_MS,
      ),
    });
    const tryRelativeDiscardPath = (
      origin: BeatGameObservation,
      distance: number,
      allowMining: boolean,
      yawOffsets: readonly number[] = [0, 90, -90, 180],
      baseYaw = origin.player.rotation.yaw,
    ) =>
      Effect.gen(function* () {
        for (const yawOffset of yawOffsets) {
          const yawRadians = (baseYaw + yawOffset) * Math.PI / 180;
          const escaped = yield* state.driver.pathfind({
            x: origin.player.position.x - Math.sin(yawRadians) * distance,
            y: origin.player.position.y,
            z: origin.player.position.z + Math.cos(yawRadians) * distance,
            dimension: origin.player.position.dimension,
          }, 0.75, discardPath(allowMining)).pipe(Effect.either);
          if (escaped._tag === "Right") {
            return true;
          }
        }
        return false;
      });
    const targetEmptySlots = Math.min(
      36,
      minimumEmptySlots + INVENTORY_EMPTY_SLOT_BUFFER,
    );
    let discardPocketYaw: number | undefined;
    let discardReturnTarget: BeatGamePosition | undefined;
    let cleanupFailure: BeatGameDriverError | undefined;
    let discardViewConfirmed = false;
    let discardedItems = false;
    while (
      current.inventory.emptyPlayerSlots !== undefined
      && current.inventory.emptyPlayerSlots < targetEmptySlots
    ) {
      if (discardPocketYaw === undefined) {
        const discardSiteOrigin = current.player.position;
        const relocated = yield* tryRelativeDiscardPath(
          current,
          INVENTORY_DISCARD_SITE_DISTANCE,
          true,
          [90, -90, 180, 0],
        );
        if (relocated) {
          current = yield* state.driver.observe;
        }
        if (current.inventory.emptyPlayerSlots === undefined) {
          return;
        }
        const discardSiteDistance = Math.hypot(
          current.player.position.x - discardSiteOrigin.x,
          current.player.position.z - discardSiteOrigin.z,
        );
        const discardSitePosition = current.player.position;
        if (
          relocated
          && discardSiteDistance > INVENTORY_DISCARD_ESCAPE_DISTANCE
        ) {
          discardReturnTarget = discardSiteOrigin;
          const corridorYaw = Math.atan2(
            -(discardSitePosition.x - discardSiteOrigin.x),
            discardSitePosition.z - discardSiteOrigin.z,
          ) * 180 / Math.PI;
          const pocketYaw = wrappedDegrees(
            Math.round((corridorYaw + 90) / 90) * 90,
          );
          const pocketYawRadians = pocketYaw * Math.PI / 180;
          const pocketStepX = Math.round(-Math.sin(pocketYawRadians));
          const pocketStepZ = Math.round(Math.cos(pocketYawRadians));
          const pocketOriginX = Math.floor(discardSitePosition.x);
          const pocketOriginY = Math.floor(discardSitePosition.y);
          const pocketOriginZ = Math.floor(discardSitePosition.z);
          for (
            let distance = 1;
            distance <= INVENTORY_DISCARD_POCKET_DEPTH;
            distance += 1
          ) {
            for (const yOffset of [1, 0]) {
              const position = {
                x: pocketOriginX + pocketStepX * distance,
                y: pocketOriginY + yOffset,
                z: pocketOriginZ + pocketStepZ * distance,
                dimension: discardSitePosition.dimension,
              };
              const blocks = yield* state.driver.queryBlocks({
                center: blockCenter(position),
                radius: 0.25,
                selector: { diggable: true },
                maximumResults: 1,
              });
              if (blocks.some((block) =>
                sameBlockPosition(block.position, position)
              )) {
                yield* state.driver.act({ type: "dig-block", position });
              }
            }
          }
          discardPocketYaw = pocketYaw;
        }
      }
      if (current.inventory.emptyPlayerSlots === undefined) {
        break;
      }
      if (discardPocketYaw === undefined) {
        cleanupFailure = new BeatGameDriverError({
          operation: "ensure-inventory-space",
          code: "unreachable",
          retryable: true,
          message: "Could not excavate an isolated inventory discard pocket",
        });
        break;
      }
      const discardItemId = INVENTORY_DISCARD_PRIORITY.find((itemId) =>
        (current.inventory.counts[itemId] ?? 0) > 0
      );
      const cobbledDeepslateCount =
        current.inventory.counts["minecraft:cobbled_deepslate"] ?? 0;
      const excessCobbledDeepslate =
        cobbledDeepslateCount - INVENTORY_BUILDING_BLOCK_RESERVE;
      const cobblestoneCount =
        current.inventory.counts["minecraft:cobblestone"] ?? 0;
      const itemId = discardItemId
        ?? (excessCobbledDeepslate >= 64
          ? "minecraft:cobbled_deepslate"
          : cobblestoneCount > 0
          ? "minecraft:cobblestone"
          : undefined);
      if (itemId === undefined) {
        if (current.inventory.emptyPlayerSlots >= minimumEmptySlots) {
          break;
        }
        cleanupFailure = new BeatGameDriverError({
          operation: "ensure-inventory-space",
          code: "resource-exhausted",
          retryable: true,
          message:
            `The player inventory needs ${minimumEmptySlots} empty slots and contains no disposable items`,
        });
        break;
      }
      const count = itemId === "minecraft:cobbled_deepslate"
        ? excessCobbledDeepslate
        : itemId === "minecraft:cobblestone"
        ? Math.min(64, cobblestoneCount)
        : current.inventory.counts[itemId] ?? 0;
      const itemCountBefore = current.inventory.counts[itemId] ?? 0;
      const emptySlotsBefore = current.inventory.emptyPlayerSlots;
      if (!discardViewConfirmed) {
        yield* state.driver.act({
          type: "look",
          yaw: discardPocketYaw,
          pitch: 0,
        });
        yield* waitForViewRotation(
          state.driver,
          discardPocketYaw,
          0,
          20,
        );
        discardViewConfirmed = true;
      }
      yield* state.driver.act({
        type: "toss-items",
        selector: { itemIds: [itemId] },
        count,
      });
      discardedItems = true;
      let observedProgress = false;
      let itemCountReduced = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        current = yield* state.driver.observe;
        itemCountReduced = itemCountReduced
          || (current.inventory.counts[itemId] ?? 0) < itemCountBefore;
        if (
          current.inventory.emptyPlayerSlots === undefined
          || (
            itemCountReduced
            && (
              current.inventory.emptyPlayerSlots > emptySlotsBefore
              || attempt >= 2
            )
          )
        ) {
          observedProgress = true;
          break;
        }
        yield* Effect.sleep(
          Math.max(50, state.strategy.observationPollMs),
        );
      }
      if (!observedProgress) {
        cleanupFailure = new BeatGameDriverError({
          operation: "ensure-inventory-space",
          code: "resource-exhausted",
          retryable: true,
          message: `Tossing ${itemId} did not reduce its inventory count`,
        });
        break;
      }
    }
    if (discardReturnTarget !== undefined) {
      yield* state.driver.pathfind(
        discardReturnTarget,
        0.75,
        discardPath(false),
      ).pipe(Effect.ignore);
    }
    if (discardedItems && cleanupFailure === undefined) {
      let stableObservations = 0;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        current = yield* state.driver.observe;
        if (current.inventory.emptyPlayerSlots === undefined) {
          stableObservations = INVENTORY_EMPTY_SLOT_STABILITY_OBSERVATIONS;
          break;
        }
        if (current.inventory.emptyPlayerSlots >= minimumEmptySlots) {
          stableObservations += 1;
        } else {
          stableObservations = 0;
        }
        if (
          stableObservations
            >= INVENTORY_EMPTY_SLOT_STABILITY_OBSERVATIONS
        ) {
          break;
        }
        yield* Effect.sleep(
          Math.max(50, state.strategy.observationPollMs),
        );
      }
      if (
        current.inventory.emptyPlayerSlots !== undefined
        && stableObservations
          < INVENTORY_EMPTY_SLOT_STABILITY_OBSERVATIONS
      ) {
        cleanupFailure = new BeatGameDriverError({
          operation: "ensure-inventory-space",
          code: "resource-exhausted",
          retryable: true,
          message: "Discarded items were picked up again after cleanup",
        });
      }
    }
    if (cleanupFailure !== undefined) {
      return yield* Effect.fail(cleanupFailure);
    }
  });
}

function placeWorkstationDirectly(
  driver: BeatGameDriver,
  target: BeatGameBlockPosition,
  blockId: "minecraft:crafting_table" | "minecraft:furnace",
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const targetBlock = (yield* driver.queryBlocks({
      center: blockCenter(target),
      radius: 0.25,
      selector: {},
      maximumResults: 1,
    }))[0];
    if (targetBlock !== undefined && !targetBlock.replaceable) {
      yield* driver.act({ type: "dig-block", position: target });
    }
    const cleared = (yield* driver.queryBlocks({
      center: blockCenter(target),
      radius: 0.25,
      selector: { replaceable: true },
      maximumResults: 1,
    })).some(({ position }) => sameBlockPosition(position, target));
    if (!cleared) {
      return yield* Effect.fail(new BeatGameDriverError({
        operation: "place-workstation",
        retryable: true,
        message: `Could not clear a local position for ${blockId}`,
      }));
    }
    yield* driver.act({
      type: "select-item",
      selector: { itemIds: [blockId] },
    });
    yield* driver.act({
      type: "place-block",
      against: {
        ...target,
        y: target.y - 1,
      },
      face: "up",
      hand: "main",
    });
  });
}

function waitForWorkstation(
  driver: BeatGameDriver,
  target: BeatGameBlockPosition,
  blockId: "minecraft:crafting_table" | "minecraft:furnace",
): Effect.Effect<
  BeatGameBlockObservation | undefined,
  BeatGameDriverError
> {
  return Effect.gen(function* () {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const workstation = yield* queryExactWorkstation(
        driver,
        target,
        blockId,
      );
      if (workstation !== undefined) {
        return workstation;
      }
      yield* Effect.sleep(50);
    }
    return undefined;
  });
}

function queryExactWorkstation(
  driver: BeatGameDriver,
  target: BeatGameBlockPosition,
  blockId: "minecraft:crafting_table" | "minecraft:furnace",
): Effect.Effect<
  BeatGameBlockObservation | undefined,
  BeatGameDriverError
> {
  return driver.queryBlocks({
    center: blockCenter(target),
    radius: 0.25,
    selector: { blockIds: [blockId] },
    maximumResults: 1,
  }).pipe(
    Effect.map((blocks) =>
      blocks.find(({ position }) => sameBlockPosition(position, target))
    ),
  );
}

function blockCenter(
  position: BeatGameBlockPosition,
): BeatGamePosition {
  return {
    x: position.x + 0.5,
    y: position.y + 0.5,
    z: position.z + 0.5,
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

function findWorkstationTargets(
  driver: BeatGameDriver,
  position: BeatGamePosition,
): Effect.Effect<readonly BeatGameBlockPosition[], BeatGameDriverError> {
  return Effect.gen(function* () {
    const playerBlock = {
      x: Math.floor(position.x),
      y: Math.floor(position.y),
      z: Math.floor(position.z),
    };
    const supports = yield* driver.queryBlocks({
      center: position,
      radius: 4,
      selector: { replaceable: false },
      maximumResults: 256,
    });
    const candidates = supports
      .map(({ position: support }) => ({
        x: support.x,
        y: support.y + 1,
        z: support.z,
        dimension: support.dimension,
      }))
      .filter((candidate) =>
        candidate.dimension === position.dimension
        && !(
          candidate.x === playerBlock.x
          && candidate.z === playerBlock.z
          && (
            candidate.y === playerBlock.y
            || candidate.y === playerBlock.y - 1
            || candidate.y === playerBlock.y + 1
          )
        )
      )
      .sort((left, right) =>
        workstationDistanceSquared(left, position)
        - workstationDistanceSquared(right, position)
      )
      .slice(0, 64);
    const available: BeatGameBlockPosition[] = [];
    const clearable: BeatGameBlockPosition[] = [];
    for (const candidate of candidates) {
      if (yield* hasFluidAt(driver, candidate)) {
        continue;
      }
      const replaceable = yield* driver.queryBlocks({
        center: {
          x: candidate.x + 0.5,
          y: candidate.y + 0.5,
          z: candidate.z + 0.5,
          dimension: candidate.dimension,
        },
        radius: 0.25,
        selector: { replaceable: true },
        maximumResults: 1,
      });
      if (replaceable.some(({ position: observed }) =>
        observed.x === candidate.x
        && observed.y === candidate.y
        && observed.z === candidate.z
        && observed.dimension === candidate.dimension
      )) {
        available.push(candidate);
        if (available.length >= 16) {
          break;
        }
        continue;
      }
      const diggable = yield* driver.queryBlocks({
        center: {
          x: candidate.x + 0.5,
          y: candidate.y + 0.5,
          z: candidate.z + 0.5,
          dimension: candidate.dimension,
        },
        radius: 0.25,
        selector: {
          diggable: true,
          interactive: false,
        },
        maximumResults: 1,
      });
      if (diggable.some(({ position: observed }) =>
        observed.x === candidate.x
        && observed.y === candidate.y
        && observed.z === candidate.z
        && observed.dimension === candidate.dimension
      )) {
        clearable.push(candidate);
      }
    }
    return available.length > 0
      ? available
      : clearable.length > 0
      ? clearable.slice(0, 16)
      : yield* Effect.fail(new BeatGameDriverError({
        operation: "find-workstation-targets",
        retryable: true,
        message:
          "No supported open or diggable block is available for a workstation",
      }));
  });
}

function hasFluidAt(
  driver: BeatGameDriver,
  position: BeatGameBlockPosition,
): Effect.Effect<boolean, BeatGameDriverError> {
  return driver.queryBlocks({
    center: blockCenter(position),
    radius: 0.25,
    selector: { blockIds: PLAYER_FLUID_BLOCK_IDS },
    maximumResults: 1,
  }).pipe(
    Effect.map((blocks) =>
      blocks.some(({ position: observed }) =>
        sameBlockPosition(observed, position)
      )
    ),
  );
}

function workstationDistanceSquared(
  target: BeatGameBlockPosition,
  player: BeatGamePosition,
): number {
  const dx = target.x + 0.5 - player.x;
  const dy = target.y - player.y;
  const dz = target.z + 0.5 - player.z;
  return dx * dx + dy * dy + dz * dz;
}

function moveToEyeBaseline(
  state: RunState,
): Effect.Effect<void, BeatGameError | BeatGameDriverError> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    const latest = checkpoint.memory.eyeSamples.at(-1);
    if (latest === undefined) {
      return;
    }
    const baseline = Math.max(32, Math.min(
      192,
      state.strategy.explorationRadius,
    ));
    yield* state.driver.pathfind({
      x: latest.origin.x - latest.direction.z * baseline,
      y: latest.origin.y,
      z: latest.origin.z + latest.direction.x * baseline,
      dimension: latest.origin.dimension,
    }, 4, state.strategy.path);
  });
}

function enterKnownPortal(
  state: RunState,
  checkpoint: BeatGameCheckpoint,
  observation: BeatGameObservation,
): Effect.Effect<boolean, BeatGameError | BeatGameDriverError> {
  return Effect.gen(function* () {
    const nearby = yield* state.driver.queryBlocks({
      center: observation.player.position,
      radius: 48,
      selector: { blockIds: ["minecraft:nether_portal"] },
      maximumResults: 16,
    });
    const immediate = nearby[0];
    if (immediate !== undefined) {
      yield* enterPortal(state.driver, {
        portal: immediate.position,
        path: state.strategy.path,
      });
      return true;
    }

    const remembered = checkpoint.memory.portals
      .filter(({ value }) =>
        value.position.dimension
          === observation.player.position.dimension
      )
      .sort((left, right) =>
        right.confidence - left.confidence
        || Date.parse(right.observedAt) - Date.parse(left.observedAt)
      );
    for (const memory of remembered) {
      const approached = yield* state.driver.pathfind(
        memory.value.position,
        8,
        state.strategy.path,
      ).pipe(Effect.either);
      if (approached._tag === "Left") {
        continue;
      }
      const revalidated = yield* state.driver.queryBlocks({
        center: memory.value.position,
        radius: 8,
        selector: { blockIds: ["minecraft:nether_portal"] },
        maximumResults: 16,
      });
      const portal = revalidated[0];
      if (portal === undefined) {
        continue;
      }
      yield* enterPortal(state.driver, {
        portal: portal.position,
        path: state.strategy.path,
      });
      return true;
    }
    return false;
  });
}

function searchStronghold(
  state: RunState,
): Effect.Effect<boolean, BeatGameError | BeatGameDriverError> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    const estimate = checkpoint.memory.strongholdEstimate;
    if (estimate === undefined) {
      return false;
    }
    let approachObservation = yield* state.driver.observe;
    const surveyPortalFrames = state.driver.queryBlocks({
      center: {
        ...estimate,
        y: 32,
      },
      radius: Math.min(
        128,
        Math.max(64, state.strategy.blockSearchRadius),
      ),
      selector: { blockIds: ["minecraft:end_portal_frame"] },
      maximumResults: 12,
    });
    let surveyedFrames = yield* surveyPortalFrames;
    if (surveyedFrames.length === 0) {
      yield* state.driver.pathfind({
        ...estimate,
        y: Math.floor(approachObservation.player.position.y),
      }, 16, state.strategy.path);
      approachObservation = yield* state.driver.observe;
      surveyedFrames = yield* surveyPortalFrames;
    }
    if (surveyedFrames.length > 0) {
      yield* approachStrongholdPortalRoom(
        state,
        surveyedFrames,
        estimate,
        approachObservation.player.position,
      );
      return true;
    }
    const undergroundTarget = {
      ...estimate,
      y: Math.min(32, estimate.y - 24),
    };
    yield* state.driver.pathfind(
      undergroundTarget,
      16,
      state.strategy.path,
    );
    const observation = yield* state.driver.observe;
    const frames = yield* state.driver.queryBlocks({
      center: observation.player.position,
      radius: 96,
      selector: { blockIds: ["minecraft:end_portal_frame"] },
      maximumResults: 12,
    });
    if (frames.length > 0) {
      yield* approachStrongholdPortalRoom(
        state,
        frames,
        estimate,
        observation.player.position,
      );
      return true;
    }
    yield* explore(state.driver, {
      origin: {
        x: Math.floor(observation.player.position.x),
        y: Math.floor(observation.player.position.y),
        z: Math.floor(observation.player.position.z),
        dimension: observation.player.position.dimension,
      },
      radius: 96,
      maximumWaypoints: 2,
      purpose: "find-stronghold-portal",
      path: state.strategy.path,
    });
    return false;
  });
}

function approachStrongholdPortalRoom(
  state: RunState,
  frames: readonly BeatGameBlockObservation[],
  estimate: BeatGamePosition,
  currentPosition: BeatGamePosition,
): Effect.Effect<void, BeatGameDriverError> {
  const destination = strongholdEntryPosition(frames, estimate);
  const current = floorBlockPosition(currentPosition);
  const depth = current.y - destination.y;
  if (depth <= 0) {
    return state.driver.pathfind(
      destination,
      4,
      state.strategy.path,
    );
  }
  return excavateStaircase(state.driver, {
    from: staircaseStartPosition(destination, current),
    to: destination,
    path: state.strategy.path,
    openSpaceHandoffRadius: 1,
  });
}

function staircaseStartPosition(
  destination: BeatGameBlockPosition,
  current: BeatGameBlockPosition,
): BeatGameBlockPosition {
  const depth = current.y - destination.y;
  let x = current.x;
  let z = current.z;
  let xDistance = Math.abs(destination.x - x);
  let zDistance = Math.abs(destination.z - z);
  let excessDistance = xDistance + zDistance - depth;
  if (excessDistance > 0) {
    const xReduction = Math.min(xDistance, excessDistance);
    x += Math.sign(destination.x - x) * xReduction;
    xDistance -= xReduction;
    excessDistance -= xReduction;
    const zReduction = Math.min(zDistance, excessDistance);
    z += Math.sign(destination.z - z) * zReduction;
    zDistance -= zReduction;
  }
  if ((depth - xDistance - zDistance) % 2 !== 0) {
    if (xDistance > 0) {
      x += Math.sign(destination.x - x);
    } else if (zDistance > 0) {
      z += Math.sign(destination.z - z);
    } else {
      x += 1;
    }
  }
  return {
    x,
    y: current.y,
    z,
    dimension: destination.dimension,
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

function strongholdEntryPosition(
  frames: readonly BeatGameBlockObservation[],
  origin: BeatGamePosition,
): BeatGameBlockPosition {
  const minimumX = Math.min(...frames.map(({ position }) => position.x));
  const maximumX = Math.max(...frames.map(({ position }) => position.x));
  const minimumY = Math.min(...frames.map(({ position }) => position.y));
  const minimumZ = Math.min(...frames.map(({ position }) => position.z));
  const maximumZ = Math.max(...frames.map(({ position }) => position.z));
  const centerX = Math.round((minimumX + maximumX) / 2);
  const centerZ = Math.round((minimumZ + maximumZ) / 2);
  const dimension = frames[0]?.position.dimension ?? origin.dimension;
  const candidates: readonly BeatGameBlockPosition[] = [
    {
      x: centerX,
      y: minimumY + 1,
      z: minimumZ - 2,
      dimension,
    },
    {
      x: centerX,
      y: minimumY + 1,
      z: maximumZ + 2,
      dimension,
    },
    {
      x: minimumX - 2,
      y: minimumY + 1,
      z: centerZ,
      dimension,
    },
    {
      x: maximumX + 2,
      y: minimumY + 1,
      z: centerZ,
      dimension,
    },
  ];
  return candidates.reduce((nearest, candidate) =>
      horizontalDistanceSquared(candidate, origin)
          < horizontalDistanceSquared(nearest, origin)
        ? candidate
        : nearest
  );
}

function horizontalDistanceSquared(
  left: Pick<BeatGamePosition, "x" | "z">,
  right: Pick<BeatGamePosition, "x" | "z">,
): number {
  return (left.x - right.x) ** 2 + (left.z - right.z) ** 2;
}

function directedHuntRouteCost(
  candidate: BeatGamePosition,
  origin: BeatGamePosition,
  destination?: BeatGamePosition,
): number {
  const approachDistance = Math.sqrt(
    horizontalDistanceSquared(candidate, origin),
  );
  if (
    destination === undefined
    || destination.dimension !== origin.dimension
    || candidate.dimension !== origin.dimension
  ) {
    return approachDistance;
  }
  return approachDistance + Math.sqrt(
    horizontalDistanceSquared(candidate, destination),
  );
}

function huntingTargetRouteCost(
  candidate: BeatGameEntityObservation,
  origin: BeatGamePosition,
  destination?: BeatGamePosition,
): number {
  const routeCost = directedHuntRouteCost(
    candidate.position,
    origin,
    destination,
  );
  return AQUATIC_FOOD_ENTITY_TYPES.has(candidate.entityType)
    ? routeCost
      + Math.abs(candidate.position.y - origin.y)
        * AQUATIC_HUNT_VERTICAL_ROUTE_COST
      + Math.max(0, candidate.health ?? AQUATIC_HUNT_DEFAULT_HEALTH)
        * AQUATIC_HUNT_HEALTH_ROUTE_COST
    : routeCost;
}

function isWithinDirectedHuntDetour(
  origin: BeatGamePosition,
  candidate: BeatGamePosition,
  destination?: BeatGamePosition,
): boolean {
  if (
    destination === undefined
    || destination.dimension !== origin.dimension
    || candidate.dimension !== origin.dimension
  ) {
    return true;
  }
  const directDistance = Math.sqrt(
    horizontalDistanceSquared(origin, destination),
  );
  return directedHuntRouteCost(candidate, origin, destination)
    <= directDistance + DIRECTED_HUNT_MAXIMUM_DETOUR;
}

function fightDragon(
  state: RunState,
): Effect.Effect<ActionResult, BeatGameDriverError> {
  return Effect.gen(function* () {
    yield* fightEnderDragon(state.driver, {
      searchRadius: 320,
      path: state.strategy.path,
    });
    return { phase: BeatGamePhase.COLLECT_DRAGON_EGG };
  });
}

function advancePhase(
  state: RunState,
  phase: BeatGamePhase,
): Effect.Effect<void, BeatGameError> {
  return Effect.gen(function* () {
    const current = yield* Ref.get(state.checkpoint);
    if (current.planner.phase === phase) {
      return;
    }
    yield* persist(state, (checkpoint) => ({
      ...checkpoint,
      planner: withoutCurrentAction({
        ...checkpoint.planner,
        phase,
        objective: objectiveForPhase(phase),
        requirements: [],
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      }),
    }));
    yield* state.coordinator.updateMember(
      current.teamId,
      current.botId,
      phase,
      BeatGameRunStatus.RUNNING,
    );
    yield* emit(state, {
      type: "phase-changed",
      previous: current.planner.phase,
      current: phase,
    });
    yield* emit(state, {
      type: "objective-changed",
      objective: objectiveForPhase(phase),
    });
  });
}

function completeRun(
  state: RunState,
): Effect.Effect<BeatGameResult, BeatGameError> {
  return Effect.gen(function* () {
    const completedAt = new Date().toISOString();
    const finalCheckpoint = yield* persist(state, (checkpoint) => ({
      ...checkpoint,
      planner: withoutCurrentAction({
        ...checkpoint.planner,
        status: BeatGameRunStatus.COMPLETED,
        objective: objectiveForPhase(BeatGamePhase.COMPLETE),
        updatedAt: completedAt,
      }),
    }));
    yield* state.coordinator.updateMember(
      finalCheckpoint.teamId,
      finalCheckpoint.botId,
      BeatGamePhase.COMPLETE,
      BeatGameRunStatus.COMPLETED,
    );
    yield* emit(state, { type: "run-completed" });
    return {
      runId: finalCheckpoint.runId,
      teamId: finalCheckpoint.teamId,
      instanceId: finalCheckpoint.instanceId,
      botId: finalCheckpoint.botId,
      completedAt,
      durationMs: Date.now() - state.startedAtMs,
      finalCheckpoint,
    };
  });
}

function observeFresh(
  state: RunState,
): Effect.Effect<BeatGameObservation, BeatGameError> {
  return Effect.gen(function* () {
    const observation = yield* observeDriverFresh(state);
    const pendingDeath = yield* Ref.modify(
      state.pendingDeaths,
      (pendingDeaths) => {
        const recoverableDeaths = pendingDeaths.filter(
          isPendingDeathRecoverable,
        );
        return [recoverableDeaths.at(-1), recoverableDeaths] as const;
      },
    );
    if (pendingDeath === undefined) {
      return observation;
    }
    if (
      !observation.player.dead
      && observation.player.food <= CRITICAL_HUNGER_FOOD_LEVEL
    ) {
      return observation;
    }
    return {
      ...observation,
      observedAt: pendingDeath.observedAt,
      player: {
        ...observation.player,
        position: pendingDeath.position,
        health: 0,
        dead: true,
      },
    };
  });
}

function hasMeaningfulRecoveryInventory(
  observation: BeatGameObservation,
): boolean {
  return classifyDeathRecoveryInventory(observation.inventory.counts)
    !== "trivial";
}

function hasMeleeWeapon(observation: BeatGameObservation): boolean {
  return MELEE_WEAPON_ITEM_IDS.some((itemId) =>
    (observation.inventory.counts[itemId] ?? 0) > 0
  );
}

function resetAfterCatastrophicInventoryLoss(
  checkpoint: BeatGameCheckpoint,
  observation: BeatGameObservation,
): BeatGameCheckpoint {
  if (
    checkpoint.planner.phase === BeatGamePhase.PREPARE_OVERWORLD
    || checkpoint.planner.phase === BeatGamePhase.EXIT_END
    || checkpoint.planner.phase === BeatGamePhase.COMPLETE
    || observation.player.position.dimension !== "minecraft:overworld"
  ) {
    return checkpoint;
  }
  const counts = observation.inventory.counts;
  const hasPickaxe = MINING_PICKAXE_ITEM_IDS.some((itemId) =>
    (counts[itemId] ?? 0) > 0
  );
  const hasFood = [...EDIBLE_FOOD_ITEM_IDS, ...EMERGENCY_FOOD_ITEM_IDS].some(
    (itemId) => (counts[itemId] ?? 0) > 0,
  );
  if (
    Number(hasMeleeWeapon(observation))
      + Number(hasPickaxe)
      + Number(hasFood)
      >= 2
  ) {
    return checkpoint;
  }
  return {
    ...checkpoint,
    planner: {
      ...checkpoint.planner,
      phase: BeatGamePhase.PREPARE_OVERWORLD,
      objective: objectiveForPhase(BeatGamePhase.PREPARE_OVERWORLD),
      requirements: [],
      retryCount: 0,
      completedActions: [],
      updatedAt: new Date().toISOString(),
    },
  };
}

function waitForDeathRecoveryInventory(
  state: RunState,
  expectedCounts: Readonly<Record<string, number>> | undefined,
  attemptsRemaining: number,
): Effect.Effect<boolean, BeatGameDriverError> {
  return state.driver.observe.pipe(
    Effect.flatMap((observation) =>
      (
          expectedCounts === undefined
            ? hasMeaningfulRecoveryInventory(observation)
            : hasRecoveredDeathInventory(
              observation,
              expectedCounts,
            )
        )
        ? Effect.succeed(true)
        : attemptsRemaining <= 1
        ? Effect.succeed(false)
        : Effect.sleep(
          Math.max(
            MINIMUM_RECOVERY_POLL_MS,
            state.strategy.observationPollMs,
          ),
        ).pipe(
          Effect.zipRight(
            waitForDeathRecoveryInventory(
              state,
              expectedCounts,
              attemptsRemaining - 1,
            ),
          ),
        )
    ),
  );
}

function updateObservedState(
  state: RunState,
  observation: BeatGameObservation,
): Effect.Effect<void, BeatGameError> {
  return Effect.gen(function* () {
    const previousObservation = yield* Ref.modify(
      state.observation,
      (previous) => [previous, observation] as const,
    );
    if (!observation.player.dead) {
      const lastLivingObservation = yield* Ref.get(
        state.lastLivingObservation,
      );
      const inventoryWasClearedBeforeDeathState =
        !previousObservation.player.dead
        && hasMeaningfulRecoveryInventory(lastLivingObservation)
        && !hasMeaningfulRecoveryInventory(observation)
        && inventoryItemCount(observation) === 0;
      if (!inventoryWasClearedBeforeDeathState) {
        yield* Ref.set(state.lastLivingObservation, observation);
      }
      return;
    }
    if (previousObservation.player.dead) {
      return;
    }
    const lastLivingObservation = yield* Ref.get(
      state.lastLivingObservation,
    );
    yield* recordPendingDeath(state, {
      observedAt: observation.observedAt,
      position: observation.player.position,
      recoverItems: hasMeaningfulRecoveryInventory(
        lastLivingObservation,
      ),
      inventoryCounts: lastLivingObservation.inventory.counts,
    });
  });
}

function observeDriverFresh(
  state: RunState,
): Effect.Effect<BeatGameObservation, BeatGameError> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    return yield* state.driver.observe.pipe(
      Effect.mapError((cause) =>
        observationError(
          checkpoint.runId,
          state.driver,
          checkpoint.planner.phase,
          cause,
        )
      ),
      Effect.tap((observation) => updateObservedState(state, observation)),
    );
  });
}

function monitorDriverEvents(
  state: RunState,
): Effect.Effect<void, never> {
  return state.driver.events.pipe(
    Stream.runForEach((event) => {
      if (event.type !== "bot-died") {
        return Effect.void;
      }
      return Ref.get(state.lastLivingObservation).pipe(
        Effect.flatMap((lastLivingObservation) =>
          state.driver.observe.pipe(
            Effect.tap((observation) =>
              updateObservedState(state, observation)
            ),
            Effect.catchAll(() => Ref.get(state.observation)),
            Effect.map((observation) => ({
              lastLivingObservation,
              observation,
            })),
          )
        ),
        Effect.flatMap(({ lastLivingObservation, observation }) =>
          recordPendingDeath(state, {
            observedAt: event.observedAt,
            position: observation.player.dead
              ? observation.player.position
              : lastLivingObservation.player.position,
            recoverItems: hasMeaningfulRecoveryInventory(
              lastLivingObservation,
            ),
            inventoryCounts: lastLivingObservation.inventory.counts,
            ...(event.message === undefined
              ? {}
              : { message: event.message }),
          })
        ),
      );
    }),
    Effect.catchAll(() => Effect.void),
  );
}

function recordPendingDeath(
  state: RunState,
  pendingDeath: PendingDeath,
): Effect.Effect<void, BeatGameError> {
  return Effect.gen(function* () {
    const recordedDeath = yield* enqueuePendingDeath(state, pendingDeath);
    yield* persist(state, (checkpoint) =>
      rememberDeathPosition(checkpoint, recordedDeath)
    );
  });
}

function enqueuePendingDeath(
  state: RunState,
  pendingDeath: PendingDeath,
): Effect.Effect<PendingDeath> {
  return Ref.modify(state.pendingDeaths, (pendingDeaths) => {
    const duplicateIndex = pendingDeaths.findIndex((candidate) =>
      candidate.observedAt === pendingDeath.observedAt
      || (
        samePosition(candidate.position, pendingDeath.position)
        && timestampsAreNear(
          candidate.observedAt,
          pendingDeath.observedAt,
          DEATH_OBSERVATION_DEDUPLICATION_WINDOW_MS,
        )
      )
    );
    if (duplicateIndex === -1) {
      return [pendingDeath, [...pendingDeaths, pendingDeath]] as const;
    }
    const duplicate = pendingDeaths[duplicateIndex];
    if (duplicate === undefined) {
      return [pendingDeath, pendingDeaths] as const;
    }
    const recoverItems = duplicate.recoverItems || pendingDeath.recoverItems;
    const inventoryCounts =
      pendingDeath.inventoryCounts ?? duplicate.inventoryCounts;
    const merged = {
      ...duplicate,
      recoverItems,
      ...(inventoryCounts === undefined ? {} : { inventoryCounts }),
      ...(duplicate.message !== undefined
        ? {}
        : pendingDeath.message === undefined
        ? {}
        : { message: pendingDeath.message }),
    };
    if (
      recoverItems === duplicate.recoverItems
      && inventoryCounts === duplicate.inventoryCounts
      && merged.message === duplicate.message
    ) {
      return [duplicate, pendingDeaths] as const;
    }
    return [merged, pendingDeaths.map((candidate, index) =>
      index === duplicateIndex
        ? merged
        : candidate
    )] as const;
  });
}

function timestampsAreNear(
  left: string,
  right: string,
  maximumDistanceMs: number,
): boolean {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs)
    && Number.isFinite(rightMs)
    && Math.abs(leftMs - rightMs) <= maximumDistanceMs;
}

function rememberDeathPosition(
  checkpoint: BeatGameCheckpoint,
  pendingDeath: PendingDeath,
): BeatGameCheckpoint {
  const key = `death:${pendingDeath.observedAt}`;
  const latestDeath = {
    key,
    value: pendingDeath.position,
    observedAt: pendingDeath.observedAt,
    confidence: 1,
  } satisfies BeatGameMemoryEntry<BeatGamePosition>;
  const alreadyRemembered = checkpoint.memory.deathPositions.some(
    (entry) => entry.key === key,
  );
  return {
    ...checkpoint,
    memory: {
      ...checkpoint.memory,
      latestDeath,
      deathPositions: alreadyRemembered
        ? checkpoint.memory.deathPositions
        : [
          ...checkpoint.memory.deathPositions,
          {
            key,
            value: {
              ...pendingDeath.position,
              ...(pendingDeath.inventoryCounts === undefined
                ? {}
                : { inventoryCounts: pendingDeath.inventoryCounts }),
            },
            observedAt: pendingDeath.observedAt,
            confidence: 1,
          },
        ].slice(-16),
    },
  };
}

function restorePendingDeaths(
  checkpoint: BeatGameCheckpoint,
  observation: BeatGameObservation,
): readonly PendingDeath[] {
  return checkpoint.memory.deathPositions.flatMap((entry) => {
    const { inventoryCounts, ...position } = entry.value;
    if (
      inventoryCounts === undefined && observation.player.dead
      || (
        inventoryCounts === undefined
          ? hasMeaningfulRecoveryInventory(observation)
          : hasRecoveredDeathInventory(
          observation,
          inventoryCounts,
        )
      )
    ) {
      return [];
    }
    const restoredDeath = {
      observedAt: entry.observedAt,
      position,
      recoverItems: true,
      ...(inventoryCounts === undefined
        ? {}
        : { inventoryCounts }),
    } satisfies PendingDeath;
    return isPendingDeathRecoverable(restoredDeath)
      ? [restoredDeath]
      : [];
  });
}

function hasRecoveredDeathInventory(
  observation: BeatGameObservation,
  deathCounts: Readonly<Record<string, number>>,
): boolean {
  const expectedEntries = Object.entries(deathCounts)
    .filter(([, count]) => count > 0);
  const valuableEntries = expectedEntries.filter(
    ([itemId]) => !RENEWABLE_DEATH_RECOVERY_ITEM_IDS.has(itemId),
  );
  const requiredEntries = valuableEntries.length > 0
    ? valuableEntries
    : expectedEntries;
  return requiredEntries.every(
    ([itemId, count]) => (observation.inventory.counts[itemId] ?? 0) >= count,
  );
}

function sweepRemainingDeathDrops(
  state: RunState,
  expectedCounts: Readonly<Record<string, number>> | undefined,
): Effect.Effect<void, BeatGameDriverError> {
  if (expectedCounts === undefined) {
    return Effect.void;
  }
  return Effect.gen(function* () {
    const observation = yield* state.driver.observe;
    const missingItemIds = Object.entries(expectedCounts)
      .filter(([itemId, count]) =>
        count > 0 && (observation.inventory.counts[itemId] ?? 0) < count
      )
      .map(([itemId]) => itemId);
    if (missingItemIds.length === 0) {
      return;
    }
    yield* collectNearbyDrops(state.driver, {
      itemIds: missingItemIds,
      radius: 24,
      maximumDrops: 64,
      settleDelayMs: 500,
      maximumVerticalDistance: 16,
      path: {
        ...state.strategy.path,
        allowPlacing: false,
        avoidFluids: true,
      },
    });
  });
}

function chainedDeathRespawnCooldown(pendingDeathCount: number): number {
  const exponent = Math.max(0, Math.floor(pendingDeathCount) - 2);
  return Math.min(
    CHAINED_DEATH_RESPAWN_MAXIMUM_COOLDOWN_MS,
    CHAINED_DEATH_RESPAWN_BASE_COOLDOWN_MS * 2 ** exponent,
  );
}

function isPendingDeathRecoverable(pendingDeath: PendingDeath): boolean {
  const ageMs = Date.now() - Date.parse(pendingDeath.observedAt);
  return Number.isFinite(ageMs)
    && ageMs >= 0
    && ageMs <= DURABLE_DEATH_RECOVERY_WINDOW_MS;
}

function recordDeathRecoveryFailure(
  state: RunState,
  observedAt: string,
  stage: "pickup" | "preparation",
): Effect.Effect<number> {
  return Ref.modify(state.deathRecoveryFailures, (failures) => {
    const key = `${observedAt}:${stage}`;
    const nextFailureCount = (failures.get(key) ?? 0) + 1;
    const updatedFailures = new Map(failures);
    updatedFailures.set(key, nextFailureCount);
    return [nextFailureCount, updatedFailures] as const;
  });
}

function clearDeathRecoveryFailure(
  state: RunState,
  observedAt: string,
  stage: "pickup" | "preparation",
): Effect.Effect<void> {
  return Ref.update(state.deathRecoveryFailures, (failures) => {
    const key = `${observedAt}:${stage}`;
    if (!failures.has(key)) {
      return failures;
    }
    const updatedFailures = new Map(failures);
    updatedFailures.delete(key);
    return updatedFailures;
  });
}

function madeMeaningfulDeathRecoveryApproach(
  deathPosition: BeatGamePosition,
  before: BeatGamePosition,
  after: BeatGamePosition,
): boolean {
  if (
    before.dimension !== deathPosition.dimension
    || after.dimension !== deathPosition.dimension
  ) {
    return false;
  }
  const beforeDistance = Math.sqrt(distanceSquared(before, deathPosition));
  const afterDistance = Math.sqrt(distanceSquared(after, deathPosition));
  return beforeDistance - afterDistance
    >= DEATH_RECOVERY_PREPARATION_PROGRESS_DISTANCE;
}

function completePendingDeath(
  state: RunState,
  observedAt: string,
): Effect.Effect<void> {
  return Effect.all([
    Ref.update(
      state.pendingDeaths,
      (pendingDeaths) =>
        pendingDeaths.filter((pendingDeath) =>
          pendingDeath.observedAt !== observedAt
        ),
    ),
    Ref.update(state.deathRecoveryFailures, (failures) => {
      const preparationKey = `${observedAt}:preparation`;
      const pickupKey = `${observedAt}:pickup`;
      if (!failures.has(preparationKey) && !failures.has(pickupKey)) {
        return failures;
      }
      const updatedFailures = new Map(failures);
      updatedFailures.delete(preparationKey);
      updatedFailures.delete(pickupKey);
      return updatedFailures;
    }),
  ], { discard: true });
}

function abandonPendingDeath(
  state: RunState,
  pendingDeath: PendingDeath,
  observation: BeatGameObservation,
  detail: string,
): Effect.Effect<ActionResult> {
  return emit(state, {
    type: "items-recovered",
    detail,
  }).pipe(
    Effect.as({
      checkpoint: (checkpoint) =>
        resetAfterCatastrophicInventoryLoss(
          forgetDeathPosition(checkpoint, pendingDeath.observedAt),
          observation,
        ),
      completedPendingDeath: pendingDeath.observedAt,
    } satisfies ActionResult),
  );
}

function inspectNearbyCorpseDrops(
  state: RunState,
  pendingDeath: PendingDeath,
  observation: BeatGameObservation,
): Effect.Effect<
  readonly BeatGameEntityObservation[] | undefined,
  BeatGameDriverError
> {
  if (
    observation.player.position.dimension
      !== pendingDeath.position.dimension
    || horizontalDistanceSquared(
        observation.player.position,
        pendingDeath.position,
      ) > CORPSE_DROP_INSPECTION_DISTANCE ** 2
  ) {
    return Effect.succeed(undefined);
  }
  const corpseItemIds = new Set(
    Object.entries(pendingDeath.inventoryCounts ?? {})
      .filter(([, count]) => count > 0)
      .map(([itemId]) => itemId),
  );
  return state.driver.queryEntities({
    origin: pendingDeath.position,
    radius: CORPSE_DROP_MATCH_RADIUS,
    selector: {
      alive: true,
      categories: [6],
    },
    maximumResults: 64,
  }).pipe(
    Effect.map((drops) =>
      drops.filter(({ itemId }) =>
        itemId !== undefined && corpseItemIds.has(itemId)
      )
    ),
  );
}

function forgetDeathPosition(
  checkpoint: BeatGameCheckpoint,
  observedAt: string,
): BeatGameCheckpoint {
  return {
    ...checkpoint,
    memory: {
      ...checkpoint.memory,
      deathPositions: checkpoint.memory.deathPositions.filter(
        (entry) => entry.observedAt !== observedAt,
      ),
    },
  };
}

function shouldAttemptDeathRecovery(
  pendingDeath: PendingDeath,
  currentPosition: BeatGamePosition,
): boolean {
  if (
    pendingDeath.position.dimension !== currentPosition.dimension
  ) {
    return false;
  }
  const recoveryClass = classifyDeathRecoveryInventory(
    pendingDeath.inventoryCounts,
  );
  if (recoveryClass === "valuable") {
    return true;
  }
  if (recoveryClass === "trivial") {
    return distanceSquared(pendingDeath.position, currentPosition)
      <= IMMEDIATE_CORPSE_RECOVERY_DISTANCE ** 2;
  }
  const maximumDistance = recoveryClass === "substantial"
    ? SUBSTANTIAL_RENEWABLE_DEATH_RECOVERY_MAX_DISTANCE
    : recoveryClass === "renewable"
    ? RENEWABLE_DEATH_RECOVERY_MAX_DISTANCE
    : UNKNOWN_DEATH_RECOVERY_MAX_DISTANCE;
  return distanceSquared(pendingDeath.position, currentPosition)
    <= maximumDistance ** 2;
}

function prepareForDistantDeathRecovery(
  state: RunState,
  pendingDeath: PendingDeath,
  observation: BeatGameObservation,
): Effect.Effect<
  string | undefined,
  BeatGameError | BeatGameDriverError
> {
  if (
    observation.player.position.dimension
      !== pendingDeath.position.dimension
  ) {
    return Effect.succeed(undefined);
  }
  return Effect.gen(function* () {
    let current = observation;
    const recoveryPath = {
      ...state.strategy.path,
      avoidFluids: false,
      additionalPlaceItemIds: DEATH_RECOVERY_ADDITIONAL_PLACE_ITEM_IDS,
    };
    const protectedRecoveryPath = {
      ...recoveryPath,
      allowPlacing: false,
      avoidFluids: true,
    };
    const buildingMaterialCount = (value: BeatGameObservation): number =>
      DEATH_RECOVERY_BUILDING_ITEM_IDS.reduce(
        (total, itemId) =>
          total + (value.inventory.counts[itemId] ?? 0),
        0,
      );
    const travelFoodCount = deathRecoveryTravelFoodCount;
    const logCount = (value: BeatGameObservation): number =>
      LOG_ITEM_IDS.reduce(
        (total, itemId) =>
          total + (value.inventory.counts[itemId] ?? 0),
        0,
      );
    const additionalLogsForWoodenPickaxe = (
      value: BeatGameObservation,
    ): number => {
      const plankEquivalent =
        PLANK_ITEM_IDS.reduce(
          (total, itemId) =>
            total + (value.inventory.counts[itemId] ?? 0),
          0,
        ) + logCount(value) * 4;
      const craftingTablePlanks =
        (value.inventory.counts["minecraft:crafting_table"] ?? 0) > 0
          ? 0
          : 4;
      const stickPlanks =
        (value.inventory.counts["minecraft:stick"] ?? 0) >= 2
          ? 0
          : 2;
      const missingPlanks = Math.max(
        0,
        3 + craftingTablePlanks + stickPlanks - plankEquivalent,
      );
      return Math.ceil(missingPlanks / 4);
    };
    const ensureTravelFood = (
      value: BeatGameObservation,
    ): Effect.Effect<
      BeatGameObservation,
      BeatGameError | BeatGameDriverError
    > => {
      const food = travelFoodCount(value);
      if (food >= DEATH_RECOVERY_MINIMUM_FOOD_COUNT) {
        return Effect.succeed(value);
      }
      const needsUrgentAquaticFood =
        value.player.food <= URGENT_HUNGER_FOOD_LEVEL;
      const foodSearchPath = needsUrgentAquaticFood
        ? { ...protectedRecoveryPath, avoidFluids: false }
        : protectedRecoveryPath;
      const search = huntOrExplore(
        state,
        value,
        {
          entityTypes: foodHuntEntityTypes(
            value.player.food,
            value.player.health >= state.strategy.minimumHealth,
          ),
          alive: true,
        },
        DEATH_RECOVERY_BOOTSTRAP_FOOD_COUNT - food,
        "prepare-corpse-recovery-food",
        {
          preferredEntityTypes: HIGH_YIELD_FOOD_ANIMAL_TYPES,
          preferredRadius: HIGH_YIELD_FOOD_PREFERENCE_RADIUS,
          maximumExplorationHops: 2,
          path: foodSearchPath,
          explorationTarget: pendingDeath.position,
          allowCriticalAquaticTargets: true,
          maximumSafeAquaticFoodLevel: Math.max(
            state.strategy.eatBelowFood,
            URGENT_HUNGER_FOOD_LEVEL,
          ),
          requireHealthRecoveryForSafeAquaticTargets: true,
          safeAquaticFallbackAfterExplorationLegs:
            value.player.health < state.strategy.minimumHealth
              ? 0
              : DEATH_RECOVERY_AQUATIC_FALLBACK_EXPLORATION_LEGS,
          allowFluidFallback: true,
          fallbackToLocalExploration: true,
        },
      );
      return Effect.raceFirst(
        search,
        Effect.sleep(DEATH_RECOVERY_FOOD_SEARCH_TIMEOUT_MS),
      ).pipe(Effect.zipRight(state.driver.observe));
    };
    const recoveryDistanceSquared = distanceSquared(
      current.player.position,
      pendingDeath.position,
    );
    const horizontalRecoveryDistanceSquared = horizontalDistanceSquared(
      current.player.position,
      pendingDeath.position,
    );
    const recoveryRequiresExcavation =
      pendingDeath.position.y < current.player.position.y - 8;
    const recoveryRequiresPreparedExcavation = recoveryRequiresExcavation
      && (
        pendingDeath.position.y
          < current.player.position.y
            - DEEP_CORPSE_EXCAVATION_MINIMUM_DEPTH
        || horizontalRecoveryDistanceSquared
          > DISTANT_CORPSE_EXCAVATION_MINIMUM_HORIZONTAL_DISTANCE ** 2
      );
    const canRaceActiveCorpse =
      current.player.health >= state.strategy.minimumHealth
      && (
        !recoveryRequiresPreparedExcavation
        || hasMiningPickaxe(current)
      )
      && (
        hasMeleeWeapon(current)
        || !hasMeaningfulRecoveryInventory(current)
      );
    if (
      recoveryDistanceSquared
        <= IMMEDIATE_CORPSE_RECOVERY_DISTANCE ** 2
      || (
        recoveryDistanceSquared <= ACTIVE_CORPSE_RECOVERY_DISTANCE ** 2
        && canRaceActiveCorpse
      )
    ) {
      return undefined;
    }
    const ensureBuildingMaterials = (
      value: BeatGameObservation,
    ): Effect.Effect<
      BeatGameObservation,
      BeatGameDriverError
    > => {
      const buildingMaterials = buildingMaterialCount(value);
      if (buildingMaterials >= DEATH_RECOVERY_BOOTSTRAP_BLOCK_COUNT) {
        return Effect.succeed(value);
      }
      return collectBlocksOrExplore(state, value, {
        blockIds: DEATH_RECOVERY_BUILDING_BLOCK_IDS,
        count:
          DEATH_RECOVERY_BOOTSTRAP_BLOCK_COUNT - buildingMaterials,
        progressItemIds: DEATH_RECOVERY_BUILDING_ITEM_IDS,
        purpose: "prepare-corpse-recovery-blocks",
        avoidSubmergedTargets: true,
        path: protectedRecoveryPath,
        explorationTarget: pendingDeath.position,
      }).pipe(Effect.zipRight(state.driver.observe));
    };

    if (
      (
        current.player.food <= CRITICAL_HUNGER_FOOD_LEVEL
        || current.player.health < state.strategy.minimumHealth
      )
      && travelFoodCount(current) < DEATH_RECOVERY_MINIMUM_FOOD_COUNT
    ) {
      current = yield* ensureTravelFood(current);
      if (travelFoodCount(current) < DEATH_RECOVERY_MINIMUM_FOOD_COUNT) {
        return DEATH_RECOVERY_FOOD_SEARCH_PENDING;
      }
    }
    if (!hasMeleeWeapon(current)) {
      const logs = logCount(current);
      if (logs < EMERGENCY_ARMAMENT_LOG_COUNT) {
        yield* collectBlocksOrExplore(state, current, {
          blockIds: LOG_ITEM_IDS,
          count: EMERGENCY_ARMAMENT_LOG_COUNT - logs,
          progressItemIds: LOG_ITEM_IDS,
          purpose: "prepare-corpse-recovery",
          avoidSubmergedTargets: true,
          requireLineOfSight: true,
          requireSurfaceTargets: true,
          path: protectedRecoveryPath,
          explorationTarget: pendingDeath.position,
        });
        current = yield* state.driver.observe;
      }
      if (logCount(current) < EMERGENCY_ARMAMENT_LOG_COUNT) {
        return "still gathering enough wood to craft a corpse recovery weapon";
      }
      yield* craftWithTable(
        state,
        current,
        "minecraft:wooden_sword",
        1,
      );
      current = yield* state.driver.observe;
    }
    if (
      recoveryDistanceSquared
          > RENEWABLE_DEATH_RECOVERY_MAX_DISTANCE ** 2
      &&
      (
        current.player.food <= state.strategy.eatBelowFood
        || current.player.health < state.strategy.minimumHealth
      )
      && travelFoodCount(current) < DEATH_RECOVERY_MINIMUM_FOOD_COUNT
    ) {
      current = yield* ensureTravelFood(current);
      if (travelFoodCount(current) < DEATH_RECOVERY_MINIMUM_FOOD_COUNT) {
        return DEATH_RECOVERY_FOOD_SEARCH_PENDING;
      }
    }
    if (
      recoveryRequiresExcavation
      && !MINING_PICKAXE_ITEM_IDS.some((itemId) =>
        (current.inventory.counts[itemId] ?? 0) > 0
      )
    ) {
      let additionalLogs = additionalLogsForWoodenPickaxe(current);
      if (
        additionalLogs > 0
        && (
          recoveryRequiresPreparedExcavation
          || recoveryDistanceSquared
            > DISTANT_DEATH_RECOVERY_BOOTSTRAP_DISTANCE ** 2
        )
      ) {
        yield* collectBlocksOrExplore(state, current, {
          blockIds: LOG_ITEM_IDS,
          count: additionalLogs,
          progressItemIds: LOG_ITEM_IDS,
          purpose: "prepare-corpse-recovery-pickaxe",
          avoidSubmergedTargets: true,
          requireLineOfSight: true,
          requireSurfaceTargets: true,
          path: protectedRecoveryPath,
          explorationTarget: pendingDeath.position,
        });
        current = yield* state.driver.observe;
        additionalLogs = additionalLogsForWoodenPickaxe(current);
      }
      if (additionalLogs === 0) {
        yield* craftWithTable(
          state,
          current,
          "minecraft:wooden_pickaxe",
          1,
        );
        current = yield* state.driver.observe;
      }
    }
    if (
      recoveryDistanceSquared
        <= DISTANT_DEATH_RECOVERY_BOOTSTRAP_DISTANCE ** 2
    ) {
      return !recoveryRequiresPreparedExcavation || hasMiningPickaxe(current)
        ? undefined
        : "still gathering enough wood to craft a deep corpse recovery pickaxe";
    }
    const bufferedLogs = logCount(current);
    if (bufferedLogs < DEATH_RECOVERY_BOOTSTRAP_LOG_COUNT) {
      yield* collectBlocksOrExplore(state, current, {
        blockIds: LOG_ITEM_IDS,
        count: DEATH_RECOVERY_BOOTSTRAP_LOG_COUNT - bufferedLogs,
        progressItemIds: LOG_ITEM_IDS,
        purpose: "prepare-corpse-recovery-log-buffer",
        avoidSubmergedTargets: true,
        requireLineOfSight: true,
        requireSurfaceTargets: true,
        path: protectedRecoveryPath,
        explorationTarget: pendingDeath.position,
      });
      current = yield* state.driver.observe;
    }

    current = yield* ensureBuildingMaterials(current);
    if (
      !hasMeleeWeapon(current)
      || (
        recoveryRequiresExcavation
        && !MINING_PICKAXE_ITEM_IDS.some((itemId) =>
          (current.inventory.counts[itemId] ?? 0) > 0
        )
      )
      || buildingMaterialCount(current)
        < DEATH_RECOVERY_BOOTSTRAP_BLOCK_COUNT
    ) {
      return "still gathering recovery tools and disposable building blocks for distant corpse recovery";
    }

    const food = travelFoodCount(current);
    if (food < DEATH_RECOVERY_MINIMUM_FOOD_COUNT) {
      current = yield* ensureTravelFood(current);
    }
    if (travelFoodCount(current) < DEATH_RECOVERY_MINIMUM_FOOD_COUNT) {
      return DEATH_RECOVERY_FOOD_SEARCH_PENDING;
    }
    current = yield* ensureBuildingMaterials(current);
    if (
      buildingMaterialCount(current)
        < DEATH_RECOVERY_BOOTSTRAP_BLOCK_COUNT
    ) {
      return "still replenishing the disposable building block reserve for distant corpse recovery";
    }
    return undefined;
  });
}

function classifyDeathRecoveryInventory(
  counts: Readonly<Record<string, number>> | undefined,
): "renewable" | "substantial" | "trivial" | "unknown" | "valuable" {
  if (counts === undefined) {
    return "unknown";
  }
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  if (
    entries.some(
      ([itemId]) => !RENEWABLE_DEATH_RECOVERY_ITEM_IDS.has(itemId),
    )
  ) {
    return "valuable";
  }
  const usefulRenewableItems = entries.reduce(
    (total, [itemId, count]) =>
      LOW_VALUE_DEATH_RECOVERY_ITEM_IDS.has(itemId)
        ? total
        : total + count,
    0,
  );
  if (usefulRenewableItems === 0) {
    return "trivial";
  }
  return usefulRenewableItems
      >= SUBSTANTIAL_RENEWABLE_DEATH_RECOVERY_ITEM_COUNT
    ? "substantial"
    : "renewable";
}

function observeWithRecovery(
  state: RunState,
): Effect.Effect<BeatGameObservation, BeatGameError> {
  const attempt = (
    recovering: boolean,
    retryCount: number,
  ): Effect.Effect<BeatGameObservation, BeatGameError> =>
    observeFresh(state).pipe(
      Effect.tap((observation) =>
        !recovering
          ? Effect.void
          : Effect.gen(function* () {
            const checkpoint = yield* Ref.get(state.checkpoint);
            const paused = yield* Ref.get(state.paused);
            const status = paused
              ? BeatGameRunStatus.PAUSED
              : BeatGameRunStatus.RUNNING;
            yield* persist(state, (current) => ({
              ...current,
              connectionEpoch: observation.player.connectionEpoch,
              planner: {
                ...current.planner,
                status,
                updatedAt: new Date().toISOString(),
              },
            }));
            yield* state.coordinator.updateMember(
              checkpoint.teamId,
              checkpoint.botId,
              checkpoint.planner.phase,
              status,
            );
            yield* emit(state, {
              type: "bot-recovered",
              detail:
                `Observation stream recovered after ${retryCount} retries`,
            });
          })
      ),
      Effect.catchAll((error) => {
        if (!error.retryable) {
          return Effect.fail(error);
        }
        const enterRecovery = recovering
          ? Effect.void
          : Effect.gen(function* () {
            const checkpoint = yield* persist(state, (current) => ({
              ...current,
              planner: {
                ...current.planner,
                status: BeatGameRunStatus.RECOVERING,
                updatedAt: new Date().toISOString(),
              },
            }));
            yield* state.coordinator.updateMember(
              checkpoint.teamId,
              checkpoint.botId,
              checkpoint.planner.phase,
              BeatGameRunStatus.RECOVERING,
            );
            yield* emit(state, {
              type: "bot-disconnected",
              detail: error.message,
            });
          });
        return enterRecovery.pipe(
          Effect.zipRight(Effect.sleep(backoffDuration(retryCount + 1))),
          Effect.zipRight(attempt(true, retryCount + 1)),
        );
      }),
    );
  return attempt(false, 0);
}

function persist(
  state: RunState,
  update: (checkpoint: BeatGameCheckpoint) => BeatGameCheckpoint,
): Effect.Effect<BeatGameCheckpoint, BeatGameError> {
  return state.checkpointMutex.withPermits(1)(Effect.uninterruptible(
    Effect.gen(function* () {
    const current = yield* Ref.get(state.checkpoint);
    const now = new Date().toISOString();
    const updated = update(current);
    const next: BeatGameCheckpoint = {
      ...updated,
      revision: current.revision + 1,
      updatedAt: now,
      planner: {
        ...updated.planner,
        updatedAt: updated.planner.updatedAt || now,
      },
    };
    const stored = yield* state.store.save(next, current.revision);
    yield* Ref.set(state.checkpoint, stored);
    yield* publishSnapshot(state);
    yield* emit(state, {
      type: "checkpoint-saved",
      revision: stored.revision,
    });
    return stored;
    }),
  ));
}

function currentSnapshot(
  state: RunState,
): Effect.Effect<BeatGameSnapshot, BeatGameError> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    const observation = yield* Ref.get(state.observation);
    const team = yield* state.coordinator.snapshot(checkpoint.teamId);
    return { checkpoint, observation, team };
  });
}

function mergeSharedDiscoveries(
  state: RunState,
  checkpoint: BeatGameCheckpoint,
): Effect.Effect<BeatGameCheckpoint, BeatGameError> {
  return Effect.gen(function* () {
    const team = yield* state.coordinator.snapshot(checkpoint.teamId);
    const knownPortals = new Set(
      checkpoint.memory.portals.map(({ key }) => key),
    );
    const sharedPortals = team.discoveries
      .filter(({ kind, key }) =>
        kind === "portal" && !knownPortals.has(key)
      )
      .map((discovery) => ({
        key: discovery.key,
        value: {
          blockId: "minecraft:nether_portal",
          position: {
            x: Math.floor(discovery.position.x),
            y: Math.floor(discovery.position.y),
            z: Math.floor(discovery.position.z),
            dimension: discovery.position.dimension,
          },
          properties: {},
          diggable: false,
          replaceable: false,
          interactive: false,
          observedAt: discovery.observedAt,
        },
        observedAt: discovery.observedAt,
        ...(discovery.expiresAt === undefined
          ? {}
          : { expiresAt: discovery.expiresAt }),
        confidence: discovery.confidence,
      }));
    const knownEyeSamples = new Set(
      checkpoint.memory.eyeSamples.map((sample) =>
        `${sample.observedAt}:${positionKey(sample.origin)}`
      ),
    );
    const sharedEyeSamples = team.discoveries.flatMap((discovery) => {
      if (discovery.kind !== "eye-sample") {
        return [];
      }
      const directionX = discovery.metadata?.directionX;
      const directionZ = discovery.metadata?.directionZ;
      const key = `${discovery.observedAt}:${positionKey(discovery.position)}`;
      if (
        knownEyeSamples.has(key)
        || typeof directionX !== "number"
        || typeof directionZ !== "number"
      ) {
        return [];
      }
      return [{
        origin: discovery.position,
        direction: { x: directionX, z: directionZ },
        observedAt: discovery.observedAt,
        confidence: discovery.confidence,
      }];
    });
    const stronghold = team.discoveries
      .filter(({ kind }) => kind === "stronghold")
      .sort((left, right) =>
        right.confidence - left.confidence
        || Date.parse(right.observedAt) - Date.parse(left.observedAt)
      )[0]?.position;
    const changedStronghold = stronghold !== undefined
      && (
        checkpoint.memory.strongholdEstimate === undefined
        || !samePosition(checkpoint.memory.strongholdEstimate, stronghold)
      );
    if (
      sharedPortals.length === 0
      && sharedEyeSamples.length === 0
      && !changedStronghold
    ) {
      return checkpoint;
    }
    return yield* persist(state, (current) => ({
      ...current,
      memory: {
        ...current.memory,
        portals: [
          ...current.memory.portals,
          ...sharedPortals,
        ].slice(-64),
        eyeSamples: [
          ...current.memory.eyeSamples,
          ...sharedEyeSamples,
        ].slice(-32),
        ...(stronghold === undefined
          ? {}
          : { strongholdEstimate: stronghold }),
      },
    }));
  });
}

function publishSnapshot(
  state: RunState,
): Effect.Effect<void, BeatGameError> {
  return currentSnapshot(state).pipe(
    Effect.flatMap((snapshot) => state.snapshots.publish(snapshot)),
  );
}

function emit(
  state: RunState,
  input: EventInput,
): Effect.Effect<void, never> {
  return state.eventMutex.withPermits(1)(
    Effect.gen(function* () {
      const checkpoint = yield* Ref.get(state.checkpoint);
      const sequence = yield* Ref.updateAndGet(
        state.sequence,
        (current) => current + 1n,
      );
      const event = {
        ...input,
        sequence,
        timestamp: new Date().toISOString(),
        runId: checkpoint.runId,
        instanceId: checkpoint.instanceId,
        botId: checkpoint.botId,
        phase: checkpoint.planner.phase,
      } as BeatGameEvent;
      yield* state.events.publish(event);
    }),
  );
}

function awaitRunnable(
  state: RunState,
): Effect.Effect<void, BeatGameError> {
  return Effect.gen(function* () {
    if (yield* Deferred.isDone(state.stopped)) {
      const checkpoint = yield* Ref.get(state.checkpoint);
      return yield* Effect.fail(cancelled(checkpoint, "stopped"));
    }
    while (yield* Ref.get(state.paused)) {
      if (yield* Deferred.isDone(state.stopped)) {
        const checkpoint = yield* Ref.get(state.checkpoint);
        return yield* Effect.fail(cancelled(checkpoint, "stopped"));
      }
      yield* Effect.sleep(50);
    }
  });
}

function cancellable<A>(
  state: RunState,
  effect: Effect.Effect<A, BeatGameError>,
): Effect.Effect<A, BeatGameError> {
  const stopped = Deferred.await(state.stopped).pipe(
    Effect.flatMap(() =>
      Ref.get(state.checkpoint).pipe(
        Effect.flatMap((checkpoint) =>
          Effect.fail(cancelled(checkpoint, "stopped"))
        ),
      )
    ),
  );
  return Effect.raceFirst(effect, stopped);
}

function claimAction(
  state: RunState,
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
): Effect.Effect<BeatGameClaim | undefined, BeatGameError> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    const baseKey = decision.type === "satisfy-requirement"
      ? `requirement:${decision.requirement.key}`
      : `${checkpoint.planner.phase}:${decision.action}`;
    const capacity = decision.type === "activate-end-portal"
      ? state.strategy.maximumConcurrentEndEntries
      : 1;
    let claim: BeatGameClaim | undefined;
    for (let slot = 0; slot < capacity; slot += 1) {
      claim = yield* state.coordinator.claim({
        teamId: checkpoint.teamId,
        runId: checkpoint.runId,
        botId: checkpoint.botId,
        key: capacity === 1 ? baseKey : `${baseKey}:${slot}`,
        purpose: decision.action,
        ttlMs: Math.max(
          state.strategy.claimTtlMs,
          state.strategy.actionTimeoutMs + 5_000,
        ),
      });
      if (claim !== undefined) {
        break;
      }
    }
    if (claim === undefined) {
      return undefined;
    }
    yield* emit(state, {
      type: "team-claim-changed",
      claim,
      released: false,
    });
    if (decision.type === "satisfy-requirement") {
      yield* emit(state, {
        type: "requirement-claimed",
        requirement: decision.requirement,
        claim,
      });
    }
    return claim;
  });
}

function releaseActionClaim(
  state: RunState,
  claim: BeatGameClaim,
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const checkpoint = yield* Ref.get(state.checkpoint);
    const released = yield* state.coordinator.release(
      checkpoint.teamId,
      claim.key,
      checkpoint.botId,
    ).pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (released) {
      yield* emit(state, {
        type: "team-claim-changed",
        claim,
        released: true,
      });
    }
  });
}

function markFailed(
  state: RunState,
  error: BeatGameError,
): Effect.Effect<void, never> {
  return persist(state, (checkpoint) => ({
    ...checkpoint,
    planner: {
      ...checkpoint.planner,
      status: BeatGameRunStatus.FAILED,
      updatedAt: new Date().toISOString(),
    },
  })).pipe(
    Effect.zipRight(emit(state, {
      type: "diagnostic",
      message: error.message,
      data: { error: error._tag },
    })),
    Effect.ignore,
  );
}

function createInitialCheckpoint(
  runId: string,
  teamId: string,
  driver: BeatGameDriver,
  role: BeatGameTeamRole,
  observation: BeatGameObservation,
  strategy: BeatGameStrategy,
): BeatGameCheckpoint {
  const now = new Date().toISOString();
  return {
    schemaVersion: BEAT_GAME_CHECKPOINT_SCHEMA_VERSION,
    runId,
    teamId,
    instanceId: driver.instanceId,
    botId: driver.botId,
    role,
    revision: 1,
    connectionEpoch: observation.player.connectionEpoch,
    planner: {
      phase: BeatGamePhase.PREPARE_OVERWORLD,
      status: BeatGameRunStatus.CREATED,
      objective: objectiveForPhase(BeatGamePhase.PREPARE_OVERWORLD),
      requirements: plannerWithObservation({
        phase: BeatGamePhase.PREPARE_OVERWORLD,
        status: BeatGameRunStatus.CREATED,
        objective: objectiveForPhase(BeatGamePhase.PREPARE_OVERWORLD),
        requirements: [],
        retryCount: 0,
        completedActions: [],
        startedAt: now,
        updatedAt: now,
      }, observation, strategy).requirements,
      retryCount: 0,
      completedActions: [],
      startedAt: now,
      updatedAt: now,
    },
    memory: emptyBeatGameWorldMemory(),
    createdAt: now,
    updatedAt: now,
  };
}

function validateRestoredCheckpoint(
  checkpoint: BeatGameCheckpoint | undefined,
  driver: BeatGameDriver,
  teamId: string,
): void {
  if (checkpoint === undefined) {
    return;
  }
  assertValidCheckpoint(checkpoint);
  if (
    checkpoint.botId !== driver.botId
    || checkpoint.teamId !== teamId
  ) {
    throw new TypeError(
      "The restored checkpoint belongs to another bot or team",
    );
  }
}

function adoptRestoredCheckpoint(
  checkpoint: BeatGameCheckpoint,
  driver: BeatGameDriver,
  role: BeatGameTeamRole,
  observation: BeatGameObservation,
): BeatGameCheckpoint {
  const now = new Date().toISOString();
  return {
    ...checkpoint,
    instanceId: driver.instanceId,
    botId: driver.botId,
    role,
    connectionEpoch: observation.player.connectionEpoch,
    revision: checkpoint.revision + 1,
    updatedAt: now,
    planner: {
      ...checkpoint.planner,
      updatedAt: now,
    },
  };
}

function mergeStrategy(
  override: BeatGameStrategyOptions | undefined,
): BeatGameStrategy {
  const strategy: BeatGameStrategy = {
    ...defaultBeatGameStrategy,
    ...override,
    path: {
      ...defaultBeatGameStrategy.path,
      ...(override?.path ?? {}),
    },
  };
  validateStrategy(strategy);
  return strategy;
}

function validateStrategy(strategy: BeatGameStrategy): void {
  for (const [name, value] of Object.entries({
    targetFoodCount: strategy.targetFoodCount,
    targetLogCount: strategy.targetLogCount,
    targetCobblestoneCount: strategy.targetCobblestoneCount,
    targetIronCount: strategy.targetIronCount,
    targetGoldCount: strategy.targetGoldCount,
    targetBlazeRodCount: strategy.targetBlazeRodCount,
    targetEnderPearlCount: strategy.targetEnderPearlCount,
    targetEyeCount: strategy.targetEyeCount,
    targetObsidianCount: strategy.targetObsidianCount,
    maximumActionRetries: strategy.maximumActionRetries,
  })) {
    requireNonNegativeInteger(value, name);
  }
  for (const [name, value] of Object.entries({
    blockSearchRadius: strategy.blockSearchRadius,
    entitySearchRadius: strategy.entitySearchRadius,
    explorationRadius: strategy.explorationRadius,
    actionTimeoutMs: strategy.actionTimeoutMs,
    observationPollMs: strategy.observationPollMs,
    claimTtlMs: strategy.claimTtlMs,
    maximumConcurrentEndEntries: strategy.maximumConcurrentEndEntries,
    maxFallDistance: strategy.path.maxFallDistance,
    maxSearchTimeMs: strategy.path.maxSearchTimeMs,
  })) {
    requirePositiveInteger(value, name);
  }
  if (
    !Number.isFinite(strategy.minimumHealth)
    || strategy.minimumHealth <= 0
    || strategy.minimumHealth > 20
  ) {
    throw new RangeError("minimumHealth must be greater than 0 and at most 20");
  }
  if (
    !Number.isFinite(strategy.eatBelowFood)
    || strategy.eatBelowFood < 0
    || strategy.eatBelowFood > 20
  ) {
    throw new RangeError("eatBelowFood must be between 0 and 20");
  }
  if (
    strategy.portalStrategy !== PortalStrategy.CAST
    && strategy.targetObsidianCount < NETHER_PORTAL_FRAME_OBSIDIAN_COUNT
  ) {
    throw new RangeError(
      `targetObsidianCount must be at least ${
        NETHER_PORTAL_FRAME_OBSIDIAN_COUNT
      } unless portalStrategy is CAST`,
    );
  }
}

function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function roleForIndex(index: number): BeatGameTeamRole {
  const roles: readonly BeatGameTeamRole[] = [
    BeatGameTeamRole.LEAD,
    BeatGameTeamRole.PORTAL_ENGINEER,
    BeatGameTeamRole.NETHER_RUNNER,
    BeatGameTeamRole.STRONGHOLD_SCOUT,
    BeatGameTeamRole.END_SUPPORT,
  ];
  return roles[index % roles.length] ?? BeatGameTeamRole.END_SUPPORT;
}

function observationError(
  runId: string,
  driver: BeatGameDriver,
  phase: BeatGamePhase,
  cause: BeatGameDriverError,
): BeatGameObservationError {
  return new BeatGameObservationError({
    runId,
    instanceId: driver.instanceId,
    botId: driver.botId,
    phase,
    retryable: cause.retryable,
    message: cause.message,
    cause,
  });
}

function actionError(
  checkpoint: BeatGameCheckpoint | undefined,
  message: string,
  isRetryable: boolean,
  cause?: unknown,
): BeatGameActionError {
  return new BeatGameActionError({
    runId: checkpoint?.runId ?? "",
    instanceId: checkpoint?.instanceId ?? "",
    botId: checkpoint?.botId ?? "",
    phase: checkpoint?.planner.phase ?? BeatGamePhase.PREPARE_OVERWORLD,
    ...(checkpoint?.planner.currentAction === undefined
      ? {}
      : { action: checkpoint.planner.currentAction }),
    retryable: isRetryable,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function pathfindingError(
  checkpoint: BeatGameCheckpoint,
  cause: BeatGameDriverError,
): BeatGamePathfindingError {
  return new BeatGamePathfindingError({
    runId: checkpoint.runId,
    instanceId: checkpoint.instanceId,
    botId: checkpoint.botId,
    phase: checkpoint.planner.phase,
    ...(checkpoint.planner.currentAction === undefined
      ? {}
      : { action: checkpoint.planner.currentAction }),
    retryable: cause.retryable,
    message: cause.message,
    cause,
  });
}

function cancelled(
  checkpoint: BeatGameCheckpoint,
  reason: string,
): BeatGameCancelled {
  return new BeatGameCancelled({
    runId: checkpoint.runId,
    instanceId: checkpoint.instanceId,
    botId: checkpoint.botId,
    phase: checkpoint.planner.phase,
    ...(checkpoint.planner.currentAction === undefined
      ? {}
      : { action: checkpoint.planner.currentAction }),
    retryable: false,
    message: `Beat-game run ${checkpoint.runId} was ${reason}`,
    reason,
  });
}

function retryable(error: BeatGameError): boolean {
  return "retryable" in error && error.retryable;
}

function isBeatGameError(value: unknown): value is BeatGameError {
  if (!(value instanceof Error) || !("_tag" in value)) {
    return false;
  }
  return [
    "BeatGameActionError",
    "BeatGameCancelled",
    "BeatGameCheckpointError",
    "BeatGameCoordinationError",
    "BeatGameDriverError",
    "BeatGameObservationError",
    "BeatGamePathfindingError",
    "BeatGameProtocolError",
    "BeatGameRequirementError",
  ].includes(String(value._tag));
}

function actionObservedComplete(
  decision: Exclude<
    BeatGamePlannerDecision,
    { readonly type: "advance-phase" }
  >,
  observation: BeatGameObservation,
  strategy: BeatGameStrategy,
  includeCollectionBuffer = false,
): boolean {
  switch (decision.type) {
    case "recover-death":
      return !observation.player.dead;
    case "eat":
      return observation.player.food > strategy.eatBelowFood;
    case "retreat":
      return observation.player.health >= strategy.minimumHealth;
    case "satisfy-requirement":
      return requirementCount(
        observation.inventory,
        decision.requirement,
      ) >= decision.requirement.targetCount + (
        includeCollectionBuffer
          ? requirementCollectionBuffer(decision.requirement.key)
          : 0
      );
    case "build-and-enter-nether":
      return isNether(observation.player.position.dimension);
    case "return-through-portal":
      return !isNether(observation.player.position.dimension);
    case "activate-end-portal":
      return isEnd(observation.player.position.dimension);
    case "collect-dragon-egg":
      return (observation.inventory.counts["minecraft:dragon_egg"] ?? 0) > 0;
    case "exit-end":
      return !isEnd(observation.player.position.dimension);
    case "prepare-equipment":
    case "throw-eye":
    case "search-stronghold":
    case "fight-ender-dragon":
      return false;
  }
}

function requirementCollectionBuffer(requirementKey: string): number {
  switch (requirementKey) {
    case "blaze-rods":
    case "cobblestone":
    case "ender-pearls":
    case "food":
    case "gold":
    case "iron":
    case "logs":
      return RESOURCE_COLLECTION_BUFFERS[requirementKey];
    case "food-supply":
      return RESOURCE_COLLECTION_BUFFERS.food;
    default:
      return 0;
  }
}

function backoffDuration(attempt: number): number {
  return Math.min(5_000, 250 * 2 ** Math.max(0, attempt - 1));
}

function resolvePortalBuildOrigin(
  driver: BeatGameDriver,
  observation: BeatGameObservation,
): Effect.Effect<BeatGameBlockPosition, BeatGameDriverError> {
  const player = observation.player.position;
  const baseX = Math.floor(player.x) - 1;
  const baseZ = Math.floor(player.z) + 2;
  const highestY = Math.floor(player.y);
  const lowestY = highestY - 12;
  const offsets = portalBuildSearchOffsets(4);
  const findFloor = (
    offsetIndex: number,
    y: number,
  ): Effect.Effect<BeatGameBlockPosition, BeatGameDriverError> => {
    const offset = offsets[offsetIndex];
    if (offset === undefined) {
      return Effect.fail(new BeatGameDriverError({
        operation: "resolvePortalBuildOrigin",
        retryable: true,
        message:
          `Could not find a clear portal workspace near ${baseX}, ${baseZ}`,
      }));
    }
    if (y < lowestY) {
      return findFloor(offsetIndex + 1, highestY);
    }
    const x = baseX + offset.x;
    const z = baseZ + offset.z;
    const candidate: BeatGameBlockPosition = {
      x: x + 1,
      y,
      z,
      dimension: player.dimension,
    };
    return driver.queryBlocks({
      center: {
        ...candidate,
        x: candidate.x + 0.5,
        y: candidate.y + 0.5,
        z: candidate.z + 0.5,
      },
      radius: 0.25,
      selector: { replaceable: false },
      maximumResults: 1,
    }).pipe(
      Effect.flatMap((blocks) => {
        if (!blocks.some(({ position }) => samePosition(position, candidate))) {
          return findFloor(offsetIndex, y - 1);
        }
        const origin = {
          x,
          y: y + 1,
          z,
          dimension: player.dimension,
        };
        return portalBuildWorkspaceIsClearable(driver, origin).pipe(
          Effect.flatMap((clearable) =>
            clearable
              ? Effect.succeed(origin)
              : findFloor(offsetIndex + 1, highestY)
          ),
        );
      }),
    );
  };

  return findFloor(0, highestY);
}

function portalBuildSearchOffsets(
  radius: number,
): readonly Readonly<{ x: number; z: number }>[] {
  const offsets: Array<Readonly<{ x: number; z: number }>> = [];
  for (let x = -radius; x <= radius; x += 1) {
    for (let z = -radius; z <= radius; z += 1) {
      offsets.push({ x, z });
    }
  }
  return offsets.sort((left, right) =>
    left.x * left.x + left.z * left.z
      - (right.x * right.x + right.z * right.z)
    || Math.abs(left.x) + Math.abs(left.z)
      - (Math.abs(right.x) + Math.abs(right.z))
    || left.x - right.x
    || left.z - right.z
  );
}

function portalBuildWorkspaceIsClearable(
  driver: BeatGameDriver,
  origin: BeatGameBlockPosition,
): Effect.Effect<boolean, BeatGameDriverError> {
  const frame = createNetherPortalFrame(origin);
  const frameKeys = new Set(frame.blocks.map(positionKey));
  const castingStand = {
    x: origin.x + 1,
    y: origin.y + 1,
    z: origin.z - 2,
    dimension: origin.dimension,
  };
  const positions = [...new Map([
    ...frame.blocks,
    ...frame.interior,
    ...frame.blocks.map((position) => ({ ...position, z: position.z - 1 })),
    castingStand,
    { ...castingStand, y: castingStand.y + 1 },
  ].map((position) => [positionKey(position), position])).values()];
  return Effect.forEach(
    positions,
    (position) => queryExactBlockAt(driver, position),
    { concurrency: 16 },
  ).pipe(
    Effect.map((blocks) => blocks.every((block, index) => {
      if (block === undefined || isPlayerFluidBlock(block.blockId)) {
        return false;
      }
      if (block.replaceable) {
        return true;
      }
      const position = positions[index];
      return block.diggable
        || (
          position !== undefined
          && frameKeys.has(positionKey(position))
          && block.blockId === "minecraft:obsidian"
        );
    })),
  );
}

function positionKey(
  position: Readonly<{
    dimension: string;
    x: number;
    y: number;
    z: number;
  }>,
): string {
  return `${position.dimension}:${position.x}:${position.y}:${position.z}`;
}

function samePosition(
  left: BeatGamePosition,
  right: BeatGamePosition,
): boolean {
  return left.dimension === right.dimension
    && left.x === right.x
    && left.y === right.y
    && left.z === right.z;
}

function stableActionResult(
  action: string,
  checkpoint: BeatGameCheckpoint,
  observation: BeatGameObservation,
  evidence:
    | "TASK_RESULT"
    | "OBSERVED_STATE"
    | "OBSERVATION_AFTER_UNCERTAIN_RESULT",
) {
  return {
    action,
    phase: checkpoint.planner.phase,
    completedAt: new Date().toISOString(),
    evidence,
    connectionEpoch: observation.player.connectionEpoch,
    playerRevision: observation.player.revision.toString(),
    inventoryRevision: observation.inventory.revision.toString(),
  } as const;
}

function withoutCurrentAction(
  planner: BeatGamePlannerState & {
    readonly currentAction?: string | undefined;
    readonly currentActionId?: string | undefined;
  },
): BeatGamePlannerState {
  const {
    currentAction: _currentAction,
    currentActionId: _currentActionId,
    ...rest
  } = planner;
  return rest;
}

function withTaskIdempotency(
  driver: BeatGameDriver,
  actionId: string,
  deadline: Date,
  observationFingerprint: string,
): BeatGameDriver {
  let taskInvocation = 0;
  return {
    instanceId: driver.instanceId,
    botId: driver.botId,
    observe: driver.observe,
    events: driver.events,
    queryBlocks: driver.queryBlocks,
    queryEntities: driver.queryEntities,
    raycast: driver.raycast,
    sampleSurface: driver.sampleSurface,
    recipesFor: driver.recipesFor,
    canCraft: driver.canCraft,
    waitForChunks: driver.waitForChunks,
    pathfind: driver.pathfind,
    pathfindXZ: driver.pathfindXZ,
    runTask: (task, policy, execution = {}) =>
      driver.runTask(task, policy, {
        idempotencyKey:
          execution.idempotencyKey
            ?? `beat-game:${actionId}:${observationFingerprint}:${
              ++taskInvocation
            }:${stableFingerprint(task)}`,
        deadline: execution.deadline ?? deadline,
      }),
    act: driver.act,
    withControl: driver.withControl,
  };
}

function stableFingerprint(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
