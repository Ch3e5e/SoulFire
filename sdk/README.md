# SoulFire SDKs

The SoulFire SDKs provide typed gRPC-Web clients for scripting bots managed by
a SoulFire server.

The initial SDK surface follows the automation RPCs that the server implements
today. It can connect to an existing server or provision a local dedicated
server. It intentionally does not model instance lifecycle, bot counts, or the
planned per-bot desired-state API.

## Packages

- [`@soulfiremc/sdk`](./typescript/README.md) for browsers and JavaScript
  runtimes with `fetch`
- [`soulfire-sdk`](./python/README.md) for synchronous and asyncio Python
  applications

Both packages use gRPC-Web exclusively. They share the Protobuf definitions in
`proto/src/main/proto` and expose generated clients when the high-level bot API
does not cover an RPC.

## Generate the bindings

Install the root Node dependencies and generate both language bindings:

```bash
pnpm install
pnpm sdk:generate
```

Generation uses the checked-in `buf.gen.yaml`. Do not edit files marked as
generated.
