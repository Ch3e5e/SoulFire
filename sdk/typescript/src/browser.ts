import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import {
  Effect,
  Layer,
  type Scope,
} from "effect";

import type { SoulFireOptions } from "./client.js";
import {
  SoulFire as UniversalSoulFire,
  type SoulFireConnectionError,
  type SoulFireClient,
  SoulFireService,
} from "./effect-client.js";

export * from "./index.js";

function connect(
  options: SoulFireOptions,
): Effect.Effect<
  SoulFireClient,
  SoulFireConnectionError,
  Scope.Scope
> {
  return UniversalSoulFire.connectWithHttpClient(options).pipe(
    Effect.provide(FetchHttpClient.layer),
  );
}

function layer(
  options: SoulFireOptions,
): Layer.Layer<SoulFireService, SoulFireConnectionError> {
  return UniversalSoulFire.layerWithHttpClient(options).pipe(
    Layer.provide(FetchHttpClient.layer),
  );
}

/**
 * Browser entry point backed by Effect Platform's fetch client.
 */
export const SoulFire = {
  ...UniversalSoulFire,
  connect,
  layer,
} as const;
