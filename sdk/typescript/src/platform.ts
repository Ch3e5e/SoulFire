import type * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import type { HttpMethod } from "@effect/platform/HttpMethod";
import { Effect, Stream } from "effect";

/**
 * Adapts an Effect Platform HTTP client to the Fetch contract used by
 * ConnectRPC. This keeps SoulFire transports portable across any runtime with
 * an `HttpClient` layer.
 */
export function makeEffectHttpClientFetch(
  client: HttpClient.HttpClient,
): typeof globalThis.fetch {
  return async (input, init) => {
    const webRequest = new Request(input, init);
    let request = HttpClientRequest.make(
      webRequest.method as HttpMethod,
    )(webRequest.url);
    if (webRequest.method !== "GET" && webRequest.method !== "HEAD") {
      request = HttpClientRequest.bodyUint8Array(
        request,
        new Uint8Array(await webRequest.arrayBuffer()),
      );
    }
    request = HttpClientRequest.setHeaders(
      request,
      webRequest.headers.entries(),
    );

    const response = await Effect.runPromise(
      client.execute(request),
      { signal: webRequest.signal },
    );
    return new Response(
      Stream.toReadableStream(response.stream),
      {
        headers: Object.entries(response.headers),
        status: response.status,
      },
    );
  };
}
