import {
  BeatGamePhase,
  PortalStrategy,
  type BeatGameInventory,
  type BeatGameItemRequirement,
  type BeatGameStrategy,
} from "./model.js";

export interface BeatGameRequirementDefinition {
  readonly key: string;
  readonly itemIds?: readonly string[];
  readonly tags?: readonly string[];
  readonly target: (strategy: BeatGameStrategy) => number;
  readonly priority: number;
}

const REQUIREMENTS: Readonly<
  Record<BeatGamePhase, readonly BeatGameRequirementDefinition[]>
> = {
  [BeatGamePhase.PREPARE_OVERWORLD]: [
    itemRequirement("food", [
      "minecraft:cooked_beef",
      "minecraft:cooked_porkchop",
      "minecraft:cooked_mutton",
      "minecraft:cooked_chicken",
      "minecraft:cooked_rabbit",
      "minecraft:bread",
      "minecraft:beef",
      "minecraft:porkchop",
      "minecraft:mutton",
      "minecraft:chicken",
      "minecraft:rabbit",
      "minecraft:carrot",
      "minecraft:baked_potato",
      "minecraft:potato",
      "minecraft:apple",
    ], ({ targetFoodCount }) => targetFoodCount, 100),
    itemRequirement("logs", [
      "minecraft:oak_log",
      "minecraft:spruce_log",
      "minecraft:birch_log",
      "minecraft:jungle_log",
      "minecraft:acacia_log",
      "minecraft:dark_oak_log",
      "minecraft:mangrove_log",
      "minecraft:cherry_log",
      "minecraft:pale_oak_log",
      "minecraft:crimson_stem",
      "minecraft:warped_stem",
    ], ({ targetLogCount }) => targetLogCount, 90),
    itemRequirement(
      "cobblestone",
      ["minecraft:cobblestone"],
      ({ targetCobblestoneCount }) => targetCobblestoneCount,
      80,
    ),
    itemRequirement(
      "iron",
      ["minecraft:iron_ingot"],
      ({ targetIronCount }) => targetIronCount,
      70,
    ),
    itemRequirement(
      "pickaxe",
      ["minecraft:iron_pickaxe", "minecraft:stone_pickaxe"],
      () => 1,
      68,
    ),
    itemRequirement(
      "water-bucket",
      ["minecraft:water_bucket"],
      () => 1,
      65,
    ),
    itemRequirement(
      "ignition",
      ["minecraft:flint_and_steel", "minecraft:fire_charge"],
      () => 1,
      60,
    ),
    itemRequirement(
      "shield",
      ["minecraft:shield"],
      () => 1,
      50,
    ),
  ],
  [BeatGamePhase.ENTER_NETHER]: [
    itemRequirement(
      "obsidian",
      ["minecraft:obsidian"],
      ({ targetObsidianCount }) => targetObsidianCount,
      100,
    ),
    itemRequirement(
      "ignition",
      ["minecraft:flint_and_steel", "minecraft:fire_charge"],
      () => 1,
      90,
    ),
  ],
  [BeatGamePhase.COLLECT_NETHER_RESOURCES]: [
    itemRequirement(
      "blaze-rods",
      ["minecraft:blaze_rod"],
      ({ targetBlazeRodCount }) => targetBlazeRodCount,
      100,
    ),
    itemRequirement(
      "ender-pearls",
      ["minecraft:ender_pearl"],
      ({ targetEnderPearlCount }) => targetEnderPearlCount,
      90,
    ),
  ],
  [BeatGamePhase.RETURN_TO_OVERWORLD]: [],
  [BeatGamePhase.LOCATE_STRONGHOLD]: [
    itemRequirement(
      "eyes-of-ender",
      ["minecraft:ender_eye"],
      ({ targetEyeCount }) => targetEyeCount,
      100,
    ),
  ],
  [BeatGamePhase.ACTIVATE_END_PORTAL]: [
    itemRequirement(
      "eyes-of-ender",
      ["minecraft:ender_eye"],
      ({ targetEyeCount }) => targetEyeCount,
      100,
    ),
  ],
  [BeatGamePhase.FIGHT_ENDER_DRAGON]: [
    itemRequirement("food", [
      "minecraft:cooked_beef",
      "minecraft:cooked_porkchop",
      "minecraft:cooked_mutton",
      "minecraft:bread",
    ], ({ targetFoodCount }) => targetFoodCount, 100),
    itemRequirement(
      "ranged-weapon",
      ["minecraft:bow", "minecraft:crossbow"],
      () => 1,
      80,
    ),
    itemRequirement(
      "arrows",
      ["minecraft:arrow"],
      () => 32,
      75,
    ),
  ],
  [BeatGamePhase.COMPLETE]: [],
};

export function requirementsForPhase(
  phase: BeatGamePhase,
  inventory: BeatGameInventory,
  strategy: BeatGameStrategy,
): readonly BeatGameItemRequirement[] {
  const definitions = phase === BeatGamePhase.ENTER_NETHER
    ? portalRequirements(inventory, strategy)
    : REQUIREMENTS[phase];
  return definitions
    .map((definition) =>
      materializeRequirement(definition, inventory, strategy)
    )
    .sort((left, right) =>
      right.priority - left.priority || left.key.localeCompare(right.key)
    );
}

function portalRequirements(
  inventory: BeatGameInventory,
  strategy: BeatGameStrategy,
): readonly BeatGameRequirementDefinition[] {
  const hasCompleteObsidianFrame =
    (inventory.counts["minecraft:obsidian"] ?? 0)
      >= strategy.targetObsidianCount;
  const useObsidian = strategy.portalStrategy === PortalStrategy.OBSIDIAN
    || (
      strategy.portalStrategy === PortalStrategy.AUTO
      && hasCompleteObsidianFrame
    );
  return [
    ...(
      useObsidian
        && !hasCompleteObsidianFrame
        && (inventory.counts["minecraft:diamond_pickaxe"] ?? 0) === 0
        ? [itemRequirement(
          "diamond-pickaxe",
          ["minecraft:diamond_pickaxe"],
          () => 1,
          110,
        )]
        : []
    ),
    useObsidian
      ? itemRequirement(
        "obsidian",
        ["minecraft:obsidian"],
        ({ targetObsidianCount }) => targetObsidianCount,
        100,
      )
      : itemRequirement(
        "lava-bucket",
        ["minecraft:lava_bucket"],
        () => 1,
        100,
      ),
    itemRequirement(
      "water-bucket",
      ["minecraft:water_bucket"],
      () => 1,
      95,
    ),
    itemRequirement(
      "ignition",
      ["minecraft:flint_and_steel", "minecraft:fire_charge"],
      () => 1,
      90,
    ),
  ];
}

export function unsatisfiedRequirements(
  phase: BeatGamePhase,
  inventory: BeatGameInventory,
  strategy: BeatGameStrategy,
): readonly BeatGameItemRequirement[] {
  return requirementsForPhase(phase, inventory, strategy)
    .filter(({ satisfied }) => !satisfied);
}

export function requirementCount(
  inventory: BeatGameInventory,
  definition: Pick<
    BeatGameRequirementDefinition,
    "itemIds" | "tags"
  >,
): number {
  const direct = (definition.itemIds ?? []).reduce(
    (total, itemId) => total + (inventory.counts[itemId] ?? 0),
    0,
  );
  const tagged = (definition.tags ?? []).reduce(
    (total, tag) => total + (inventory.counts[`#${tag}`] ?? 0),
    0,
  );
  return Math.max(direct, tagged);
}

function materializeRequirement(
  definition: BeatGameRequirementDefinition,
  inventory: BeatGameInventory,
  strategy: BeatGameStrategy,
): BeatGameItemRequirement {
  const targetCount = nonNegativeInteger(
    definition.target(strategy),
    `${definition.key}.target`,
  );
  const currentCount = requirementCount(inventory, definition);
  return {
    key: definition.key,
    itemIds: definition.itemIds ?? [],
    tags: definition.tags ?? [],
    targetCount,
    currentCount,
    priority: definition.priority,
    satisfied: currentCount >= targetCount,
  };
}

function itemRequirement(
  key: string,
  itemIds: readonly string[],
  target: BeatGameRequirementDefinition["target"],
  priority: number,
): BeatGameRequirementDefinition {
  return { key, itemIds, target, priority };
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number`);
  }
  return Math.floor(value);
}
