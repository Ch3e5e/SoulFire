import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  BeatGamePhase,
  BeatGameRunStatus,
  InMemoryBeatGameCheckpointStore,
} from "../src/index.js";
import { beatGameWithDriver } from "../src/promise.js";
import {
  checkpoint,
  FakeBeatGameDriver,
  observation,
  postDragonHooks,
} from "./fixtures.js";

describe("beat-game Promise facade", () => {
  it("uses the canonical Effect runtime and exposes async iterables", async () => {
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
        runId: "promise-run",
        teamId: "promise-team",
      },
    ), undefined));

    const run = await beatGameWithDriver(driver, {
      runId: "promise-run",
      team: { teamId: "promise-team" },
      checkpointStore: store,
      hooks: postDragonHooks(driver),
    });
    const eventTypes: string[] = [];
    const consumeEvents = (async () => {
      for await (const event of run.events) {
        eventTypes.push(event.type);
      }
    })();
    const result = await run.awaitCompletion();
    await consumeEvents;

    expect(result.finalCheckpoint.planner.status)
      .toBe(BeatGameRunStatus.COMPLETED);
    expect(eventTypes).toContain("checkpoint-restored");
    expect(eventTypes).toContain("run-completed");
  });
});
