import {
  BotTaskConflictPolicy,
  BotTaskReconnectPolicy,
  InventoryArea,
  SoulFireTaskError,
  SoulFireTaskFailed,
  type SoulFireBot,
} from "@soulfiremc/sdk";
import { create } from "@bufbuild/protobuf";
import {
  BotTaskFailureSchema,
  BotTaskSchema,
} from "@soulfiremc/sdk/generated/soulfire/task_pb";
import { Effect, Fiber, Stream } from "effect";
import { describe, expect, it } from "vitest";

import {
  defaultBeatGameStrategy,
  makeSoulFireBeatGameDriver,
} from "../src/index.js";

function effectBot(
  taskResult: Effect.Effect<unknown, unknown> = Effect.succeed({}),
) {
  const calls: {
    attack?: Readonly<Record<string, unknown>>;
    collect?: readonly unknown[];
    explore?: Readonly<Record<string, unknown>>;
    flee?: readonly unknown[];
    goTo?: readonly unknown[];
    armor?: Readonly<Record<string, unknown>>;
    eat?: readonly unknown[];
    equip?: Readonly<Record<string, unknown>>;
    cancellations: number;
    controlAcquisitions: number;
    controlReleases: number;
    controlRenewals: number;
  } = {
    cancellations: 0,
    controlAcquisitions: 0,
    controlReleases: 0,
    controlRenewals: 0,
  };
  const taskHandle = {
    result: () => taskResult,
    cancel: () =>
      Effect.sync(() => {
        calls.cancellations += 1;
        return {};
      }),
  };
  const bot = {
    instanceId: "instance-id",
    id: "bot-id",
    world: {
      player: () =>
        Effect.succeed({
          position: {
            x: 1,
            y: 64,
            z: 2,
            dimension: "minecraft:overworld",
          },
          velocity: { x: 0, y: 0, z: 0 },
          rotation: { yaw: 20, pitch: -10 },
          health: 18,
          maxHealth: 20,
          food: 17,
          dead: false,
          sleeping: false,
          usingItem: false,
          equipment: {
            offhand: {
              itemId: "minecraft:shield",
              count: 1,
            },
          },
          connectionEpoch: "connection-epoch",
          revision: 7n,
        }),
      queryBlocks: () => Effect.succeed({ blocks: [] }),
      queryEntities: () => Effect.succeed({ entities: [] }),
    },
    inventory: {
      snapshot: () =>
        Effect.succeed({
          revision: 9n,
          selectedHotbarSlot: 2,
          slots: [
            {
              slot: 10,
              area: InventoryArea.MAIN,
              item: { itemId: "minecraft:spruce_log", count: 3 },
            },
            {
              slot: 36,
              area: InventoryArea.HOTBAR,
              item: { itemId: "minecraft:spruce_log", count: 2 },
            },
            {
              slot: 1,
              area: InventoryArea.CRAFTING,
              item: { itemId: "minecraft:spruce_log", count: 1 },
            },
            {
              slot: 0,
              area: InventoryArea.CONTAINER,
              item: { itemId: "minecraft:diamond", count: 64 },
            },
          ],
        }),
      selectHotbar: () => Effect.succeed({}),
      equip: (request: Readonly<Record<string, unknown>>) => {
        calls.equip = request;
        return Effect.succeed({});
      },
    },
    recipes: {
      list: () => Effect.succeed({ recipes: [] }),
      canCraft: () =>
        Effect.succeed({
          canCraft: false,
          maximumCraftCount: 0,
          missing: [],
        }),
    },
    tasks: {
      collectBlocks: (...args: readonly unknown[]) => {
        calls.collect = args;
        return Effect.succeed(taskHandle);
      },
      goTo: (...args: readonly unknown[]) => {
        calls.goTo = args;
        return Effect.succeed(taskHandle);
      },
      autoArmor: (options: Readonly<Record<string, unknown>>) => {
        calls.armor = options;
        return Effect.succeed(taskHandle);
      },
      autoEat: (...args: readonly unknown[]) => {
        calls.eat = args;
        return Effect.succeed(taskHandle);
      },
      explore: (options: Readonly<Record<string, unknown>>) => {
        calls.explore = options;
        return Effect.succeed(taskHandle);
      },
      flee: (...args: readonly unknown[]) => {
        calls.flee = args;
        return Effect.succeed(taskHandle);
      },
    },
    events: () => Stream.empty,
    attackEntity: (request: Readonly<Record<string, unknown>>) => {
      calls.attack = request;
      return Effect.succeed({});
    },
    acquireControl: () =>
      Effect.sync(() => {
        calls.controlAcquisitions += 1;
        return {
          renew: () =>
            Effect.sync(() => {
              calls.controlRenewals += 1;
              return {};
            }),
          release: () =>
            Effect.sync(() => {
              calls.controlReleases += 1;
            }),
        };
      }),
  };
  return { bot: bot as unknown as SoulFireBot, calls };
}

describe("production SoulFire beat-game driver", () => {
  it("shares one control lease across nested control scopes", async () => {
    const { bot, calls } = effectBot();
    const driver = makeSoulFireBeatGameDriver(bot);

    await Effect.runPromise(driver.withControl(
      driver.withControl(Effect.void),
    ));

    expect(calls.controlAcquisitions).toBe(1);
    expect(calls.controlReleases).toBe(1);
  });

  it("maps public snapshots into the stable planner observation", async () => {
    const { bot } = effectBot();
    const driver = makeSoulFireBeatGameDriver(bot);

    const current = await Effect.runPromise(driver.observe);

    expect(current.player).toMatchObject({
      position: {
        x: 1,
        y: 64,
        z: 2,
        dimension: "minecraft:overworld",
      },
      health: 18,
      food: 17,
      equipment: { offhand: "minecraft:shield" },
      connectionEpoch: "connection-epoch",
      revision: 7n,
    });
    expect(current.inventory).toMatchObject({
      revision: 9n,
      selectedHotbarSlot: 2,
      emptyPlayerSlots: 34,
      counts: { "minecraft:spruce_log": 5 },
      hotbar: { 36: "minecraft:spruce_log" },
    });
  });

  it("passes durable task inputs through the public task API", async () => {
    const { bot, calls } = effectBot();
    const driver = makeSoulFireBeatGameDriver(bot);

    await Effect.runPromise(driver.runTask({
      type: "collect-blocks",
      blockIds: ["minecraft:oak_log"],
      tags: ["minecraft:logs"],
      count: 3,
      searchRadius: 40,
    }, {
      ...defaultBeatGameStrategy.path,
      additionalPlaceItemIds: ["minecraft:oak_log"],
      sprint: false,
    }, {
      idempotencyKey: "beat-game:test-action",
    }));

    expect(calls.collect).toEqual([
      ["minecraft:oak_log"],
      {
        avoidSubmergedTargets: false,
        conflictPolicy: BotTaskConflictPolicy.QUEUE,
        tags: ["minecraft:logs"],
        count: 3,
        idempotencyKey: "beat-game:test-action",
        searchRadius: 40,
        reconnectPolicy: BotTaskReconnectPolicy.PAUSE_AND_RESUME,
        path: {
          allowMining: true,
          allowPlacing: true,
          avoidFluids: false,
          additionalPlaceItemIds: ["minecraft:oak_log"],
          sprint: false,
          timeoutSeconds: 30,
          searchTimeoutSeconds: 30,
        },
      },
    ]);
  });

  it("forwards bounded auto-eat completion controls", async () => {
    const { bot, calls } = effectBot();
    const driver = makeSoulFireBeatGameDriver(bot);

    await Effect.runPromise(driver.runTask({
      type: "auto-eat",
      foodItemIds: ["minecraft:cooked_mutton"],
      foodLevel: 18,
      maximumMeals: 8,
      completeWhenNoFood: true,
      restoreSelectedSlot: false,
    }, defaultBeatGameStrategy.path));

    expect(calls.eat).toEqual([
      ["minecraft:cooked_mutton"],
      expect.objectContaining({
        foodLevel: 18,
        maximumMeals: 8,
        completeWhenNoFood: true,
        restoreSelectedSlot: false,
      }),
    ]);
  });

  it("preserves exact entity selectors for targeted evasion", async () => {
    const { bot, calls } = effectBot();
    const driver = makeSoulFireBeatGameDriver(bot);

    await Effect.runPromise(driver.runTask({
      type: "flee",
      selector: {
        networkId: 42,
        uuid: "00000000-0000-0000-0000-000000000042",
        alive: true,
      },
      triggerRadius: 12,
      safeDistance: 16,
      completeWhenSafe: true,
      maximumEscapes: 1,
    }, defaultBeatGameStrategy.path));

    expect(calls.flee).toEqual([
      {
        entityTypes: [],
        tags: [],
        categories: [],
        networkId: 42,
        uuid: "00000000-0000-0000-0000-000000000042",
        alive: true,
        requireLineOfSight: false,
      },
      expect.objectContaining({
        triggerRadius: 12,
        safeDistance: 16,
        completeWhenSafe: true,
        maximumEscapes: 1,
      }),
    ]);
  });

  it("normalizes precise player coordinates for block-position tasks", async () => {
    const { bot, calls } = effectBot();
    const driver = makeSoulFireBeatGameDriver(bot);

    await Effect.runPromise(driver.runTask({
      type: "explore",
      origin: {
        x: 8.5,
        y: 86,
        z: -3.5,
        dimension: "minecraft:overworld",
      },
      radius: 32,
      maximumWaypoints: 3,
    }, defaultBeatGameStrategy.path));

    expect(calls.explore).toMatchObject({
      origin: {
        x: 8,
        y: 86,
        z: -4,
        dimension: "minecraft:overworld",
      },
      radius: 32,
      maximumWaypoints: 3,
    });
  });

  it("preserves durable task failure codes", async () => {
    const task = create(BotTaskSchema, {
      taskId: "missing-target",
      failure: create(BotTaskFailureSchema, {
        code: "not_found",
        message: "Target entity is not observable",
        retryable: false,
      }),
    });
    const cause = new SoulFireTaskError(task);
    const { bot } = effectBot(Effect.fail(new SoulFireTaskFailed({
      task,
      cause,
      message: cause.message,
    })));
    const driver = makeSoulFireBeatGameDriver(bot);

    const error = await Effect.runPromise(Effect.flip(driver.runTask({
      type: "collect-blocks",
      blockIds: ["minecraft:oak_log"],
      count: 1,
      searchRadius: 16,
    }, defaultBeatGameStrategy.path)));

    expect(error.code).toBe("not_found");
  });

  it("forwards the observation epoch with direct entity actions", async () => {
    const { bot, calls } = effectBot();
    const driver = makeSoulFireBeatGameDriver(bot);

    await Effect.runPromise(driver.act({
      type: "attack-entity",
      connectionEpoch: "00000000-0000-0000-0000-000000000042",
      networkId: 42,
      sprinting: true,
    }));

    expect(calls.attack).toEqual({
      connectionEpoch: "00000000-0000-0000-0000-000000000042",
      entityId: 42,
      sprinting: true,
    });
  });

  it("equips an item into the requested equipment slot", async () => {
    const { bot, calls } = effectBot();
    const driver = makeSoulFireBeatGameDriver(bot);

    await Effect.runPromise(driver.act({
      type: "equip-item",
      selector: { itemIds: ["minecraft:shield"] },
      equipmentSlot: "offhand",
    }));

    expect(calls.equip).toEqual({
      selector: {
        itemIds: ["minecraft:shield"],
        tags: [],
      },
      equipmentSlot: "offhand",
    });
  });

  it("forwards bounded auto-armor completion options", async () => {
    const { bot, calls } = effectBot();
    const driver = makeSoulFireBeatGameDriver(bot);

    await Effect.runPromise(driver.runTask({
      type: "auto-armor",
      maximumEquips: 4,
      completeWhenNoUpgrade: true,
    }, defaultBeatGameStrategy.path));

    expect(calls.armor).toMatchObject({
      maximumEquips: 4,
      completeWhenNoUpgrade: true,
    });
  });

  it("cancels its durable server task when interrupted", async () => {
    const { bot, calls } = effectBot(Effect.never);
    const driver = makeSoulFireBeatGameDriver(bot);
    const fiber = Effect.runFork(driver.runTask({
      type: "collect-blocks",
      blockIds: ["minecraft:oak_log"],
      count: 1,
      searchRadius: 16,
    }, defaultBeatGameStrategy.path));

    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(calls.cancellations).toBe(1);
  });

  it("cancels durable pathfinding when interrupted", async () => {
    const { bot, calls } = effectBot(Effect.never);
    const driver = makeSoulFireBeatGameDriver(bot);
    const fiber = Effect.runFork(driver.pathfind(
      {
        x: 10,
        y: 64,
        z: 20,
        dimension: "minecraft:overworld",
      },
      2,
      defaultBeatGameStrategy.path,
    ));

    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(calls.goTo?.[1]).toMatchObject({
      conflictPolicy: BotTaskConflictPolicy.REPLACE,
      reconnectPolicy: BotTaskReconnectPolicy.PAUSE_AND_RESUME,
    });
    expect(calls.cancellations).toBe(1);
  });
});
