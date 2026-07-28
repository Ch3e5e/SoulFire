import type { Client } from "@connectrpc/connect";
import {
  Effect,
  Stream,
} from "effect";

import {
  type EffectPluginCatalog,
  SoulFireExtensionTypeId,
  type SoulFirePluginModule,
  SoulFirePluginError,
} from "./effect-client.js";
import {
  ExamplePluginService,
  type EchoResponse,
  type Tick,
} from "./generated/soulfire/plugin/example/v1/example_pb.js";
import type { PluginApiDescriptor } from "./generated/soulfire/plugin_api_pb.js";

export class ExamplePluginClient {
  public readonly [SoulFireExtensionTypeId] = true;

  public constructor(
    private readonly client: Client<typeof ExamplePluginService>,
  ) {}

  public echo(
    instanceId: string,
    message: string,
  ): Effect.Effect<EchoResponse, SoulFirePluginError> {
    return Effect.tryPromise({
      try: () => this.client.echo({ instanceId, message }),
      catch: (cause) =>
        new SoulFirePluginError({ pluginId: "example", cause }),
    });
  }

  public watchTicks(
    instanceId: string,
    count: number,
  ): Stream.Stream<Tick, SoulFirePluginError> {
    return Stream.fromAsyncIterable(
      this.client.watchTicks({ instanceId, count }),
      (cause) => new SoulFirePluginError({ pluginId: "example", cause }),
    );
  }
}

export const examplePlugin: SoulFirePluginModule<ExamplePluginClient> = {
  pluginId: "example",
  isCompatible: (descriptor) =>
    descriptor.apiMajorVersion === 1
    && hasExampleService(descriptor),
  create(catalog: EffectPluginCatalog) {
    const client = catalog.service("example", ExamplePluginService);
    return new ExamplePluginClient(Effect.runSync(client));
  },
};

function hasExampleService(descriptor: PluginApiDescriptor): boolean {
  return descriptor.services.some(
    (service) =>
      service.fullName
      === "soulfire.plugin.example.v1.ExamplePluginService",
  );
}
