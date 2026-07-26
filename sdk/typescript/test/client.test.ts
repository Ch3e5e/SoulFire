import { createClient } from "@connectrpc/connect";
import { createRouterTransport } from "@connectrpc/connect";
import { describe, expect, it, vi } from "vitest";

import { SoulFireBot, SoulFireInstance } from "../src/client.js";
import {
  BotDesiredState,
  BotRuntimeState,
  BotService,
  type RestartBotsRequest,
  type SetBotsDesiredStateRequest,
} from "../src/generated/soulfire/bot_pb.js";
import {
  BotActionStatus,
  BotLiveService,
  type SendChatRequest,
  type WatchBotEventsRequest,
} from "../src/generated/soulfire/bot_live_pb.js";
import { InstanceService } from "../src/generated/soulfire/instance_pb.js";

describe("SoulFireBot", () => {
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
});

describe("SoulFireInstance", () => {
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
