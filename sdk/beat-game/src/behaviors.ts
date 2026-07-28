import { Effect } from "effect";

import { BeatGameDriverError } from "./errors.js";
import {
  createNetherPortalFrame,
  horizontalDirection,
  rotationToward,
  triangulateStronghold,
  type PortalFrame,
} from "./geometry.js";
import {
  defaultBeatGameStrategy,
  type BeatGameBlockObservation,
  type BeatGameBlockPosition,
  type BeatGameEntityObservation,
  type BeatGameEyeSample,
  type BeatGameItemRequirement,
  type BeatGamePathPolicy,
  type BeatGamePosition,
} from "./model.js";
import type {
  BeatGameBuildBlock,
  BeatGameContainerTransfer,
  BeatGameDriver,
  BeatGameEntitySelector,
  BeatGameItemSelector,
  BeatGameLoadoutRequirement,
  BeatGamePrimitiveAction,
  BeatGameQueryBlocks,
  BeatGameTask,
} from "./driver.js";

export interface BeatGameBehaviorOptions {
  readonly path?: Partial<BeatGamePathPolicy>;
}

export interface AcquireOptions extends BeatGameBehaviorOptions {
  readonly searchRadius?: number;
}

export function acquire(
  driver: BeatGameDriver,
  requirement: BeatGameItemRequirement,
  options: AcquireOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  const missing = Math.max(
    0,
    requirement.targetCount - requirement.currentCount,
  );
  if (missing === 0) {
    return Effect.void;
  }
  return collectBlocks(driver, {
    blockIds: requirement.itemIds,
    tags: requirement.tags,
    count: missing,
    searchRadius: options.searchRadius
      ?? defaultBeatGameStrategy.blockSearchRadius,
    ...(options.path === undefined ? {} : { path: options.path }),
  });
}

export interface CollectBlocksOptions extends BeatGameBehaviorOptions {
  readonly blockIds: readonly string[];
  readonly tags?: readonly string[];
  readonly count: number;
  readonly searchRadius?: number;
}

export function collectBlocks(
  driver: BeatGameDriver,
  options: CollectBlocksOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "collect-blocks",
    blockIds: options.blockIds,
    tags: options.tags ?? [],
    count: positiveInteger(options.count, "count"),
    searchRadius: options.searchRadius
      ?? defaultBeatGameStrategy.blockSearchRadius,
  }, options.path);
}

export interface ExcavateOptions extends BeatGameBehaviorOptions {
  readonly from: BeatGameBlockPosition;
  readonly to: BeatGameBlockPosition;
  readonly maximumBlocks?: number;
}

export function excavate(
  driver: BeatGameDriver,
  options: ExcavateOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "excavate",
    from: options.from,
    to: options.to,
    ...(options.maximumBlocks === undefined
      ? {}
      : { maximumBlocks: options.maximumBlocks }),
  }, options.path);
}

export interface AttackEntityOptions extends BeatGameBehaviorOptions {
  readonly target: Pick<
    BeatGameEntityObservation,
    "connectionEpoch" | "networkId"
  >;
  readonly attackRange?: number;
  readonly sprinting?: boolean;
  readonly maximumAttacks?: number;
  readonly targetUnavailableTimeoutSeconds?: number;
  readonly selectBestWeapon?: boolean;
  readonly weapon?: BeatGameItemSelector;
  readonly restoreSelectedSlot?: boolean;
}

export function attackEntity(
  driver: BeatGameDriver,
  options: AttackEntityOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "attack-entity",
    target: options.target,
    ...(options.attackRange === undefined
      ? {}
      : { attackRange: options.attackRange }),
    ...(options.sprinting === undefined
      ? {}
      : { sprinting: options.sprinting }),
    ...(options.maximumAttacks === undefined
      ? {}
      : { maximumAttacks: options.maximumAttacks }),
    ...(options.targetUnavailableTimeoutSeconds === undefined
      ? {}
      : {
        targetUnavailableTimeoutSeconds:
          options.targetUnavailableTimeoutSeconds,
      }),
    ...(options.selectBestWeapon === undefined
      ? {}
      : { selectBestWeapon: options.selectBestWeapon }),
    ...(options.weapon === undefined ? {} : { weapon: options.weapon }),
    ...(options.restoreSelectedSlot === undefined
      ? {}
      : { restoreSelectedSlot: options.restoreSelectedSlot }),
  }, options.path);
}

export interface AttackNearestOptions extends BeatGameBehaviorOptions {
  readonly selector: BeatGameEntitySelector;
  readonly radius?: number;
  readonly attackRange?: number;
  readonly sprinting?: boolean;
  readonly maximumAttacks?: number;
  readonly maximumTargets?: number;
  readonly noTargetTimeoutSeconds?: number;
  readonly completeWhenNoTarget?: boolean;
  readonly selectBestWeapon?: boolean;
  readonly weapon?: BeatGameItemSelector;
  readonly restoreSelectedSlot?: boolean;
}

export function attackNearest(
  driver: BeatGameDriver,
  options: AttackNearestOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "attack-nearest",
    selector: options.selector,
    radius: options.radius ?? defaultBeatGameStrategy.entitySearchRadius,
    ...(options.attackRange === undefined
      ? {}
      : { attackRange: options.attackRange }),
    ...(options.sprinting === undefined
      ? {}
      : { sprinting: options.sprinting }),
    ...(options.maximumAttacks === undefined
      ? {}
      : { maximumAttacks: options.maximumAttacks }),
    ...(options.maximumTargets === undefined
      ? {}
      : { maximumTargets: options.maximumTargets }),
    ...(options.noTargetTimeoutSeconds === undefined
      ? {}
      : { noTargetTimeoutSeconds: options.noTargetTimeoutSeconds }),
    ...(options.completeWhenNoTarget === undefined
      ? {}
      : { completeWhenNoTarget: options.completeWhenNoTarget }),
    ...(options.selectBestWeapon === undefined
      ? {}
      : { selectBestWeapon: options.selectBestWeapon }),
    ...(options.weapon === undefined ? {} : { weapon: options.weapon }),
    ...(options.restoreSelectedSlot === undefined
      ? {}
      : { restoreSelectedSlot: options.restoreSelectedSlot }),
  }, options.path);
}

export interface RangedAttackOptions extends BeatGameBehaviorOptions {
  readonly target: Pick<
    BeatGameEntityObservation,
    "connectionEpoch" | "networkId"
  >;
  readonly minimumRange?: number;
  readonly maximumRange?: number;
  readonly maximumShots?: number;
  readonly targetUnavailableTimeoutSeconds?: number;
  readonly weapon?: BeatGameItemSelector;
  readonly bowDrawTicks?: number;
  readonly leadTarget?: boolean;
  readonly compensateGravity?: boolean;
  readonly strafe?: boolean;
  readonly restoreSelectedSlot?: boolean;
}

export function rangedAttack(
  driver: BeatGameDriver,
  options: RangedAttackOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "ranged-attack",
    target: options.target,
    ...(options.minimumRange === undefined
      ? {}
      : { minimumRange: options.minimumRange }),
    ...(options.maximumRange === undefined
      ? {}
      : { maximumRange: options.maximumRange }),
    ...(options.maximumShots === undefined
      ? {}
      : { maximumShots: options.maximumShots }),
    ...(options.targetUnavailableTimeoutSeconds === undefined
      ? {}
      : {
        targetUnavailableTimeoutSeconds:
          options.targetUnavailableTimeoutSeconds,
      }),
    ...(options.weapon === undefined ? {} : { weapon: options.weapon }),
    ...(options.bowDrawTicks === undefined
      ? {}
      : { bowDrawTicks: options.bowDrawTicks }),
    ...(options.leadTarget === undefined
      ? {}
      : { leadTarget: options.leadTarget }),
    ...(options.compensateGravity === undefined
      ? {}
      : { compensateGravity: options.compensateGravity }),
    ...(options.strafe === undefined ? {} : { strafe: options.strafe }),
    ...(options.restoreSelectedSlot === undefined
      ? {}
      : { restoreSelectedSlot: options.restoreSelectedSlot }),
  }, options.path);
}

export interface FleeOptions extends BeatGameBehaviorOptions {
  readonly selector: BeatGameEntitySelector;
  readonly triggerRadius?: number;
  readonly safeDistance?: number;
  readonly safeSeconds?: number;
  readonly completeWhenSafe?: boolean;
  readonly maximumEscapes?: number;
}

export function flee(
  driver: BeatGameDriver,
  options: FleeOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "flee",
    selector: options.selector,
    ...(options.triggerRadius === undefined
      ? {}
      : { triggerRadius: options.triggerRadius }),
    ...(options.safeDistance === undefined
      ? {}
      : { safeDistance: options.safeDistance }),
    ...(options.safeSeconds === undefined
      ? {}
      : { safeSeconds: options.safeSeconds }),
    ...(options.completeWhenSafe === undefined
      ? {}
      : { completeWhenSafe: options.completeWhenSafe }),
    ...(options.maximumEscapes === undefined
      ? {}
      : { maximumEscapes: options.maximumEscapes }),
  }, options.path);
}

export interface GuardOptions extends BeatGameBehaviorOptions {
  readonly position: BeatGameBlockPosition;
  readonly selector: BeatGameEntitySelector;
  readonly guardRadius?: number;
  readonly maximumPursuitDistance?: number;
  readonly returnRadius?: number;
  readonly attackRange?: number;
  readonly sprinting?: boolean;
  readonly maximumAttacks?: number;
  readonly maximumTargets?: number;
  readonly completeWhenClear?: boolean;
  readonly clearSeconds?: number;
  readonly selectBestWeapon?: boolean;
  readonly weapon?: BeatGameItemSelector;
  readonly restoreSelectedSlot?: boolean;
}

export function guard(
  driver: BeatGameDriver,
  options: GuardOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "guard",
    position: options.position,
    selector: options.selector,
    ...(options.guardRadius === undefined
      ? {}
      : { guardRadius: options.guardRadius }),
    ...(options.maximumPursuitDistance === undefined
      ? {}
      : { maximumPursuitDistance: options.maximumPursuitDistance }),
    ...(options.returnRadius === undefined
      ? {}
      : { returnRadius: options.returnRadius }),
    ...(options.attackRange === undefined
      ? {}
      : { attackRange: options.attackRange }),
    ...(options.sprinting === undefined
      ? {}
      : { sprinting: options.sprinting }),
    ...(options.maximumAttacks === undefined
      ? {}
      : { maximumAttacks: options.maximumAttacks }),
    ...(options.maximumTargets === undefined
      ? {}
      : { maximumTargets: options.maximumTargets }),
    ...(options.completeWhenClear === undefined
      ? {}
      : { completeWhenClear: options.completeWhenClear }),
    ...(options.clearSeconds === undefined
      ? {}
      : { clearSeconds: options.clearSeconds }),
    ...(options.selectBestWeapon === undefined
      ? {}
      : { selectBestWeapon: options.selectBestWeapon }),
    ...(options.weapon === undefined ? {} : { weapon: options.weapon }),
    ...(options.restoreSelectedSlot === undefined
      ? {}
      : { restoreSelectedSlot: options.restoreSelectedSlot }),
  }, options.path);
}

export interface EatWhenNeededOptions extends BeatGameBehaviorOptions {
  readonly foodItemIds?: readonly string[];
  readonly foodLevel?: number;
  readonly maximumMeals?: number;
}

export function eatWhenNeeded(
  driver: BeatGameDriver,
  options: EatWhenNeededOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "auto-eat",
    foodItemIds: options.foodItemIds ?? [],
    foodLevel: options.foodLevel ?? defaultBeatGameStrategy.eatBelowFood,
    ...(options.maximumMeals === undefined
      ? {}
      : { maximumMeals: options.maximumMeals }),
  }, options.path);
}

export interface RespawnAndRecoverOptions extends BeatGameBehaviorOptions {
  readonly deathPosition?: BeatGamePosition;
  readonly searchRadius?: number;
}

export function respawnAndRecover(
  driver: BeatGameDriver,
  options: RespawnAndRecoverOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const before = yield* driver.observe;
    if (before.player.dead) {
      yield* runControlled(driver, {
        type: "auto-respawn",
        maximumRespawns: 1,
      }, options.path);
    }
    if (options.deathPosition === undefined) {
      return;
    }
    const drops = yield* driver.queryEntities({
      origin: options.deathPosition,
      radius: options.searchRadius ?? 24,
      selector: { alive: true, categories: [6] },
      maximumResults: 64,
    });
    for (const drop of drops) {
      yield* driver.pathfind(
        drop.position,
        1,
        mergePathPolicy(options.path),
      );
    }
  });
}

export function equipBestArmor(
  driver: BeatGameDriver,
  options: BeatGameBehaviorOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, { type: "auto-armor" }, options.path);
}

export function keepTotemEquipped(
  driver: BeatGameDriver,
  options: BeatGameBehaviorOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, { type: "auto-totem" }, options.path);
}

export interface FishOptions extends BeatGameBehaviorOptions {
  readonly maximumCatches?: number;
}

export function fish(
  driver: BeatGameDriver,
  options: FishOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "fish",
    ...(options.maximumCatches === undefined
      ? {}
      : { maximumCatches: options.maximumCatches }),
  }, options.path);
}

export interface FarmOptions extends BeatGameBehaviorOptions {
  readonly cropIds?: readonly string[];
  readonly center?: BeatGameBlockPosition;
  readonly radius?: number;
  readonly maximumHarvests?: number;
}

export function farm(
  driver: BeatGameDriver,
  options: FarmOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "farm",
    cropIds: options.cropIds ?? [],
    ...(options.center === undefined ? {} : { center: options.center }),
    ...(options.radius === undefined ? {} : { radius: options.radius }),
    ...(options.maximumHarvests === undefined
      ? {}
      : { maximumHarvests: options.maximumHarvests }),
  }, options.path);
}

export interface BreedOptions extends BeatGameBehaviorOptions {
  readonly selector?: BeatGameEntitySelector;
  readonly food?: BeatGameItemSelector;
  readonly maximumPairs?: number;
}

export function breed(
  driver: BeatGameDriver,
  options: BreedOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "breed",
    ...(options.selector === undefined
      ? {}
      : { selector: options.selector }),
    ...(options.food === undefined ? {} : { food: options.food }),
    ...(options.maximumPairs === undefined
      ? {}
      : { maximumPairs: options.maximumPairs }),
  }, options.path);
}

export interface ExploreOptions extends BeatGameBehaviorOptions {
  readonly origin?: BeatGameBlockPosition;
  readonly radius?: number;
  readonly maximumWaypoints?: number;
  readonly purpose?: string;
}

export function explore(
  driver: BeatGameDriver,
  options: ExploreOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "explore",
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    radius: options.radius ?? defaultBeatGameStrategy.explorationRadius,
    ...(options.maximumWaypoints === undefined
      ? {}
      : { maximumWaypoints: options.maximumWaypoints }),
    ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
  }, options.path);
}

export interface TransferContainerItemsOptions
  extends BeatGameBehaviorOptions {
  readonly direction: "deposit" | "withdraw";
  readonly container: BeatGameBlockPosition;
  readonly operations: readonly BeatGameContainerTransfer[];
}

export function transferContainerItems(
  driver: BeatGameDriver,
  options: TransferContainerItemsOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "transfer-container",
    direction: options.direction,
    container: options.container,
    operations: options.operations,
  }, options.path);
}

export interface MaintainLoadoutOptions extends BeatGameBehaviorOptions {
  readonly container: BeatGameBlockPosition;
  readonly requirements: readonly BeatGameLoadoutRequirement[];
}

export function maintainLoadout(
  driver: BeatGameDriver,
  options: MaintainLoadoutOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "maintain-loadout",
    container: options.container,
    requirements: options.requirements,
  }, options.path);
}

export interface CraftOptions extends BeatGameBehaviorOptions {
  readonly recipeId: string;
  readonly count?: number;
  readonly station?: BeatGameBlockPosition;
}

export function craft(
  driver: BeatGameDriver,
  options: CraftOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "craft",
    recipeId: options.recipeId,
    count: positiveInteger(options.count ?? 1, "count"),
    ...(options.station === undefined ? {} : { station: options.station }),
  }, options.path);
}

export interface CraftItemOptions extends BeatGameBehaviorOptions {
  readonly resultItemId: string;
  readonly count?: number;
  readonly station?: BeatGameBlockPosition;
  readonly maximumDependencyDepth?: number;
}

export function craftItem(
  driver: BeatGameDriver,
  options: CraftItemOptions,
): Effect.Effect<void, BeatGameDriverError> {
  const requestedCount = positiveInteger(options.count ?? 1, "count");
  const maximumDepth = positiveInteger(
    options.maximumDependencyDepth ?? 12,
    "maximumDependencyDepth",
  );
  return craftItemDependencies(
    driver,
    options.resultItemId,
    requestedCount,
    options,
    [],
    maximumDepth,
  );
}

export interface SmeltOptions extends BeatGameBehaviorOptions {
  readonly input: BeatGameItemSelector;
  readonly count?: number;
  readonly fuel?: BeatGameItemSelector;
  readonly station?: BeatGameBlockPosition;
}

export function smelt(
  driver: BeatGameDriver,
  options: SmeltOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "smelt",
    input: options.input,
    count: positiveInteger(options.count ?? 1, "count"),
    ...(options.fuel === undefined ? {} : { fuel: options.fuel }),
    ...(options.station === undefined ? {} : { station: options.station }),
  }, options.path);
}

export interface BrewOptions extends BeatGameBehaviorOptions {
  readonly input: BeatGameItemSelector;
  readonly ingredient: BeatGameItemSelector;
  readonly count?: number;
  readonly fuel?: BeatGameItemSelector;
  readonly station?: BeatGameBlockPosition;
  readonly expectedResult?: BeatGameItemSelector;
}

export function brew(
  driver: BeatGameDriver,
  options: BrewOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "brew",
    input: options.input,
    ingredient: options.ingredient,
    count: positiveInteger(options.count ?? 1, "count"),
    ...(options.fuel === undefined ? {} : { fuel: options.fuel }),
    ...(options.station === undefined ? {} : { station: options.station }),
    ...(options.expectedResult === undefined
      ? {}
      : { expectedResult: options.expectedResult }),
  }, options.path);
}

export interface TradeOptions extends BeatGameBehaviorOptions {
  readonly offerIndex: number;
  readonly count?: number;
  readonly expectedResult?: BeatGameItemSelector;
}

export function trade(
  driver: BeatGameDriver,
  options: TradeOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "trade",
    offerIndex: nonNegativeInteger(options.offerIndex, "offerIndex"),
    count: positiveInteger(options.count ?? 1, "count"),
    ...(options.expectedResult === undefined
      ? {}
      : { expectedResult: options.expectedResult }),
  }, options.path);
}

export interface BuildStructureOptions extends BeatGameBehaviorOptions {
  readonly origin: BeatGameBlockPosition;
  readonly blocks: readonly BeatGameBuildBlock[];
  readonly partitionIndex?: number;
  readonly partitionCount?: number;
}

export function buildStructure(
  driver: BeatGameDriver,
  options: BuildStructureOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return runControlled(driver, {
    type: "build",
    origin: options.origin,
    blocks: options.blocks,
    ...(options.partitionIndex === undefined
      ? {}
      : { partitionIndex: options.partitionIndex }),
    ...(options.partitionCount === undefined
      ? {}
      : { partitionCount: options.partitionCount }),
  }, options.path);
}

export interface BuildNetherPortalOptions extends BeatGameBehaviorOptions {
  readonly origin: BeatGameBlockPosition;
  readonly axis?: "x" | "z";
  readonly ignite?: boolean;
}

export function buildNetherPortal(
  driver: BeatGameDriver,
  options: BuildNetherPortalOptions,
): Effect.Effect<PortalFrame, BeatGameDriverError> {
  return Effect.gen(function* () {
    const frame = createNetherPortalFrame(options.origin, options.axis);
    const existing = yield* driver.queryBlocks({
      center: {
        x: options.origin.x + (frame.axis === "x" ? 1.5 : 0),
        y: options.origin.y + 2,
        z: options.origin.z + (frame.axis === "z" ? 1.5 : 0),
        dimension: options.origin.dimension,
      },
      radius: 5,
      selector: { blockIds: ["minecraft:obsidian"] },
      maximumResults: 32,
    });
    const occupied = new Set(existing.map(({ position }) =>
      positionKey(position)
    ));
    const missing = frame.blocks.filter((position) =>
      !occupied.has(positionKey(position))
    );
    if (missing.length > 0) {
      yield* buildStructure(driver, {
        origin: frame.origin,
        blocks: missing.map((position): BeatGameBuildBlock => ({
          offset: {
            x: position.x - frame.origin.x,
            y: position.y - frame.origin.y,
            z: position.z - frame.origin.z,
          },
          blockId: "minecraft:obsidian",
        })),
        ...(options.path === undefined ? {} : { path: options.path }),
      });
      const built = yield* driver.queryBlocks({
        center: frame.origin,
        radius: 8,
        selector: { blockIds: ["minecraft:obsidian"] },
        maximumResults: 64,
      });
      const builtKeys = new Set(built.map(({ position }) =>
        positionKey(position)
      ));
      if (missing.some((position) => !builtKeys.has(positionKey(position)))) {
        return yield* Effect.fail(behaviorError(
          driver,
          "The generic build task did not complete the Nether portal frame",
        ));
      }
    }
    if (options.ignite ?? true) {
      yield* ignitePortal(driver, frame, true, options.path);
    }
    return frame;
  });
}

export interface CastPortalStep {
  readonly itemIds: readonly string[];
  readonly action: BeatGamePrimitiveAction;
  readonly expectedBlock?: {
    readonly position: BeatGameBlockPosition;
    readonly blockIds: readonly string[];
  };
  readonly observationDelayMs?: number;
}

export interface CastNetherPortalOptions extends BeatGameBehaviorOptions {
  readonly origin: BeatGameBlockPosition;
  readonly axis?: "x" | "z";
  readonly steps?: readonly CastPortalStep[];
  readonly ignite?: boolean;
}

export function castNetherPortal(
  driver: BeatGameDriver,
  options: CastNetherPortalOptions,
): Effect.Effect<PortalFrame, BeatGameDriverError> {
  const frame = createNetherPortalFrame(options.origin, options.axis);
  if (options.steps === undefined) {
    return castNetherPortalFromLavaPool(driver, frame, options);
  }
  return driver.withControl(
    Effect.gen(function* () {
      for (const step of options.steps ?? []) {
        const target = primitiveActionPosition(step.action);
        if (target !== undefined) {
          yield* driver.pathfind(
            target,
            3,
            mergePathPolicy(options.path),
          );
        }
        yield* driver.act({
          type: "select-item",
          selector: { itemIds: step.itemIds },
        });
        yield* driver.act(step.action);
        if (step.expectedBlock !== undefined) {
          yield* Effect.sleep(step.observationDelayMs ?? 250);
          yield* requireObservedBlock(
            driver,
            step.expectedBlock.position,
            step.expectedBlock.blockIds,
            "cast portal step",
          );
        }
      }
      if (options.ignite ?? true) {
        yield* ignitePortal(driver, frame, false, options.path);
      }
      return frame;
    }).pipe(Effect.ensuring(driver.act({ type: "reset-movement" }).pipe(
      Effect.ignore,
    ))),
  );
}

export interface EnterPortalOptions extends BeatGameBehaviorOptions {
  readonly portal?: BeatGameBlockPosition;
  readonly searchOrigin?: BeatGamePosition;
  readonly searchRadius?: number;
}

export function enterPortal(
  driver: BeatGameDriver,
  options: EnterPortalOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const observation = yield* driver.observe;
    const origin = options.searchOrigin ?? observation.player.position;
    const target = options.portal ?? (yield* driver.queryBlocks({
      center: origin,
      radius: options.searchRadius ?? 48,
      selector: { blockIds: ["minecraft:nether_portal"] },
      maximumResults: 1,
    }))[0]?.position;
    if (target === undefined) {
      return yield* Effect.fail(behaviorError(
        driver,
        "No Nether portal is observable",
      ));
    }
    yield* driver.pathfind(target, 0, mergePathPolicy(options.path));
  });
}

export interface ThrowItemOptions {
  readonly target?: BeatGamePosition;
  readonly yaw?: number;
  readonly pitch?: number;
}

export function throwEnderPearl(
  driver: BeatGameDriver,
  options: ThrowItemOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return throwSelectedItem(
    driver,
    ["minecraft:ender_pearl"],
    options,
  );
}

export interface ThrowEyeOptions extends ThrowItemOptions {
  readonly observationRadius?: number;
  readonly observationDelayMs?: number;
}

export function throwEyeOfEnder(
  driver: BeatGameDriver,
  options: ThrowEyeOptions = {},
): Effect.Effect<BeatGameEyeSample, BeatGameDriverError> {
  return driver.withControl(Effect.gen(function* () {
    const before = yield* driver.observe;
    const previous = yield* driver.queryEntities({
      origin: before.player.position,
      radius: options.observationRadius ?? 64,
      selector: { entityTypes: ["minecraft:eye_of_ender"] },
      maximumResults: 32,
    });
    const previousIds = new Set(previous.map(({ networkId }) => networkId));
    yield* driver.act({
      type: "select-item",
      selector: { itemIds: ["minecraft:ender_eye"] },
    });
    yield* lookForThrow(driver, before.player.position, options);
    yield* driver.act({ type: "use-item", hand: "main" });
    yield* Effect.sleep(options.observationDelayMs ?? 750);
    const observed = yield* driver.queryEntities({
      origin: before.player.position,
      radius: options.observationRadius ?? 64,
      selector: { entityTypes: ["minecraft:eye_of_ender"] },
      maximumResults: 32,
    });
    const eye = observed.find(({ networkId }) => !previousIds.has(networkId))
      ?? observed[0];
    if (eye === undefined) {
      return yield* Effect.fail(behaviorError(
        driver,
        "The thrown eye of ender was not observed",
      ));
    }
    const direction = horizontalDirection(
      before.player.position,
      eye.position,
    ) ?? horizontalDirection(
      { x: 0, z: 0 },
      eye.velocity,
    );
    if (direction === undefined) {
      return yield* Effect.fail(behaviorError(
        driver,
        "The observed eye of ender did not provide a direction",
      ));
    }
    return {
      origin: before.player.position,
      direction,
      observedAt: eye.observedAt,
      confidence: Math.hypot(eye.velocity.x, eye.velocity.z) > 0.01
        ? 1
        : 0.7,
    };
  }));
}

export interface ActivateEndPortalOptions extends BeatGameBehaviorOptions {
  readonly center?: BeatGamePosition;
  readonly searchRadius?: number;
  readonly confirmationAttempts?: number;
  readonly confirmationDelayMs?: number;
}

export function activateEndPortal(
  driver: BeatGameDriver,
  options: ActivateEndPortalOptions = {},
): Effect.Effect<number, BeatGameDriverError> {
  return driver.withControl(Effect.gen(function* () {
    const observation = yield* driver.observe;
    const center = options.center ?? observation.player.position;
    const searchRadius = options.searchRadius ?? 32;
    const frames = yield* driver.queryBlocks({
      center,
      radius: searchRadius,
      selector: {
        blockIds: ["minecraft:end_portal_frame"],
        properties: { eye: "false" },
      },
      maximumResults: 12,
    });
    yield* driver.act({
      type: "select-item",
      selector: { itemIds: ["minecraft:ender_eye"] },
    });
    for (const frame of frames) {
      yield* driver.pathfind(
        frame.position,
        3,
        mergePathPolicy(options.path),
      );
      yield* driver.act({
        type: "interact-block",
        position: frame.position,
        face: "up",
        hand: "main",
      });
    }
    const portal = yield* waitForBlock(
      driver,
      {
        center,
        radius: searchRadius,
        selector: { blockIds: ["minecraft:end_portal"] },
        maximumResults: 1,
      },
      positiveInteger(
        options.confirmationAttempts ?? 20,
        "confirmationAttempts",
      ),
      nonNegativeInteger(
        options.confirmationDelayMs ?? 250,
        "confirmationDelayMs",
      ),
    );
    if (portal === undefined) {
      return yield* Effect.fail(behaviorError(
        driver,
        "End portal blocks were not observable after filling the frames",
      ));
    }
    return frames.length;
  }));
}

export interface FightEnderDragonOptions extends BeatGameBehaviorOptions {
  readonly searchRadius?: number;
  readonly maximumCrystalPasses?: number;
  readonly crystalRangedShotsPerPass?: number;
  readonly dragonRangedShotsPerPass?: number;
}

export function fightEnderDragon(
  driver: BeatGameDriver,
  options: FightEnderDragonOptions = {},
): Effect.Effect<void, BeatGameDriverError> {
  return Effect.gen(function* () {
    const searchRadius = options.searchRadius ?? 256;
    const maximumCrystalPasses = positiveInteger(
      options.maximumCrystalPasses ?? 6,
      "maximumCrystalPasses",
    );
    const crystalShots = positiveInteger(
      options.crystalRangedShotsPerPass ?? 3,
      "crystalRangedShotsPerPass",
    );
    for (let pass = 0; pass < maximumCrystalPasses; pass += 1) {
      const observation = yield* driver.observe;
      const crystals = yield* queryEndEntities(
        driver,
        observation.player.position,
        "minecraft:end_crystal",
        searchRadius,
        32,
      );
      if (crystals.length === 0) {
        break;
      }
      for (const crystal of crystals) {
        const ranged = yield* rangedAttack(driver, {
          target: crystal,
          maximumShots: crystalShots,
          targetUnavailableTimeoutSeconds: 2,
          ...(options.path === undefined ? {} : { path: options.path }),
        }).pipe(Effect.either);
        if (ranged._tag === "Left") {
          yield* attackEntity(driver, {
            target: crystal,
            maximumAttacks: 4,
            targetUnavailableTimeoutSeconds: 2,
            ...(options.path === undefined ? {} : { path: options.path }),
          }).pipe(Effect.ignore);
        }
      }
    }
    const afterCrystals = yield* driver.observe;
    const remainingCrystals = yield* queryEndEntities(
      driver,
      afterCrystals.player.position,
      "minecraft:end_crystal",
      searchRadius,
      1,
    );
    if (remainingCrystals.length > 0) {
      return yield* Effect.fail(behaviorError(
        driver,
        "End crystals remain after the configured attack passes",
      ));
    }
    const dragons = yield* queryEndEntities(
      driver,
      afterCrystals.player.position,
      "minecraft:ender_dragon",
      searchRadius,
      1,
    );
    const dragon = dragons[0];
    if (dragon === undefined) {
      return;
    }
    yield* rangedAttack(driver, {
      target: dragon,
      maximumShots: positiveInteger(
        options.dragonRangedShotsPerPass ?? 8,
        "dragonRangedShotsPerPass",
      ),
      targetUnavailableTimeoutSeconds: 3,
      ...(options.path === undefined ? {} : { path: options.path }),
    }).pipe(Effect.catchAll(() =>
      attackEntity(driver, {
        target: dragon,
        maximumAttacks: 16,
        targetUnavailableTimeoutSeconds: 3,
        ...(options.path === undefined ? {} : { path: options.path }),
      })
    ));
    yield* attackNearest(driver, {
      selector: {
        entityTypes: ["minecraft:ender_dragon"],
        alive: true,
      },
      radius: searchRadius,
      maximumTargets: 1,
      noTargetTimeoutSeconds: 3,
      completeWhenNoTarget: true,
      ...(options.path === undefined ? {} : { path: options.path }),
    });
    const finalObservation = yield* driver.observe;
    const remainingDragons = yield* queryEndEntities(
      driver,
      finalObservation.player.position,
      "minecraft:ender_dragon",
      searchRadius,
      1,
    );
    if (remainingDragons.length > 0) {
      return yield* Effect.fail(behaviorError(
        driver,
        "The Ender Dragon is still alive after the configured attack pass",
      ));
    }
  });
}

export { triangulateStronghold };

function runControlled(
  driver: BeatGameDriver,
  task: BeatGameTask,
  path: Partial<BeatGamePathPolicy> | undefined,
): Effect.Effect<void, BeatGameDriverError> {
  return driver.withControl(
    driver.runTask(task, mergePathPolicy(path)).pipe(
      Effect.asVoid,
      Effect.ensuring(driver.act({ type: "reset-movement" }).pipe(
        Effect.ignore,
      )),
    ),
  );
}

function throwSelectedItem(
  driver: BeatGameDriver,
  itemIds: readonly string[],
  options: ThrowItemOptions,
): Effect.Effect<void, BeatGameDriverError> {
  return driver.withControl(Effect.gen(function* () {
    const observation = yield* driver.observe;
    yield* driver.act({
      type: "select-item",
      selector: { itemIds },
    });
    yield* lookForThrow(driver, observation.player.position, options);
    yield* driver.act({ type: "use-item", hand: "main" });
  }));
}

function lookForThrow(
  driver: BeatGameDriver,
  origin: BeatGamePosition,
  options: ThrowItemOptions,
): Effect.Effect<unknown, BeatGameDriverError> {
  const rotation = options.target === undefined
    ? {
        yaw: options.yaw ?? 0,
        pitch: options.pitch ?? -20,
      }
    : rotationToward(origin, options.target);
  return driver.act({
    type: "look",
    yaw: options.yaw ?? rotation.yaw,
    pitch: options.pitch ?? rotation.pitch,
  });
}

function ignitePortal(
  driver: BeatGameDriver,
  frame: PortalFrame,
  acquireControl = true,
  path?: Partial<BeatGamePathPolicy>,
): Effect.Effect<void, BeatGameDriverError> {
  const interior = frame.interior[0];
  if (interior === undefined) {
    return Effect.void;
  }
  const base = frame.blocks.find((block) =>
    block.y === frame.origin.y
    && (
      block.x === interior.x
      || block.z === interior.z
    )
  ) ?? frame.origin;
  const program = Effect.gen(function* () {
    yield* driver.act({
      type: "select-item",
      selector: {
        itemIds: ["minecraft:flint_and_steel", "minecraft:fire_charge"],
      },
    });
    yield* driver.pathfind(base, 3, mergePathPolicy(path));
    yield* driver.act({
      type: "interact-block",
      position: base,
      face: "up",
      hand: "main",
    });
    yield* Effect.sleep(250);
    const portals = yield* driver.queryBlocks({
      center: interior,
      radius: 3,
      selector: { blockIds: ["minecraft:nether_portal"] },
      maximumResults: frame.interior.length,
    });
    if (!portals.some(({ position }) => samePosition(position, interior))) {
      return yield* Effect.fail(behaviorError(
        driver,
        "The Nether portal did not activate after ignition",
      ));
    }
  });
  return acquireControl ? driver.withControl(program) : program;
}

function castNetherPortalFromLavaPool(
  driver: BeatGameDriver,
  frame: PortalFrame,
  options: CastNetherPortalOptions,
): Effect.Effect<PortalFrame, BeatGameDriverError> {
  return Effect.gen(function* () {
    const observation = yield* driver.observe;
    const existingObsidian = yield* driver.queryBlocks({
      center: frame.origin,
      radius: 8,
      selector: { blockIds: ["minecraft:obsidian"] },
      maximumResults: 64,
    });
    const existingKeys = new Set(existingObsidian.map(({ position }) =>
      positionKey(position)
    ));
    const targets = [...frame.blocks]
      .filter((position) => !existingKeys.has(positionKey(position)))
      .sort((left, right) =>
        left.y - right.y
        || left.x - right.x
        || left.z - right.z
      );
    if (targets.length === 0) {
      if (options.ignite ?? true) {
        yield* ignitePortal(driver, frame, true, options.path);
      }
      return frame;
    }
    const lavaSources = yield* driver.queryBlocks({
      center: observation.player.position,
      radius: defaultBeatGameStrategy.blockSearchRadius,
      selector: {
        blockIds: ["minecraft:lava"],
        properties: { level: "0" },
      },
      maximumResults: Math.max(1, targets.length - 1),
    });
    if (lavaSources.length < targets.length - 1) {
      return yield* Effect.fail(behaviorError(
        driver,
        `Portal casting needs ${
          targets.length - 1
        } observable lava sources in addition to the filled bucket`,
      ));
    }
    const frameKeys = new Set(frame.blocks.map(positionKey));
    const supportCandidates = uniquePositions(targets.flatMap((target) => {
      const support = below(target);
      const water = castingWaterPosition(frame, target);
      return [
        ...(frameKeys.has(positionKey(support)) ? [] : [support]),
        below(water),
      ];
    }));
    const solidBlocks = yield* driver.queryBlocks({
      center: frame.origin,
      radius: 8,
      selector: { solid: true },
      maximumResults: 256,
    });
    const solidKeys = new Set(solidBlocks.map(({ position }) =>
      positionKey(position)
    ));
    const temporarySupports = supportCandidates.filter((position) =>
      !solidKeys.has(positionKey(position))
    );
    if (temporarySupports.length > 0) {
      yield* buildStructure(driver, {
        origin: frame.origin,
        blocks: temporarySupports.map((position) => ({
          offset: {
            x: position.x - frame.origin.x,
            y: position.y - frame.origin.y,
            z: position.z - frame.origin.z,
          },
          blockId: "minecraft:cobblestone",
        })),
        ...(options.path === undefined ? {} : { path: options.path }),
      });
    }
    yield* driver.withControl(Effect.gen(function* () {
      for (const [index, target] of targets.entries()) {
        if (index > 0) {
          const source = lavaSources[index - 1];
          if (source === undefined) {
            return yield* Effect.fail(behaviorError(
              driver,
              "A reserved lava source disappeared during portal casting",
            ));
          }
          yield* driver.pathfind(
            source.position,
            3,
            mergePathPolicy(options.path),
          );
          yield* driver.act({
            type: "select-item",
            selector: { itemIds: ["minecraft:bucket"] },
          });
          yield* driver.act({
            type: "interact-block",
            position: source.position,
            face: "up",
            hand: "main",
          });
        }
        yield* driver.pathfind(
          target,
          3,
          mergePathPolicy(options.path),
        );
        yield* driver.act({
          type: "select-item",
          selector: { itemIds: ["minecraft:lava_bucket"] },
        });
        yield* driver.act({
          type: "interact-block",
          position: below(target),
          face: "up",
          hand: "main",
        });
        const water = castingWaterPosition(frame, target);
        yield* driver.act({
          type: "select-item",
          selector: { itemIds: ["minecraft:water_bucket"] },
        });
        yield* driver.act({
          type: "interact-block",
          position: below(water),
          face: "up",
          hand: "main",
        });
        yield* Effect.sleep(300);
        yield* requireObservedBlock(
          driver,
          target,
          ["minecraft:obsidian"],
          "cast portal block",
        );
        yield* driver.act({
          type: "select-item",
          selector: { itemIds: ["minecraft:bucket"] },
        });
        yield* driver.act({
          type: "interact-block",
          position: water,
          face: "up",
          hand: "main",
        });
      }
      for (const support of temporarySupports) {
        yield* driver.pathfind(
          support,
          4,
          mergePathPolicy(options.path),
        );
        yield* driver.act({ type: "dig-block", position: support });
      }
      if (options.ignite ?? true) {
        yield* ignitePortal(driver, frame, false, options.path);
      }
    }).pipe(Effect.ensuring(
      driver.act({ type: "reset-movement" }).pipe(Effect.ignore),
    )));
    return frame;
  });
}

function primitiveActionPosition(
  action: BeatGamePrimitiveAction,
): BeatGameBlockPosition | undefined {
  switch (action.type) {
    case "dig-block":
    case "interact-block":
      return action.position;
    case "place-block":
      return action.against;
    default:
      return undefined;
  }
}

function queryEndEntities(
  driver: BeatGameDriver,
  origin: BeatGamePosition,
  entityType: string,
  radius: number,
  maximumResults: number,
): Effect.Effect<readonly BeatGameEntityObservation[], BeatGameDriverError> {
  return driver.queryEntities({
    origin,
    radius,
    selector: {
      entityTypes: [entityType],
      alive: true,
    },
    maximumResults,
  });
}

function requireObservedBlock(
  driver: BeatGameDriver,
  position: BeatGameBlockPosition,
  blockIds: readonly string[],
  operation: string,
): Effect.Effect<void, BeatGameDriverError> {
  return driver.queryBlocks({
    center: position,
    radius: 1,
    selector: { blockIds },
    maximumResults: 16,
  }).pipe(
    Effect.flatMap((blocks) =>
      blocks.some((block) => samePosition(block.position, position))
        ? Effect.void
        : Effect.fail(behaviorError(
          driver,
          `${operation} did not produce ${blockIds.join(" or ")}`,
        ))
    ),
  );
}

function waitForBlock(
  driver: BeatGameDriver,
  query: BeatGameQueryBlocks,
  attemptsRemaining: number,
  delayMs: number,
): Effect.Effect<BeatGameBlockObservation | undefined, BeatGameDriverError> {
  return driver.queryBlocks(query).pipe(
    Effect.flatMap((blocks) => {
      const block = blocks[0];
      if (block !== undefined || attemptsRemaining <= 1) {
        return Effect.succeed(block);
      }
      return Effect.sleep(delayMs).pipe(
        Effect.zipRight(
          waitForBlock(
            driver,
            query,
            attemptsRemaining - 1,
            delayMs,
          ),
        ),
      );
    }),
  );
}

function castingWaterPosition(
  frame: PortalFrame,
  target: BeatGameBlockPosition,
): BeatGameBlockPosition {
  return {
    ...target,
    x: target.x + (frame.axis === "z" ? 1 : 0),
    z: target.z + (frame.axis === "x" ? 1 : 0),
  };
}

function below(position: BeatGameBlockPosition): BeatGameBlockPosition {
  return { ...position, y: position.y - 1 };
}

function uniquePositions(
  positions: readonly BeatGameBlockPosition[],
): readonly BeatGameBlockPosition[] {
  return [...new Map(positions.map((position) => [
    positionKey(position),
    position,
  ])).values()];
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

function mergePathPolicy(
  override: Partial<BeatGamePathPolicy> | undefined,
): BeatGamePathPolicy {
  return {
    ...defaultBeatGameStrategy.path,
    ...override,
  };
}

function positionKey(position: BeatGameBlockPosition): string {
  return `${position.dimension}:${position.x}:${position.y}:${position.z}`;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function behaviorError(
  driver: BeatGameDriver,
  message: string,
): BeatGameDriverError {
  return new BeatGameDriverError({
    operation: "behavior",
    retryable: true,
    message: `${driver.instanceId}/${driver.botId}: ${message}`,
  });
}

function craftItemDependencies(
  driver: BeatGameDriver,
  resultItemId: string,
  requestedCount: number,
  options: CraftItemOptions,
  ancestors: readonly string[],
  remainingDepth: number,
): Effect.Effect<void, BeatGameDriverError> {
  if (remainingDepth === 0) {
    return Effect.fail(behaviorError(
      driver,
      `Recipe expansion exceeded its depth limit while producing ${resultItemId}`,
    ));
  }
  if (ancestors.includes(resultItemId)) {
    return Effect.fail(behaviorError(
      driver,
      `Recipe dependency cycle encountered while producing ${resultItemId}`,
    ));
  }
  return Effect.gen(function* () {
    const recipes = yield* driver.recipesFor(resultItemId);
    let lastFailure: BeatGameDriverError | undefined;
    recipeLoop:
    for (const recipe of recipes) {
      if (recipe.resultCount <= 0) {
        continue;
      }
      const operations = Math.ceil(requestedCount / recipe.resultCount);
      let craftability = yield* driver.canCraft(recipe.recipeId, operations);
      if (!craftability.canCraft) {
        for (const missing of craftability.missing) {
          let resolved = false;
          for (const candidate of missing.itemIds) {
            const result = yield* craftItemDependencies(
              driver,
              candidate,
              missing.missing,
              options,
              [...ancestors, resultItemId],
              remainingDepth - 1,
            ).pipe(Effect.either);
            if (result._tag === "Right") {
              resolved = true;
              break;
            }
            lastFailure = result.left;
          }
          if (!resolved) {
            continue recipeLoop;
          }
        }
        craftability = yield* driver.canCraft(recipe.recipeId, operations);
      }
      if (!craftability.canCraft) {
        continue;
      }
      if (
        craftability.requiredStation !== undefined
        && options.station === undefined
      ) {
        lastFailure = behaviorError(
          driver,
          `${craftability.requiredStation} is required to produce ${resultItemId}`,
        );
        continue;
      }
      return yield* craft(driver, {
        recipeId: recipe.recipeId,
        count: operations,
        ...(options.station === undefined
          ? {}
          : { station: options.station }),
        ...(options.path === undefined ? {} : { path: options.path }),
      });
    }
    return yield* Effect.fail(lastFailure ?? behaviorError(
      driver,
      `No known recipe can currently produce ${resultItemId}`,
    ));
  });
}
