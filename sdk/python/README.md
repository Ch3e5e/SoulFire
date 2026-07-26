# SoulFire Python SDK

Use `soulfire-sdk` to control bots through a SoulFire server from synchronous
or asyncio Python applications. The SDK always uses gRPC-Web.

## Install

```bash
pip install soulfire-sdk
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

The default event filter includes state changes, chat, and lifecycle events.

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
