# SoulFire Python SDK

Use `soulfire` to control bots through a SoulFire server from synchronous
or asyncio Python applications. The SDK always uses gRPC-Web.

## Install

```bash
pip install soulfire
```

## Connect and stream events

Create a client with an API token, then select an operator-provisioned instance
and bot:

```python
import asyncio
import os

from soulfire import SoulFire


async def main() -> None:
    async with SoulFire.connect(
        "https://soulfire.example.com",
        token=os.environ["SOULFIRE_TOKEN"],
    ) as soulfire:
        bot = soulfire.instance("instance-uuid").bot("bot-uuid")
        await bot.start()

        async for event in bot.events():
            print(event)


asyncio.run(main())
```

The default event filter includes status, state, inventory, damage, chat, and
lifecycle events. The stream stays open while the bot is stopped and follows
the configured account across reconnects.

## Control bots

Bot intent is persistent. Calling `start()` sets the bot's desired state to
running, while `stop()` sets it to stopped:

```python
instance = soulfire.instance("instance-uuid")
bot = instance.bot("bot-uuid")

await bot.start()
await bot.restart()
await bot.stop()
```

Control a group by explicit ID or count:

```python
await instance.start(count=25)
await instance.stop(bot_ids=["bot-uuid-1", "bot-uuid-2"])
await instance.restart()
```

With no selection, `start()` targets stopped bots, `stop()` targets desired
bots, and `restart()` targets desired bots. A `count` selection follows the
instance's `account.shuffle-accounts` setting. Explicit `bot_ids` always use
the IDs you provide.

## Watch bot status

`watch_bot_statuses()` first yields a complete snapshot, then incremental
updates and removals:

```python
async for event in instance.watch_bot_statuses():
    event_type = event.WhichOneof("event")
    if event_type == "snapshot":
        print(event.snapshot.bots)
    elif event_type == "update":
        print(event.update.profile_id, event.update.runtime_state)
    elif event_type == "removed_bot_id":
        print("Removed", event.removed_bot_id)
```

Use `await bot.status()` when you only need the current state of one bot. The
synchronous client exposes the same methods without `await`.

## Provision a local server

`SoulFire.install()` downloads and verifies the latest SoulFire dedicated
server and a Temurin 25 runtime, starts the server, and returns an authenticated
client:

```python
import asyncio

from soulfire import SoulFire


async def main() -> None:
    soulfire = await SoulFire.install(
        directory=".soulfire",
        on_log=print,
    )
    try:
        print(soulfire.local_server.base_url)
        bot = soulfire.instance("instance-uuid").bot("bot-uuid")
        # Use the operator-provisioned bot.
    finally:
        await soulfire.close()


asyncio.run(main())
```

Pass `version` to pin a release tag. Existing verified downloads are reused.

## Send a chat message

```python
await bot.send_chat("Hello from the SoulFire SDK")
```

Action calls return after the bot game thread executes them. Failed or
cancelled actions raise `SoulFireActionError`, which includes the action ID and
server result.

## Control inventory and movement

```python
from soulfire.bot_pb2 import LEFT_CLICK

inventory = await bot.inventory()
print(inventory.slots)

await bot.select_hotbar(0)
await bot.click_inventory(12, LEFT_CLICK)
await bot.transfer_inventory_slot(12)
await bot.move_inventory_stack(12, 36)

await bot.set_movement(forward=True, sprint=True)
await bot.look(90, 0)
await bot.reset_movement()
```

The synchronous bot exposes the same methods without `await`.

## Coordinate multiple controllers

```python
lease = await bot.acquire_control(ttl_seconds=30)
try:
    await bot.send_chat("This action carries the lease token")
    await lease.renew(ttl_seconds=30)
finally:
    await lease.release()
```

Control leases are optional. Acquiring one prevents other clients from issuing
actions until the lease is released or expires.

## Use composable behaviors

```python
from soulfire import AttackNearest, CollectBlocks, run_behaviors

await run_behaviors(
    bot,
    [
        CollectBlocks(["minecraft:oak_log"], max_count=16),
        AttackNearest(["minecraft:zombie"]),
    ],
)
```

The package includes `CollectBlocks`, `FollowEntity`, `AttackNearest`,
`AutoEat`, and `Build`.

## Provision instances and accounts

```python
from soulfire.common_pb2 import MICROSOFT_JAVA_DEVICE_CODE

instance = await soulfire.create_instance("automation")

async for step in instance.login_device_code(MICROSOFT_JAVA_DEVICE_CODE):
    if step.WhichOneof("data") == "device_code":
        print(step.device_code.verification_uri, step.device_code.user_code)
    elif step.WhichOneof("data") == "account":
        await instance.add_accounts([step.account])
```

Instance listing, settings, account and proxy batches, credentials login,
device-code login, and account refresh are available on async and synchronous
clients.

## Manage an installed server

```python
print(soulfire.local_server.version)
print(soulfire.local_server_logs)

await soulfire.restart_local_server()
await soulfire.stop_local_server()
```

Restart keeps the same directory, port, release, and root API token.

## Use the synchronous client

```python
import os

from soulfire import SoulFireSync


with SoulFireSync.connect(
    "https://soulfire.example.com",
    token=os.environ["SOULFIRE_TOKEN"],
) as soulfire:
    bot = soulfire.instance("instance-uuid").bot("bot-uuid")
    bot.send_chat("Hello from Python")
```

Generated request messages and service clients are importable from the
`soulfire` package when an RPC does not have a high-level wrapper:

```python
from soulfire.instance_connect import InstanceServiceClient

instances = soulfire.service(InstanceServiceClient)
```

Instances are not lifecycle units. They compartmentalize accounts, settings,
proxies, permissions, scripts, and automation. Each bot can be controlled
independently.
