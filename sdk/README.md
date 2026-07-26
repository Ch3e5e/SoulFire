# SoulFire SDKs

The SoulFire SDKs provide typed gRPC-Web clients for scripting bots managed by
a SoulFire server.

The SDK can connect to an existing server or provision a local dedicated
server. Instances provide permission and configuration boundaries, while each
configured account is controlled as an independent bot with its own persistent
desired state.

## Packages

- [`@soulfiremc/sdk`](./typescript/README.md) for browsers and JavaScript
  runtimes with `fetch`
- [`soulfire-sdk`](./python/README.md) for synchronous and asyncio Python
  applications

Both packages use gRPC-Web exclusively. They share the Protobuf definitions in
`proto/src/main/proto` and expose generated clients when the high-level bot API
does not cover an RPC.

The high-level clients support:

- Starting, stopping, and restarting one bot, explicit bot IDs, or a count
- Watching desired and runtime status as a server stream
- Sending chat, querying the world, interacting, and pathfinding
- Installing and managing a local SoulFire dedicated server

## Generate the bindings

Install the root Node dependencies and generate both language bindings:

```bash
pnpm install
pnpm sdk:generate
```

Generation uses the checked-in `buf.gen.yaml`. Do not edit files marked as
generated.
