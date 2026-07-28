import * as HttpClient from "@effect/platform/HttpClient";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import {
  Effect,
  Layer,
  type Scope,
} from "effect";

import {
  SoulFire as KernelSoulFire,
  type SoulFireOptions,
} from "./client.js";
import {
  SoulFire as UniversalSoulFire,
  SoulFireClient,
  SoulFireConnectionError,
  SoulFireService,
} from "./effect-client.js";
import type { SoulFireInstallOptions } from "./install-types.js";
import { installLocalServer } from "./local-server.js";
import { makeEffectHttpClientFetch } from "./platform.js";

export * from "./index.js";

function connect(
  options: SoulFireOptions,
): Effect.Effect<
  SoulFireClient,
  SoulFireConnectionError,
  Scope.Scope
> {
  return UniversalSoulFire.connectWithHttpClient(options).pipe(
    Effect.provide(NodeHttpClient.layerUndici),
  );
}

function layer(
  options: SoulFireOptions,
): Layer.Layer<SoulFireService, SoulFireConnectionError> {
  return UniversalSoulFire.layerWithHttpClient(options).pipe(
    Layer.provide(NodeHttpClient.layerUndici),
  );
}

function install(
  options: SoulFireInstallOptions = {},
): Effect.Effect<
  SoulFireClient,
  SoulFireConnectionError,
  Scope.Scope
> {
  return Effect.flatMap(
    HttpClient.HttpClient,
    (httpClient) =>
      Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const fetchImplementation =
              options.fetch ?? makeEffectHttpClientFetch(httpClient);
            const localServer = await installLocalServer({
              ...options,
              fetch: fetchImplementation,
            });
            return new SoulFireClient(await KernelSoulFire.connectManaged(
              connectionOptions(
                localServer.info.baseUrl,
                localServer.token,
                {
                  ...options,
                  fetch: fetchImplementation,
                },
              ),
              localServer,
            ));
          },
          catch: (cause) => new SoulFireConnectionError({ cause }),
        }),
        (client) => client.close(),
      ),
  ).pipe(
    Effect.provide(NodeHttpClient.layerUndici),
  );
}

function installLayer(
  options: SoulFireInstallOptions = {},
): Layer.Layer<SoulFireService, SoulFireConnectionError> {
  return Layer.scoped(SoulFireService, install(options));
}

export const SoulFire = {
  ...UniversalSoulFire,
  connect,
  layer,
  install,
  installLayer,
} as const;

function connectionOptions(
  baseUrl: string,
  token: string,
  options: SoulFireInstallOptions,
): SoulFireOptions {
  return {
    baseUrl,
    token,
    ...(options.defaultTimeoutMs === undefined
      ? {}
      : { defaultTimeoutMs: options.defaultTimeoutMs }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.interceptors === undefined
      ? {}
      : { interceptors: options.interceptors }),
  };
}
