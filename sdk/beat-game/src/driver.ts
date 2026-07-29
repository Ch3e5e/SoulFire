import {
  BlockFace,
  BotTaskConflictPolicy,
  BotTaskReconnectPolicy,
  goals,
  Hand,
  InventoryArea,
  QuerySort,
  type SchematicBlock,
  type SoulFireBot,
} from "@soulfiremc/sdk";
import { Effect, Stream } from "effect";

import { BeatGameDriverError } from "./errors.js";
import type {
  BeatGameBlockObservation,
  BeatGameBlockPosition,
  BeatGameEntityObservation,
  BeatGameObservation,
  BeatGamePathPolicy,
  BeatGamePosition,
} from "./model.js";

const CONTROL_LEASE_TTL_SECONDS = 90;
const CONTROL_LEASE_RENEWAL_INTERVAL_MS = 30_000;

export interface BeatGameItemSelector {
  readonly itemIds?: readonly string[];
  readonly tags?: readonly string[];
  readonly minimumCount?: number;
}

export interface BeatGameEntitySelector {
  readonly entityTypes?: readonly string[];
  readonly tags?: readonly string[];
  readonly categories?: readonly number[];
  readonly alive?: boolean;
  readonly requireLineOfSight?: boolean;
}

export interface BeatGameBlockSelector {
  readonly blockIds?: readonly string[];
  readonly tags?: readonly string[];
  readonly properties?: Readonly<Record<string, string>>;
  readonly solid?: boolean;
  readonly replaceable?: boolean;
  readonly interactive?: boolean;
  readonly diggable?: boolean;
  readonly requireLineOfSight?: boolean;
}

export interface BeatGameQueryBlocks {
  readonly center: BeatGamePosition;
  readonly radius: number;
  readonly selector: BeatGameBlockSelector;
  readonly maximumResults?: number;
}

export interface BeatGameQueryEntities {
  readonly origin?: BeatGamePosition;
  readonly radius: number;
  readonly selector: BeatGameEntitySelector;
  readonly maximumResults?: number;
}

export interface BeatGameBuildBlock {
  readonly offset: Readonly<{ x: number; y: number; z: number }>;
  readonly blockId: string;
  readonly properties?: Readonly<Record<string, string>>;
}

export interface BeatGameRecipe {
  readonly recipeId: string;
  readonly recipeType: string;
  readonly resultItemId: string;
  readonly resultCount: number;
  readonly ingredients: readonly {
    readonly itemIds: readonly string[];
    readonly tags: readonly string[];
    readonly count: number;
  }[];
}

export interface BeatGameCraftability {
  readonly canCraft: boolean;
  readonly maximumCraftCount: number;
  readonly requiredStation?: string;
  readonly missing: readonly {
    readonly itemIds: readonly string[];
    readonly tags: readonly string[];
    readonly available: number;
    readonly missing: number;
  }[];
}

export interface BeatGameContainerTransfer {
  readonly selector: BeatGameItemSelector;
  readonly count: number;
  readonly allowPartial?: boolean;
}

export interface BeatGameLoadoutRequirement {
  readonly selector: BeatGameItemSelector;
  readonly minimumCount: number;
  readonly targetCount: number;
  readonly maximumCount?: number;
}

export interface BeatGameTaskExecutionOptions {
  readonly idempotencyKey?: string;
  readonly deadline?: Date;
}

export type BeatGameTask =
  | {
    readonly type: "collect-blocks";
    readonly blockIds: readonly string[];
    readonly tags?: readonly string[];
    readonly count: number;
    readonly searchRadius: number;
  }
  | {
    readonly type: "excavate";
    readonly from: BeatGameBlockPosition;
    readonly to: BeatGameBlockPosition;
    readonly maximumBlocks?: number;
  }
  | {
    readonly type: "attack-entity";
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
  | {
    readonly type: "ranged-attack";
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
  | {
    readonly type: "attack-nearest";
    readonly selector: BeatGameEntitySelector;
    readonly radius: number;
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
  | {
    readonly type: "flee";
    readonly selector: BeatGameEntitySelector;
    readonly triggerRadius?: number;
    readonly safeDistance?: number;
    readonly safeSeconds?: number;
    readonly completeWhenSafe?: boolean;
    readonly maximumEscapes?: number;
  }
  | {
    readonly type: "guard";
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
  | {
    readonly type: "fish";
    readonly maximumCatches?: number;
  }
  | {
    readonly type: "farm";
    readonly cropIds?: readonly string[];
    readonly center?: BeatGameBlockPosition;
    readonly radius?: number;
    readonly maximumHarvests?: number;
  }
  | {
    readonly type: "breed";
    readonly selector?: BeatGameEntitySelector;
    readonly food?: BeatGameItemSelector;
    readonly maximumPairs?: number;
  }
  | {
    readonly type: "explore";
    readonly origin?: BeatGameBlockPosition;
    readonly radius: number;
    readonly maximumWaypoints?: number;
    readonly purpose?: string;
  }
  | {
    readonly type: "transfer-container";
    readonly direction: "deposit" | "withdraw";
    readonly container: BeatGameBlockPosition;
    readonly operations: readonly BeatGameContainerTransfer[];
  }
  | {
    readonly type: "maintain-loadout";
    readonly container: BeatGameBlockPosition;
    readonly requirements: readonly BeatGameLoadoutRequirement[];
  }
  | {
    readonly type: "auto-eat";
    readonly foodItemIds?: readonly string[];
    readonly foodLevel: number;
    readonly maximumMeals?: number;
  }
  | {
    readonly type: "auto-respawn";
    readonly maximumRespawns?: number;
  }
  | {
    readonly type: "auto-totem";
  }
  | {
    readonly type: "auto-armor";
    readonly maximumEquips?: number;
    readonly completeWhenNoUpgrade?: boolean;
  }
  | {
    readonly type: "build";
    readonly origin: BeatGameBlockPosition;
    readonly blocks: readonly BeatGameBuildBlock[];
    readonly partitionIndex?: number;
    readonly partitionCount?: number;
  }
  | {
    readonly type: "craft";
    readonly recipeId: string;
    readonly count: number;
    readonly station?: BeatGameBlockPosition;
  }
  | {
    readonly type: "smelt";
    readonly input: BeatGameItemSelector;
    readonly count: number;
    readonly fuel?: BeatGameItemSelector;
    readonly station?: BeatGameBlockPosition;
  }
  | {
    readonly type: "brew";
    readonly input: BeatGameItemSelector;
    readonly ingredient: BeatGameItemSelector;
    readonly count: number;
    readonly fuel?: BeatGameItemSelector;
    readonly station?: BeatGameBlockPosition;
    readonly expectedResult?: BeatGameItemSelector;
  }
  | {
    readonly type: "trade";
    readonly offerIndex: number;
    readonly count: number;
    readonly expectedResult?: BeatGameItemSelector;
  };

export type BeatGameBlockFace =
  | "down"
  | "up"
  | "north"
  | "south"
  | "west"
  | "east";

export type BeatGameHand = "main" | "off";

export type BeatGamePrimitiveAction =
  | {
    readonly type: "look";
    readonly yaw: number;
    readonly pitch: number;
  }
  | {
    readonly type: "select-item";
    readonly selector: BeatGameItemSelector;
  }
  | {
    readonly type: "use-item";
    readonly hand?: BeatGameHand;
  }
  | {
    readonly type: "release-item";
  }
  | {
    readonly type: "dig-block";
    readonly position: BeatGameBlockPosition;
  }
  | {
    readonly type: "place-block";
    readonly against: BeatGameBlockPosition;
    readonly face: BeatGameBlockFace;
    readonly hand?: BeatGameHand;
  }
  | {
    readonly type: "interact-block";
    readonly position: BeatGameBlockPosition;
    readonly face: BeatGameBlockFace;
    readonly hand?: BeatGameHand;
    readonly sneaking?: boolean;
  }
  | {
    readonly type: "attack-entity";
    readonly connectionEpoch: string;
    readonly networkId: number;
    readonly sprinting?: boolean;
  }
  | {
    readonly type: "interact-entity";
    readonly connectionEpoch: string;
    readonly networkId: number;
    readonly hand?: BeatGameHand;
    readonly sneaking?: boolean;
  }
  | {
    readonly type: "set-movement";
    readonly forward?: boolean;
    readonly backward?: boolean;
    readonly left?: boolean;
    readonly right?: boolean;
    readonly jump?: boolean;
    readonly sneak?: boolean;
    readonly sprint?: boolean;
  }
  | {
    readonly type: "respawn" | "reset-movement" | "close-container";
  };

export interface BeatGameDriverEvent {
  readonly type: "bot-event";
  readonly observedAt: string;
  readonly payload: unknown;
}

export interface BeatGameDriver {
  readonly instanceId: string;
  readonly botId: string;
  readonly observe: Effect.Effect<BeatGameObservation, BeatGameDriverError>;
  readonly events: Stream.Stream<BeatGameDriverEvent, BeatGameDriverError>;
  readonly queryBlocks: (
    query: BeatGameQueryBlocks,
  ) => Effect.Effect<
    readonly BeatGameBlockObservation[],
    BeatGameDriverError
  >;
  readonly queryEntities: (
    query: BeatGameQueryEntities,
  ) => Effect.Effect<
    readonly BeatGameEntityObservation[],
    BeatGameDriverError
  >;
  readonly recipesFor: (
    resultItemId: string,
  ) => Effect.Effect<readonly BeatGameRecipe[], BeatGameDriverError>;
  readonly canCraft: (
    recipeId: string,
    count: number,
  ) => Effect.Effect<BeatGameCraftability, BeatGameDriverError>;
  readonly waitForChunks: (
    radiusChunks?: number,
    timeoutMs?: number,
  ) => Effect.Effect<void, BeatGameDriverError>;
  readonly pathfind: (
    position: BeatGamePosition,
    radius: number,
    policy: BeatGamePathPolicy,
  ) => Effect.Effect<void, BeatGameDriverError>;
  readonly runTask: (
    task: BeatGameTask,
    policy: BeatGamePathPolicy,
    execution?: BeatGameTaskExecutionOptions,
  ) => Effect.Effect<unknown, BeatGameDriverError>;
  readonly act: (
    action: BeatGamePrimitiveAction,
  ) => Effect.Effect<unknown, BeatGameDriverError>;
  readonly withControl: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | BeatGameDriverError, R>;
}

export function makeSoulFireBeatGameDriver(
  bot: SoulFireBot,
): BeatGameDriver {
  const mapError = (operation: string) => (cause: unknown) =>
    driverError(operation, cause);
  const pathOptions = (policy: BeatGamePathPolicy) => ({
    allowMining: policy.allowMining,
    allowPlacing: policy.allowPlacing,
    timeoutSeconds: Math.max(1, Math.ceil(policy.maxSearchTimeMs / 1_000)),
    searchTimeoutSeconds: Math.max(
      1,
      Math.ceil(policy.maxSearchTimeMs / 1_000),
    ),
  });

  const observe = Effect.all({
    player: bot.world.player(),
    inventory: bot.inventory.snapshot(),
  }).pipe(
    Effect.map(({ player, inventory }): BeatGameObservation => {
      const position = required(player.position, "player.position");
      const velocity = required(player.velocity, "player.velocity");
      const rotation = required(player.rotation, "player.rotation");
      const counts: Record<string, number> = {};
      const hotbar: Record<number, string> = {};
      for (const slot of inventory.slots) {
        if (slot.item === undefined) {
          continue;
        }
        counts[slot.item.itemId] =
          (counts[slot.item.itemId] ?? 0) + slot.item.count;
        if (slot.area === InventoryArea.HOTBAR) {
          hotbar[slot.slot] = slot.item.itemId;
        }
      }
      return {
        observedAt: new Date().toISOString(),
        player: {
          position: toPosition(position),
          rotation: { yaw: rotation.yaw, pitch: rotation.pitch },
          velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
          health: player.health,
          maxHealth: player.maxHealth,
          food: player.food,
          dead: player.dead,
          sleeping: player.sleeping,
          usingItem: player.usingItem,
          connectionEpoch: player.connectionEpoch,
          revision: player.revision,
        },
        inventory: {
          revision: inventory.revision,
          selectedHotbarSlot: inventory.selectedHotbarSlot,
          counts,
          hotbar,
        },
      };
    }),
    Effect.mapError(mapError("observe")),
  );

  const runTask = (
    task: BeatGameTask,
    policy: BeatGamePathPolicy,
    execution: BeatGameTaskExecutionOptions = {},
  ): Effect.Effect<unknown, BeatGameDriverError> => {
    const path = pathOptions(policy);
    const taskStart = {
      conflictPolicy: BotTaskConflictPolicy.QUEUE,
      reconnectPolicy: BotTaskReconnectPolicy.PAUSE_AND_RESUME,
      ...(execution.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: execution.idempotencyKey }),
      ...(execution.deadline === undefined
        ? {}
        : { deadline: execution.deadline }),
    };
    const started = (() => {
      switch (task.type) {
        case "collect-blocks":
          return bot.tasks.collectBlocks(task.blockIds, {
            ...taskStart,
            tags: task.tags ?? [],
            count: task.count,
            searchRadius: task.searchRadius,
            path,
          });
        case "excavate":
          return bot.tasks.excavate(task.from, task.to, {
            ...taskStart,
            path,
            ...(task.maximumBlocks === undefined
              ? {}
              : { maximumBlocks: task.maximumBlocks }),
          });
        case "attack-entity":
          return bot.tasks.attackEntity(task.target, {
            ...taskStart,
            path,
            ...(task.attackRange === undefined
              ? {}
              : { attackRange: task.attackRange }),
            ...(task.sprinting === undefined
              ? {}
              : { sprinting: task.sprinting }),
            ...(task.maximumAttacks === undefined
              ? {}
              : { maximumAttacks: task.maximumAttacks }),
            ...(task.targetUnavailableTimeoutSeconds === undefined
              ? {}
              : {
                targetUnavailableTimeoutSeconds:
                  task.targetUnavailableTimeoutSeconds,
              }),
            ...(task.selectBestWeapon === undefined
              ? {}
              : { selectBestWeapon: task.selectBestWeapon }),
            ...(task.weapon === undefined
              ? {}
              : { weapon: itemSelector(task.weapon) }),
            ...(task.restoreSelectedSlot === undefined
              ? {}
              : { restoreSelectedSlot: task.restoreSelectedSlot }),
          });
        case "ranged-attack":
          return bot.tasks.rangedAttack(task.target, {
            ...taskStart,
            path,
            ...(task.minimumRange === undefined
              ? {}
              : { minimumRange: task.minimumRange }),
            ...(task.maximumRange === undefined
              ? {}
              : { maximumRange: task.maximumRange }),
            ...(task.maximumShots === undefined
              ? {}
              : { maximumShots: task.maximumShots }),
            ...(task.targetUnavailableTimeoutSeconds === undefined
              ? {}
              : {
                targetUnavailableTimeoutSeconds:
                  task.targetUnavailableTimeoutSeconds,
              }),
            ...(task.weapon === undefined
              ? {}
              : { weapon: itemSelector(task.weapon) }),
            ...(task.bowDrawTicks === undefined
              ? {}
              : { bowDrawTicks: task.bowDrawTicks }),
            ...(task.leadTarget === undefined
              ? {}
              : { leadTarget: task.leadTarget }),
            ...(task.compensateGravity === undefined
              ? {}
              : { compensateGravity: task.compensateGravity }),
            ...(task.strafe === undefined ? {} : { strafe: task.strafe }),
            ...(task.restoreSelectedSlot === undefined
              ? {}
              : { restoreSelectedSlot: task.restoreSelectedSlot }),
          });
        case "attack-nearest":
          return bot.tasks.attackNearest(entitySelector(task.selector), {
            ...taskStart,
            path,
            radius: task.radius,
            ...(task.attackRange === undefined
              ? {}
              : { attackRange: task.attackRange }),
            ...(task.sprinting === undefined
              ? {}
              : { sprinting: task.sprinting }),
            ...(task.maximumAttacks === undefined
              ? {}
              : { maximumAttacks: task.maximumAttacks }),
            ...(task.maximumTargets === undefined
              ? {}
              : { maximumTargets: task.maximumTargets }),
            ...(task.noTargetTimeoutSeconds === undefined
              ? {}
              : { noTargetTimeoutSeconds: task.noTargetTimeoutSeconds }),
            ...(task.completeWhenNoTarget === undefined
              ? {}
              : { completeWhenNoTarget: task.completeWhenNoTarget }),
            ...(task.selectBestWeapon === undefined
              ? {}
              : { selectBestWeapon: task.selectBestWeapon }),
            ...(task.weapon === undefined
              ? {}
              : { weapon: itemSelector(task.weapon) }),
            ...(task.restoreSelectedSlot === undefined
              ? {}
              : { restoreSelectedSlot: task.restoreSelectedSlot }),
          });
        case "flee":
          return bot.tasks.flee(entitySelector(task.selector), {
            ...taskStart,
            path,
            ...(task.triggerRadius === undefined
              ? {}
              : { triggerRadius: task.triggerRadius }),
            ...(task.safeDistance === undefined
              ? {}
              : { safeDistance: task.safeDistance }),
            ...(task.safeSeconds === undefined
              ? {}
              : { safeSeconds: task.safeSeconds }),
            ...(task.completeWhenSafe === undefined
              ? {}
              : { completeWhenSafe: task.completeWhenSafe }),
            ...(task.maximumEscapes === undefined
              ? {}
              : { maximumEscapes: task.maximumEscapes }),
          });
        case "guard":
          return bot.tasks.guard(
            task.position,
            entitySelector(task.selector),
            {
              ...taskStart,
              path,
              ...(task.guardRadius === undefined
                ? {}
                : { guardRadius: task.guardRadius }),
              ...(task.maximumPursuitDistance === undefined
                ? {}
                : {
                  maximumPursuitDistance:
                    task.maximumPursuitDistance,
                }),
              ...(task.returnRadius === undefined
                ? {}
                : { returnRadius: task.returnRadius }),
              ...(task.attackRange === undefined
                ? {}
                : { attackRange: task.attackRange }),
              ...(task.sprinting === undefined
                ? {}
                : { sprinting: task.sprinting }),
              ...(task.maximumAttacks === undefined
                ? {}
                : { maximumAttacks: task.maximumAttacks }),
              ...(task.maximumTargets === undefined
                ? {}
                : { maximumTargets: task.maximumTargets }),
              ...(task.completeWhenClear === undefined
                ? {}
                : { completeWhenClear: task.completeWhenClear }),
              ...(task.clearSeconds === undefined
                ? {}
                : { clearSeconds: task.clearSeconds }),
              ...(task.selectBestWeapon === undefined
                ? {}
                : { selectBestWeapon: task.selectBestWeapon }),
              ...(task.weapon === undefined
                ? {}
                : { weapon: itemSelector(task.weapon) }),
              ...(task.restoreSelectedSlot === undefined
                ? {}
                : { restoreSelectedSlot: task.restoreSelectedSlot }),
            },
          );
        case "fish":
          return bot.tasks.fish({
            ...taskStart,
            ...(task.maximumCatches === undefined
              ? {}
              : { maximumCatches: task.maximumCatches }),
          });
        case "farm":
          return bot.tasks.farm({
            ...taskStart,
            cropIds: task.cropIds ?? [],
            ...(task.center === undefined ? {} : { center: task.center }),
            ...(task.radius === undefined ? {} : { radius: task.radius }),
            ...(task.maximumHarvests === undefined
              ? {}
              : { maximumHarvests: task.maximumHarvests }),
            path,
          });
        case "breed":
          return bot.tasks.breed({
            ...taskStart,
            ...(task.selector === undefined
              ? {}
              : { animals: entitySelector(task.selector) }),
            ...(task.food === undefined
              ? {}
              : { food: itemSelector(task.food) }),
            ...(task.maximumPairs === undefined
              ? {}
              : { maximumPairs: task.maximumPairs }),
            path,
          });
        case "explore":
          return bot.tasks.explore({
            ...taskStart,
            ...(task.origin === undefined ? {} : { origin: task.origin }),
            radius: task.radius,
            ...(task.maximumWaypoints === undefined
              ? {}
              : { maximumWaypoints: task.maximumWaypoints }),
            ...(task.purpose === undefined
              ? {}
              : { purpose: task.purpose }),
            path,
          });
        case "transfer-container": {
          const operations = task.operations.map((operation) => ({
            selector: itemSelector(operation.selector),
            count: operation.count,
            ...(operation.allowPartial === undefined
              ? {}
              : { allowPartial: operation.allowPartial }),
          }));
          return task.direction === "deposit"
            ? bot.tasks.stash(task.container, operations, {
              ...taskStart,
              path,
            })
            : bot.tasks.withdraw(task.container, operations, {
              ...taskStart,
              path,
            });
        }
        case "maintain-loadout":
          return bot.tasks.maintainLoadout(
            task.container,
            task.requirements.map((requirement) => ({
              selector: itemSelector(requirement.selector),
              minimumCount: requirement.minimumCount,
              targetCount: requirement.targetCount,
              ...(requirement.maximumCount === undefined
                ? {}
                : { maximumCount: requirement.maximumCount }),
            })),
            { ...taskStart, path },
          );
        case "auto-eat":
          return bot.tasks.autoEat(task.foodItemIds ?? [], {
            ...taskStart,
            foodLevel: task.foodLevel,
            ...(task.maximumMeals === undefined
              ? {}
              : { maximumMeals: task.maximumMeals }),
          });
        case "auto-respawn":
          return bot.tasks.autoRespawn({
            ...taskStart,
            ...(task.maximumRespawns === undefined
              ? {}
              : { maximumRespawns: task.maximumRespawns }),
          });
        case "auto-totem":
          return bot.tasks.autoTotem(taskStart);
        case "auto-armor":
          return bot.tasks.autoArmor({
            ...taskStart,
            ...(task.maximumEquips === undefined
              ? {}
              : { maximumEquips: task.maximumEquips }),
            ...(task.completeWhenNoUpgrade === undefined
              ? {}
              : { completeWhenNoUpgrade: task.completeWhenNoUpgrade }),
          });
        case "build":
          return bot.tasks.build(
            task.origin,
            task.blocks.map((block): SchematicBlock => ({
              offset: { ...block.offset },
              blockId: block.blockId,
              ...(block.properties === undefined
                ? {}
                : { properties: block.properties }),
            })),
            {
              ...taskStart,
              path,
              ...(task.partitionIndex === undefined
                ? {}
                : { partitionIndex: task.partitionIndex }),
              ...(task.partitionCount === undefined
                ? {}
                : { partitionCount: task.partitionCount }),
            },
          );
        case "craft":
          return bot.tasks.craft(task.recipeId, task.count, {
            ...taskStart,
            ...(task.station === undefined ? {} : { station: task.station }),
          });
        case "smelt":
          return bot.tasks.smelt(itemSelector(task.input), task.count, {
            ...taskStart,
            ...(task.fuel === undefined
              ? {}
              : { fuel: itemSelector(task.fuel) }),
            ...(task.station === undefined ? {} : { station: task.station }),
          });
        case "brew":
          return bot.tasks.brew(
            itemSelector(task.input),
            itemSelector(task.ingredient),
            task.count,
            {
              ...taskStart,
              ...(task.fuel === undefined
                ? {}
                : { fuel: itemSelector(task.fuel) }),
              ...(task.station === undefined
                ? {}
                : { station: task.station }),
              ...(task.expectedResult === undefined
                ? {}
                : { expectedResult: itemSelector(task.expectedResult) }),
            },
          );
        case "trade":
          return bot.tasks.villagerTrade(task.offerIndex, task.count, {
            ...taskStart,
            ...(task.expectedResult === undefined
              ? {}
              : { expectedResult: itemSelector(task.expectedResult) }),
          });
      }
    })();
    return (started as unknown as Effect.Effect<{
      readonly result: () => Effect.Effect<unknown, unknown>;
      readonly cancel: (
        reason?: string,
      ) => Effect.Effect<unknown, unknown>;
    }, unknown>).pipe(
      Effect.flatMap((handle) =>
        handle.result().pipe(
          Effect.onInterrupt(() =>
            handle.cancel("Beat-game action was interrupted").pipe(
              Effect.ignore,
            )
          ),
        )
      ),
      Effect.mapError(mapError(`task.${task.type}`)),
    );
  };

  return {
    instanceId: bot.instanceId,
    botId: bot.id,
    observe,
    events: bot.events().pipe(
      Stream.map((payload): BeatGameDriverEvent => ({
        type: "bot-event",
        observedAt: new Date().toISOString(),
        payload,
      })),
      Stream.mapError(mapError("events")),
    ),
    queryBlocks: (query) =>
      bot.world.queryBlocks({
        region: {
          region: {
            case: "sphere",
            value: {
              center: query.center,
              radius: query.radius,
            },
          },
        },
        selector: blockSelector(query.selector),
        sort: QuerySort.NEAREST,
        pageSize: query.maximumResults ?? 128,
      }).pipe(
        Effect.map(({ blocks }) =>
          blocks.map((block): BeatGameBlockObservation => ({
            blockId: block.blockId,
            position: toBlockPosition(
              required(block.position, "block.position"),
            ),
            properties: block.properties,
            diggable: block.diggable,
            replaceable: block.replaceable,
            interactive: block.interactive,
            observedAt: new Date().toISOString(),
          }))
        ),
        Effect.mapError(mapError("queryBlocks")),
      ),
    queryEntities: (query) =>
      bot.world.queryEntities({
        ...(query.origin === undefined ? {} : { origin: query.origin }),
        radius: query.radius,
        selector: entitySelector(query.selector),
        sort: QuerySort.NEAREST,
        pageSize: query.maximumResults ?? 128,
      }).pipe(
        Effect.map(({ entities }) =>
          entities.map((entity): BeatGameEntityObservation => {
            const reference = required(entity.reference, "entity.reference");
            const velocity = required(entity.velocity, "entity.velocity");
            return {
              connectionEpoch: reference.connectionEpoch,
              networkId: reference.networkId,
              ...(reference.uuid === undefined
                ? {}
                : { uuid: reference.uuid }),
              entityType: entity.entityType,
              position: toPosition(
                required(entity.position, "entity.position"),
              ),
              velocity: {
                x: velocity.x,
                y: velocity.y,
                z: velocity.z,
              },
              alive: entity.alive,
              ...(entity.health === undefined
                ? {}
                : { health: entity.health }),
              ...(entity.item === undefined
                ? {}
                : { itemId: entity.item.itemId }),
              observedAt: new Date().toISOString(),
            };
          })
        ),
        Effect.mapError(mapError("queryEntities")),
      ),
    recipesFor: (resultItemId) =>
      bot.recipes.list({
        resultItemId,
        pageSize: 256,
      }).pipe(
        Effect.map(({ recipes }) =>
          recipes.map((recipe): BeatGameRecipe => ({
            recipeId: recipe.recipeId,
            recipeType: recipe.recipeType,
            resultItemId: required(recipe.result, "recipe.result").itemId,
            resultCount: required(recipe.result, "recipe.result").count,
            ingredients: recipe.ingredients.map((ingredient) => ({
              itemIds: ingredient.itemIds,
              tags: ingredient.tags,
              count: ingredient.count,
            })),
          }))
        ),
        Effect.mapError(mapError("recipesFor")),
      ),
    canCraft: (recipeId, count) =>
      bot.recipes.canCraft({ recipeId, count }).pipe(
        Effect.map((response): BeatGameCraftability => ({
          canCraft: response.canCraft,
          maximumCraftCount: response.maximumCraftCount,
          ...(response.requiredStation === undefined
            ? {}
            : { requiredStation: response.requiredStation }),
          missing: response.missing.map((missing) => {
            const ingredient = required(
              missing.ingredient,
              "missing.ingredient",
            );
            return {
              itemIds: ingredient.itemIds,
              tags: ingredient.tags,
              available: missing.available,
              missing: missing.missing,
            };
          }),
        })),
        Effect.mapError(mapError("canCraft")),
      ),
    waitForChunks: (radiusChunks = 0, timeoutMs = 60_000) =>
      bot.waitForChunks({
        radiusChunks,
        timeoutMs,
      }).pipe(
        Effect.asVoid,
        Effect.mapError(mapError("waitForChunks")),
      ),
    pathfind: (position, radius, policy) =>
      bot.tasks.goTo(goals.near(position, radius), {
        conflictPolicy: BotTaskConflictPolicy.REPLACE,
        reconnectPolicy: BotTaskReconnectPolicy.PAUSE_AND_RESUME,
        path: pathOptions(policy),
      }).pipe(
        Effect.flatMap((handle) =>
          handle.result().pipe(
            Effect.onInterrupt(() =>
              handle.cancel("Beat-game pathfinding was interrupted").pipe(
                Effect.ignore,
              )
            ),
          )
        ),
        Effect.asVoid,
        Effect.mapError(mapError("pathfind")),
      ),
    runTask,
    act: (action) =>
      executePrimitive(bot, action).pipe(
        Effect.mapError(mapError(`act.${action.type}`)),
      ),
    withControl: (effect) =>
      Effect.scoped(
        Effect.gen(function* () {
          const lease = yield* bot.acquireControlScoped(
            CONTROL_LEASE_TTL_SECONDS,
          );
          const renew = Effect.sleep(
            CONTROL_LEASE_RENEWAL_INTERVAL_MS,
          ).pipe(
            Effect.zipRight(lease.renew(CONTROL_LEASE_TTL_SECONDS)),
            Effect.forever,
          );
          return yield* Effect.raceFirst(effect, renew);
        }),
      ).pipe(Effect.mapError((cause) =>
        cause instanceof BeatGameDriverError
          ? cause
          : driverError("control", cause)
      )),
  };
}

function executePrimitive(
  bot: SoulFireBot,
  action: BeatGamePrimitiveAction,
): Effect.Effect<unknown, unknown> {
  switch (action.type) {
    case "look":
      return bot.look(action.yaw, action.pitch);
    case "select-item":
      return bot.inventory.selectHotbar({
        selection: {
          case: "selector",
          value: itemSelector(action.selector),
        },
      });
    case "use-item":
      return bot.useItem({ hand: hand(action.hand) });
    case "release-item":
      return bot.releaseItem();
    case "dig-block":
      return bot.digBlock({ position: action.position });
    case "place-block":
      return bot.placeBlock({
        against: action.against,
        face: blockFace(action.face),
        hand: hand(action.hand),
      });
    case "interact-block":
      return bot.interactBlock({
        position: action.position,
        face: blockFace(action.face),
        hand: hand(action.hand),
        sneaking: action.sneaking ?? false,
      });
    case "attack-entity":
      return bot.attackEntity({
        connectionEpoch: action.connectionEpoch,
        entityId: action.networkId,
        sprinting: action.sprinting ?? false,
      });
    case "interact-entity":
      return bot.interactEntity({
        connectionEpoch: action.connectionEpoch,
        entityId: action.networkId,
        hand: hand(action.hand),
        sneaking: action.sneaking ?? false,
      });
    case "set-movement":
      return bot.setMovement({
        ...(action.forward === undefined
          ? {}
          : { forward: action.forward }),
        ...(action.backward === undefined
          ? {}
          : { backward: action.backward }),
        ...(action.left === undefined ? {} : { left: action.left }),
        ...(action.right === undefined ? {} : { right: action.right }),
        ...(action.jump === undefined ? {} : { jump: action.jump }),
        ...(action.sneak === undefined ? {} : { sneak: action.sneak }),
        ...(action.sprint === undefined ? {} : { sprint: action.sprint }),
      });
    case "respawn":
      return bot.respawn();
    case "reset-movement":
      return bot.resetMovement();
    case "close-container":
      return bot.closeContainer();
  }
}

function itemSelector(selector: BeatGameItemSelector) {
  return {
    itemIds: [...(selector.itemIds ?? [])],
    tags: [...(selector.tags ?? [])],
    ...(selector.minimumCount === undefined
      ? {}
      : { minimumCount: selector.minimumCount }),
  };
}

function entitySelector(selector: BeatGameEntitySelector) {
  return {
    entityTypes: [...(selector.entityTypes ?? [])],
    tags: [...(selector.tags ?? [])],
    categories: [...(selector.categories ?? [])],
    ...(selector.alive === undefined ? {} : { alive: selector.alive }),
    requireLineOfSight: selector.requireLineOfSight ?? false,
  };
}

function blockSelector(selector: BeatGameBlockSelector) {
  return {
    blockIds: [...(selector.blockIds ?? [])],
    tags: [...(selector.tags ?? [])],
    properties: { ...(selector.properties ?? {}) },
    ...(selector.solid === undefined ? {} : { solid: selector.solid }),
    ...(selector.replaceable === undefined
      ? {}
      : { replaceable: selector.replaceable }),
    ...(selector.interactive === undefined
      ? {}
      : { interactive: selector.interactive }),
    ...(selector.diggable === undefined
      ? {}
      : { diggable: selector.diggable }),
    requireLineOfSight: selector.requireLineOfSight ?? false,
  };
}

function hand(value: BeatGameHand | undefined): Hand {
  return value === "off" ? Hand.OFF : Hand.MAIN;
}

function blockFace(value: BeatGameBlockFace): BlockFace {
  switch (value) {
    case "down":
      return BlockFace.DOWN;
    case "up":
      return BlockFace.UP;
    case "north":
      return BlockFace.NORTH;
    case "south":
      return BlockFace.SOUTH;
    case "west":
      return BlockFace.WEST;
    case "east":
      return BlockFace.EAST;
  }
}

function toPosition(
  value: Readonly<{ x: number; y: number; z: number; dimension: string }>,
): BeatGamePosition {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
    dimension: value.dimension,
  };
}

function toBlockPosition(
  value: Readonly<{ x: number; y: number; z: number; dimension: string }>,
): BeatGameBlockPosition {
  return toPosition(value);
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`SoulFire omitted required ${name}`);
  }
  return value;
}

function driverError(
  operation: string,
  cause: unknown,
): BeatGameDriverError {
  return new BeatGameDriverError({
    operation,
    retryable: isRetryable(cause),
    message: cause instanceof Error
      ? cause.message
      : `SoulFire ${operation} failed`,
    cause,
  });
}

function isRetryable(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) {
    return false;
  }
  if ("retryable" in cause && cause.retryable === true) {
    return true;
  }
  if (
    "task" in cause
    && typeof cause.task === "object"
    && cause.task !== null
    && "failure" in cause.task
    && typeof cause.task.failure === "object"
    && cause.task.failure !== null
    && "retryable" in cause.task.failure
  ) {
    return cause.task.failure.retryable === true;
  }
  return "cause" in cause
    && cause.cause !== cause
    && isRetryable(cause.cause);
}
