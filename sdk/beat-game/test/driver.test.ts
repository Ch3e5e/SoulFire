import {
  BotTaskConflictPolicy,
  BotTaskReconnectPolicy,
  type SoulFireBot,
} from "@soulfiremc/sdk";
import { Effect, Fiber, Stream } from "effect";
import { describe, expect, it } from "vitest";

import {
  defaultBeatGameStrategy,
  makeSoulFireBeatGameDriver,
} from "../src/index.js";

function effectBot(
  taskResult: Effect.Effect<unknown> = Effect.succeed({}),
) {
  const calls: {
    attack?: Readonly<Record<string, unknown>>;
    collect?: readonly unknown[];
    goTo?: readonly unknown[];
    cancellations: number;
  } = { cancellations: 0 };
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
          slots: [],
        }),
      selectHotbar: () => Effect.succeed({}),
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
    },
    events: () => Stream.empty,
    attackEntity: (request: Readonly<Record<string, unknown>>) => {
      calls.attack = request;
      return Effect.succeed({});
    },
    acquireControlScoped: () =>
      Effect.succeed({
        renew: () => Effect.succeed({}),
      }),
  };
  return { bot: bot as unknown as SoulFireBot, calls };
}

describe("production SoulFire beat-game driver", () => {
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
      connectionEpoch: "connection-epoch",
      revision: 7n,
    });
    expect(current.inventory).toMatchObject({
      revision: 9n,
      selectedHotbarSlot: 2,
      counts: {},
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
    }, defaultBeatGameStrategy.path, {
      idempotencyKey: "beat-game:test-action",
    }));

    expect(calls.collect).toEqual([
      ["minecraft:oak_log"],
      {
        conflictPolicy: BotTaskConflictPolicy.QUEUE,
        tags: ["minecraft:logs"],
        count: 3,
        idempotencyKey: "beat-game:test-action",
        searchRadius: 40,
        reconnectPolicy: BotTaskReconnectPolicy.PAUSE_AND_RESUME,
        path: {
          allowMining: true,
          allowPlacing: true,
          timeoutSeconds: 30,
          searchTimeoutSeconds: 30,
        },
      },
    ]);
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

    expect(calls.goTo).toBeDefined();
    expect(calls.cancellations).toBe(1);
  });
});
