import { createClient } from "@connectrpc/connect";
import { createRouterTransport } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";

import { SoulFire, SoulFireBot, SoulFireInstance } from "../src/client.js";
import {
  BotDesiredState,
  BotLiveStateSchema,
  BotRuntimeState,
  BotService,
  type RestartBotsRequest,
  type SetBotsDesiredStateRequest,
} from "../src/generated/soulfire/bot_pb.js";
import {
  BotActionStatus,
  BotLiveService,
  BlockFace,
  Hand,
  ResourcePackResponse,
  type AttackEntityRequest,
  type InteractEntityRequest,
  type InteractBlockRequest,
  type MountEntityRequest,
  type RespondResourcePackRequest,
  type SendChatRequest,
  type SetCreativeSlotRequest,
  type SetFlyingRequest,
  type SleepRequest,
  type StartElytraFlightRequest,
  type UpdateSignRequest,
  type WaitForChunksRequest,
  type WakeRequest,
  type WatchBotEventsRequest,
  type WriteBookRequest,
} from "../src/generated/soulfire/bot_live_pb.js";
import { InstanceService } from "../src/generated/soulfire/instance_pb.js";
import {
  InstanceLiveService,
  type WatchInstanceEventsRequest,
} from "../src/generated/soulfire/instance_live_pb.js";

describe("SoulFireBot", () => {
  it("waits for a usable player snapshot instead of runtime startup", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(BotService, {
        getBotInfo() {
          return {
            status: {
              profileId: "bot-id",
              desiredState: BotDesiredState.RUNNING,
              runtimeState: BotRuntimeState.RUNNING,
            },
          };
        },
      });
      service(BotLiveService, {
        async *watchBotEvents() {
          yield {
            event: {
              case: "status",
              value: {
                profileId: "bot-id",
                desiredState: BotDesiredState.RUNNING,
                runtimeState: BotRuntimeState.RUNNING,
              },
            },
          };
          yield {
            event: {
              case: "snapshot",
              value: create(BotLiveStateSchema),
            },
          };
        },
      });
    });
    const bot = new SoulFireBot(
      "instance-id",
      "bot-id",
      createClient(BotService, transport),
      createClient(BotLiveService, transport),
    );

    const status = await bot.waitForOnline();

    expect(status.runtimeState).toBe(BotRuntimeState.RUNNING);
  });

  it("scopes event streams to the selected instance and bot", async () => {
    let received: WatchBotEventsRequest | undefined;
    const transport = createRouterTransport(({ service }) => {
      service(BotLiveService, {
        async *watchBotEvents(request) {
          received = request;
          yield {};
        },
      });
    });
    const bot = new SoulFireBot(
      "instance-id",
      "bot-id",
      createClient(BotService, transport),
      createClient(BotLiveService, transport),
    );

    for await (const _event of bot.events()) {
      break;
    }

    expect(received).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
      filter: {
        includeChat: true,
        includeDamage: true,
        includeInventory: true,
        includeLifecycle: true,
        includeStateDeltas: true,
        includeTitles: true,
      },
    });
  });

  it("scopes commands to the selected instance and bot", async () => {
    let received: SendChatRequest | undefined;
    const transport = createRouterTransport(({ service }) => {
      service(BotLiveService, {
        sendChat(request) {
          received = request;
          return {
            result: {
              actionId: "action-id",
              status: BotActionStatus.COMPLETED,
            },
          };
        },
      });
    });
    const bot = new SoulFireBot(
      "instance-id",
      "bot-id",
      createClient(BotService, transport),
      createClient(BotLiveService, transport),
    );

    await bot.sendChat("hello");

    expect(received).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
      message: "hello",
    });
  });

  it("scopes block interaction, sleep, and wake actions", async () => {
    let interaction: InteractBlockRequest | undefined;
    let sleep: SleepRequest | undefined;
    let wake: WakeRequest | undefined;
    const completed = {
      result: {
        actionId: "action-id",
        status: BotActionStatus.COMPLETED,
      },
    };
    const transport = createRouterTransport(({ service }) => {
      service(BotLiveService, {
        interactBlock(request) {
          interaction = request;
          return completed;
        },
        sleep(request) {
          sleep = request;
          return completed;
        },
        wake(request) {
          wake = request;
          return completed;
        },
      });
    });
    const bot = new SoulFireBot(
      "instance-id",
      "bot-id",
      createClient(BotService, transport),
      createClient(BotLiveService, transport),
    );

    await bot.interactBlock({
      position: { x: 1, y: 64, z: 2 },
      face: BlockFace.NORTH,
      hand: Hand.OFF,
      sneaking: true,
    });
    await bot.sleep({
      bed: { x: 3, y: 64, z: 4 },
      hand: Hand.MAIN,
    });
    await bot.wake();

    expect(interaction).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
      position: { x: 1, y: 64, z: 2 },
      face: BlockFace.NORTH,
      hand: Hand.OFF,
      sneaking: true,
    });
    expect(sleep).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
      bed: { x: 3, y: 64, z: 4 },
      hand: Hand.MAIN,
    });
    expect(wake).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
    });
  });

  it("preserves connection epochs for direct entity actions", async () => {
    let attack: AttackEntityRequest | undefined;
    let interaction: InteractEntityRequest | undefined;
    let mount: MountEntityRequest | undefined;
    const completed = {
      result: {
        actionId: "action-id",
        status: BotActionStatus.COMPLETED,
      },
    };
    const transport = createRouterTransport(({ service }) => {
      service(BotLiveService, {
        attackEntity(request) {
          attack = request;
          return completed;
        },
        interactEntity(request) {
          interaction = request;
          return completed;
        },
        mountEntity(request) {
          mount = request;
          return completed;
        },
      });
    });
    const bot = new SoulFireBot(
      "instance-id",
      "bot-id",
      createClient(BotService, transport),
      createClient(BotLiveService, transport),
    );

    await bot.attackEntity({
      entityId: 42,
      connectionEpoch: "00000000-0000-0000-0000-000000000042",
      sprinting: true,
    });
    await bot.interactEntity({
      entityId: 43,
      connectionEpoch: "00000000-0000-0000-0000-000000000043",
      hand: Hand.OFF,
      sneaking: true,
    });
    await bot.mount({
      entityId: 44,
      connectionEpoch: "00000000-0000-0000-0000-000000000044",
      hand: Hand.MAIN,
    });

    expect(attack).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
      entityId: 42,
      connectionEpoch: "00000000-0000-0000-0000-000000000042",
      sprinting: true,
    });
    expect(interaction).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
      entityId: 43,
      connectionEpoch: "00000000-0000-0000-0000-000000000043",
      hand: Hand.OFF,
      sneaking: true,
    });
    expect(mount).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
      entityId: 44,
      connectionEpoch: "00000000-0000-0000-0000-000000000044",
      hand: Hand.MAIN,
    });
  });

  it("attaches and clears an acquired control lease", async () => {
    const actionTokens: Array<string | null> = [];
    const transport = createRouterTransport(({ service }) => {
      service(BotLiveService, {
        acquireBotControl() {
          return {
            lease: {
              token: "lease-token",
            },
          };
        },
        releaseBotControl() {
          return {};
        },
        sendChat(_request, context) {
          actionTokens.push(
            context.requestHeader.get("X-SoulFire-Control-Token"),
          );
          return {
            result: {
              actionId: "action-id",
              status: BotActionStatus.COMPLETED,
            },
          };
        },
      });
    });
    const bot = new SoulFireBot(
      "instance-id",
      "bot-id",
      createClient(BotService, transport),
      createClient(BotLiveService, transport),
    );

    const lease = await bot.acquireControl();
    await bot.sendChat("leased");
    await lease.release();
    await bot.sendChat("unleased");

    expect(actionTokens).toEqual(["lease-token", null]);
  });

  it("scopes rich player actions and preserves optional input", async () => {
    let sign: UpdateSignRequest | undefined;
    let book: WriteBookRequest | undefined;
    let resourcePack: RespondResourcePackRequest | undefined;
    let flight: SetFlyingRequest | undefined;
    let elytra: StartElytraFlightRequest | undefined;
    let creativeSlot: SetCreativeSlotRequest | undefined;
    let chunkWait: WaitForChunksRequest | undefined;
    const completed = {
      result: {
        actionId: "action-id",
        status: BotActionStatus.COMPLETED,
      },
    };
    const transport = createRouterTransport(({ service }) => {
      service(BotLiveService, {
        updateSign(request) {
          sign = request;
          return completed;
        },
        writeBook(request) {
          book = request;
          return completed;
        },
        respondResourcePack(request) {
          resourcePack = request;
          return completed;
        },
        setFlying(request) {
          flight = request;
          return completed;
        },
        startElytraFlight(request) {
          elytra = request;
          return completed;
        },
        setCreativeSlot(request) {
          creativeSlot = request;
          return completed;
        },
        waitForChunks(request) {
          chunkWait = request;
          return {
            centerChunkX: 2,
            centerChunkZ: -3,
            loadedChunks: 25,
            requiredChunks: 25,
            dimension: "minecraft:overworld",
          };
        },
      });
    });
    const bot = new SoulFireBot(
      "instance-id",
      "bot-id",
      createClient(BotService, transport),
      createClient(BotLiveService, transport),
    );

    await bot.updateSign({
      position: { dimension: "minecraft:overworld", x: 1, y: 64, z: 2 },
      frontText: true,
      lines: ["one", "two", "three", "four"],
    });
    await bot.writeBook({
      inventorySlot: 2,
      pages: ["first", "second"],
      title: "Field notes",
    });
    await bot.respondResourcePack({
      packId: "00000000-0000-0000-0000-000000000042",
      response: ResourcePackResponse.ACCEPTED,
    });
    await bot.setFlying({ flying: true });
    await bot.startElytraFlight();
    await bot.setCreativeSlot({
      slot: 36,
      item: { itemId: "minecraft:stone", count: 64 },
    });
    const chunks = await bot.waitForChunks({
      radiusChunks: 2,
      timeoutMs: 12_000,
    });

    expect(sign).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
      position: { dimension: "minecraft:overworld", x: 1, y: 64, z: 2 },
      lines: ["one", "two", "three", "four"],
    });
    expect(book).toMatchObject({
      inventorySlot: 2,
      pages: ["first", "second"],
      title: "Field notes",
    });
    expect(resourcePack).toMatchObject({
      packId: "00000000-0000-0000-0000-000000000042",
      response: ResourcePackResponse.ACCEPTED,
    });
    expect(flight).toMatchObject({ flying: true });
    expect(elytra).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
    });
    expect(creativeSlot).toMatchObject({
      slot: 36,
      item: { itemId: "minecraft:stone", count: 64 },
    });
    expect(chunkWait).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
      radiusChunks: 2,
      timeoutMs: 12_000,
    });
    expect(chunks.loadedChunks).toBe(25);
  });
});

describe("SoulFireInstance", () => {
  it("scopes the multiplexed event stream and applies stateful defaults", async () => {
    let received: WatchInstanceEventsRequest | undefined;
    const transport = createRouterTransport(({ service }) => {
      service(InstanceLiveService, {
        async *watchInstanceEvents(request) {
          received = request;
          yield {};
        },
      });
    });
    const instance = SoulFire.unauthenticated({
      baseUrl: "https://soulfire.example.com",
      transport,
    }).instance("instance-id");

    for await (const _event of instance.events()) {
      break;
    }

    expect(received).toMatchObject({
      instanceId: "instance-id",
      filter: {
        botEvents: {
          includeBlockUpdates: true,
          includeBossBars: true,
          includeChat: true,
          includeEntityEvents: true,
          includeEnvironment: true,
          includeInventory: true,
          includeLifecycle: true,
          includePlayerList: true,
          includeResourcePacks: true,
          includeScoreboard: true,
          includeStateDeltas: true,
          includeTitles: true,
        },
      },
    });
  });

  it("uses shuffle-accounts when selecting a count of stopped bots", async () => {
    let received: SetBotsDesiredStateRequest | undefined;
    const transport = createRouterTransport(({ service }) => {
      service(BotService, {
        getBotList() {
          return {
            bots: ["first", "second", "third"].map((profileId) => ({
              profileId,
              status: {
                profileId,
                desiredState: BotDesiredState.STOPPED,
                runtimeState: BotRuntimeState.STOPPED,
              },
            })),
          };
        },
        setBotsDesiredState(request) {
          received = request;
          return { bots: [] };
        },
      });
      service(InstanceService, {
        getInstanceInfo() {
          return {
            result: {
              case: "info",
              value: {
                config: {
                  settings: [
                    {
                      namespace: "account",
                      entries: [
                        {
                          key: "shuffle-accounts",
                          value: {
                            kind: { case: "boolValue", value: true },
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          };
        },
      });
    });
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const instance = new SoulFireInstance(
      "instance-id",
      createClient(BotService, transport),
      createClient(BotLiveService, transport),
      createClient(InstanceService, transport),
    );

    try {
      await instance.start({ count: 1 });
    } finally {
      random.mockRestore();
    }

    expect(received).toMatchObject({
      instanceId: "instance-id",
      botIds: ["second"],
      desiredState: BotDesiredState.RUNNING,
    });
  });

  it("restarts only bots that are already desired when no selection is given", async () => {
    let received: RestartBotsRequest | undefined;
    const transport = createRouterTransport(({ service }) => {
      service(BotService, {
        getBotList() {
          return {
            bots: [
              {
                profileId: "desired",
                status: {
                  profileId: "desired",
                  desiredState: BotDesiredState.RUNNING,
                  runtimeState: BotRuntimeState.RUNNING,
                },
              },
              {
                profileId: "stopped",
                status: {
                  profileId: "stopped",
                  desiredState: BotDesiredState.STOPPED,
                  runtimeState: BotRuntimeState.STOPPED,
                },
              },
            ],
          };
        },
        restartBots(request) {
          received = request;
          return { bots: [] };
        },
      });
    });
    const instance = new SoulFireInstance(
      "instance-id",
      createClient(BotService, transport),
      createClient(BotLiveService, transport),
      createClient(InstanceService, transport),
    );

    await instance.restart();

    expect(received).toMatchObject({
      instanceId: "instance-id",
      botIds: ["desired"],
    });
  });
});
