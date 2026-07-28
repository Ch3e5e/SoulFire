import {
  Effect,
  Exit,
} from "effect";
import {
  describe,
  expect,
  it,
} from "vitest";

import type { SoulFireBot as PromiseSoulFireBot } from "../src/client.js";
import {
  cleanup as cleanupPromise,
  defineBehavior as definePromiseBehavior,
  parallel as parallelPromise,
  retry as retryPromise,
  sequence as sequencePromise,
  SoulFireBehaviorTimeoutError,
  timeout as timeoutPromise,
} from "../src/behaviors.js";
import type { EffectSoulFireBot } from "../src/effect-client.js";
import {
  cleanup,
  defineBehavior,
  race,
  retry,
  sequence,
  SoulFireBehaviorError,
} from "../src/effect-behaviors.js";

const promiseBot = {} as PromiseSoulFireBot;
const effectBot = {} as EffectSoulFireBot;

describe("Promise behavior combinators", () => {
  it("preserves sequence order, bounded parallel result order, and retries", async () => {
    const calls: number[] = [];
    let attempts = 0;
    const first = definePromiseBehavior(async () => {
      calls.push(1);
      return "first";
    });
    const second = definePromiseBehavior(async () => {
      calls.push(2);
      return "second";
    });
    const unstable = definePromiseBehavior(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("transient");
      }
      return attempts;
    });

    await expect(sequencePromise(first, second).run(promiseBot))
      .resolves.toEqual(["first", "second"]);
    expect(calls).toEqual([1, 2]);
    await expect(
      parallelPromise([second, first], { concurrency: 1 }).run(promiseBot),
    ).resolves.toEqual(["second", "first"]);
    await expect(
      retryPromise(unstable, { attempts: 3 }).run(promiseBot),
    ).resolves.toBe(3);
  });

  it("times out ignored cancellation and always runs cleanup", async () => {
    let cleaned = false;
    const never = definePromiseBehavior(
      () => new Promise<never>(() => undefined),
    );
    const failing = definePromiseBehavior(async () => {
      throw new Error("failed");
    });
    const finalizer = definePromiseBehavior(async () => {
      cleaned = true;
    });

    await expect(timeoutPromise(never, 5).run(promiseBot))
      .rejects.toBeInstanceOf(SoulFireBehaviorTimeoutError);
    await expect(cleanupPromise(failing, finalizer).run(promiseBot))
      .rejects.toThrow();
    expect(cleaned).toBe(true);
  });
});

describe("Effect behavior combinators", () => {
  it("composes typed results, retries failures, and races for first success", async () => {
    let attempts = 0;
    const first = defineBehavior(() => Effect.succeed(1));
    const second = defineBehavior(() => Effect.succeed("two"));
    const unstable = defineBehavior(() =>
      Effect.suspend(() => {
        attempts += 1;
        return attempts < 3
          ? Effect.fail(new SoulFireBehaviorError({
            behavior: "unstable",
            message: "transient",
          }))
          : Effect.succeed(attempts);
      })
    );
    const never = defineBehavior<number>(() => Effect.never);

    await expect(
      Effect.runPromise(sequence(first, second).run(effectBot)),
    ).resolves.toEqual([1, "two"]);
    await expect(
      Effect.runPromise(retry(unstable, { attempts: 3 }).run(effectBot)),
    ).resolves.toBe(3);
    await expect(
      Effect.runPromise(race(never, first).run(effectBot)),
    ).resolves.toBe(1);
  });

  it("runs cleanup when the primary behavior fails", async () => {
    let cleaned = false;
    const failing = defineBehavior(() =>
      Effect.fail(new SoulFireBehaviorError({
        behavior: "primary",
        message: "failed",
      }))
    );
    const finalizer = defineBehavior(() =>
      Effect.sync(() => {
        cleaned = true;
      })
    );

    const exit = await Effect.runPromiseExit(
      cleanup(failing, finalizer).run(effectBot),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(cleaned).toBe(true);
  });
});
