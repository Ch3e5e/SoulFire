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

await bot.start();
```

The token is sent as a bearer token on every authenticated request.

## Control bots

Bot intent is persistent. Calling `start()` sets the bot's desired state to
running, while `stop()` sets it to stopped:

```ts
const instance = soulfire.instance("instance-uuid");
const bot = instance.bot("bot-uuid");

await bot.start();
await bot.restart();
await bot.stop();
```

You can control a group without creating one wrapper per bot:

```ts
await instance.start({ count: 25 });
await instance.stop({ botIds: ["bot-uuid-1", "bot-uuid-2"] });
await instance.restart();
```

With no selection, `start()` targets stopped bots, `stop()` targets desired
bots, and `restart()` targets desired bots. A `count` selection follows the
instance's `account.shuffle-accounts` setting. Explicit `botIds` always use the
IDs you provide.

## Watch bot status

`watchBotStatuses()` first yields a complete snapshot, then incremental updates
and removals:

```ts
for await (const event of instance.watchBotStatuses()) {
  switch (event.event.case) {
    case "snapshot":
      console.log(event.event.value.bots);
      break;
    case "update":
      console.log(event.event.value.profileId, event.event.value.runtimeState);
      break;
    case "removedBotId":
      console.log("Removed", event.event.value);
      break;
  }
}
```

Use `await bot.status()` when you only need the current state of one bot.

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

Instances are not lifecycle units. They compartmentalize accounts, settings,
proxies, permissions, scripts, and automation. Each bot can be controlled
independently.
