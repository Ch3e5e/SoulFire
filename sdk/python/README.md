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

        async for event in bot.events():
            print(event)


asyncio.run(main())
```

The default event filter includes state changes, chat, and lifecycle events.

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

## Current scope

The first release does not abstract instance lifecycle, bot counts, or the
planned per-bot desired-state API. Those APIs will be added after the
corresponding server model is stable.
