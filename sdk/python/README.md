# SoulFire Python SDK

`soulfire` is the official Python SDK for SoulFire. It provides first-class
async and synchronous clients, durable task handles, stateful event sessions,
semantic Minecraft APIs, and plugin RPC discovery over gRPC-Web.

The first official release requires CPython 3.14 or newer.

## Install

```bash
python -m pip install soulfire
```

## Connect asynchronously

`AsyncSoulFire` is the primary client for automation applications. Use it as an
async context manager so transports, subscriptions, and local processes close
deterministically.

```python
import asyncio
import os

from soulfire import AsyncSoulFire


async def main() -> None:
    async with AsyncSoulFire.connect(
        "https://soulfire.example.com",
        token=os.environ["SOULFIRE_TOKEN"],
    ) as soulfire:
        bot = soulfire.instance("instance-uuid").bot("bot-uuid")
        await bot.start()
        await bot.chat.send("Hello from SoulFire")

        async for event in bot.events():
            print(event)


asyncio.run(main())
```

The connection handshake validates the core API version, requested
capabilities, and required plugin versions before returning the client.

## Connect synchronously

`SoulFire` uses a real synchronous transport. It does not create a new event
loop for each operation.

```python
import os

from soulfire import SoulFire


with SoulFire.connect(
    "https://soulfire.example.com",
    token=os.environ["SOULFIRE_TOKEN"],
) as soulfire:
    bot = soulfire.instance("instance-uuid").bot("bot-uuid")
    bot.start()
    bot.chat.send("Hello from synchronous Python")
```

The sync and async clients share the same operation model, domain messages,
validation, task results, and plugin descriptors.

## Coordinate concurrent bots

Python 3.14 structured concurrency works naturally with the async client:

```python
async with asyncio.TaskGroup() as group:
    for bot_id in bot_ids:
        bot = soulfire.instance(instance_id).bot(bot_id)
        group.create_task(bot.chat.send("Ready"))
```

Cancellation propagates through unary calls and async iterators. Use
`asyncio.timeout()` when a group of operations needs one scoped deadline.

## Build progression applications

The Python SDK exposes the same complete observation, action, pathfinding,
task, control, and plugin surface as TypeScript. It does not expose a native
server-side beat-game planner.

SoulFire's first-party runner currently ships as the separate TypeScript
package `@soulfiremc/beat-game`. Python applications can compose their own
policy from the primitives and durable tasks documented below. A future
Python runner can use the same public boundary without moving strategy into
the SoulFire server.

## Orchestrate a fleet

`instance.fleet` applies one reusable selector to lifecycle changes, work
distribution, and typed durable tasks:

```python
from soulfire import (
    FleetMetadataSelector,
    FleetSelector,
    FleetTaskStartOptions,
)


builders = FleetSelector(
    online=True,
    dimensions=("minecraft:overworld",),
    minimum_health=12,
    metadata=(
        FleetMetadataSelector(
            namespace="fleet",
            key="role",
            equals="builder",
        ),
    ),
)

assignments = await instance.fleet.distribute(schematic_sections, builders)
group = await instance.fleet.start_tasks(
    builders,
    lambda bot, index, total: build_task_for(
        assignments[index].items,
        partition_index=index,
        partition_count=total,
    ),
    BuildTaskResult,
    options=FleetTaskStartOptions(concurrency=4),
)

async for update in group.events():
    print(update.bot.id, update.event.task.summary)

report = await group.results()
```

Selectors can combine bot IDs, account names and types, controller state,
connection phase, persistent account metadata, dimension, position, health,
food, ping, negotiated capabilities, and a custom predicate. Group starts and
cancellation have bounded concurrency. Results preserve each bot identity and
aggregate failures instead of losing successful work.

## Capture cameras and world maps

`bot.camera` provides the same API in async and sync clients. It can use the
bot's eyes or an explicit free-camera position and rotation:

```python
from soulfire import (
    CameraRenderOptions,
    WorldMapOptions,
    decode_camera_image,
)

image = await bot.camera.capture_bytes(
    CameraRenderOptions(
        width=1280,
        height=720,
        camera_x=120.5,
        camera_y=80,
        camera_z=-32.5,
        yaw=180,
        pitch=-20,
        fov=80,
        max_distance=256,
        include_hud=False,
        include_hands=False,
        include_debug_trace=True,
    )
)

async for frame in bot.camera.frames(
    CameraRenderOptions(width=854, height=480),
    interval_ms=250,
):
    await persist_frame(decode_camera_image(frame.render))

world_map = await bot.camera.world_map(
    WorldMapOptions(
        radius=128,
        sample_step=2,
        include_entities=True,
    )
)
```

Frame events report transport backpressure through `dropped_before`. World
maps contain loaded state, surface height, block, biome, and light data for
each sampled column, plus optional entity overlays. The synchronous client
uses `capture_bytes`, `frames`, and `world_map` without `await`.

## Run durable tasks

Continuous behaviors execute on the SoulFire server instead of relying on a
client-side polling loop.

```python
task = await bot.tasks.auto_eat(
    ["minecraft:bread", "minecraft:cooked_beef"],
    food_level=14,
    maximum_meals=1,
)

result = await task.result()
print(f"Ate {result.meals_eaten} meal")
```

The task API currently includes durable pathfinding, block collection, cuboid
excavation, transformed schematic construction, crafting, smelting, batched
potion brewing, exact-count villager trading, entity following, managed melee
and ranged combat, position guarding, entity protection, bed discovery and
sleeping, server-timed fishing, mature crop harvesting and replanting,
verified animal feeding for breeding, automatic eating, automatic respawning,
automatic armor, automatic totems, and coordinated frontier exploration. Bots
can also navigate to block containers for transactional stash and withdrawal
batches and ongoing loadout maintenance. Every task has an ID, progress stream,
cancellation, resource policy, reconnect policy, and typed result.

Managed combat can acquire targets on the server and select the strongest
allowed weapon:

```python
hunt = await bot.tasks.attack_nearest(
    EntitySelector(entity_types=["minecraft:zombie"]),
    radius=48,
    maximum_targets=3,
    weapon=ItemSelector(tags=["minecraft:swords"]),
)

archer = await bot.tasks.ranged_attack(
    target,
    minimum_range=10,
    maximum_range=32,
    maximum_shots=6,
    weapon=ItemSelector(item_ids=["minecraft:bow"]),
    lead_target=True,
    compensate_gravity=True,
    strafe=True,
)

escape = await bot.tasks.flee(
    EntitySelector(categories=[ENTITY_CATEGORY_HOSTILE]),
    trigger_radius=8,
    safe_distance=20,
)

defense = await bot.tasks.guard(
    BlockPosition(x=120, y=64, z=-32),
    EntitySelector(categories=[ENTITY_CATEGORY_HOSTILE]),
    guard_radius=16,
    maximum_pursuit_distance=24,
)

escort = await bot.tasks.protect(
    teammate,
    EntitySelector(categories=[ENTITY_CATEGORY_HOSTILE]),
)

rest = await bot.tasks.sleep(
    search_radius=24,
    wait_until_possible=True,
)

fishing = await bot.tasks.fish(maximum_catches=3)

harvest = await bot.tasks.farm(
    ["minecraft:wheat", "minecraft:carrots"],
    center=farm_center,
    radius=16,
    maximum_harvests=24,
    replant=True,
)

breeding = await bot.tasks.breed(
    EntitySelector(entity_types=["minecraft:cow"]),
    food=ItemSelector(item_ids=["minecraft:wheat"]),
    maximum_pairs=2,
)

scouting = await bot.tasks.explore(
    origin=base_position,
    radius=512,
    waypoint_spacing=64,
    maximum_waypoints=8,
    return_to_origin=True,
    purpose="village-scouting",
)

supplies = await bot.tasks.withdraw(
    storage_chest,
    [
        ContainerTransferSpec(
            selector=ItemSelector(item_ids=["minecraft:bread"]),
            count=16,
        ),
        ContainerTransferSpec(
            selector=ItemSelector(tags=["minecraft:coals"]),
            count=8,
            allow_partial=True,
        ),
    ],
)
```

Recipe discovery and production share one bot API:

```python
recipes = await bot.recipes.list(result_item_id="minecraft:iron_ingot")

smelting = await bot.recipes.smelt(
    ItemSelector(item_ids=["minecraft:raw_iron"]),
    count=8,
    fuel=ItemSelector(tags=["minecraft:coals"]),
    station=furnace_position,
)

result = await smelting.result()

brewing = await bot.recipes.brew(
    ItemSelector(fingerprint=water_potion_fingerprint),
    ItemSelector(item_ids=["minecraft:nether_wart"]),
    count=3,
    expected_result=ItemSelector(fingerprint=awkward_potion_fingerprint),
    station=brewing_stand_position,
)

await brewing.result()

# Open a villager menu through an entity interaction first.
offers = await bot.recipes.list_villager_trades()
offer = offers.offers[0]
trading = await bot.recipes.villager_trade(
    offer.offer_index,
    count=3,
    expected_result=ItemSelector(item_ids=[offer.result.item_id]),
)
await trading.result()
```

Inventory recommendations share the server's Minecraft-aware selection
policy and include explainable score factors:

```python
tool = await bot.inventory.best_tool(
    block_position,
    prefer_hotbar=True,
    prefer_high_durability=True,
    preferred_enchantment_ids=["minecraft:fortune"],
)
```

Use `run_auto_eat`, `run_attack_entity`, and the other `run_*` methods when the
task should be owned by the lifetime of its event iterator.

## Observe synchronized state

`bot.observe()` opens one event stream and maintains an immutable session
state from snapshots and deltas:

```python
session = await bot.observe()
async with session:
    print(session.state.player)

    async for event in session.events():
        print(event)
```

Raw event streams remain available through `bot.events()` for applications
that want to process protocol events directly.

## Compose behaviors

Async behavior combinators use Python 3.14 structured concurrency:

```python
workflow = cleanup(
    sequence(
        CollectBlocks(
            block_ids=(),
            tags=("minecraft:logs",),
            count=16,
        ),
        retry(
            build_shelter,
            attempts=3,
            delay=0.5,
            backoff=2,
        ),
    ),
    release_temporary_claims,
)

results = await workflow.run(bot)
```

The SDK includes `sequence`, `parallel`, `race`, `repeat`, `retry`, `timeout`,
`until`, `conditional`, `fallback`, `cleanup`, and `scoped_lease`.
`parallel` uses `asyncio.TaskGroup`; concurrent failures remain available as
an `ExceptionGroup`.

## Call plugin APIs

Use a typed companion module when the plugin publishes one:

```python
plugin = soulfire.plugins.require(async_example_plugin)
reply = await plugin.echo(instance_id, "hello")
```

Typed plugin events preserve their global, instance, bot, or task scope:

```python
async for event in soulfire.plugins.typed_events(
    "example",
    Tick,
    instance_id=instance_id,
):
    if event.value is not None:
        print(event.value.sequence)
```

The initial envelope reports whether `after_sequence` could be resumed.
`dropped_before` reports backpressure loss. Sync clients expose the same API as
an iterator.

The plugin catalog can also download protobuf descriptors and create a
reflective client for an installed plugin that has no companion package.
Generated companion packages expose both sync and async clients from the same
service definition.

## Administer SoulFire

`client.admin` gives async and sync applications one typed entry point for the
server control plane:

```python
from soulfire.logs_pb2 import InstanceLogScope, LogScope

server = await client.admin.server_info()
users = await client.admin.list_users()
metrics = await client.admin.instance_metrics(instance.id)
audits = await client.admin.audit_log(instance.id)

scope = LogScope(instance=InstanceLogScope(instance_id=instance.id))
async for entry in client.admin.logs(scope):
    print(entry.message.message)
```

The admin API covers self-service tokens and profile changes, server settings,
users and session revocation, scoped logs, server and instance metrics,
commands and completion, permission-scoped downloads, plugin metrics, audit
logs, and the complete script lifecycle. Synchronous applications call the
same snake-case methods without `await`.

## Use the raw Minecraft protocol

`bot.protocol` provides filtered packet observation, native packet schema
discovery, and a permission-gated raw send escape hatch:

```python
from soulfire import PACKET_DIRECTION_CLIENTBOUND

info = await bot.protocol.info()
schemas = await bot.protocol.schemas(PACKET_DIRECTION_CLIENTBOUND)

async for packet in bot.protocol.packets(
    directions=[PACKET_DIRECTION_CLIENTBOUND],
    names=["minecraft:game_event"],
):
    print(packet.name, packet.network_id)
```

Encoded bytes use SoulFire's reported native protocol. ViaVersion translates
the decoded packet to the remote server protocol afterward. Raw sends require
the admin-only `RAW_PROTOCOL` permission and should set `expected_name`.

## Use generated protocol clients

Generated protobuf messages and ConnectRPC clients are available as an
advanced escape hatch:

```python
from soulfire.instance_connect import InstanceServiceClient

instances = soulfire.service(InstanceServiceClient)
```

Prefer the high-level object model for application code. It adds validation,
resource cleanup, task semantics, and stable language-level behavior around
the wire protocol.
