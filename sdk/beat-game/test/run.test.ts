import { Effect, Either, Stream } from "effect";
import { describe, expect, it } from "vitest";

import {
  BeatGamePhase,
  BeatGameCancelled,
  BeatGameDriverError,
  BeatGameRunStatus,
  InMemoryBeatGameCheckpointStore,
  beatGameTeamWithDrivers,
  beatGameWithDriver,
} from "../src/index.js";
import {
  blockObservation,
  checkpoint,
  FakeBeatGameDriver,
  installStaircaseMovementSimulation,
  observation,
  postDragonHooks,
} from "./fixtures.js";

describe("beat-game run lifecycle", () => {
  it("recovers a lifecycle death even after an immediate respawn", async () => {
    const driver = new FakeBeatGameDriver();
    const deathPosition = {
      x: 24,
      y: 64,
      z: -12,
      dimension: "minecraft:the_end",
    };
    driver.currentObservation = observation({
      dimension: "minecraft:the_end",
      position: deathPosition,
      counts: {
        "minecraft:cooked_beef": 16,
        "minecraft:bow": 1,
        "minecraft:arrow": 32,
      },
    });
    driver.events = Stream.make({
      type: "bot-died",
      observedAt: "2026-01-01T00:00:01.000Z",
      message: "Bot was shot by Skeleton",
    } as const);
    const store = new InMemoryBeatGameCheckpointStore();
    await Effect.runPromise(store.save(checkpoint(
      BeatGamePhase.FIGHT_ENDER_DRAGON,
      {
        runId: "lifecycle-death-run",
        teamId: "lifecycle-death-team",
      },
    ), undefined));
    let recoveries = 0;
    let recoveredPosition: typeof deathPosition | undefined;

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "lifecycle-death-run",
        team: { teamId: "lifecycle-death-team" },
        checkpointStore: store,
        strategy: { observationPollMs: 1 },
        hooks: {
          recoverDeath: ({ observation: current }) =>
            Effect.sync(() => {
              recoveries += 1;
              recoveredPosition = current.player.position;
            }),
          fightEnderDragon: () => Effect.never,
        },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (recoveries === 0) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(recoveries).toBe(1);
    expect(recoveredPosition).toEqual(deathPosition);
  });

  it("escapes dangerous neutral mobs before checking for hostile mobs", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({ health: 8 });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 12,
      entityType: "minecraft:polar_bear",
      position: {
        x: 2,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 30,
      observedAt: "2026-01-01T00:00:00.000Z",
    }];
    driver.taskObserver = (task) => {
      if (
        task.type === "flee"
        && task.selector.categories?.includes(2)
      ) {
        driver.currentObservation = observation({ health: 20 });
      }
    };

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              driver.tasks.filter((task) => task.type === "flee").length < 2
            ) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.entityQueries[0]).toMatchObject({
      radius: 24,
      selector: {
        entityTypes: expect.arrayContaining(["minecraft:polar_bear"]),
        alive: true,
      },
      maximumResults: 1,
    });
    expect(driver.tasks.filter((task) => task.type === "flee")).toEqual([
      expect.objectContaining({
        selector: expect.objectContaining({
          entityTypes: expect.arrayContaining(["minecraft:polar_bear"]),
        }),
        triggerRadius: 24,
        safeDistance: 32,
        maximumEscapes: 2,
      }),
      expect.objectContaining({
        selector: { categories: [2], alive: true },
        triggerRadius: 16,
        safeDistance: 28,
        maximumEscapes: 2,
      }),
    ]);
  });

  it("uses a distinct idempotency key for repeated task invocations", async () => {
    const driver = new FakeBeatGameDriver();
    const task = {
      type: "collect-blocks" as const,
      blockIds: ["minecraft:oak_log"],
      count: 1,
      searchRadius: 32,
    };

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "task-invocation-run",
        team: { teamId: "task-invocation-team" },
        strategy: { observationPollMs: 1 },
        hooks: {
          satisfyRequirement: ({ driver: actionDriver, strategy }) =>
            Effect.gen(function* () {
              yield* actionDriver.runTask(task, strategy.path);
              yield* actionDriver.runTask(task, strategy.path);
              return yield* Effect.never;
            }),
        },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (driver.taskExecutions.length < 2) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    const keys = driver.taskExecutions.map(({ idempotencyKey }) =>
      idempotencyKey
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(
      /^beat-game:[0-9a-f-]{36}:[0-9a-f]{16}:1:[0-9a-f]{16}$/u,
    );
    expect(keys[1]).toMatch(
      /^beat-game:[0-9a-f-]{36}:[0-9a-f]{16}:2:[0-9a-f]{16}$/u,
    );
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("explores for resources without mining through protected terrain", async () => {
    const driver = new FakeBeatGameDriver();

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (!driver.tasks.some((task) => task.type === "explore")) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    const collectionIndex = driver.tasks.findIndex((task) =>
      task.type === "collect-blocks"
    );
    const explorationIndex = driver.tasks.findIndex((task) =>
      task.type === "explore"
    );
    expect(collectionIndex).toBeGreaterThanOrEqual(0);
    expect(explorationIndex).toBeGreaterThan(collectionIndex);
    expect(driver.taskPolicies[collectionIndex]).toMatchObject({
      allowMining: true,
      allowPlacing: false,
    });
    expect(driver.taskPolicies[explorationIndex]).toMatchObject({
      allowMining: false,
      allowPlacing: false,
    });
  });

  it("honors a compact triangulation baseline", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      counts: { "minecraft:ender_eye": 12 },
      position: {
        x: 100,
        y: 70,
        z: 200,
        dimension: "minecraft:overworld",
      },
    });
    const store = new InMemoryBeatGameCheckpointStore();
    const initial = checkpoint(BeatGamePhase.LOCATE_STRONGHOLD, {
      runId: "compact-baseline-run",
      teamId: "compact-baseline-team",
    });
    await Effect.runPromise(store.save({
      ...initial,
      memory: {
        ...initial.memory,
        eyeSamples: [{
          origin: driver.currentObservation.player.position,
          direction: { x: 1, z: 0 },
          observedAt: "2026-01-01T00:00:01.000Z",
          confidence: 1,
        }],
      },
    }, undefined));

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "compact-baseline-run",
        team: { teamId: "compact-baseline-team" },
        checkpointStore: store,
        strategy: {
          explorationRadius: 16,
          observationPollMs: 1,
        },
        hooks: {
          ...postDragonHooks(driver),
          throwEye: () =>
            Effect.succeed({
              origin: {
                x: 100,
                y: 70,
                z: 232,
                dimension: "minecraft:overworld",
              },
              direction: {
                x: Math.SQRT1_2,
                z: -Math.SQRT1_2,
              },
              observedAt: "2026-01-01T00:00:02.000Z",
              confidence: 1,
            }),
          searchStronghold: () => Effect.succeed(true),
          activateEndPortal: () =>
            Effect.sync(() => {
              driver.currentObservation = observation({
                dimension: "minecraft:the_end",
                counts: driver.currentObservation.inventory.counts,
              });
            }),
        },
      }).pipe(Effect.flatMap(({ awaitCompletion }) => awaitCompletion)),
    ));

    expect(driver.paths[0]).toEqual(expect.objectContaining({
      position: {
        x: 100,
        y: 70,
        z: 232,
        dimension: "minecraft:overworld",
      },
      radius: 4,
    }));
  });

  it("resumes a stronghold staircase from an intermediate step", async () => {
    const driver = new FakeBeatGameDriver();
    const currentPosition = {
      x: 15,
      y: 10,
      z: 17,
      dimension: "minecraft:overworld",
    };
    driver.currentObservation = observation({
      counts: { "minecraft:ender_eye": 12 },
      position: currentPosition,
    });
    installStaircaseMovementSimulation(driver, currentPosition);
    const portalFrames = [
      { x: 10, z: 20 },
      { x: 14, z: 20 },
      { x: 10, z: 24 },
      { x: 14, z: 24 },
    ].map(({ x, z }) => ({
      blockId: "minecraft:end_portal_frame",
      position: {
        x,
        y: 3,
        z,
        dimension: "minecraft:overworld",
      },
      properties: { eye: "false" },
      diggable: false,
      replaceable: false,
      interactive: true,
      observedAt: "2026-01-01T00:00:01.000Z",
    }));
    driver.blockResults = portalFrames;
    driver.blockQueryResolver = ({ center, selector }) =>
      selector.blockIds?.includes("minecraft:end_portal_frame") === true
        ? portalFrames
        : [blockObservation({
          x: Math.floor(center.x),
          y: Math.floor(center.y),
          z: Math.floor(center.z),
          dimension: center.dimension,
        })];
    const store = new InMemoryBeatGameCheckpointStore();
    const initial = checkpoint(BeatGamePhase.LOCATE_STRONGHOLD, {
      runId: "staircase-resume-run",
      teamId: "staircase-resume-team",
    });
    await Effect.runPromise(store.save({
      ...initial,
      memory: {
        ...initial.memory,
        strongholdEstimate: {
          x: 12,
          y: 100,
          z: 0,
          dimension: "minecraft:overworld",
        },
      },
    }, undefined));

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "staircase-resume-run",
        team: { teamId: "staircase-resume-team" },
        checkpointStore: store,
        strategy: { observationPollMs: 1 },
        hooks: {
          ...postDragonHooks(driver),
          activateEndPortal: () =>
            Effect.sync(() => {
              driver.currentObservation = observation({
                dimension: "minecraft:the_end",
                counts: driver.currentObservation.inventory.counts,
              });
            }),
        },
      }).pipe(Effect.flatMap(({ awaitCompletion }) => awaitCompletion)),
    ));

    expect(driver.paths[0]?.position).toEqual(currentPosition);
    expect(driver.paths[0]?.radius).toBe(0.5);
    expect(driver.paths).not.toContainEqual(expect.objectContaining({
      position: {
        x: 15,
        y: 10,
        z: 15,
        dimension: "minecraft:overworld",
      },
    }));
  });

  it("approaches portal frames found after the underground survey", async () => {
    const driver = new FakeBeatGameDriver();
    const currentPosition = {
      x: 2,
      y: 10,
      z: -3,
      dimension: "minecraft:overworld",
    };
    driver.currentObservation = observation({
      counts: {
        "minecraft:cobblestone": 16,
        "minecraft:diamond_pickaxe": 1,
        "minecraft:ender_eye": 12,
      },
      position: currentPosition,
    });
    installStaircaseMovementSimulation(driver, currentPosition);
    const portalFrames = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 0, z: 4 },
      { x: 4, z: 4 },
    ].map(({ x, z }) =>
      blockObservation(
        {
          x,
          y: 8,
          z,
          dimension: "minecraft:overworld",
        },
        {
          blockId: "minecraft:end_portal_frame",
          properties: { eye: "false" },
          diggable: false,
          interactive: true,
        },
      )
    );
    let portalFrameQueries = 0;
    driver.blockQueryResolver = ({ center, selector }) => {
      if (
        selector.blockIds?.includes("minecraft:end_portal_frame") === true
      ) {
        portalFrameQueries += 1;
        return portalFrameQueries >= 3 ? portalFrames : [];
      }
      return [blockObservation({
        x: Math.floor(center.x),
        y: Math.floor(center.y),
        z: Math.floor(center.z),
        dimension: center.dimension,
      })];
    };
    const store = new InMemoryBeatGameCheckpointStore();
    const initial = checkpoint(BeatGamePhase.LOCATE_STRONGHOLD, {
      runId: "underground-survey-run",
      teamId: "underground-survey-team",
    });
    await Effect.runPromise(store.save({
      ...initial,
      memory: {
        ...initial.memory,
        strongholdEstimate: {
          x: 2,
          y: 34,
          z: -10,
          dimension: "minecraft:overworld",
        },
      },
    }, undefined));

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "underground-survey-run",
        team: { teamId: "underground-survey-team" },
        checkpointStore: store,
        strategy: { observationPollMs: 1 },
        hooks: {
          ...postDragonHooks(driver),
          activateEndPortal: () =>
            Effect.sync(() => {
              driver.currentObservation = observation({
                dimension: "minecraft:the_end",
                counts: driver.currentObservation.inventory.counts,
              });
            }),
        },
      }).pipe(Effect.flatMap(({ awaitCompletion }) => awaitCompletion)),
    ));

    expect(portalFrameQueries).toBeGreaterThanOrEqual(3);
    expect(driver.paths).toContainEqual(expect.objectContaining({
      position: currentPosition,
      radius: 0.5,
    }));
    expect(driver.paths).toContainEqual(expect.objectContaining({
      position: {
        x: 2,
        y: 9,
        z: -2,
        dimension: "minecraft:overworld",
      },
      radius: 0.5,
      policy: expect.objectContaining({
        allowMining: false,
        allowPlacing: false,
        maxFallDistance: 1,
      }),
    }));
  });

  it("resumes a checkpoint and completes after policy confirms the fight", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      dimension: "minecraft:the_end",
      counts: {
        "minecraft:cooked_beef": 16,
        "minecraft:bow": 1,
        "minecraft:arrow": 32,
      },
    });
    const store = new InMemoryBeatGameCheckpointStore();
    await Effect.runPromise(store.save(checkpoint(
      BeatGamePhase.FIGHT_ENDER_DRAGON,
      {
        runId: "resumed-run",
        teamId: "resumed-team",
        planner: {
          ...checkpoint(BeatGamePhase.FIGHT_ENDER_DRAGON).planner,
          status: BeatGameRunStatus.RECOVERING,
        },
      },
    ), undefined));

    const result = await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "resumed-run",
        team: { teamId: "resumed-team" },
        checkpointStore: store,
        strategy: { observationPollMs: 1 },
        hooks: postDragonHooks(driver),
      }).pipe(Effect.flatMap(({ awaitCompletion }) => awaitCompletion)),
    ));

    expect(result.finalCheckpoint.planner.phase).toBe(BeatGamePhase.COMPLETE);
    expect(result.finalCheckpoint.planner.status)
      .toBe(BeatGameRunStatus.COMPLETED);
    expect(result.finalCheckpoint.revision).toBeGreaterThan(1);
  });

  it("replans when a queued hunting target is no longer observable", async () => {
    const driver = new FakeBeatGameDriver();
    const allRequiredItems = {
      "minecraft:cooked_beef": 16,
      "minecraft:oak_log": 8,
      "minecraft:cobblestone": 20,
      "minecraft:stone_sword": 1,
      "minecraft:iron_ingot": 7,
      "minecraft:iron_pickaxe": 1,
      "minecraft:water_bucket": 1,
      "minecraft:lava_bucket": 1,
      "minecraft:flint_and_steel": 1,
      "minecraft:shield": 1,
      "minecraft:obsidian": 10,
      "minecraft:blaze_rod": 7,
      "minecraft:ender_pearl": 14,
      "minecraft:ender_eye": 12,
      "minecraft:bow": 1,
      "minecraft:arrow": 32,
      "minecraft:torch": 1,
    };
    driver.currentObservation = observation({
      counts: {
        ...allRequiredItems,
        "minecraft:cooked_beef": 0,
      },
    });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 42,
      entityType: "minecraft:cow",
      position: {
        x: 5,
        y: 64,
        z: 5,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      observedAt: "2026-01-01T00:00:00.000Z",
    }];
    let attackAttempts = 0;
    driver.taskResolver = (task) => {
      if (task.type !== "attack-entity") {
        return Effect.succeed({});
      }
      attackAttempts += 1;
      driver.currentObservation = observation({ counts: allRequiredItems });
      return Effect.fail(new BeatGameDriverError({
        operation: "run-task",
        code: "not_found",
        retryable: false,
        message: "Target entity is not observable",
      }));
    };
    const updateDimension = (dimension: string) =>
      Effect.sync(() => {
        driver.currentObservation = observation({
          dimension,
          counts: driver.currentObservation.inventory.counts,
        });
      });
    const store = new InMemoryBeatGameCheckpointStore();
    const initial = checkpoint(BeatGamePhase.PREPARE_OVERWORLD, {
      runId: "missing-hunt-target-run",
      teamId: "missing-hunt-target-team",
    });
    await Effect.runPromise(store.save({
      ...initial,
      memory: {
        ...initial.memory,
        strongholdEstimate: {
          x: 100,
          y: 32,
          z: 100,
          dimension: "minecraft:overworld",
        },
      },
    }, undefined));

    const result = await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "missing-hunt-target-run",
        team: { teamId: "missing-hunt-target-team" },
        checkpointStore: store,
        strategy: {
          observationPollMs: 1,
          portalStrategy: "OBSIDIAN",
        },
        hooks: {
          buildAndEnterNether: () =>
            updateDimension("minecraft:the_nether"),
          returnThroughPortal: () =>
            updateDimension("minecraft:overworld"),
          searchStronghold: () => Effect.succeed(true),
          activateEndPortal: () => updateDimension("minecraft:the_end"),
          fightEnderDragon: () => Effect.succeed(true),
          collectDragonEgg: ({ observation: current }) =>
            Effect.sync(() => {
              driver.currentObservation = observation({
                dimension: "minecraft:the_end",
                counts: {
                  ...current.inventory.counts,
                  "minecraft:dragon_egg": 1,
                },
              });
            }),
          exitEnd: () => updateDimension("minecraft:overworld"),
        },
      }).pipe(Effect.flatMap(({ awaitCompletion }) => awaitCompletion)),
    ));

    expect(attackAttempts).toBe(1);
    expect(result.finalCheckpoint.planner.status)
      .toBe(BeatGameRunStatus.COMPLETED);
  });

  it("crafts the minimum pickaxe before mining cobblestone", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      counts: {
        "minecraft:cooked_beef": 16,
        "minecraft:oak_log": 8,
      },
    });
    let craftingTablePlaced = false;
    let resolveCollection!: () => void;
    const collectionStarted = new Promise<void>((resolve) => {
      resolveCollection = resolve;
    });
    driver.recipeResolver = (resultItemId) => [{
      recipeId: resultItemId,
      recipeType: "minecraft:crafting",
      resultItemId,
      resultCount: 1,
      ingredients: [],
    }];
    driver.craftabilityResolver = (recipeId) => ({
      canCraft: true,
      maximumCraftCount: 1,
      ...(recipeId === "minecraft:wooden_pickaxe"
        ? { requiredStation: "minecraft:crafting_table" }
        : {}),
      missing: [],
    });
    driver.blockQueryResolver = ({ center, selector }) => {
      if (
        craftingTablePlaced
        && selector.blockIds?.includes("minecraft:crafting_table") === true
      ) {
        return [blockObservation({
          x: 2,
          y: 64,
          z: 0,
          dimension: "minecraft:overworld",
        }, { blockId: "minecraft:crafting_table" })];
      }
      if (selector.replaceable === false) {
        return [blockObservation({
          x: 2,
          y: 63,
          z: 0,
          dimension: "minecraft:overworld",
        })];
      }
      if (
        selector.diggable === true
        && selector.interactive === false
      ) {
        return [blockObservation({
          x: Math.floor(center.x),
          y: Math.floor(center.y),
          z: Math.floor(center.z),
          dimension: center.dimension,
        }, {
          blockId: "minecraft:stone",
          replaceable: false,
        })];
      }
      return [];
    };
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
        if (task.type === "build") {
          craftingTablePlaced = true;
        }
        if (
          task.type === "craft"
          && task.recipeId === "minecraft:wooden_pickaxe"
        ) {
          driver.currentObservation = observation({
            counts: {
              ...driver.currentObservation.inventory.counts,
              "minecraft:wooden_pickaxe": 1,
            },
          });
        }
        if (task.type === "collect-blocks") {
          expect(task.blockIds).toEqual(["minecraft:stone"]);
          expect(task.count).toBe(20);
          expect(
            driver.currentObservation.inventory.counts[
              "minecraft:wooden_pickaxe"
            ],
          ).toBe(1);
          resolveCollection();
        }
        return {};
      });

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const run = yield* beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      });
      yield* Effect.promise(() => collectionStarted).pipe(
        Effect.timeout("5 seconds"),
      );
      yield* run.stop;
    })));

    expect(driver.tasks.map((task) => task.type === "craft"
      ? `${task.type}:${task.recipeId}`
      : task.type)).toEqual([
      "craft:minecraft:crafting_table",
      "build",
      "craft:minecraft:wooden_pickaxe",
      "collect-blocks",
    ]);
    expect(driver.blockQueries).toContainEqual(expect.objectContaining({
      radius: 32,
      selector: { blockIds: ["minecraft:crafting_table"] },
    }));
    expect(driver.blockQueries).toContainEqual(expect.objectContaining({
      selector: { diggable: true, interactive: false },
    }));
  });

  it("replaces a remembered workstation that cannot be reached", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      position: { y: 54 },
      counts: {
        "minecraft:cooked_beef": 8,
        "minecraft:oak_log": 5,
        "minecraft:oak_planks": 3,
        "minecraft:stick": 2,
        "minecraft:wooden_pickaxe": 1,
        "minecraft:cobblestone": 20,
      },
    });
    const surfaceTable = blockObservation({
      x: 0,
      y: 70,
      z: 0,
      dimension: "minecraft:overworld",
    }, { blockId: "minecraft:crafting_table" });
    const localTable = blockObservation({
      x: 1,
      y: 54,
      z: 0,
      dimension: "minecraft:overworld",
    }, { blockId: "minecraft:crafting_table" });
    let localTablePlaced = false;
    driver.recipeResolver = (resultItemId) => [{
      recipeId: resultItemId,
      recipeType: "minecraft:crafting",
      resultItemId,
      resultCount: 1,
      ingredients: [],
    }];
    driver.craftabilityResolver = (recipeId) => ({
      canCraft: true,
      maximumCraftCount: 1,
      ...(recipeId === "minecraft:stone_sword"
        ? { requiredStation: "minecraft:crafting_table" }
        : {}),
      missing: [],
    });
    driver.blockQueryResolver = ({ center, selector }) => {
      if (selector.blockIds?.includes("minecraft:crafting_table") === true) {
        return localTablePlaced ? [localTable] : [surfaceTable];
      }
      if (selector.replaceable === false) {
        return [blockObservation({
          x: 1,
          y: 53,
          z: 0,
          dimension: "minecraft:overworld",
        })];
      }
      if (selector.replaceable === true) {
        return [blockObservation({
          x: Math.floor(center.x),
          y: Math.floor(center.y),
          z: Math.floor(center.z),
          dimension: center.dimension,
        }, { replaceable: true })];
      }
      return [];
    };
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
      }).pipe(
        Effect.zipRight(
          position.y > 60
            ? Effect.fail(new BeatGameDriverError({
              operation: "pathfind",
              code: "unreachable_goal",
              retryable: false,
              message: "No route found to the goal",
            }))
            : Effect.void,
        ),
      );
    let resolveSwordCraft!: () => void;
    const swordCraftStarted = new Promise<void>((resolve) => {
      resolveSwordCraft = resolve;
    });
    driver.taskResolver = (task) => {
      driver.tasks.push(task);
      if (task.type === "build") {
        localTablePlaced = true;
        return Effect.void;
      }
      if (
        task.type === "craft"
        && task.recipeId === "minecraft:stone_sword"
      ) {
        resolveSwordCraft();
        return Effect.never;
      }
      return Effect.void;
    };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const run = yield* beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      });
      yield* Effect.promise(() => swordCraftStarted).pipe(
        Effect.timeout("5 seconds"),
      );
      yield* run.stop;
    })));

    expect(driver.paths[0]?.position).toEqual({
      x: 0.5,
      y: 70,
      z: 0.5,
      dimension: "minecraft:overworld",
    });
    expect(driver.paths[0]?.policy.allowPlacing).toBe(false);
    expect(driver.tasks.map((task) => task.type === "craft"
      ? `${task.type}:${task.recipeId}`
      : task.type)).toEqual([
      "craft:minecraft:crafting_table",
      "build",
      "craft:minecraft:stone_sword",
    ]);
    expect(driver.tasks.at(-1)).toMatchObject({
      station: localTable.position,
    });
  });

  it("makes charcoal before cooking a full food batch", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      counts: {
        "minecraft:oak_log": 4,
        "minecraft:oak_planks": 3,
        "minecraft:cobblestone": 20,
        "minecraft:stone_sword": 1,
        "minecraft:beef": 8,
        "minecraft:iron_ingot": 7,
        "minecraft:iron_pickaxe": 1,
        "minecraft:water_bucket": 1,
        "minecraft:flint_and_steel": 1,
        "minecraft:shield": 1,
      },
    });
    driver.blockQueryResolver = ({ selector }) =>
      selector.blockIds?.includes("minecraft:furnace") === true
        ? [blockObservation({
          x: 1,
          y: 64,
          z: 0,
          dimension: "minecraft:overworld",
        }, { blockId: "minecraft:furnace" })]
        : [];
    let resolveFoodSmelt!: () => void;
    const foodSmeltStarted = new Promise<void>((resolve) => {
      resolveFoodSmelt = resolve;
    });
    driver.taskResolver = (task) => {
      driver.tasks.push(task);
      if (
        task.type !== "smelt"
        || !task.input.itemIds?.includes("minecraft:beef")
      ) {
        return Effect.void;
      }
      resolveFoodSmelt();
      return Effect.never;
    };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const run = yield* beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      });
      yield* Effect.promise(() => foodSmeltStarted).pipe(
        Effect.timeout("5 seconds"),
      );
      yield* run.stop;
    })));

    expect(driver.tasks.filter((task) => task.type === "smelt")).toEqual([
      expect.objectContaining({
        input: {
          itemIds: expect.arrayContaining(["minecraft:oak_log"]),
        },
        count: 1,
        fuel: {
          itemIds: expect.arrayContaining(["minecraft:oak_planks"]),
        },
      }),
      expect.objectContaining({
        input: { itemIds: ["minecraft:beef"] },
        count: 8,
        fuel: {
          itemIds: ["minecraft:coal", "minecraft:charcoal"],
        },
      }),
    ]);
  });

  it("runs custom Effect policy inside the normal planner lifecycle", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      dimension: "minecraft:the_end",
      counts: {
        "minecraft:cooked_beef": 16,
        "minecraft:bow": 1,
        "minecraft:arrow": 32,
      },
    });
    const store = new InMemoryBeatGameCheckpointStore();
    await Effect.runPromise(store.save(checkpoint(
      BeatGamePhase.FIGHT_ENDER_DRAGON,
      {
        runId: "hook-run",
        teamId: "hook-team",
      },
    ), undefined));
    let hookCheckpointRevision = 0;

    const result = await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "hook-run",
        team: { teamId: "hook-team" },
        checkpointStore: store,
        hooks: {
          ...postDragonHooks(driver),
          fightEnderDragon: ({ checkpoint: current }) =>
            Effect.sync(() => {
              hookCheckpointRevision = current.revision;
              return true;
            }),
        },
      }).pipe(Effect.flatMap(({ awaitCompletion }) => awaitCompletion)),
    ));

    expect(hookCheckpointRevision).toBeGreaterThan(1);
    expect(result.finalCheckpoint.planner.status)
      .toBe(BeatGameRunStatus.COMPLETED);
  });

  it("coordinates and awaits every driver in a multi-bot run", async () => {
    const store = new InMemoryBeatGameCheckpointStore();
    const drivers = [
      new FakeBeatGameDriver("instance-1", "bot-a"),
      new FakeBeatGameDriver("instance-1", "bot-b"),
    ];
    for (const driver of drivers) {
      driver.currentObservation = observation({
        dimension: "minecraft:the_end",
        counts: {
          "minecraft:cooked_beef": 16,
          "minecraft:bow": 1,
          "minecraft:arrow": 32,
          "minecraft:torch": 1,
          "minecraft:dragon_egg": 1,
        },
      });
      await Effect.runPromise(store.save(checkpoint(
        BeatGamePhase.FIGHT_ENDER_DRAGON,
        {
          runId: `team-run-${driver.botId}`,
          teamId: "team-run",
          instanceId: driver.instanceId,
          botId: driver.botId,
        },
      ), undefined));
    }

    const results = await Effect.runPromise(Effect.scoped(
      beatGameTeamWithDrivers(drivers, {
        teamId: "team-run",
        checkpointStore: store,
        hooks: {
          exitEnd: ({ driver: current, observation: currentObservation }) =>
            Effect.sync(() => {
              const fake = drivers.find(({ botId }) =>
                botId === current.botId
              );
              if (fake === undefined) {
                throw new Error(`Missing fake driver ${current.botId}`);
              }
              fake.currentObservation = observation({
                dimension: "minecraft:overworld",
                counts: currentObservation.inventory.counts,
              });
            }),
        },
      }).pipe(Effect.flatMap(({ awaitCompletion }) => awaitCompletion)),
    ));

    expect(results.map(({ botId }) => botId).sort()).toEqual([
      "bot-a",
      "bot-b",
    ]);
    expect(results.every(({ finalCheckpoint }) =>
      finalCheckpoint.planner.status === BeatGameRunStatus.COMPLETED
    )).toBe(true);
  });

  it("recovers from retryable observation failures", async () => {
    const driver = new FakeBeatGameDriver();
    const endObservation = observation({
      dimension: "minecraft:the_end",
      counts: {
        "minecraft:cooked_beef": 16,
        "minecraft:bow": 1,
        "minecraft:arrow": 32,
      },
    });
    driver.currentObservation = endObservation;
    let observations = 0;
    driver.observationResolver = () => {
      observations += 1;
      if (observations === 2) {
        return Effect.fail(new BeatGameDriverError({
          operation: "observe",
          retryable: true,
          message: "connection restarted",
        }));
      }
      return Effect.succeed(driver.currentObservation);
    };
    const store = new InMemoryBeatGameCheckpointStore();
    await Effect.runPromise(store.save(checkpoint(
      BeatGamePhase.FIGHT_ENDER_DRAGON,
      {
        runId: "recovery-run",
        teamId: "recovery-team",
      },
    ), undefined));

    const result = await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "recovery-run",
        team: { teamId: "recovery-team" },
        checkpointStore: store,
        strategy: { observationPollMs: 1 },
        hooks: postDragonHooks(driver),
      }).pipe(Effect.flatMap(({ awaitCompletion }) => awaitCompletion)),
    ));

    expect(observations).toBeGreaterThanOrEqual(3);
    expect(result.finalCheckpoint.planner.status)
      .toBe(BeatGameRunStatus.COMPLETED);
  });

  it("observes a timed-out action before deciding whether to retry it", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      counts: { "minecraft:ender_eye": 12 },
    });
    const store = new InMemoryBeatGameCheckpointStore();
    await Effect.runPromise(store.save(checkpoint(
      BeatGamePhase.ACTIVATE_END_PORTAL,
      {
        runId: "idempotent-retry-run",
        teamId: "idempotent-retry-team",
      },
    ), undefined));
    let activationAttempts = 0;

    const result = await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "idempotent-retry-run",
        team: { teamId: "idempotent-retry-team" },
        checkpointStore: store,
        strategy: { observationPollMs: 1 },
        hooks: {
          ...postDragonHooks(driver),
          activateEndPortal: () =>
            Effect.suspend(() => {
              activationAttempts += 1;
              driver.currentObservation = observation({
                dimension: "minecraft:the_end",
                counts: {
                  "minecraft:cooked_beef": 16,
                  "minecraft:bow": 1,
                  "minecraft:arrow": 32,
                },
              });
              return Effect.fail(new BeatGameDriverError({
                operation: "activate-end-portal",
                retryable: true,
                message: "response was lost after the dimension changed",
              }));
            }),
        },
      }).pipe(Effect.flatMap(({ awaitCompletion }) => awaitCompletion)),
    ));

    expect(activationAttempts).toBe(1);
    expect(result.finalCheckpoint.planner.status)
      .toBe(BeatGameRunStatus.COMPLETED);
  });

  it("interrupts a long action when a run is paused", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      dimension: "minecraft:the_end",
      counts: {
        "minecraft:cooked_beef": 16,
        "minecraft:bow": 1,
        "minecraft:arrow": 32,
      },
    });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 99,
      entityType: "minecraft:ender_dragon",
      position: {
        x: 20,
        y: 80,
        z: 20,
        dimension: "minecraft:the_end",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      observedAt: "2026-01-01T00:00:00.000Z",
    }];
    let interrupted = 0;
    driver.taskResolver = () =>
      Effect.never.pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interrupted += 1;
          })
        ),
      );
    const store = new InMemoryBeatGameCheckpointStore();
    await Effect.runPromise(store.save(checkpoint(
      BeatGamePhase.FIGHT_ENDER_DRAGON,
      {
        runId: "pause-run",
        teamId: "pause-team",
      },
    ), undefined));

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "pause-run",
        team: { teamId: "pause-team" },
        checkpointStore: store,
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.sleep(10).pipe(
            Effect.zipRight(run.pause),
            Effect.zipRight(Effect.sleep(20)),
            Effect.zipRight(run.stop),
            Effect.zipRight(run.awaitCompletion.pipe(Effect.either)),
          )
        ),
      ),
    ));

    expect(interrupted).toBeGreaterThan(0);
  });

  it("reattaches durable tasks with the restored action identity", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      dimension: "minecraft:the_end",
      counts: {
        "minecraft:cooked_beef": 16,
        "minecraft:bow": 1,
        "minecraft:arrow": 32,
      },
    });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 99,
      entityType: "minecraft:ender_dragon",
      position: {
        x: 20,
        y: 80,
        z: 20,
        dimension: "minecraft:the_end",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      observedAt: "2026-01-01T00:00:00.000Z",
    }];
    driver.taskResolver = () => Effect.never;
    const store = new InMemoryBeatGameCheckpointStore();
    const initial = checkpoint(BeatGamePhase.FIGHT_ENDER_DRAGON);
    await Effect.runPromise(store.save({
      ...initial,
      runId: "durable-resume-run",
      teamId: "durable-resume-team",
      planner: {
        ...initial.planner,
        currentAction: "fight-ender-dragon",
        currentActionId: "restored-action-id",
      },
    }, undefined));

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "durable-resume-run",
        team: { teamId: "durable-resume-team" },
        checkpointStore: store,
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.sleep(10).pipe(
            Effect.zipRight(run.stop),
            Effect.zipRight(run.awaitCompletion.pipe(Effect.either)),
          )
        ),
      ),
    ));

    expect(driver.taskExecutions[0]?.idempotencyKey).toMatch(
      /^beat-game:restored-action-id:[0-9a-f]{16}:1:[0-9a-f]{16}$/u,
    );
    expect(driver.taskExecutions[0]?.deadline).toBeInstanceOf(Date);
  });

  it("interrupts a blocked observation when the run is stopped", async () => {
    const driver = new FakeBeatGameDriver();
    let observations = 0;
    driver.observationResolver = () => {
      observations += 1;
      return observations === 1
        ? Effect.succeed(observation())
        : Effect.never;
    };

    const exit = await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        runId: "stopped-run",
        team: { teamId: "stopped-team" },
      }).pipe(
        Effect.flatMap((run) =>
          run.stop.pipe(
            Effect.zipRight(run.awaitCompletion),
            Effect.either,
          )
        ),
      ),
    ));

    expect(Either.isLeft(exit)).toBe(true);
    if (Either.isLeft(exit)) {
      expect(exit.left).toBeInstanceOf(BeatGameCancelled);
      expect(exit.left._tag).toBe("BeatGameCancelled");
      if (exit.left._tag === "BeatGameCancelled") {
        expect(exit.left.reason).toBe("stopped");
      }
    }
  });
});
