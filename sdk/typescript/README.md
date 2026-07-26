# SoulFire TypeScript SDK

Use `@soulfiremc/sdk` to control bots through a SoulFire server from a browser
or JavaScript runtime with `fetch`. The SDK always uses gRPC-Web.

## Install

From npm:

```bash
pnpm add @soulfiremc/sdk
```

From JSR:

```bash
deno add jsr:@soulfiremc/sdk
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

`events()` returns an async iterable. Its default filter includes status,
state, inventory, damage, chat, and lifecycle events. The stream stays open
while the bot is stopped and follows the same configured account across
reconnects:

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

Action promises resolve after the bot game thread executes the action. A
cancelled or failed action throws `SoulFireActionError` with the action ID and
server result.

## Control inventory and movement

```ts
import { ClickType } from "@soulfiremc/sdk";

const inventory = await bot.inventory();
console.log(inventory.slots);

await bot.selectHotbar(0);
await bot.clickInventory(12, ClickType.LEFT_CLICK);
await bot.transferInventorySlot(12);
await bot.moveInventoryStack(12, 36);

await bot.setMovement({ forward: true, sprint: true });
await bot.look(90, 0);
await bot.resetMovement();
```

`moveInventoryStack()` waits for every click before sending the next one.

## Coordinate multiple controllers

Control leases are optional. Without a lease, authorized clients can issue
actions normally. Once a client acquires a lease, other clients must wait for
it to be released or expire:

```ts
const lease = await bot.acquireControl(30);

try {
  await bot.sendChat("This action carries the lease token");
  await lease.renew(30);
} finally {
  await lease.release();
}
```

Leases belong to the configured bot identity, not one transient Minecraft
connection.

## Use composable behaviors

```ts
import {
  attackNearest,
  collectBlocks,
  runBehaviors,
} from "@soulfiremc/sdk";

const controller = new AbortController();

await runBehaviors(
  bot,
  [
    collectBlocks({ blockIds: ["minecraft:oak_log"], maxCount: 16 }),
    attackNearest({ entityTypes: ["minecraft:zombie"] }),
  ],
  { signal: controller.signal },
);
```

`collectBlocks`, `followEntity`, `attackNearest`, `autoEat`, and `build` use
the public bot API. They are building blocks, not special server-side modes.

## Provision instances and accounts

Operators can create compartmentalized instances and authenticate accounts:

```ts
import { AccountTypeDeviceCode } from "@soulfiremc/sdk";

const instance = await soulfire.createInstance("automation");

for await (const step of instance.loginDeviceCode({
  service: AccountTypeDeviceCode.MICROSOFT_JAVA_DEVICE_CODE,
})) {
  if (step.data.case === "deviceCode") {
    console.log(step.data.value.verificationUri, step.data.value.userCode);
  }
  if (step.data.case === "account") {
    await instance.addAccounts([step.data.value]);
  }
}
```

Instance listing, configuration updates, account and proxy batch operations,
credentials login, device-code login, and account refresh have high-level
wrappers.

## Manage an installed server

```ts
console.log(soulfire.localServer?.version);
console.log(soulfire.localServerLogs);

await soulfire.restartLocalServer();
await soulfire.stopLocalServer();
```

Restart keeps the same directory, port, release, and root API token. These
methods are only available for a process created by `SoulFire.install()`.

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
