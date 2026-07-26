# SoulFire TypeScript SDK

Use `@soulfiremc/sdk` to control bots through a SoulFire server from a browser
or JavaScript runtime with `fetch`. The SDK always uses gRPC-Web.

## Install

```bash
pnpm add @soulfiremc/sdk
```

## Connect to a bot

Connect with an API token, then select an operator-provisioned instance and
bot:

```ts
import { SoulFire } from "@soulfiremc/sdk";

const soulfire = SoulFire.connect({
  baseUrl: "https://soulfire.example.com",
  token: process.env.SOULFIRE_TOKEN,
});

const bot = soulfire
  .instance("instance-uuid")
  .bot("bot-uuid");
```

The token is sent as a bearer token on every authenticated request.

## Provision a local server

`SoulFire.install()` downloads and verifies the latest SoulFire dedicated
server and a Temurin 25 runtime, starts the server, and returns an authenticated
client:

```ts
import { SoulFire } from "@soulfiremc/sdk";

const soulfire = await SoulFire.install({
  directory: ".soulfire",
  onLog: console.log,
});

try {
  console.log(`SoulFire is listening at ${soulfire.localServer?.baseUrl}`);
  const bot = soulfire.instance("instance-uuid").bot("bot-uuid");
  // Use the operator-provisioned bot.
} finally {
  await soulfire.close();
}
```

Pass `version` to pin a release tag. Existing verified downloads are reused.
Local installation is available in Node.js and is not included in the browser
execution path.

## Stream bot events

`events()` returns an async iterable. Its default filter includes state
changes, chat, and lifecycle events:

```ts
for await (const event of bot.events()) {
  switch (event.event.case) {
    case "chat":
      console.log(event.event.value.plainText);
      break;
    case "lifecycle":
      console.log(event.event.value.kind);
      break;
  }
}
```

Pass an `AbortSignal` to cancel a stream:

```ts
const controller = new AbortController();

for await (const event of bot.events(undefined, {
  signal: controller.signal,
})) {
  console.log(event);
}
```

## Send a chat message

```ts
await bot.sendChat("Hello from the SoulFire SDK");
```

The bot wrapper also exposes the world-query, interaction, and pathfinding
calls currently implemented by `BotLiveService`.

## Call a generated service

Use `service()` when an RPC does not have a high-level wrapper:

```ts
import { InstanceService } from "@soulfiremc/sdk/generated/soulfire/instance_pb";

const instances = soulfire.service(InstanceService);
const response = await instances.listInstances({});
```

Generated modules follow the Protobuf service names and are available under
`@soulfiremc/sdk/generated`.

## Current scope

The first release does not abstract instance lifecycle, bot counts, or the
planned per-bot desired-state API. Those APIs will be added after the
corresponding server model is stable.
