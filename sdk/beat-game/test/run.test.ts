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

  it("resumes item recovery after combat interrupts it", async () => {
    const driver = new FakeBeatGameDriver();
    const deathPosition = {
      x: 24,
      y: 64,
      z: -12,
      dimension: "minecraft:overworld",
    };
    const zombie = {
      connectionEpoch: "epoch-1",
      networkId: 31,
      entityType: "minecraft:zombie",
      position: {
        x: 2,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:01.000Z",
    } as const;
    driver.currentObservation = observation({
      dead: true,
      health: 0,
      position: deathPosition,
    });
    let recoveries = 0;

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
        hooks: {
          recoverDeath: () =>
            Effect.sync(() => {
              recoveries += 1;
              if (recoveries === 1) {
                driver.currentObservation = observation();
                driver.entityResults = [zombie];
              }
            }).pipe(
              Effect.zipRight(
                recoveries === 0 ? Effect.never : Effect.void,
              ),
            ),
        },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (recoveries < 2) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(recoveries).toBe(2);
    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "attack-entity",
      target: expect.objectContaining({ networkId: zombie.networkId }),
      selectBestWeapon: true,
    }));
  });

  it("flees from a nearby creeper before it can explode", async () => {
    const driver = new FakeBeatGameDriver();
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 41,
      entityType: "minecraft:creeper",
      position: {
        x: 6,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:01.000Z",
    }];
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
      }).pipe(
        Effect.zipRight(
          task.type === "collect-blocks"
            ? Effect.never
            : Effect.void,
        ),
      );

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (!driver.tasks.some((task) => task.type === "flee")) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "flee",
      selector: {
        networkId: 41,
        alive: true,
      },
      triggerRadius: 12,
      safeDistance: 16,
      maximumEscapes: 1,
    }));
    expect(driver.tasks).not.toContainEqual(expect.objectContaining({
      type: "attack-entity",
    }));
  });

  it("does not abandon work for a distant creeper", async () => {
    const driver = new FakeBeatGameDriver();
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 42,
      entityType: "minecraft:creeper",
      position: {
        x: 16,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:01.000Z",
    }];
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
      }).pipe(
        Effect.zipRight(
          task.type === "collect-blocks"
            ? Effect.never
            : Effect.void,
        ),
      );

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const run = yield* beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      });
      while (!driver.tasks.some((task) => task.type === "collect-blocks")) {
        yield* Effect.sleep(1);
      }
      yield* Effect.sleep(250);
      yield* run.stop;
    })));

    expect(driver.tasks.some((task) => task.type === "flee")).toBe(false);
  });

  it("stops retreating once a creeper is outside its trigger radius", async () => {
    const driver = new FakeBeatGameDriver();
    const creeper = {
      connectionEpoch: "epoch-1",
      networkId: 43,
      entityType: "minecraft:creeper",
      position: {
        x: 2,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:01.000Z",
    } as const;
    driver.currentObservation = observation({
      health: 8,
      counts: { "minecraft:cooked_beef": 1 },
    });
    driver.entityResults = [creeper];
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
        if (task.type === "flee") {
          driver.entityResults = [{
            ...creeper,
            position: { ...creeper.position, x: 16 },
          }];
          driver.currentObservation = observation({
            health: 20,
            counts: { "minecraft:cooked_beef": 1 },
          });
        }
      }).pipe(
        Effect.zipRight(
          task.type === "collect-blocks" ? Effect.never : Effect.void,
        ),
      );

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              !driver.tasks.some((task) => task.type === "collect-blocks")
            ) {
              yield* Effect.sleep(1);
            }
            yield* Effect.sleep(50);
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.tasks.filter((task) => task.type === "flee")).toHaveLength(1);
  });

  it("escapes underground threats toward the Overworld surface", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      health: 4,
      position: {
        x: 0,
        y: 30,
        z: 0,
        dimension: "minecraft:overworld",
      },
    });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 42,
      entityType: "minecraft:creeper",
      position: {
        x: 6,
        y: 30,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:01.000Z",
    }];
    driver.entityQueryResolver = (query) =>
      query.selector.categories?.includes(2) ? driver.entityResults : [];
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
      }).pipe(
        Effect.zipRight(
          task.type === "attack-entity" ? Effect.never : Effect.void,
        ),
      );
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
      }).pipe(Effect.zipRight(Effect.never));

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (driver.paths.length === 0) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.paths[0]).toEqual({
      position: {
        x: -24,
        y: 80,
        z: 0,
        dimension: "minecraft:overworld",
      },
      radius: 17,
      policy: expect.objectContaining({
        allowMining: true,
        allowPlacing: true,
        maxSearchTimeMs: 3_000,
      }),
    });
    expect(driver.tasks.some((task) => task.type === "flee")).toBe(false);
  });

  it("escapes dangerous neutral mobs before checking for nearby hostiles", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      health: 8,
      counts: { "minecraft:cooked_beef": 1 },
    });
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
      if (task.type === "flee") {
        driver.entityResults = [];
      }
    };

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              !driver.tasks.some((task) => task.type === "flee")
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
    ]);
  });

  it("raises a shield and attacks a ranged hostile at critical health", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      health: 8,
      counts: {
        "minecraft:cooked_beef": 1,
        "minecraft:shield": 1,
        "minecraft:stone_sword": 1,
      },
    });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 13,
      entityType: "minecraft:skeleton",
      position: {
        x: 6,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:00.000Z",
    }];
    driver.entityQueryResolver = (query) =>
      query.selector.categories?.includes(2) ? driver.entityResults : [];
    driver.taskObserver = (task) => {
      if (task.type === "attack-entity") {
        driver.entityResults = [];
        driver.currentObservation = observation({
          health: 20,
          counts: {
            "minecraft:cooked_beef": 1,
            "minecraft:shield": 1,
            "minecraft:stone_sword": 1,
          },
        });
      }
    };

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              !driver.tasks.some((task) =>
                task.type === "attack-entity"
              )
            ) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.actions).toContainEqual({
      type: "equip-item",
      selector: { itemIds: ["minecraft:shield"] },
      equipmentSlot: "offhand",
    });
    expect(driver.actions).toContainEqual({ type: "use-item", hand: "off" });
    expect(driver.actions).toContainEqual({ type: "release-item" });
    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "attack-entity",
      target: expect.objectContaining({
        entityType: "minecraft:skeleton",
        networkId: 13,
      }),
      selectBestWeapon: true,
    }));
    expect(driver.tasks.some((task) => task.type === "flee")).toBe(false);
  });

  it("keeps distance from ranged hostiles until it has combat equipment", async () => {
    const driver = new FakeBeatGameDriver();
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 14,
      entityType: "minecraft:skeleton",
      position: {
        x: 6,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:00.000Z",
    }];
    driver.entityQueryResolver = (query) =>
      query.selector.categories?.includes(2) ? driver.entityResults : [];
    driver.taskObserver = (task) => {
      if (task.type === "flee") {
        driver.entityResults = [];
      }
    };

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (!driver.tasks.some((task) => task.type === "flee")) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "flee",
      selector: {
        networkId: 14,
        alive: true,
      },
      triggerRadius: 12,
      safeDistance: 16,
      maximumEscapes: 1,
    }));
    expect(driver.tasks.some((task) => task.type === "attack-entity"))
      .toBe(false);
  });

  it("interrupts work and fights back bare-handed after taking damage", async () => {
    const driver = new FakeBeatGameDriver();
    const attacker = {
      connectionEpoch: "epoch-1",
      networkId: 23,
      entityType: "minecraft:zombie",
      position: {
        x: 2,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:01.000Z",
    } as const;
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
        driver.taskObserver(task);
      }).pipe(
        Effect.zipRight(
          task.type === "collect-blocks"
            ? Effect.never
            : Effect.succeed({}),
        ),
      );

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              !driver.tasks.some((task) => task.type === "collect-blocks")
            ) {
              yield* Effect.sleep(1);
            }
            driver.entityResults = [attacker];
            driver.currentObservation = observation({ health: 14 });
            while (
              !driver.tasks.some((task) => task.type === "attack-entity")
            ) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.entityQueries).toContainEqual(expect.objectContaining({
      radius: 24,
      selector: { categories: [2], alive: true },
      maximumResults: 32,
    }));
    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "attack-entity",
      target: expect.objectContaining({
        connectionEpoch: attacker.connectionEpoch,
        networkId: attacker.networkId,
      }),
      maximumAttacks: 3,
      selectBestWeapon: true,
    }));
    const attackIndex = driver.tasks.findIndex((task) =>
      task.type === "attack-entity"
    );
    expect(driver.taskPolicies[attackIndex]).toEqual(expect.objectContaining({
      allowMining: false,
      allowPlacing: false,
      maxSearchTimeMs: 1_000,
    }));
    expect(driver.maximumActiveControlScopes).toBe(1);
  });

  it("escapes an attacking Enderman instead of trading bare-handed", async () => {
    const driver = new FakeBeatGameDriver();
    const attacker = {
      connectionEpoch: "epoch-1",
      networkId: 26,
      entityType: "minecraft:enderman",
      position: {
        x: 3,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 40,
      observedAt: "2026-01-01T00:00:01.000Z",
    } as const;
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
        driver.taskObserver(task);
      }).pipe(
        Effect.zipRight(
          task.type === "collect-blocks"
            ? Effect.never
            : Effect.succeed({}),
        ),
      );
    driver.taskObserver = (task) => {
      if (task.type === "flee") {
        driver.entityResults = [];
      }
    };

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              !driver.tasks.some((task) => task.type === "collect-blocks")
            ) {
              yield* Effect.sleep(1);
            }
            driver.entityResults = [attacker];
            driver.currentObservation = observation({ health: 18 });
            while (!driver.tasks.some((task) => task.type === "flee")) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "flee",
      selector: {
        networkId: 26,
        alive: true,
      },
      triggerRadius: 12,
      safeDistance: 16,
      maximumEscapes: 1,
    }));
    expect(driver.tasks.some((task) => task.type === "attack-entity"))
      .toBe(false);
  });

  it("disengages from melee combat before critical health becomes fatal", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      health: 8,
      counts: { "minecraft:cooked_beef": 1 },
    });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 24,
      entityType: "minecraft:zombie",
      position: {
        x: 2,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:01.000Z",
    }];
    driver.entityQueryResolver = (query) =>
      query.selector.categories?.includes(2) ? driver.entityResults : [];
    driver.taskObserver = (task) => {
      if (task.type === "flee") {
        driver.entityResults = [];
        driver.currentObservation = observation({
          health: 8,
          counts: { "minecraft:cooked_beef": 1 },
        });
      }
    };

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (!driver.tasks.some((task) => task.type === "flee")) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "flee",
      selector: {
        networkId: 24,
        alive: true,
      },
      triggerRadius: 12,
      safeDistance: 16,
      maximumEscapes: 1,
    }));
    expect(driver.tasks.some((task) => task.type === "attack-entity"))
      .toBe(false);
  });

  it("replans when a defensive target becomes unreachable", async () => {
    const driver = new FakeBeatGameDriver();
    const attacker = {
      connectionEpoch: "epoch-1",
      networkId: 25,
      entityType: "minecraft:zombie",
      position: {
        x: 2,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:01.000Z",
    } as const;
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
        driver.taskObserver(task);
      }).pipe(
        Effect.zipRight(
          task.type === "collect-blocks"
            ? Effect.never
            : task.type === "attack-entity"
            ? Effect.sync(() => {
              driver.entityResults = [];
            }).pipe(
              Effect.zipRight(Effect.fail(new BeatGameDriverError({
                operation: "task.attack-entity",
                code: "unreachable",
                retryable: true,
                message: "Unable to reach the target entity",
              }))),
            )
            : Effect.succeed({}),
        ),
      );

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              driver.tasks.filter((task) =>
                task.type === "collect-blocks"
              ).length < 1
            ) {
              yield* Effect.sleep(1);
            }
            driver.entityResults = [attacker];
            while (
              driver.tasks.filter((task) =>
                task.type === "collect-blocks"
              ).length < 2
            ) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "attack-entity",
      target: expect.objectContaining({ networkId: attacker.networkId }),
      sprinting: true,
    }));
    expect(driver.tasks.filter((task) =>
      task.type === "collect-blocks"
    )).toHaveLength(2);
  });

  it("interrupts work and swims upward before running out of air", async () => {
    const driver = new FakeBeatGameDriver();
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
        driver.taskObserver(task);
      }).pipe(
        Effect.zipRight(
          task.type === "collect-blocks" ? Effect.never : Effect.succeed({}),
        ),
      );
    driver.actionObserver = (action) => {
      if (action.type === "set-movement" && action.jump === true) {
        driver.currentObservation = observation({ air: 300 });
      }
    };

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              !driver.tasks.some((task) => task.type === "collect-blocks")
            ) {
              yield* Effect.sleep(1);
            }
            driver.currentObservation = observation({ air: 100 });
            while (
              !driver.actions.some((action) =>
                action.type === "set-movement" && action.jump === true
              )
            ) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.actions).toContainEqual({
      type: "look",
      yaw: 0,
      pitch: -90,
    });
    expect(driver.actions).toContainEqual({
      type: "set-movement",
      forward: true,
      jump: true,
      sprint: true,
    });
    expect(driver.actions).toContainEqual({ type: "reset-movement" });
  });

  it("fills a bucket by facing and interacting with a fluid source", async () => {
    const driver = new FakeBeatGameDriver();
    const source = {
      x: 2,
      y: 63,
      z: 1,
      dimension: "minecraft:overworld",
    } as const;
    driver.currentObservation = observation({
      counts: {
        "minecraft:cooked_beef": 8,
        "minecraft:oak_log": 8,
        "minecraft:cobblestone": 20,
        "minecraft:stone_sword": 1,
        "minecraft:iron_ingot": 7,
        "minecraft:stone_pickaxe": 1,
        "minecraft:bucket": 1,
        "minecraft:shield": 1,
      },
    });
    driver.blockResults = [blockObservation(source, {
      blockId: "minecraft:water",
      properties: { level: "0" },
      replaceable: true,
    })];
    driver.actionResolver = (action) => {
      if (action.type === "look") {
        driver.currentObservation = observation({
          counts: driver.currentObservation.inventory.counts,
          rotation: { yaw: action.yaw, pitch: action.pitch },
        });
      }
      return action.type === "interact-block"
        ? Effect.never
        : Effect.succeed({});
    };

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              !driver.actions.some((action) => action.type === "interact-block")
            ) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.paths).toContainEqual(expect.objectContaining({
      position: source,
      radius: 2,
    }));
    expect(driver.actions.slice(-3)).toEqual([
      {
        type: "select-item",
        selector: { itemIds: ["minecraft:bucket"] },
      },
      expect.objectContaining({
        type: "look",
        yaw: expect.any(Number),
        pitch: expect.any(Number),
      }),
      {
        type: "interact-block",
        position: source,
        face: "up",
        hand: "main",
      },
    ]);
  });

  it("recycles placed gravel until it produces flint", async () => {
    const driver = new FakeBeatGameDriver();
    const support = {
      x: 2,
      y: 63,
      z: 0,
      dimension: "minecraft:overworld",
    } as const;
    const target = { ...support, y: support.y + 1 };
    let gravelPlaced = false;
    driver.currentObservation = observation({
      counts: {
        "minecraft:cooked_beef": 8,
        "minecraft:oak_log": 8,
        "minecraft:cobblestone": 20,
        "minecraft:stone_sword": 1,
        "minecraft:iron_ingot": 7,
        "minecraft:stone_pickaxe": 1,
        "minecraft:water_bucket": 1,
        "minecraft:shield": 1,
        "minecraft:gravel": 1,
      },
    });
    driver.blockQueryResolver = (query) => {
      if (
        query.selector.blockIds?.includes("minecraft:gravel")
        && gravelPlaced
      ) {
        return [blockObservation(target, {
          blockId: "minecraft:gravel",
        })];
      }
      if (query.selector.replaceable === false) {
        return [blockObservation(support)];
      }
      if (query.selector.replaceable === true) {
        return [blockObservation(target, {
          blockId: "minecraft:air",
          diggable: false,
          replaceable: true,
        })];
      }
      return [];
    };
    driver.actionResolver = (action) =>
      Effect.sync(() => {
        if (action.type === "place-block") {
          gravelPlaced = true;
        }
        if (action.type === "dig-block") {
          gravelPlaced = false;
          driver.currentObservation = observation({
            counts: {
              ...driver.currentObservation.inventory.counts,
              "minecraft:gravel": 0,
              "minecraft:flint": 1,
            },
          });
        }
        return {};
      });

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              !driver.actions.some((action) => action.type === "dig-block")
            ) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.actions).toContainEqual({
      type: "select-item",
      selector: { itemIds: ["minecraft:gravel"] },
    });
    expect(driver.actions).toContainEqual({
      type: "place-block",
      against: support,
      face: "up",
      hand: "main",
    });
    expect(driver.actions).toContainEqual({
      type: "dig-block",
      position: target,
    });
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

  it("explores for resources without tunneling and may bridge terrain", async () => {
    const driver = new FakeBeatGameDriver();

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (driver.xzPaths.length === 0) {
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
    expect(collectionIndex).toBeGreaterThanOrEqual(0);
    expect(driver.taskPolicies[collectionIndex]).toMatchObject({
      allowMining: true,
      allowPlacing: true,
    });
    expect(driver.xzPaths[0]).toMatchObject({
      x: 24,
      z: 0,
      dimension: "minecraft:overworld",
      radius: 2,
      policy: {
        allowMining: false,
        allowPlacing: true,
      },
    });
    expect(driver.tasks.some((task) => task.type === "explore")).toBe(false);
  });

  it("rotates resource exploration after a threat interrupts a frontier", async () => {
    const driver = new FakeBeatGameDriver();
    const creeper = {
      connectionEpoch: "epoch-1",
      networkId: 42,
      entityType: "minecraft:creeper",
      position: {
        x: 6,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      health: 20,
      observedAt: "2026-01-01T00:00:00.000Z",
    } as const;
    driver.xzPathResolver = (x, z, dimension, radius, policy) =>
      Effect.sync(() => {
        driver.xzPaths.push({ x, z, dimension, radius, policy });
        if (driver.xzPaths.length === 1) {
          driver.entityResults = [creeper];
        }
      }).pipe(Effect.zipRight(Effect.never));
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
        if (task.type === "flee") {
          driver.entityResults = [];
        }
      });

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (driver.xzPaths.length < 2) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.xzPaths.slice(0, 2).map(({ x, z }) => ({ x, z }))).toEqual([
      { x: 24, z: 0 },
      { x: 24, z: 24 },
    ]);
  });

  it("rotates resource exploration after a blocked frontier", async () => {
    const driver = new FakeBeatGameDriver();
    driver.xzPathResolver = (x, z, dimension, radius, policy) =>
      Effect.sync(() => {
        driver.xzPaths.push({ x, z, dimension, radius, policy });
      }).pipe(
        Effect.zipRight(
          driver.xzPaths.length === 0
            ? Effect.fail(new BeatGameDriverError({
              operation: "pathfindXZ",
              code: "unreachable",
              retryable: true,
              message: "The frontier route made no progress",
            }))
            : Effect.never,
        ),
      );

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (driver.xzPaths.length < 2) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.xzPaths.slice(0, 2).map(({ x, z }) => ({ x, z }))).toEqual([
      { x: 24, z: 0 },
      { x: 24, z: 24 },
    ]);
  });

  it("returns to the Overworld surface before exploring for animals", async () => {
    const driver = new FakeBeatGameDriver();
    driver.surfaceColumns = [{
      x: 12,
      z: -8,
      loaded: true,
      surfaceY: 86,
      blockId: "minecraft:grass_block",
      biomeId: "minecraft:plains",
      skyLight: 15,
      blockLight: 0,
    }];
    driver.currentObservation = observation({
      position: {
        x: 12,
        y: 63,
        z: -8,
        dimension: "minecraft:overworld",
      },
      counts: {
        "minecraft:cobblestone": 20,
        "minecraft:stone_sword": 1,
        "minecraft:iron_ingot": 7,
        "minecraft:iron_pickaxe": 1,
        "minecraft:water_bucket": 1,
        "minecraft:flint_and_steel": 1,
        "minecraft:shield": 1,
      },
    });
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
      }).pipe(Effect.zipRight(Effect.never));

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (driver.paths.length === 0) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.paths[0]).toEqual({
      position: {
        x: 12.5,
        y: 87,
        z: -7.5,
        dimension: "minecraft:overworld",
      },
      radius: 1.5,
      policy: expect.objectContaining({
        allowMining: true,
        allowPlacing: true,
      }),
    });
    expect(driver.tasks.some((task) => task.type === "explore")).toBe(false);
  });

  it("does not mistake an adjacent hillside for overhead terrain", async () => {
    const driver = new FakeBeatGameDriver();
    const preparedItems = {
      "minecraft:cobblestone": 20,
      "minecraft:oak_log": 8,
      "minecraft:stone_sword": 1,
    };
    driver.currentObservation = observation({
      counts: preparedItems,
      position: {
        x: 0.5,
        y: 64,
        z: 0.5,
        dimension: "minecraft:overworld",
      },
    });
    driver.surfaceColumns = [
      {
        x: 0,
        z: 0,
        loaded: true,
        surfaceY: 63,
        blockId: "minecraft:grass_block",
        biomeId: "minecraft:plains",
        skyLight: 15,
        blockLight: 0,
      },
      {
        x: 2,
        z: 0,
        loaded: true,
        surfaceY: 80,
        blockId: "minecraft:grass_block",
        biomeId: "minecraft:plains",
        skyLight: 15,
        blockLight: 0,
      },
    ];
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 1,
      entityType: "minecraft:cow",
      position: {
        x: 100,
        y: 64,
        z: 0.5,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      observedAt: "2026-01-01T00:00:00.000Z",
    }];
    driver.xzPathResolver = (x, z, dimension, radius, policy) =>
      Effect.sync(() => {
        driver.xzPaths.push({ x, z, dimension, radius, policy });
      }).pipe(Effect.zipRight(Effect.never));

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: {
          observationPollMs: 1,
          entitySearchRadius: 320,
        },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (driver.xzPaths.length === 0) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.paths).toHaveLength(0);
    expect(driver.xzPaths[0]).toEqual(expect.objectContaining({
      x: 48.5,
      z: 0.5,
      radius: 4,
    }));
  });

  it("climbs to the sampled surface before exploring for missing blocks", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      position: {
        x: 247.5,
        y: 42,
        z: -175.5,
        dimension: "minecraft:overworld",
      },
    });
    driver.surfaceColumns = [{
      x: 247,
      z: -175,
      loaded: true,
      surfaceY: 89,
      blockId: "minecraft:grass_block",
      biomeId: "minecraft:plains",
      skyLight: 15,
      blockLight: 0,
    }];
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
      }).pipe(Effect.zipRight(Effect.never));

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (driver.paths.length === 0) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.tasks.some((task) => task.type === "collect-blocks")).toBe(
      true,
    );
    expect(driver.paths[0]).toEqual({
      position: {
        x: 247.5,
        y: 90,
        z: -174.5,
        dimension: "minecraft:overworld",
      },
      radius: 1.5,
      policy: expect.objectContaining({
        allowMining: true,
        allowPlacing: true,
      }),
    });
    expect(driver.tasks.some((task) => task.type === "explore")).toBe(false);
  });

  it("moves on after an animal remains unreachable", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      counts: {
        "minecraft:oak_log": 8,
        "minecraft:cobblestone": 20,
        "minecraft:stone_sword": 1,
      },
    });
    const cow = {
      connectionEpoch: "epoch-1",
      networkId: 42,
      entityType: "minecraft:cow",
      position: {
        x: 8,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      observedAt: "2026-01-01T00:00:00.000Z",
    } as const;
    driver.entityResults = [cow];
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
      }).pipe(
        Effect.zipRight(
          task.type === "attack-entity"
            ? Effect.fail(new BeatGameDriverError({
              operation: "task.attack-entity",
              code: "unreachable",
              retryable: true,
              message: "Unable to reach the target entity",
            }))
            : Effect.void,
        ),
      );
    driver.xzPathResolver = (x, z, dimension, radius, policy) =>
      Effect.sync(() => {
        driver.xzPaths.push({ x, z, dimension, radius, policy });
      }).pipe(Effect.zipRight(Effect.never));
    let rememberedTargets: readonly string[] = [];

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: {
          observationPollMs: 1,
          entitySearchRadius: 320,
        },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              driver.xzPaths.length === 0
            ) {
              yield* Effect.sleep(1);
            }
            rememberedTargets = (yield* run.snapshot).checkpoint.memory
              .unreachable.map(({ key }) => key);
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    const attackIndex = driver.tasks.findIndex(
      (task) => task.type === "attack-entity",
    );
    expect(driver.taskPolicies[attackIndex]).toMatchObject({
      allowPlacing: true,
    });
    expect(driver.xzPaths[0]?.policy).toMatchObject({
      allowMining: false,
      allowPlacing: true,
    });
    expect(driver.xzPaths[0]).toMatchObject({
      x: 64,
      z: 0,
    });
    expect(rememberedTargets).toContain("target:epoch-1:42");
  });

  it("waits for a delayed block pickup before exploring", async () => {
    const driver = new FakeBeatGameDriver();
    const droppedLog = {
      connectionEpoch: "epoch-1",
      networkId: 10,
      entityType: "minecraft:item",
      itemId: "minecraft:oak_log",
      position: {
        x: 2,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      observedAt: "2026-01-01T00:00:00.000Z",
    } as const;
    let collectingDrop = false;
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
        if (task.type === "collect-blocks") {
          driver.entityResults = [droppedLog];
        }
        return {};
      });
    driver.pathResolver = (position, radius, policy) =>
      Effect.gen(function* () {
        driver.paths.push({ position, radius, policy });
        if (
          position.x === droppedLog.position.x
          && position.y === droppedLog.position.y
          && position.z === droppedLog.position.z
        ) {
          collectingDrop = true;
          yield* Effect.forkDaemon(
            Effect.sleep(75).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  driver.currentObservation = observation({
                    counts: { "minecraft:oak_log": 1 },
                  });
                })
              ),
            ),
          );
        }
      });

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: {
          observationPollMs: 1,
          targetLogCount: 1,
        },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (!collectingDrop) {
              yield* Effect.sleep(1);
            }
            yield* Effect.sleep(200);
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.tasks.some((task) => task.type === "explore")).toBe(false);
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
        operation: "task.attack-entity",
        code: "unreachable",
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

  it("selects the nearest fresh hunting target after every kill", async () => {
    const driver = new FakeBeatGameDriver();
    const preparedItems = {
      "minecraft:cobblestone": 20,
      "minecraft:stone_sword": 1,
      "minecraft:iron_ingot": 7,
      "minecraft:iron_pickaxe": 1,
      "minecraft:water_bucket": 1,
      "minecraft:flint_and_steel": 1,
      "minecraft:shield": 1,
    };
    const targets = [
      {
        connectionEpoch: "epoch-1",
        networkId: 1,
        entityType: "minecraft:cow",
        position: {
          x: 10,
          y: 64,
          z: 0,
          dimension: "minecraft:overworld",
        },
        velocity: { x: 0, y: 0, z: 0 },
        alive: true,
        observedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        connectionEpoch: "epoch-1",
        networkId: 2,
        entityType: "minecraft:cow",
        position: {
          x: -11,
          y: 64,
          z: 0,
          dimension: "minecraft:overworld",
        },
        velocity: { x: 0, y: 0, z: 0 },
        alive: true,
        observedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        connectionEpoch: "epoch-1",
        networkId: 3,
        entityType: "minecraft:cow",
        position: {
          x: 20,
          y: 64,
          z: 0,
          dimension: "minecraft:overworld",
        },
        velocity: { x: 0, y: 0, z: 0 },
        alive: true,
        observedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        connectionEpoch: "epoch-1",
        networkId: 4,
        entityType: "minecraft:cow",
        position: {
          x: 1,
          y: 0,
          z: 0,
          dimension: "minecraft:overworld",
        },
        velocity: { x: 0, y: 0, z: 0 },
        alive: true,
        observedAt: "2026-01-01T00:00:00.000Z",
      },
    ] as const;
    driver.currentObservation = observation({ counts: preparedItems });
    driver.entityResults = targets;
    driver.xzPathResolver = (x, z, dimension, radius, policy) =>
      Effect.sync(() => {
        driver.xzPaths.push({ x, z, dimension, radius, policy });
        driver.currentObservation = observation({
          counts: preparedItems,
          position: {
            x,
            y: 64,
            z,
            dimension,
          },
        });
      });
    const attackOrder: number[] = [];
    driver.taskObserver = (task) => {
      if (task.type !== "attack-entity") {
        return;
      }
      attackOrder.push(task.target.networkId);
      const target = targets.find(({ networkId }) =>
        networkId === task.target.networkId
      );
      if (target !== undefined) {
        driver.currentObservation = observation({
          counts: preparedItems,
          position: target.position,
        });
      }
    };

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (attackOrder.length < 3) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(attackOrder).toEqual([1, 3, 2]);
    const huntQueries = driver.entityQueries.filter(({ selector }) =>
      selector.entityTypes?.includes("minecraft:cow") === true
    );
    expect(huntQueries.slice(0, 3).map(({ origin }) => origin?.x))
      .toEqual([0, 10, 20]);
  });

  it("refreshes a distant animal between bounded approach segments", async () => {
    const driver = new FakeBeatGameDriver();
    const preparedItems = {
      "minecraft:cobblestone": 20,
      "minecraft:oak_log": 8,
      "minecraft:stone_sword": 1,
    };
    const cow = {
      connectionEpoch: "epoch-1",
      networkId: 1,
      entityType: "minecraft:cow",
      position: {
        x: 100,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      observedAt: "2026-01-01T00:00:00.000Z",
    } as const;
    driver.currentObservation = observation({ counts: preparedItems });
    driver.entityResults = [cow];
    driver.xzPathResolver = (x, z, dimension, radius, policy) =>
      Effect.sync(() => {
        driver.xzPaths.push({ x, z, dimension, radius, policy });
        driver.currentObservation = observation({
          counts: preparedItems,
          position: {
            x,
            y: 64,
            z,
            dimension,
          },
        });
      });
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
      }).pipe(
        Effect.zipRight(
          task.type === "attack-entity" ? Effect.never : Effect.void,
        ),
      );

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: {
          observationPollMs: 1,
          entitySearchRadius: 320,
        },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (
              !driver.tasks.some((task) => task.type === "attack-entity")
            ) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.xzPaths.slice(0, 2)).toEqual([
      expect.objectContaining({
        x: 48,
        z: 0,
        radius: 4,
        policy: expect.objectContaining({
          allowMining: false,
          allowPlacing: true,
        }),
      }),
      expect.objectContaining({
        x: 76,
        z: 0,
        radius: 4,
        policy: expect.objectContaining({
          allowMining: false,
          allowPlacing: true,
        }),
      }),
    ]);
    const huntQueries = driver.entityQueries.filter(({ selector }) =>
      selector.entityTypes?.includes("minecraft:cow") === true
    );
    expect(huntQueries.slice(0, 3).map(({ origin }) => origin?.x))
      .toEqual([0, 48, 76]);
  });

  it("recovers toward the surface when a distant hunt route is blocked", async () => {
    const driver = new FakeBeatGameDriver();
    const preparedItems = {
      "minecraft:cobblestone": 20,
      "minecraft:oak_log": 8,
      "minecraft:stone_sword": 1,
    };
    driver.currentObservation = observation({ counts: preparedItems });
    driver.entityResults = [{
      connectionEpoch: "epoch-1",
      networkId: 1,
      entityType: "minecraft:cow",
      position: {
        x: 100,
        y: 64,
        z: 0,
        dimension: "minecraft:overworld",
      },
      velocity: { x: 0, y: 0, z: 0 },
      alive: true,
      observedAt: "2026-01-01T00:00:00.000Z",
    }];
    driver.surfaceColumns = [{
      x: 12,
      z: 0,
      loaded: true,
      surfaceY: 64,
      blockId: "minecraft:grass_block",
      biomeId: "minecraft:plains",
      skyLight: 15,
      blockLight: 0,
    }];
    driver.xzPathResolver = (x, z, dimension, radius, policy) =>
      Effect.sync(() => {
        driver.xzPaths.push({ x, z, dimension, radius, policy });
        driver.currentObservation = observation({
          counts: preparedItems,
          position: {
            x: 12,
            y: 30,
            z: 0,
            dimension,
          },
        });
      }).pipe(
        Effect.zipRight(Effect.fail(new BeatGameDriverError({
          operation: "pathfindXZ",
          code: "unreachable",
          retryable: true,
          message: "The distant route made no progress",
        }))),
      );
    driver.pathResolver = (position, radius, policy) =>
      Effect.sync(() => {
        driver.paths.push({ position, radius, policy });
      }).pipe(Effect.zipRight(Effect.never));

    await Effect.runPromise(Effect.scoped(
      beatGameWithDriver(driver, {
        strategy: {
          observationPollMs: 1,
          entitySearchRadius: 320,
        },
      }).pipe(
        Effect.flatMap((run) =>
          Effect.gen(function* () {
            while (driver.paths.length === 0) {
              yield* Effect.sleep(1);
            }
            yield* run.stop;
            yield* run.awaitCompletion.pipe(Effect.either);
          })
        ),
      ),
    ));

    expect(driver.xzPaths).toHaveLength(1);
    expect(driver.paths[0]).toEqual({
      position: {
        x: 12.5,
        y: 65,
        z: 0.5,
        dimension: "minecraft:overworld",
      },
      radius: 1.5,
      policy: expect.objectContaining({
        allowMining: true,
        allowPlacing: true,
      }),
    });
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
          expect(task.count).toBe(32);
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
      if (
        task.type === "craft"
        && task.recipeId === "minecraft:stone_sword"
      ) {
        resolveSwordCraft();
        return Effect.never;
      }
      return Effect.void;
    };
    driver.actionResolver = (action) =>
      Effect.sync(() => {
        if (action.type === "place-block") {
          localTablePlaced = true;
        }
        return {};
      });

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
    expect(driver.paths[0]?.policy.allowMining).toBe(false);
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
    expect(driver.actions).toContainEqual({
      type: "select-item",
      selector: { itemIds: ["minecraft:crafting_table"] },
    });
    expect(driver.actions).toContainEqual({
      type: "place-block",
      against: {
        x: localTable.position.x,
        y: localTable.position.y - 1,
        z: localTable.position.z,
        dimension: localTable.position.dimension,
      },
      face: "up",
      hand: "main",
    });
  });

  it("immediately cooks a partial raw-food batch at low health", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      health: 8,
      food: 17,
      counts: {
        "minecraft:porkchop": 1,
        "minecraft:coal": 2,
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
        task.type === "smelt"
        && task.input.itemIds?.includes("minecraft:porkchop")
      ) {
        resolveFoodSmelt();
        return Effect.never;
      }
      return Effect.void;
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

    expect(driver.entityQueries).toEqual([]);
    expect(driver.tasks.filter((task) => task.type === "smelt")).toEqual([
      expect.objectContaining({
        input: { itemIds: ["minecraft:porkchop"] },
        count: 1,
        fuel: {
          itemIds: ["minecraft:coal", "minecraft:charcoal"],
        },
      }),
    ]);
  });

  it("recovers an interrupted food batch from a nearby furnace", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      counts: {
        "minecraft:oak_log": 8,
        "minecraft:cobblestone": 20,
        "minecraft:stone_sword": 1,
      },
    });
    const furnace = blockObservation({
      x: 1,
      y: 64,
      z: 0,
      dimension: "minecraft:overworld",
    }, { blockId: "minecraft:furnace" });
    driver.blockQueryResolver = ({ selector }) =>
      selector.blockIds?.includes("minecraft:furnace") === true
        ? [furnace]
        : [];
    let resolveRecovery!: () => void;
    const recoveryStarted = new Promise<void>((resolve) => {
      resolveRecovery = resolve;
    });
    driver.taskResolver = (task) =>
      Effect.sync(() => {
        driver.tasks.push(task);
        if (task.type === "transfer-container") {
          driver.currentObservation = observation({
            counts: {
              ...driver.currentObservation.inventory.counts,
              "minecraft:cooked_mutton": 8,
            },
          });
          resolveRecovery();
        }
      });

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const run = yield* beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      });
      yield* Effect.promise(() => recoveryStarted).pipe(
        Effect.timeout("5 seconds"),
      );
      yield* run.stop;
    })));

    expect(driver.tasks).toContainEqual({
      type: "transfer-container",
      direction: "withdraw",
      container: furnace.position,
      operations: [{
        selector: {},
        count: 192,
        allowPartial: true,
      }],
    });
    expect(driver.tasks.some((task) => task.type === "attack-entity"))
      .toBe(false);
  });

  it("does not revisit a drained recovery furnace during the same run", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      counts: {
        "minecraft:oak_log": 8,
        "minecraft:cobblestone": 20,
        "minecraft:stone_sword": 1,
      },
    });
    const furnace = blockObservation({
      x: 1,
      y: 64,
      z: 0,
      dimension: "minecraft:overworld",
    }, { blockId: "minecraft:furnace" });
    driver.blockQueryResolver = ({ selector }) =>
      selector.blockIds?.includes("minecraft:furnace") === true
        ? [furnace]
        : [];
    let resolveSecondFrontier!: () => void;
    const secondFrontierStarted = new Promise<void>((resolve) => {
      resolveSecondFrontier = resolve;
    });
    driver.xzPathResolver = (x, z, dimension, radius, policy) =>
      Effect.sync(() => {
        driver.xzPaths.push({ x, z, dimension, radius, policy });
        if (driver.xzPaths.length === 2) {
          resolveSecondFrontier();
        }
      }).pipe(
        Effect.flatMap(() =>
          driver.xzPaths.length === 1 ? Effect.void : Effect.never,
        ),
      );

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const run = yield* beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      });
      yield* Effect.promise(() => secondFrontierStarted).pipe(
        Effect.timeout("5 seconds"),
      );
      yield* run.stop;
    })));

    expect(driver.tasks.filter((task) =>
      task.type === "transfer-container"
    )).toHaveLength(1);
  });

  it("eats raw food for emergency recovery when no furnace is available", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      health: 8,
      food: 14,
      counts: { "minecraft:mutton": 2 },
    });
    driver.taskResolver = (task) => {
      driver.tasks.push(task);
      return task.type === "auto-eat" ? Effect.never : Effect.void;
    };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const run = yield* beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      });
      while (!driver.tasks.some((task) => task.type === "auto-eat")) {
        yield* Effect.sleep(1);
      }
      yield* run.stop;
    })));

    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "auto-eat",
      foodItemIds: ["minecraft:mutton"],
      foodLevel: 18,
      maximumMeals: 2,
      completeWhenNoFood: true,
    }));
    expect(driver.tasks.some((task) =>
      task.type === "craft" || task.type === "smelt"
    )).toBe(false);
  });

  it("uses rotten flesh for emergency recovery instead of traveling for food", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      health: 8,
      food: 17,
      counts: { "minecraft:rotten_flesh": 1 },
    });
    driver.taskResolver = (task) => {
      driver.tasks.push(task);
      return task.type === "auto-eat" ? Effect.never : Effect.void;
    };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const run = yield* beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      });
      while (!driver.tasks.some((task) => task.type === "auto-eat")) {
        yield* Effect.sleep(1);
      }
      yield* run.stop;
    })));

    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "auto-eat",
      foodItemIds: ["minecraft:rotten_flesh"],
      foodLevel: 18,
      completeWhenNoFood: true,
    }));
    expect(driver.tasks.some((task) => task.type === "explore")).toBe(false);
  });

  it("does not interrupt eating solely because health becomes unsafe", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      health: 19,
      food: 14,
      counts: { "minecraft:rotten_flesh": 1 },
    });
    driver.taskResolver = (task) => {
      driver.tasks.push(task);
      if (task.type !== "auto-eat") {
        return Effect.void;
      }
      driver.currentObservation = observation({
        health: 17,
        food: 14,
        counts: { "minecraft:rotten_flesh": 1 },
      });
      return Effect.never;
    };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const run = yield* beatGameWithDriver(driver, {
        strategy: { observationPollMs: 1 },
      });
      yield* Effect.sleep(250);
      yield* run.stop;
    })));

    expect(driver.tasks.filter((task) => task.type === "auto-eat")).toEqual([
      expect.objectContaining({
        foodItemIds: ["minecraft:rotten_flesh"],
        foodLevel: 14,
        maximumMeals: 1,
      }),
    ]);
  });

  it("makes only the required charcoal before cooking a food batch", async () => {
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
          itemIds: [
            "minecraft:oak_planks",
            "minecraft:spruce_planks",
            "minecraft:birch_planks",
            "minecraft:jungle_planks",
            "minecraft:acacia_planks",
            "minecraft:dark_oak_planks",
            "minecraft:mangrove_planks",
            "minecraft:cherry_planks",
            "minecraft:pale_oak_planks",
            "minecraft:crimson_planks",
            "minecraft:warped_planks",
          ],
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

  it("uses existing efficient fuel without manufacturing a spare", async () => {
    const driver = new FakeBeatGameDriver();
    driver.currentObservation = observation({
      counts: {
        "minecraft:oak_log": 4,
        "minecraft:oak_planks": 3,
        "minecraft:cobblestone": 20,
        "minecraft:stone_sword": 1,
        "minecraft:porkchop": 1,
        "minecraft:charcoal": 1,
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
        task.type === "smelt"
        && task.input.itemIds?.includes("minecraft:porkchop")
      ) {
        resolveFoodSmelt();
        return Effect.never;
      }
      return Effect.void;
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
        input: { itemIds: ["minecraft:porkchop"] },
        count: 1,
        fuel: {
          itemIds: ["minecraft:coal", "minecraft:charcoal"],
        },
      }),
    ]);
  });

  it("mines a visible coal vein before falling back to charcoal", async () => {
    const driver = new FakeBeatGameDriver();
    const initialCounts = {
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
    };
    driver.currentObservation = observation({ counts: initialCounts });
    driver.blockQueryResolver = ({ selector }) => {
      if (selector.blockIds?.includes("minecraft:furnace") === true) {
        return [blockObservation({
          x: 1,
          y: 64,
          z: 0,
          dimension: "minecraft:overworld",
        }, { blockId: "minecraft:furnace" })];
      }
      if (selector.blockIds?.includes("minecraft:coal_ore") === true) {
        return [blockObservation({
          x: 3,
          y: 63,
          z: 0,
          dimension: "minecraft:overworld",
        }, { blockId: "minecraft:coal_ore" })];
      }
      return [];
    };
    let resolveFoodSmelt!: () => void;
    const foodSmeltStarted = new Promise<void>((resolve) => {
      resolveFoodSmelt = resolve;
    });
    driver.taskResolver = (task) => {
      driver.tasks.push(task);
      if (task.type === "collect-blocks") {
        driver.currentObservation = observation({
          counts: {
            ...initialCounts,
            "minecraft:coal": 4,
          },
        });
      }
      if (
        task.type === "smelt"
        && task.input.itemIds?.includes("minecraft:beef")
      ) {
        resolveFoodSmelt();
        return Effect.never;
      }
      return Effect.void;
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

    expect(driver.blockQueries).toContainEqual({
      center: expect.objectContaining({ dimension: "minecraft:overworld" }),
      radius: 16,
      selector: {
        blockIds: [
          "minecraft:coal_ore",
          "minecraft:deepslate_coal_ore",
        ],
        diggable: true,
        requireLineOfSight: true,
      },
      maximumResults: 3,
    });
    expect(driver.tasks).toContainEqual(expect.objectContaining({
      type: "collect-blocks",
      blockIds: [
        "minecraft:coal_ore",
        "minecraft:deepslate_coal_ore",
      ],
      count: 3,
      searchRadius: 16,
    }));
    expect(driver.tasks.filter((task) => task.type === "smelt")).toEqual([
      expect.objectContaining({
        input: { itemIds: ["minecraft:beef"] },
        count: 8,
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
