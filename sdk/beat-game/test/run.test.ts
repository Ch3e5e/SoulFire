import { Effect, Either } from "effect";
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
  checkpoint,
  FakeBeatGameDriver,
  observation,
} from "./fixtures.js";

describe("beat-game run lifecycle", () => {
  it("resumes a checkpoint and completes from observed dragon absence", async () => {
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
      }).pipe(Effect.flatMap(({ awaitCompletion }) => awaitCompletion)),
    ));

    expect(result.finalCheckpoint.planner.phase).toBe(BeatGamePhase.COMPLETE);
    expect(result.finalCheckpoint.planner.status)
      .toBe(BeatGameRunStatus.COMPLETED);
    expect(result.finalCheckpoint.revision).toBeGreaterThan(1);
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
      return Effect.succeed(endObservation);
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
    expect(result.finalCheckpoint.lastStableAction).toMatchObject({
      action: "fight-ender-dragon",
      evidence: "OBSERVED_STATE",
    });
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
      /^beat-game:restored-action-id:[0-9a-f]{16}$/u,
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
