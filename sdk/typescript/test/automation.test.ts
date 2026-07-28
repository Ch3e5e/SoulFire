import { createRouterTransport } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";

import {
  AutomationEventKind,
  AutomationGoalMode,
  AutomationService,
  type StartAutomationAcquireRequest,
  type WatchAutomationEventsRequest,
} from "../src/generated/soulfire/automation_pb.js";
import { SoulFire } from "../src/promise-client.js";

describe("SoulFireAutomation", () => {
  it("provides scoped state, event, and control APIs through the Promise facade", async () => {
    let watchRequest: WatchAutomationEventsRequest | undefined;
    let acquireRequest: StartAutomationAcquireRequest | undefined;
    const transport = createRouterTransport(({ service }) => {
      service(AutomationService, {
        getAutomationTeamState(request) {
          return {
            state: {
              instanceId: request.instanceId,
              friendlyName: "Fleet",
              objective: 1,
              activeBots: 1,
            },
          };
        },
        async *watchAutomationEvents(request) {
          watchRequest = request;
          yield {
            sequence: 1n,
            kind: AutomationEventKind.SNAPSHOT,
            teamState: {
              instanceId: request.instanceId,
              friendlyName: "Fleet",
              activeBots: 1,
            },
          };
        },
        startAutomationAcquire(request) {
          acquireRequest = request;
          return {
            results: request.botIds.map((botId) => ({
              botId,
              success: true,
              message: "started",
            })),
          };
        },
      });
    });
    const soulfire = await SoulFire.unauthenticated({
      baseUrl: "https://soulfire.example.com",
      transport,
    });
    const automation = soulfire.instance("instance-id").automation;

    const team = await automation.teamState();
    const events = [];
    for await (
      const event of automation.events({
        botIds: ["bot-id", "bot-id"],
        pollIntervalMs: 250,
      })
    ) {
      events.push(event);
    }
    const results = await automation.acquire(
      "minecraft:oak_log",
      8,
      ["bot-id"],
    );
    await soulfire.close();

    expect(team.instanceId).toBe("instance-id");
    expect(events[0]?.kind).toBe(AutomationEventKind.SNAPSHOT);
    expect(results[0]).toMatchObject({ botId: "bot-id", success: true });
    expect(watchRequest).toMatchObject({
      instanceId: "instance-id",
      botIds: ["bot-id"],
      includeCoordination: true,
      includeProgress: true,
      pollIntervalMs: 250,
    });
    expect(acquireRequest).toMatchObject({
      instanceId: "instance-id",
      botIds: ["bot-id"],
      target: "minecraft:oak_log",
      count: 8,
    });
  });

  it("preserves generated automation enums and optional selections", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(AutomationService, {
        getAutomationBotState(request) {
          return {
            state: {
              instanceId: request.instanceId,
              botId: request.botId,
              accountName: "Builder",
              statusSummary: "idle",
              goalMode: AutomationGoalMode.IDLE,
            },
          };
        },
      });
    });
    const soulfire = await SoulFire.unauthenticated({
      baseUrl: "https://soulfire.example.com",
      transport,
    });

    const state = await soulfire
      .instance("instance-id")
      .automation
      .botState("bot-id");
    await soulfire.close();

    expect(state.goalMode).toBe(AutomationGoalMode.IDLE);
  });
});
