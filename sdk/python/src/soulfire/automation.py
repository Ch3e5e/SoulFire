from __future__ import annotations

from collections.abc import AsyncIterator, Iterable, Iterator
from dataclasses import dataclass

from .automation_connect import AutomationServiceClient, AutomationServiceClientSync
from .automation_pb2 import (
    ApplyAutomationPresetRequest,
    ApplyAutomationPresetResponse,
    AutomationActionRequest,
    AutomationBotActionResult,
    AutomationBotState,
    AutomationCoordinationState,
    AutomationEvent,
    AutomationInstanceSettings,
    AutomationMemoryState,
    AutomationPreset,
    AutomationRolePolicy,
    AutomationTeamObjective,
    AutomationTeamRole,
    AutomationTeamState,
    GetAutomationBotStateRequest,
    GetAutomationCoordinationStateRequest,
    GetAutomationMemoryStateRequest,
    GetAutomationTeamStateRequest,
    ReleaseAutomationBotClaimsRequest,
    ReleaseAutomationBotClaimsResponse,
    ReleaseAutomationClaimRequest,
    ReleaseAutomationClaimResponse,
    ResetAutomationCoordinationStateRequest,
    ResetAutomationMemoryRequest,
    SetAutomationCollaborationRequest,
    SetAutomationMaxEndBotsRequest,
    SetAutomationObjectiveOverrideRequest,
    SetAutomationQuotaOverrideRequest,
    SetAutomationRoleOverrideRequest,
    SetAutomationRolePolicyRequest,
    SetAutomationSharedClaimsRequest,
    SetAutomationSharedEndEntryRequest,
    SetAutomationSharedStructuresRequest,
    StartAutomationAcquireRequest,
    UpdateAutomationBotSettingsRequest,
    WatchAutomationEventsRequest,
)

type Headers = dict[str, str] | None


@dataclass(frozen=True, slots=True, kw_only=True)
class AutomationBotSettingsPatch:
    enabled: bool | None = None
    allow_death_recovery: bool | None = None
    memory_scan_radius: int | None = None
    memory_scan_interval_ticks: int | None = None
    retreat_health_threshold: int | None = None
    retreat_food_threshold: int | None = None
    role_override: AutomationTeamRole | None = None

    def apply_to(self, request: UpdateAutomationBotSettingsRequest) -> None:
        if self.enabled is not None:
            request.enabled = self.enabled
        if self.allow_death_recovery is not None:
            request.allow_death_recovery = self.allow_death_recovery
        if self.memory_scan_radius is not None:
            request.memory_scan_radius = self.memory_scan_radius
        if self.memory_scan_interval_ticks is not None:
            request.memory_scan_interval_ticks = self.memory_scan_interval_ticks
        if self.retreat_health_threshold is not None:
            request.retreat_health_threshold = self.retreat_health_threshold
        if self.retreat_food_threshold is not None:
            request.retreat_food_threshold = self.retreat_food_threshold
        if self.role_override is not None:
            request.role_override = self.role_override


class AsyncSoulFireAutomation:
    """Async control and observation for SoulFire's coordinated automation engine."""

    def __init__(
        self,
        instance_id: str,
        client: AutomationServiceClient,
    ) -> None:
        self._instance_id = instance_id
        self._client = client

    def events(
        self,
        *,
        bot_ids: Iterable[str] = (),
        include_coordination: bool = True,
        max_coordination_entries: int = 0,
        poll_interval_ms: int = 0,
        heartbeat_interval_seconds: int = 0,
        include_progress: bool = True,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[AutomationEvent]:
        return self._client.watch_automation_events(
            WatchAutomationEventsRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
                include_coordination=include_coordination,
                max_coordination_entries=max_coordination_entries,
                poll_interval_ms=poll_interval_ms,
                heartbeat_interval_seconds=heartbeat_interval_seconds,
                include_progress=include_progress,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def team_state(
        self,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationTeamState:
        response = await self._client.get_automation_team_state(
            GetAutomationTeamStateRequest(instance_id=self._instance_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.state

    async def coordination_state(
        self,
        max_entries: int = 0,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationCoordinationState:
        response = await self._client.get_automation_coordination_state(
            GetAutomationCoordinationStateRequest(
                instance_id=self._instance_id,
                max_entries=max_entries,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.state

    async def bot_state(
        self,
        bot_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationBotState:
        response = await self._client.get_automation_bot_state(
            GetAutomationBotStateRequest(
                instance_id=self._instance_id,
                bot_id=bot_id,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.state

    async def memory(
        self,
        bot_id: str,
        max_entries: int = 0,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationMemoryState:
        response = await self._client.get_automation_memory_state(
            GetAutomationMemoryStateRequest(
                instance_id=self._instance_id,
                bot_id=bot_id,
                max_entries=max_entries,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.state

    async def start_beat(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = await self._client.start_automation_beat(
            _action_request(self._instance_id, bot_ids),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    async def acquire(
        self,
        target: str,
        count: int,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = await self._client.start_automation_acquire(
            StartAutomationAcquireRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
                target=target,
                count=count,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    async def pause(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = await self._client.pause_automation(
            _action_request(self._instance_id, bot_ids),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    async def resume(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = await self._client.resume_automation(
            _action_request(self._instance_id, bot_ids),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    async def stop(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = await self._client.stop_automation(
            _action_request(self._instance_id, bot_ids),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    async def apply_preset(
        self,
        preset: AutomationPreset,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> ApplyAutomationPresetResponse:
        return await self._client.apply_automation_preset(
            ApplyAutomationPresetRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
                preset=preset,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def set_collaboration(
        self,
        enabled: bool,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = await self._client.set_automation_collaboration(
            SetAutomationCollaborationRequest(
                instance_id=self._instance_id,
                enabled=enabled,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    async def set_role_policy(
        self,
        role_policy: AutomationRolePolicy,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = await self._client.set_automation_role_policy(
            SetAutomationRolePolicyRequest(
                instance_id=self._instance_id,
                role_policy=role_policy,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    async def set_shared_structures(
        self,
        enabled: bool,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = await self._client.set_automation_shared_structures(
            SetAutomationSharedStructuresRequest(
                instance_id=self._instance_id,
                enabled=enabled,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    async def set_shared_claims(
        self,
        enabled: bool,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = await self._client.set_automation_shared_claims(
            SetAutomationSharedClaimsRequest(
                instance_id=self._instance_id,
                enabled=enabled,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    async def set_shared_end_entry(
        self,
        enabled: bool,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = await self._client.set_automation_shared_end_entry(
            SetAutomationSharedEndEntryRequest(
                instance_id=self._instance_id,
                enabled=enabled,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    async def set_max_end_bots(
        self,
        max_end_bots: int,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = await self._client.set_automation_max_end_bots(
            SetAutomationMaxEndBotsRequest(
                instance_id=self._instance_id,
                max_end_bots=max_end_bots,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    async def set_quota_override(
        self,
        requirement_key: str,
        target_count: int,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = await self._client.set_automation_quota_override(
            SetAutomationQuotaOverrideRequest(
                instance_id=self._instance_id,
                requirement_key=requirement_key,
                target_count=target_count,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    async def set_objective_override(
        self,
        objective: AutomationTeamObjective,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = await self._client.set_automation_objective_override(
            SetAutomationObjectiveOverrideRequest(
                instance_id=self._instance_id,
                objective=objective,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    async def set_role_override(
        self,
        role: AutomationTeamRole,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = await self._client.set_automation_role_override(
            SetAutomationRoleOverrideRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
                role=role,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    async def update_bot_settings(
        self,
        patch: AutomationBotSettingsPatch,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        request = _settings_patch_request(self._instance_id, bot_ids, patch)
        response = await self._client.update_automation_bot_settings(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    async def reset_memory(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = await self._client.reset_automation_memory(
            ResetAutomationMemoryRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    async def reset_coordination(
        self,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationCoordinationState:
        response = await self._client.reset_automation_coordination_state(
            ResetAutomationCoordinationStateRequest(instance_id=self._instance_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.state

    async def release_claim(
        self,
        key: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> ReleaseAutomationClaimResponse:
        return await self._client.release_automation_claim(
            ReleaseAutomationClaimRequest(
                instance_id=self._instance_id,
                key=key,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def release_bot_claims(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> ReleaseAutomationBotClaimsResponse:
        return await self._client.release_automation_bot_claims(
            ReleaseAutomationBotClaimsRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )


class SoulFireAutomation:
    """Synchronous control and observation for coordinated automation."""

    def __init__(
        self,
        instance_id: str,
        client: AutomationServiceClientSync,
    ) -> None:
        self._instance_id = instance_id
        self._client = client

    def events(
        self,
        *,
        bot_ids: Iterable[str] = (),
        include_coordination: bool = True,
        max_coordination_entries: int = 0,
        poll_interval_ms: int = 0,
        heartbeat_interval_seconds: int = 0,
        include_progress: bool = True,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> Iterator[AutomationEvent]:
        return self._client.watch_automation_events(
            WatchAutomationEventsRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
                include_coordination=include_coordination,
                max_coordination_entries=max_coordination_entries,
                poll_interval_ms=poll_interval_ms,
                heartbeat_interval_seconds=heartbeat_interval_seconds,
                include_progress=include_progress,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def team_state(
        self,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationTeamState:
        response = self._client.get_automation_team_state(
            GetAutomationTeamStateRequest(instance_id=self._instance_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.state

    def coordination_state(
        self,
        max_entries: int = 0,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationCoordinationState:
        response = self._client.get_automation_coordination_state(
            GetAutomationCoordinationStateRequest(
                instance_id=self._instance_id,
                max_entries=max_entries,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.state

    def bot_state(
        self,
        bot_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationBotState:
        response = self._client.get_automation_bot_state(
            GetAutomationBotStateRequest(
                instance_id=self._instance_id,
                bot_id=bot_id,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.state

    def memory(
        self,
        bot_id: str,
        max_entries: int = 0,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationMemoryState:
        response = self._client.get_automation_memory_state(
            GetAutomationMemoryStateRequest(
                instance_id=self._instance_id,
                bot_id=bot_id,
                max_entries=max_entries,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.state

    def start_beat(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = self._client.start_automation_beat(
            _action_request(self._instance_id, bot_ids),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    def acquire(
        self,
        target: str,
        count: int,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = self._client.start_automation_acquire(
            StartAutomationAcquireRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
                target=target,
                count=count,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    def pause(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = self._client.pause_automation(
            _action_request(self._instance_id, bot_ids),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    def resume(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = self._client.resume_automation(
            _action_request(self._instance_id, bot_ids),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    def stop(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = self._client.stop_automation(
            _action_request(self._instance_id, bot_ids),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    def apply_preset(
        self,
        preset: AutomationPreset,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> ApplyAutomationPresetResponse:
        return self._client.apply_automation_preset(
            ApplyAutomationPresetRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
                preset=preset,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def set_collaboration(
        self,
        enabled: bool,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = self._client.set_automation_collaboration(
            SetAutomationCollaborationRequest(
                instance_id=self._instance_id,
                enabled=enabled,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    def set_role_policy(
        self,
        role_policy: AutomationRolePolicy,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = self._client.set_automation_role_policy(
            SetAutomationRolePolicyRequest(
                instance_id=self._instance_id,
                role_policy=role_policy,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    def set_shared_structures(
        self,
        enabled: bool,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = self._client.set_automation_shared_structures(
            SetAutomationSharedStructuresRequest(
                instance_id=self._instance_id,
                enabled=enabled,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    def set_shared_claims(
        self,
        enabled: bool,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = self._client.set_automation_shared_claims(
            SetAutomationSharedClaimsRequest(
                instance_id=self._instance_id,
                enabled=enabled,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    def set_shared_end_entry(
        self,
        enabled: bool,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = self._client.set_automation_shared_end_entry(
            SetAutomationSharedEndEntryRequest(
                instance_id=self._instance_id,
                enabled=enabled,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    def set_max_end_bots(
        self,
        max_end_bots: int,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = self._client.set_automation_max_end_bots(
            SetAutomationMaxEndBotsRequest(
                instance_id=self._instance_id,
                max_end_bots=max_end_bots,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    def set_quota_override(
        self,
        requirement_key: str,
        target_count: int,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = self._client.set_automation_quota_override(
            SetAutomationQuotaOverrideRequest(
                instance_id=self._instance_id,
                requirement_key=requirement_key,
                target_count=target_count,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    def set_objective_override(
        self,
        objective: AutomationTeamObjective,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationInstanceSettings:
        response = self._client.set_automation_objective_override(
            SetAutomationObjectiveOverrideRequest(
                instance_id=self._instance_id,
                objective=objective,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.settings

    def set_role_override(
        self,
        role: AutomationTeamRole,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = self._client.set_automation_role_override(
            SetAutomationRoleOverrideRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
                role=role,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    def update_bot_settings(
        self,
        patch: AutomationBotSettingsPatch,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = self._client.update_automation_bot_settings(
            _settings_patch_request(self._instance_id, bot_ids, patch),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    def reset_memory(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[AutomationBotActionResult]:
        response = self._client.reset_automation_memory(
            ResetAutomationMemoryRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.results)

    def reset_coordination(
        self,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AutomationCoordinationState:
        response = self._client.reset_automation_coordination_state(
            ResetAutomationCoordinationStateRequest(instance_id=self._instance_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.state

    def release_claim(
        self,
        key: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> ReleaseAutomationClaimResponse:
        return self._client.release_automation_claim(
            ReleaseAutomationClaimRequest(
                instance_id=self._instance_id,
                key=key,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def release_bot_claims(
        self,
        bot_ids: Iterable[str] = (),
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> ReleaseAutomationBotClaimsResponse:
        return self._client.release_automation_bot_claims(
            ReleaseAutomationBotClaimsRequest(
                instance_id=self._instance_id,
                bot_ids=_unique(bot_ids),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )


def _unique(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def _action_request(instance_id: str, bot_ids: Iterable[str]) -> AutomationActionRequest:
    return AutomationActionRequest(
        instance_id=instance_id,
        bot_ids=_unique(bot_ids),
    )


def _settings_patch_request(
    instance_id: str,
    bot_ids: Iterable[str],
    patch: AutomationBotSettingsPatch,
) -> UpdateAutomationBotSettingsRequest:
    request = UpdateAutomationBotSettingsRequest(
        instance_id=instance_id,
        bot_ids=_unique(bot_ids),
    )
    patch.apply_to(request)
    return request
