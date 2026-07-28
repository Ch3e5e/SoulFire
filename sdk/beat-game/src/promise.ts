import {
  toEffectBot,
  type SoulFireBot as PromiseSoulFireBot,
} from "@soulfiremc/sdk/promise";
import {
  Effect,
  Exit,
  Scope,
  Stream,
} from "effect";

import type {
  BeatGameError,
  BeatGameEvent,
  BeatGameOptions,
  BeatGameResult,
  BeatGameSnapshot,
  BeatGameTeamRunOptions,
} from "./index.js";
import {
  beatGame as effectBeatGame,
  beatGameTeam as effectBeatGameTeam,
  beatGameTeamWithDrivers as effectBeatGameTeamWithDrivers,
  beatGameWithDriver as effectBeatGameWithDriver,
  makeSoulFireBeatGameDriver,
  type BeatGameDriver,
  type BeatGameRun,
  type BeatGameTeamRun,
} from "./index.js";

export interface PromiseBeatGameRun {
  readonly id: string;
  readonly teamId: string;
  readonly instanceId: string;
  readonly botId: string;
  readonly events: AsyncIterable<BeatGameEvent>;
  readonly snapshots: AsyncIterable<BeatGameSnapshot>;
  readonly awaitCompletion: () => Promise<BeatGameResult>;
  readonly pause: () => Promise<void>;
  readonly resume: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly snapshot: () => Promise<BeatGameSnapshot>;
}

export interface PromiseBeatGameTeamRun {
  readonly teamId: string;
  readonly runs: readonly PromiseBeatGameRun[];
  readonly awaitCompletion: () => Promise<readonly BeatGameResult[]>;
  readonly pause: () => Promise<void>;
  readonly resume: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export async function beatGame(
  bot: PromiseSoulFireBot,
  options: BeatGameOptions = {},
): Promise<PromiseBeatGameRun> {
  const scope = await Effect.runPromise(Scope.make());
  try {
    const run = await Effect.runPromise(
      Effect.provideService(
        effectBeatGame(toEffectBot(bot), options),
        Scope.Scope,
        scope,
      ),
    );
    return wrapRun(run, scope);
  } catch (error) {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    throw error;
  }
}

export async function beatGameWithDriver(
  driver: BeatGameDriver,
  options: BeatGameOptions = {},
): Promise<PromiseBeatGameRun> {
  const scope = await Effect.runPromise(Scope.make());
  try {
    const run = await Effect.runPromise(
      Effect.provideService(
        effectBeatGameWithDriver(driver, options),
        Scope.Scope,
        scope,
      ),
    );
    return wrapRun(run, scope);
  } catch (error) {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    throw error;
  }
}

export async function beatGameTeam(
  bots: readonly PromiseSoulFireBot[],
  options: BeatGameTeamRunOptions = {},
): Promise<PromiseBeatGameTeamRun> {
  const scope = await Effect.runPromise(Scope.make());
  try {
    const run = await Effect.runPromise(
      Effect.provideService(
        effectBeatGameTeam(bots.map(toEffectBot), options),
        Scope.Scope,
        scope,
      ),
    );
    return wrapTeamRun(run, scope);
  } catch (error) {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    throw error;
  }
}

export async function beatGameTeamWithDrivers(
  drivers: readonly BeatGameDriver[],
  options: BeatGameTeamRunOptions = {},
): Promise<PromiseBeatGameTeamRun> {
  const scope = await Effect.runPromise(Scope.make());
  try {
    const run = await Effect.runPromise(
      Effect.provideService(
        effectBeatGameTeamWithDrivers(drivers, options),
        Scope.Scope,
        scope,
      ),
    );
    return wrapTeamRun(run, scope);
  } catch (error) {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    throw error;
  }
}

export function makeBeatGameDriver(
  bot: PromiseSoulFireBot,
): BeatGameDriver {
  return makeSoulFireBeatGameDriver(toEffectBot(bot));
}

function wrapRun(
  run: BeatGameRun,
  scope: Scope.CloseableScope,
): PromiseBeatGameRun {
  const completion = runEffect(run.awaitCompletion);
  const closed = completion.then(
    () => closeScope(scope),
    () => closeScope(scope),
  );
  void closed.catch(() => undefined);
  return {
    id: run.id,
    teamId: run.teamId,
    instanceId: run.instanceId,
    botId: run.botId,
    events: Stream.toAsyncIterable(run.events),
    snapshots: Stream.toAsyncIterable(run.snapshots),
    awaitCompletion: () => completion,
    pause: () => runEffect(run.pause),
    resume: () => runEffect(run.resume),
    stop: () => runEffect(run.stop),
    snapshot: () => runEffect(run.snapshot),
  };
}

function wrapTeamRun(
  run: BeatGameTeamRun,
  scope: Scope.CloseableScope,
): PromiseBeatGameTeamRun {
  const completion = runEffect(run.awaitCompletion);
  const closed = completion.then(
    () => closeScope(scope),
    () => closeScope(scope),
  );
  void closed.catch(() => undefined);
  const runs = run.runs.map(wrapTeamMember);
  return {
    teamId: run.teamId,
    runs,
    awaitCompletion: () => completion,
    pause: () => runEffect(run.pause),
    resume: () => runEffect(run.resume),
    stop: () => runEffect(run.stop),
  };
}

function wrapTeamMember(
  run: BeatGameRun,
): PromiseBeatGameRun {
  const completion = runEffect(run.awaitCompletion);
  return {
    id: run.id,
    teamId: run.teamId,
    instanceId: run.instanceId,
    botId: run.botId,
    events: Stream.toAsyncIterable(run.events),
    snapshots: Stream.toAsyncIterable(run.snapshots),
    awaitCompletion: () => completion,
    pause: () => runEffect(run.pause),
    resume: () => runEffect(run.resume),
    stop: () => runEffect(run.stop),
    snapshot: () => runEffect(run.snapshot),
  };
}

function closeScope(scope: Scope.CloseableScope): Promise<void> {
  return Effect.runPromise(Scope.close(scope, Exit.void));
}

function runEffect<A>(
  effect: Effect.Effect<A, BeatGameError>,
): Promise<A> {
  return Effect.runPromise(effect);
}

export type {
  BeatGameCheckpointStore,
  BeatGameCoordinator,
  BeatGameError,
  BeatGameEvent,
  BeatGameOptions,
  BeatGameResult,
  BeatGameSnapshot,
  BeatGameStrategy,
  BeatGameStrategyOptions,
  BeatGameStrategyHooks,
  BeatGameTeamRunOptions,
} from "./index.js";
export {
  InMemoryBeatGameCheckpointStore,
  InMemoryBeatGameCoordinator,
} from "./index.js";
