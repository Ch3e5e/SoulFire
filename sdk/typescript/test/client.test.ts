import { createClient } from "@connectrpc/connect";
import { createRouterTransport } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";

import { SoulFireBot } from "../src/client.js";
import {
  BotLiveService,
  type SendChatRequest,
  type WatchBotEventsRequest,
} from "../src/generated/soulfire/bot_live_pb.js";

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
          return {};
        },
      });
    });
    const bot = new SoulFireBot(
      "instance-id",
      "bot-id",
      createClient(BotLiveService, transport),
    );

    await bot.sendChat("hello");

    expect(received).toMatchObject({
      instanceId: "instance-id",
      botId: "bot-id",
      message: "hello",
    });
  });
});
