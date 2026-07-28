import type {
  DescMessage,
  MessageInitShape,
} from "@bufbuild/protobuf";
import type { CallOptions, Client } from "@connectrpc/connect";

import {
  AutomationService,
  type ApplyAutomationPresetResponse,
  type AutomationActionResponse,
  type AutomationBotActionResult,
  type AutomationBotState,
  type AutomationCoordinationState,
  type AutomationEvent,
  type AutomationInstanceSettings,
  type AutomationMemoryState,
  type AutomationPreset,
  type AutomationRolePolicy,
  type AutomationTeamObjective,
  type AutomationTeamRole,
  type AutomationTeamState,
  type ReleaseAutomationBotClaimsResponse,
  type ReleaseAutomationClaimResponse,
  type UpdateAutomationBotSettingsRequestSchema,
  type WatchAutomationEventsRequestSchema,
} from "./generated/soulfire/automation_pb.js";

type InstanceScoped<T extends DescMessage> = Omit<
  MessageInitShape<T>,
  "$typeName" | "instanceId"
>;

export type AutomationBotSettingsPatch = Omit<
  InstanceScoped<typeof UpdateAutomationBotSettingsRequestSchema>,
  "botIds"
>;

export type WatchAutomationOptions =
  & Omit<
    InstanceScoped<typeof WatchAutomationEventsRequestSchema>,
    "botIds"
  >
  & {
    botIds?: readonly string[];
    call?: CallOptions;
  };

/**
 * Controls and observes SoulFire's coordinated, persistent automation engine.
 *
 * An empty bot selection means every applicable bot in the instance.
 */
export class SoulFireAutomation {
  public constructor(
    private readonly instanceId: string,
    private readonly client: Client<typeof AutomationService>,
  ) {}

  public events(
    options: WatchAutomationOptions = {},
  ): AsyncIterable<AutomationEvent> {
    const {
      botIds = [],
      call,
      includeCoordination = true,
      includeProgress = true,
      ...request
    } = options;
    return this.client.watchAutomationEvents(
      {
        ...request,
        ...this.scope(),
        botIds: unique(botIds),
        includeCoordination,
        includeProgress,
      },
      call,
    );
  }

  public async teamState(options?: CallOptions): Promise<AutomationTeamState> {
    const response = await this.client.getAutomationTeamState(
      this.scope(),
      options,
    );
    return required(response.state, "automation team state");
  }

  public async coordinationState(
    maxEntries = 0,
    options?: CallOptions,
  ): Promise<AutomationCoordinationState> {
    const response = await this.client.getAutomationCoordinationState(
      { ...this.scope(), maxEntries },
      options,
    );
    return required(response.state, "automation coordination state");
  }

  public async botState(
    botId: string,
    options?: CallOptions,
  ): Promise<AutomationBotState> {
    const response = await this.client.getAutomationBotState(
      { ...this.scope(), botId },
      options,
    );
    return required(response.state, `automation state for bot ${botId}`);
  }

  public async memory(
    botId: string,
    maxEntries = 0,
    options?: CallOptions,
  ): Promise<AutomationMemoryState> {
    const response = await this.client.getAutomationMemoryState(
      { ...this.scope(), botId, maxEntries },
      options,
    );
    return required(response.state, `automation memory for bot ${botId}`);
  }

  public async startBeat(
    botIds: readonly string[] = [],
    options?: CallOptions,
  ): Promise<readonly AutomationBotActionResult[]> {
    return this.action(
      () =>
        this.client.startAutomationBeat(
          { ...this.scope(), botIds: unique(botIds) },
          options,
        ),
    );
  }

  public async acquire(
    target: string,
    count: number,
    botIds: readonly string[] = [],
    options?: CallOptions,
  ): Promise<readonly AutomationBotActionResult[]> {
    return this.action(
      () =>
        this.client.startAutomationAcquire(
          {
            ...this.scope(),
            botIds: unique(botIds),
            target,
            count,
          },
          options,
        ),
    );
  }

  public pause(
    botIds: readonly string[] = [],
    options?: CallOptions,
  ): Promise<readonly AutomationBotActionResult[]> {
    return this.control("pause", botIds, options);
  }

  public resume(
    botIds: readonly string[] = [],
    options?: CallOptions,
  ): Promise<readonly AutomationBotActionResult[]> {
    return this.control("resume", botIds, options);
  }

  public stop(
    botIds: readonly string[] = [],
    options?: CallOptions,
  ): Promise<readonly AutomationBotActionResult[]> {
    return this.control("stop", botIds, options);
  }

  public applyPreset(
    preset: AutomationPreset,
    botIds: readonly string[] = [],
    options?: CallOptions,
  ): Promise<ApplyAutomationPresetResponse> {
    return this.client.applyAutomationPreset(
      { ...this.scope(), botIds: unique(botIds), preset },
      options,
    );
  }

  public async setCollaboration(
    enabled: boolean,
    options?: CallOptions,
  ): Promise<AutomationInstanceSettings> {
    const response = await this.client.setAutomationCollaboration(
      { ...this.scope(), enabled },
      options,
    );
    return required(response.settings, "automation instance settings");
  }

  public async setRolePolicy(
    rolePolicy: AutomationRolePolicy,
    options?: CallOptions,
  ): Promise<AutomationInstanceSettings> {
    const response = await this.client.setAutomationRolePolicy(
      { ...this.scope(), rolePolicy },
      options,
    );
    return required(response.settings, "automation instance settings");
  }

  public async setSharedStructures(
    enabled: boolean,
    options?: CallOptions,
  ): Promise<AutomationInstanceSettings> {
    const response = await this.client.setAutomationSharedStructures(
      { ...this.scope(), enabled },
      options,
    );
    return required(response.settings, "automation instance settings");
  }

  public async setSharedClaims(
    enabled: boolean,
    options?: CallOptions,
  ): Promise<AutomationInstanceSettings> {
    const response = await this.client.setAutomationSharedClaims(
      { ...this.scope(), enabled },
      options,
    );
    return required(response.settings, "automation instance settings");
  }

  public async setSharedEndEntry(
    enabled: boolean,
    options?: CallOptions,
  ): Promise<AutomationInstanceSettings> {
    const response = await this.client.setAutomationSharedEndEntry(
      { ...this.scope(), enabled },
      options,
    );
    return required(response.settings, "automation instance settings");
  }

  public async setMaxEndBots(
    maxEndBots: number,
    options?: CallOptions,
  ): Promise<AutomationInstanceSettings> {
    const response = await this.client.setAutomationMaxEndBots(
      { ...this.scope(), maxEndBots },
      options,
    );
    return required(response.settings, "automation instance settings");
  }

  public async setQuotaOverride(
    requirementKey: string,
    targetCount: number,
    options?: CallOptions,
  ): Promise<AutomationInstanceSettings> {
    const response = await this.client.setAutomationQuotaOverride(
      { ...this.scope(), requirementKey, targetCount },
      options,
    );
    return required(response.settings, "automation instance settings");
  }

  public async setObjectiveOverride(
    objective: AutomationTeamObjective,
    options?: CallOptions,
  ): Promise<AutomationInstanceSettings> {
    const response = await this.client.setAutomationObjectiveOverride(
      { ...this.scope(), objective },
      options,
    );
    return required(response.settings, "automation instance settings");
  }

  public async setRoleOverride(
    role: AutomationTeamRole,
    botIds: readonly string[] = [],
    options?: CallOptions,
  ): Promise<readonly AutomationBotActionResult[]> {
    const response = await this.client.setAutomationRoleOverride(
      { ...this.scope(), botIds: unique(botIds), role },
      options,
    );
    return response.results;
  }

  public async updateBotSettings(
    patch: AutomationBotSettingsPatch,
    botIds: readonly string[] = [],
    options?: CallOptions,
  ): Promise<readonly AutomationBotActionResult[]> {
    const response = await this.client.updateAutomationBotSettings(
      {
        ...patch,
        ...this.scope(),
        botIds: unique(botIds),
      },
      options,
    );
    return response.results;
  }

  public async resetMemory(
    botIds: readonly string[] = [],
    options?: CallOptions,
  ): Promise<readonly AutomationBotActionResult[]> {
    const response = await this.client.resetAutomationMemory(
      { ...this.scope(), botIds: unique(botIds) },
      options,
    );
    return response.results;
  }

  public async resetCoordination(
    options?: CallOptions,
  ): Promise<AutomationCoordinationState> {
    const response = await this.client.resetAutomationCoordinationState(
      this.scope(),
      options,
    );
    return required(response.state, "automation coordination state");
  }

  public releaseClaim(
    key: string,
    options?: CallOptions,
  ): Promise<ReleaseAutomationClaimResponse> {
    return this.client.releaseAutomationClaim(
      { ...this.scope(), key },
      options,
    );
  }

  public releaseBotClaims(
    botIds: readonly string[] = [],
    options?: CallOptions,
  ): Promise<ReleaseAutomationBotClaimsResponse> {
    return this.client.releaseAutomationBotClaims(
      { ...this.scope(), botIds: unique(botIds) },
      options,
    );
  }

  private async control(
    operation: "pause" | "resume" | "stop",
    botIds: readonly string[],
    options?: CallOptions,
  ): Promise<readonly AutomationBotActionResult[]> {
    const request = { ...this.scope(), botIds: unique(botIds) };
    return this.action(() => {
      switch (operation) {
        case "pause":
          return this.client.pauseAutomation(request, options);
        case "resume":
          return this.client.resumeAutomation(request, options);
        case "stop":
          return this.client.stopAutomation(request, options);
      }
    });
  }

  private async action(
    call: () => Promise<AutomationActionResponse>,
  ): Promise<readonly AutomationBotActionResult[]> {
    return (await call()).results;
  }

  private scope(): { instanceId: string } {
    return { instanceId: this.instanceId };
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`SoulFire did not return ${description}`);
  }
  return value;
}
