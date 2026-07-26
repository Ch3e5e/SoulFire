import datetime

from soulfire import api_docs_pb2 as _api_docs_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class AutomationPreset(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AUTOMATION_PRESET_UNSPECIFIED: _ClassVar[AutomationPreset]
    AUTOMATION_PRESET_BALANCED_TEAM: _ClassVar[AutomationPreset]
    AUTOMATION_PRESET_INDEPENDENT_RUNNERS: _ClassVar[AutomationPreset]
    AUTOMATION_PRESET_CAUTIOUS_TEAM: _ClassVar[AutomationPreset]

class AutomationRolePolicy(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AUTOMATION_ROLE_POLICY_UNSPECIFIED: _ClassVar[AutomationRolePolicy]
    AUTOMATION_ROLE_POLICY_STATIC_TEAM: _ClassVar[AutomationRolePolicy]
    AUTOMATION_ROLE_POLICY_INDEPENDENT: _ClassVar[AutomationRolePolicy]

class AutomationTeamRole(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AUTOMATION_TEAM_ROLE_UNSPECIFIED: _ClassVar[AutomationTeamRole]
    AUTOMATION_TEAM_ROLE_LEAD: _ClassVar[AutomationTeamRole]
    AUTOMATION_TEAM_ROLE_PORTAL_ENGINEER: _ClassVar[AutomationTeamRole]
    AUTOMATION_TEAM_ROLE_NETHER_RUNNER: _ClassVar[AutomationTeamRole]
    AUTOMATION_TEAM_ROLE_STRONGHOLD_SCOUT: _ClassVar[AutomationTeamRole]
    AUTOMATION_TEAM_ROLE_END_SUPPORT: _ClassVar[AutomationTeamRole]

class AutomationTeamObjective(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AUTOMATION_TEAM_OBJECTIVE_UNSPECIFIED: _ClassVar[AutomationTeamObjective]
    AUTOMATION_TEAM_OBJECTIVE_BOOTSTRAP: _ClassVar[AutomationTeamObjective]
    AUTOMATION_TEAM_OBJECTIVE_NETHER_PROGRESS: _ClassVar[AutomationTeamObjective]
    AUTOMATION_TEAM_OBJECTIVE_STRONGHOLD_HUNT: _ClassVar[AutomationTeamObjective]
    AUTOMATION_TEAM_OBJECTIVE_END_ASSAULT: _ClassVar[AutomationTeamObjective]
    AUTOMATION_TEAM_OBJECTIVE_COMPLETE: _ClassVar[AutomationTeamObjective]

class AutomationGoalMode(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AUTOMATION_GOAL_MODE_UNSPECIFIED: _ClassVar[AutomationGoalMode]
    AUTOMATION_GOAL_MODE_IDLE: _ClassVar[AutomationGoalMode]
    AUTOMATION_GOAL_MODE_ACQUIRE: _ClassVar[AutomationGoalMode]
    AUTOMATION_GOAL_MODE_BEAT: _ClassVar[AutomationGoalMode]

class AutomationBeatPhase(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AUTOMATION_BEAT_PHASE_UNSPECIFIED: _ClassVar[AutomationBeatPhase]
    AUTOMATION_BEAT_PHASE_PREPARE_OVERWORLD: _ClassVar[AutomationBeatPhase]
    AUTOMATION_BEAT_PHASE_ENTER_NETHER: _ClassVar[AutomationBeatPhase]
    AUTOMATION_BEAT_PHASE_NETHER_COLLECTION: _ClassVar[AutomationBeatPhase]
    AUTOMATION_BEAT_PHASE_RETURN_TO_OVERWORLD: _ClassVar[AutomationBeatPhase]
    AUTOMATION_BEAT_PHASE_STRONGHOLD_SEARCH: _ClassVar[AutomationBeatPhase]
    AUTOMATION_BEAT_PHASE_ACTIVATE_PORTAL: _ClassVar[AutomationBeatPhase]
    AUTOMATION_BEAT_PHASE_END_FIGHT: _ClassVar[AutomationBeatPhase]
    AUTOMATION_BEAT_PHASE_COMPLETE: _ClassVar[AutomationBeatPhase]
AUTOMATION_PRESET_UNSPECIFIED: AutomationPreset
AUTOMATION_PRESET_BALANCED_TEAM: AutomationPreset
AUTOMATION_PRESET_INDEPENDENT_RUNNERS: AutomationPreset
AUTOMATION_PRESET_CAUTIOUS_TEAM: AutomationPreset
AUTOMATION_ROLE_POLICY_UNSPECIFIED: AutomationRolePolicy
AUTOMATION_ROLE_POLICY_STATIC_TEAM: AutomationRolePolicy
AUTOMATION_ROLE_POLICY_INDEPENDENT: AutomationRolePolicy
AUTOMATION_TEAM_ROLE_UNSPECIFIED: AutomationTeamRole
AUTOMATION_TEAM_ROLE_LEAD: AutomationTeamRole
AUTOMATION_TEAM_ROLE_PORTAL_ENGINEER: AutomationTeamRole
AUTOMATION_TEAM_ROLE_NETHER_RUNNER: AutomationTeamRole
AUTOMATION_TEAM_ROLE_STRONGHOLD_SCOUT: AutomationTeamRole
AUTOMATION_TEAM_ROLE_END_SUPPORT: AutomationTeamRole
AUTOMATION_TEAM_OBJECTIVE_UNSPECIFIED: AutomationTeamObjective
AUTOMATION_TEAM_OBJECTIVE_BOOTSTRAP: AutomationTeamObjective
AUTOMATION_TEAM_OBJECTIVE_NETHER_PROGRESS: AutomationTeamObjective
AUTOMATION_TEAM_OBJECTIVE_STRONGHOLD_HUNT: AutomationTeamObjective
AUTOMATION_TEAM_OBJECTIVE_END_ASSAULT: AutomationTeamObjective
AUTOMATION_TEAM_OBJECTIVE_COMPLETE: AutomationTeamObjective
AUTOMATION_GOAL_MODE_UNSPECIFIED: AutomationGoalMode
AUTOMATION_GOAL_MODE_IDLE: AutomationGoalMode
AUTOMATION_GOAL_MODE_ACQUIRE: AutomationGoalMode
AUTOMATION_GOAL_MODE_BEAT: AutomationGoalMode
AUTOMATION_BEAT_PHASE_UNSPECIFIED: AutomationBeatPhase
AUTOMATION_BEAT_PHASE_PREPARE_OVERWORLD: AutomationBeatPhase
AUTOMATION_BEAT_PHASE_ENTER_NETHER: AutomationBeatPhase
AUTOMATION_BEAT_PHASE_NETHER_COLLECTION: AutomationBeatPhase
AUTOMATION_BEAT_PHASE_RETURN_TO_OVERWORLD: AutomationBeatPhase
AUTOMATION_BEAT_PHASE_STRONGHOLD_SEARCH: AutomationBeatPhase
AUTOMATION_BEAT_PHASE_ACTIVATE_PORTAL: AutomationBeatPhase
AUTOMATION_BEAT_PHASE_END_FIGHT: AutomationBeatPhase
AUTOMATION_BEAT_PHASE_COMPLETE: AutomationBeatPhase

class AutomationPosition(_message.Message):
    __slots__ = ("x", "y", "z")
    X_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    x: float
    y: float
    z: float
    def __init__(self, x: _Optional[float] = ..., y: _Optional[float] = ..., z: _Optional[float] = ...) -> None: ...

class AutomationRequirementTarget(_message.Message):
    __slots__ = ("requirement_key", "display_name", "count")
    REQUIREMENT_KEY_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    requirement_key: str
    display_name: str
    count: int
    def __init__(self, requirement_key: _Optional[str] = ..., display_name: _Optional[str] = ..., count: _Optional[int] = ...) -> None: ...

class AutomationBotSettings(_message.Message):
    __slots__ = ("enabled", "allow_death_recovery", "memory_scan_radius", "memory_scan_interval_ticks", "retreat_health_threshold", "retreat_food_threshold", "role_override")
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    ALLOW_DEATH_RECOVERY_FIELD_NUMBER: _ClassVar[int]
    MEMORY_SCAN_RADIUS_FIELD_NUMBER: _ClassVar[int]
    MEMORY_SCAN_INTERVAL_TICKS_FIELD_NUMBER: _ClassVar[int]
    RETREAT_HEALTH_THRESHOLD_FIELD_NUMBER: _ClassVar[int]
    RETREAT_FOOD_THRESHOLD_FIELD_NUMBER: _ClassVar[int]
    ROLE_OVERRIDE_FIELD_NUMBER: _ClassVar[int]
    enabled: bool
    allow_death_recovery: bool
    memory_scan_radius: int
    memory_scan_interval_ticks: int
    retreat_health_threshold: int
    retreat_food_threshold: int
    role_override: AutomationTeamRole
    def __init__(self, enabled: bool = ..., allow_death_recovery: bool = ..., memory_scan_radius: _Optional[int] = ..., memory_scan_interval_ticks: _Optional[int] = ..., retreat_health_threshold: _Optional[int] = ..., retreat_food_threshold: _Optional[int] = ..., role_override: _Optional[_Union[AutomationTeamRole, str]] = ...) -> None: ...

class AutomationInstanceSettings(_message.Message):
    __slots__ = ("preset", "team_collaboration", "role_policy", "shared_end_entry", "max_end_bots", "shared_structure_intel", "shared_target_claims", "objective_override", "target_blaze_rods", "target_ender_pearls", "target_ender_eyes", "target_arrows", "target_beds")
    PRESET_FIELD_NUMBER: _ClassVar[int]
    TEAM_COLLABORATION_FIELD_NUMBER: _ClassVar[int]
    ROLE_POLICY_FIELD_NUMBER: _ClassVar[int]
    SHARED_END_ENTRY_FIELD_NUMBER: _ClassVar[int]
    MAX_END_BOTS_FIELD_NUMBER: _ClassVar[int]
    SHARED_STRUCTURE_INTEL_FIELD_NUMBER: _ClassVar[int]
    SHARED_TARGET_CLAIMS_FIELD_NUMBER: _ClassVar[int]
    OBJECTIVE_OVERRIDE_FIELD_NUMBER: _ClassVar[int]
    TARGET_BLAZE_RODS_FIELD_NUMBER: _ClassVar[int]
    TARGET_ENDER_PEARLS_FIELD_NUMBER: _ClassVar[int]
    TARGET_ENDER_EYES_FIELD_NUMBER: _ClassVar[int]
    TARGET_ARROWS_FIELD_NUMBER: _ClassVar[int]
    TARGET_BEDS_FIELD_NUMBER: _ClassVar[int]
    preset: AutomationPreset
    team_collaboration: bool
    role_policy: AutomationRolePolicy
    shared_end_entry: bool
    max_end_bots: int
    shared_structure_intel: bool
    shared_target_claims: bool
    objective_override: AutomationTeamObjective
    target_blaze_rods: int
    target_ender_pearls: int
    target_ender_eyes: int
    target_arrows: int
    target_beds: int
    def __init__(self, preset: _Optional[_Union[AutomationPreset, str]] = ..., team_collaboration: bool = ..., role_policy: _Optional[_Union[AutomationRolePolicy, str]] = ..., shared_end_entry: bool = ..., max_end_bots: _Optional[int] = ..., shared_structure_intel: bool = ..., shared_target_claims: bool = ..., objective_override: _Optional[_Union[AutomationTeamObjective, str]] = ..., target_blaze_rods: _Optional[int] = ..., target_ender_pearls: _Optional[int] = ..., target_ender_eyes: _Optional[int] = ..., target_arrows: _Optional[int] = ..., target_beds: _Optional[int] = ...) -> None: ...

class AutomationResourceQuota(_message.Message):
    __slots__ = ("requirement_key", "display_name", "current_count", "target_count")
    REQUIREMENT_KEY_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    CURRENT_COUNT_FIELD_NUMBER: _ClassVar[int]
    TARGET_COUNT_FIELD_NUMBER: _ClassVar[int]
    requirement_key: str
    display_name: str
    current_count: int
    target_count: int
    def __init__(self, requirement_key: _Optional[str] = ..., display_name: _Optional[str] = ..., current_count: _Optional[int] = ..., target_count: _Optional[int] = ...) -> None: ...

class AutomationBotState(_message.Message):
    __slots__ = ("instance_id", "bot_id", "account_name", "status_summary", "goal_mode", "paused", "beat_phase", "current_action", "target", "team_role", "team_objective", "dimension", "position", "death_count", "timeout_count", "recovery_count", "last_recovery_reason", "last_progress_at", "settings", "queued_targets")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    ACCOUNT_NAME_FIELD_NUMBER: _ClassVar[int]
    STATUS_SUMMARY_FIELD_NUMBER: _ClassVar[int]
    GOAL_MODE_FIELD_NUMBER: _ClassVar[int]
    PAUSED_FIELD_NUMBER: _ClassVar[int]
    BEAT_PHASE_FIELD_NUMBER: _ClassVar[int]
    CURRENT_ACTION_FIELD_NUMBER: _ClassVar[int]
    TARGET_FIELD_NUMBER: _ClassVar[int]
    TEAM_ROLE_FIELD_NUMBER: _ClassVar[int]
    TEAM_OBJECTIVE_FIELD_NUMBER: _ClassVar[int]
    DIMENSION_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    DEATH_COUNT_FIELD_NUMBER: _ClassVar[int]
    TIMEOUT_COUNT_FIELD_NUMBER: _ClassVar[int]
    RECOVERY_COUNT_FIELD_NUMBER: _ClassVar[int]
    LAST_RECOVERY_REASON_FIELD_NUMBER: _ClassVar[int]
    LAST_PROGRESS_AT_FIELD_NUMBER: _ClassVar[int]
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    QUEUED_TARGETS_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    account_name: str
    status_summary: str
    goal_mode: AutomationGoalMode
    paused: bool
    beat_phase: AutomationBeatPhase
    current_action: str
    target: AutomationRequirementTarget
    team_role: AutomationTeamRole
    team_objective: AutomationTeamObjective
    dimension: str
    position: AutomationPosition
    death_count: int
    timeout_count: int
    recovery_count: int
    last_recovery_reason: str
    last_progress_at: _timestamp_pb2.Timestamp
    settings: AutomationBotSettings
    queued_targets: _containers.RepeatedCompositeFieldContainer[AutomationRequirementTarget]
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., account_name: _Optional[str] = ..., status_summary: _Optional[str] = ..., goal_mode: _Optional[_Union[AutomationGoalMode, str]] = ..., paused: bool = ..., beat_phase: _Optional[_Union[AutomationBeatPhase, str]] = ..., current_action: _Optional[str] = ..., target: _Optional[_Union[AutomationRequirementTarget, _Mapping]] = ..., team_role: _Optional[_Union[AutomationTeamRole, str]] = ..., team_objective: _Optional[_Union[AutomationTeamObjective, str]] = ..., dimension: _Optional[str] = ..., position: _Optional[_Union[AutomationPosition, _Mapping]] = ..., death_count: _Optional[int] = ..., timeout_count: _Optional[int] = ..., recovery_count: _Optional[int] = ..., last_recovery_reason: _Optional[str] = ..., last_progress_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., settings: _Optional[_Union[AutomationBotSettings, _Mapping]] = ..., queued_targets: _Optional[_Iterable[_Union[AutomationRequirementTarget, _Mapping]]] = ...) -> None: ...

class AutomationTeamState(_message.Message):
    __slots__ = ("instance_id", "friendly_name", "settings", "objective", "active_bots", "quotas", "bots")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    FRIENDLY_NAME_FIELD_NUMBER: _ClassVar[int]
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    OBJECTIVE_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_BOTS_FIELD_NUMBER: _ClassVar[int]
    QUOTAS_FIELD_NUMBER: _ClassVar[int]
    BOTS_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    friendly_name: str
    settings: AutomationInstanceSettings
    objective: AutomationTeamObjective
    active_bots: int
    quotas: _containers.RepeatedCompositeFieldContainer[AutomationResourceQuota]
    bots: _containers.RepeatedCompositeFieldContainer[AutomationBotState]
    def __init__(self, instance_id: _Optional[str] = ..., friendly_name: _Optional[str] = ..., settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ..., objective: _Optional[_Union[AutomationTeamObjective, str]] = ..., active_bots: _Optional[int] = ..., quotas: _Optional[_Iterable[_Union[AutomationResourceQuota, _Mapping]]] = ..., bots: _Optional[_Iterable[_Union[AutomationBotState, _Mapping]]] = ...) -> None: ...

class AutomationCoordinationSharedBlock(_message.Message):
    __slots__ = ("observer_bot_id", "observer_account_name", "dimension", "x", "y", "z", "block_id", "last_seen_at")
    OBSERVER_BOT_ID_FIELD_NUMBER: _ClassVar[int]
    OBSERVER_ACCOUNT_NAME_FIELD_NUMBER: _ClassVar[int]
    DIMENSION_FIELD_NUMBER: _ClassVar[int]
    X_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    BLOCK_ID_FIELD_NUMBER: _ClassVar[int]
    LAST_SEEN_AT_FIELD_NUMBER: _ClassVar[int]
    observer_bot_id: str
    observer_account_name: str
    dimension: str
    x: int
    y: int
    z: int
    block_id: str
    last_seen_at: _timestamp_pb2.Timestamp
    def __init__(self, observer_bot_id: _Optional[str] = ..., observer_account_name: _Optional[str] = ..., dimension: _Optional[str] = ..., x: _Optional[int] = ..., y: _Optional[int] = ..., z: _Optional[int] = ..., block_id: _Optional[str] = ..., last_seen_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class AutomationCoordinationClaim(_message.Message):
    __slots__ = ("key", "owner_bot_id", "owner_account_name", "target", "expires_at")
    KEY_FIELD_NUMBER: _ClassVar[int]
    OWNER_BOT_ID_FIELD_NUMBER: _ClassVar[int]
    OWNER_ACCOUNT_NAME_FIELD_NUMBER: _ClassVar[int]
    TARGET_FIELD_NUMBER: _ClassVar[int]
    EXPIRES_AT_FIELD_NUMBER: _ClassVar[int]
    key: str
    owner_bot_id: str
    owner_account_name: str
    target: AutomationPosition
    expires_at: _timestamp_pb2.Timestamp
    def __init__(self, key: _Optional[str] = ..., owner_bot_id: _Optional[str] = ..., owner_account_name: _Optional[str] = ..., target: _Optional[_Union[AutomationPosition, _Mapping]] = ..., expires_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class AutomationCoordinationEyeSample(_message.Message):
    __slots__ = ("bot_id", "account_name", "origin", "direction", "recorded_at")
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    ACCOUNT_NAME_FIELD_NUMBER: _ClassVar[int]
    ORIGIN_FIELD_NUMBER: _ClassVar[int]
    DIRECTION_FIELD_NUMBER: _ClassVar[int]
    RECORDED_AT_FIELD_NUMBER: _ClassVar[int]
    bot_id: str
    account_name: str
    origin: AutomationPosition
    direction: AutomationPosition
    recorded_at: _timestamp_pb2.Timestamp
    def __init__(self, bot_id: _Optional[str] = ..., account_name: _Optional[str] = ..., origin: _Optional[_Union[AutomationPosition, _Mapping]] = ..., direction: _Optional[_Union[AutomationPosition, _Mapping]] = ..., recorded_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class AutomationSharedRequirementCount(_message.Message):
    __slots__ = ("requirement_key", "display_name", "current_count", "target_count")
    REQUIREMENT_KEY_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    CURRENT_COUNT_FIELD_NUMBER: _ClassVar[int]
    TARGET_COUNT_FIELD_NUMBER: _ClassVar[int]
    requirement_key: str
    display_name: str
    current_count: int
    target_count: int
    def __init__(self, requirement_key: _Optional[str] = ..., display_name: _Optional[str] = ..., current_count: _Optional[int] = ..., target_count: _Optional[int] = ...) -> None: ...

class AutomationCoordinationState(_message.Message):
    __slots__ = ("instance_id", "friendly_name", "settings", "objective", "active_bots", "shared_block_count", "claim_count", "eye_sample_count", "shared_counts", "shared_blocks", "claims", "eye_samples")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    FRIENDLY_NAME_FIELD_NUMBER: _ClassVar[int]
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    OBJECTIVE_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_BOTS_FIELD_NUMBER: _ClassVar[int]
    SHARED_BLOCK_COUNT_FIELD_NUMBER: _ClassVar[int]
    CLAIM_COUNT_FIELD_NUMBER: _ClassVar[int]
    EYE_SAMPLE_COUNT_FIELD_NUMBER: _ClassVar[int]
    SHARED_COUNTS_FIELD_NUMBER: _ClassVar[int]
    SHARED_BLOCKS_FIELD_NUMBER: _ClassVar[int]
    CLAIMS_FIELD_NUMBER: _ClassVar[int]
    EYE_SAMPLES_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    friendly_name: str
    settings: AutomationInstanceSettings
    objective: AutomationTeamObjective
    active_bots: int
    shared_block_count: int
    claim_count: int
    eye_sample_count: int
    shared_counts: _containers.RepeatedCompositeFieldContainer[AutomationSharedRequirementCount]
    shared_blocks: _containers.RepeatedCompositeFieldContainer[AutomationCoordinationSharedBlock]
    claims: _containers.RepeatedCompositeFieldContainer[AutomationCoordinationClaim]
    eye_samples: _containers.RepeatedCompositeFieldContainer[AutomationCoordinationEyeSample]
    def __init__(self, instance_id: _Optional[str] = ..., friendly_name: _Optional[str] = ..., settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ..., objective: _Optional[_Union[AutomationTeamObjective, str]] = ..., active_bots: _Optional[int] = ..., shared_block_count: _Optional[int] = ..., claim_count: _Optional[int] = ..., eye_sample_count: _Optional[int] = ..., shared_counts: _Optional[_Iterable[_Union[AutomationSharedRequirementCount, _Mapping]]] = ..., shared_blocks: _Optional[_Iterable[_Union[AutomationCoordinationSharedBlock, _Mapping]]] = ..., claims: _Optional[_Iterable[_Union[AutomationCoordinationClaim, _Mapping]]] = ..., eye_samples: _Optional[_Iterable[_Union[AutomationCoordinationEyeSample, _Mapping]]] = ...) -> None: ...

class AutomationMemoryBlock(_message.Message):
    __slots__ = ("x", "y", "z", "block_id", "last_seen_tick")
    X_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    BLOCK_ID_FIELD_NUMBER: _ClassVar[int]
    LAST_SEEN_TICK_FIELD_NUMBER: _ClassVar[int]
    x: int
    y: int
    z: int
    block_id: str
    last_seen_tick: int
    def __init__(self, x: _Optional[int] = ..., y: _Optional[int] = ..., z: _Optional[int] = ..., block_id: _Optional[str] = ..., last_seen_tick: _Optional[int] = ...) -> None: ...

class AutomationMemoryContainer(_message.Message):
    __slots__ = ("x", "y", "z", "block_id", "inspected", "distinct_item_kinds", "total_item_count", "last_seen_tick")
    X_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    BLOCK_ID_FIELD_NUMBER: _ClassVar[int]
    INSPECTED_FIELD_NUMBER: _ClassVar[int]
    DISTINCT_ITEM_KINDS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_ITEM_COUNT_FIELD_NUMBER: _ClassVar[int]
    LAST_SEEN_TICK_FIELD_NUMBER: _ClassVar[int]
    x: int
    y: int
    z: int
    block_id: str
    inspected: bool
    distinct_item_kinds: int
    total_item_count: int
    last_seen_tick: int
    def __init__(self, x: _Optional[int] = ..., y: _Optional[int] = ..., z: _Optional[int] = ..., block_id: _Optional[str] = ..., inspected: bool = ..., distinct_item_kinds: _Optional[int] = ..., total_item_count: _Optional[int] = ..., last_seen_tick: _Optional[int] = ...) -> None: ...

class AutomationMemoryEntity(_message.Message):
    __slots__ = ("entity_id", "entity_type", "position", "last_seen_tick")
    ENTITY_ID_FIELD_NUMBER: _ClassVar[int]
    ENTITY_TYPE_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    LAST_SEEN_TICK_FIELD_NUMBER: _ClassVar[int]
    entity_id: str
    entity_type: str
    position: AutomationPosition
    last_seen_tick: int
    def __init__(self, entity_id: _Optional[str] = ..., entity_type: _Optional[str] = ..., position: _Optional[_Union[AutomationPosition, _Mapping]] = ..., last_seen_tick: _Optional[int] = ...) -> None: ...

class AutomationMemoryDroppedItem(_message.Message):
    __slots__ = ("entity_id", "item_id", "count", "position", "last_seen_tick")
    ENTITY_ID_FIELD_NUMBER: _ClassVar[int]
    ITEM_ID_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    LAST_SEEN_TICK_FIELD_NUMBER: _ClassVar[int]
    entity_id: str
    item_id: str
    count: int
    position: AutomationPosition
    last_seen_tick: int
    def __init__(self, entity_id: _Optional[str] = ..., item_id: _Optional[str] = ..., count: _Optional[int] = ..., position: _Optional[_Union[AutomationPosition, _Mapping]] = ..., last_seen_tick: _Optional[int] = ...) -> None: ...

class AutomationMemoryUnreachablePosition(_message.Message):
    __slots__ = ("x", "y", "z", "until_tick")
    X_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    UNTIL_TICK_FIELD_NUMBER: _ClassVar[int]
    x: int
    y: int
    z: int
    until_tick: int
    def __init__(self, x: _Optional[int] = ..., y: _Optional[int] = ..., z: _Optional[int] = ..., until_tick: _Optional[int] = ...) -> None: ...

class AutomationMemoryState(_message.Message):
    __slots__ = ("instance_id", "bot_id", "account_name", "tick", "remembered_block_count", "remembered_container_count", "remembered_entity_count", "remembered_dropped_item_count", "unreachable_position_count", "blocks", "containers", "entities", "dropped_items", "unreachable_positions")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    ACCOUNT_NAME_FIELD_NUMBER: _ClassVar[int]
    TICK_FIELD_NUMBER: _ClassVar[int]
    REMEMBERED_BLOCK_COUNT_FIELD_NUMBER: _ClassVar[int]
    REMEMBERED_CONTAINER_COUNT_FIELD_NUMBER: _ClassVar[int]
    REMEMBERED_ENTITY_COUNT_FIELD_NUMBER: _ClassVar[int]
    REMEMBERED_DROPPED_ITEM_COUNT_FIELD_NUMBER: _ClassVar[int]
    UNREACHABLE_POSITION_COUNT_FIELD_NUMBER: _ClassVar[int]
    BLOCKS_FIELD_NUMBER: _ClassVar[int]
    CONTAINERS_FIELD_NUMBER: _ClassVar[int]
    ENTITIES_FIELD_NUMBER: _ClassVar[int]
    DROPPED_ITEMS_FIELD_NUMBER: _ClassVar[int]
    UNREACHABLE_POSITIONS_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    account_name: str
    tick: int
    remembered_block_count: int
    remembered_container_count: int
    remembered_entity_count: int
    remembered_dropped_item_count: int
    unreachable_position_count: int
    blocks: _containers.RepeatedCompositeFieldContainer[AutomationMemoryBlock]
    containers: _containers.RepeatedCompositeFieldContainer[AutomationMemoryContainer]
    entities: _containers.RepeatedCompositeFieldContainer[AutomationMemoryEntity]
    dropped_items: _containers.RepeatedCompositeFieldContainer[AutomationMemoryDroppedItem]
    unreachable_positions: _containers.RepeatedCompositeFieldContainer[AutomationMemoryUnreachablePosition]
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., account_name: _Optional[str] = ..., tick: _Optional[int] = ..., remembered_block_count: _Optional[int] = ..., remembered_container_count: _Optional[int] = ..., remembered_entity_count: _Optional[int] = ..., remembered_dropped_item_count: _Optional[int] = ..., unreachable_position_count: _Optional[int] = ..., blocks: _Optional[_Iterable[_Union[AutomationMemoryBlock, _Mapping]]] = ..., containers: _Optional[_Iterable[_Union[AutomationMemoryContainer, _Mapping]]] = ..., entities: _Optional[_Iterable[_Union[AutomationMemoryEntity, _Mapping]]] = ..., dropped_items: _Optional[_Iterable[_Union[AutomationMemoryDroppedItem, _Mapping]]] = ..., unreachable_positions: _Optional[_Iterable[_Union[AutomationMemoryUnreachablePosition, _Mapping]]] = ...) -> None: ...

class GetAutomationTeamStateRequest(_message.Message):
    __slots__ = ("instance_id",)
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    def __init__(self, instance_id: _Optional[str] = ...) -> None: ...

class GetAutomationTeamStateResponse(_message.Message):
    __slots__ = ("state",)
    STATE_FIELD_NUMBER: _ClassVar[int]
    state: AutomationTeamState
    def __init__(self, state: _Optional[_Union[AutomationTeamState, _Mapping]] = ...) -> None: ...

class GetAutomationCoordinationStateRequest(_message.Message):
    __slots__ = ("instance_id", "max_entries")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    MAX_ENTRIES_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    max_entries: int
    def __init__(self, instance_id: _Optional[str] = ..., max_entries: _Optional[int] = ...) -> None: ...

class GetAutomationCoordinationStateResponse(_message.Message):
    __slots__ = ("state",)
    STATE_FIELD_NUMBER: _ClassVar[int]
    state: AutomationCoordinationState
    def __init__(self, state: _Optional[_Union[AutomationCoordinationState, _Mapping]] = ...) -> None: ...

class GetAutomationBotStateRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ...) -> None: ...

class GetAutomationBotStateResponse(_message.Message):
    __slots__ = ("state",)
    STATE_FIELD_NUMBER: _ClassVar[int]
    state: AutomationBotState
    def __init__(self, state: _Optional[_Union[AutomationBotState, _Mapping]] = ...) -> None: ...

class GetAutomationMemoryStateRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "max_entries")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    MAX_ENTRIES_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    max_entries: int
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., max_entries: _Optional[int] = ...) -> None: ...

class GetAutomationMemoryStateResponse(_message.Message):
    __slots__ = ("state",)
    STATE_FIELD_NUMBER: _ClassVar[int]
    state: AutomationMemoryState
    def __init__(self, state: _Optional[_Union[AutomationMemoryState, _Mapping]] = ...) -> None: ...

class AutomationBotActionResult(_message.Message):
    __slots__ = ("bot_id", "account_name", "success", "message")
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    ACCOUNT_NAME_FIELD_NUMBER: _ClassVar[int]
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    bot_id: str
    account_name: str
    success: bool
    message: str
    def __init__(self, bot_id: _Optional[str] = ..., account_name: _Optional[str] = ..., success: bool = ..., message: _Optional[str] = ...) -> None: ...

class AutomationActionRequest(_message.Message):
    __slots__ = ("instance_id", "bot_ids")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_IDS_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, instance_id: _Optional[str] = ..., bot_ids: _Optional[_Iterable[str]] = ...) -> None: ...

class StartAutomationAcquireRequest(_message.Message):
    __slots__ = ("instance_id", "bot_ids", "target", "count")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_IDS_FIELD_NUMBER: _ClassVar[int]
    TARGET_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_ids: _containers.RepeatedScalarFieldContainer[str]
    target: str
    count: int
    def __init__(self, instance_id: _Optional[str] = ..., bot_ids: _Optional[_Iterable[str]] = ..., target: _Optional[str] = ..., count: _Optional[int] = ...) -> None: ...

class AutomationActionResponse(_message.Message):
    __slots__ = ("results",)
    RESULTS_FIELD_NUMBER: _ClassVar[int]
    results: _containers.RepeatedCompositeFieldContainer[AutomationBotActionResult]
    def __init__(self, results: _Optional[_Iterable[_Union[AutomationBotActionResult, _Mapping]]] = ...) -> None: ...

class ResetAutomationMemoryRequest(_message.Message):
    __slots__ = ("instance_id", "bot_ids")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_IDS_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, instance_id: _Optional[str] = ..., bot_ids: _Optional[_Iterable[str]] = ...) -> None: ...

class ResetAutomationMemoryResponse(_message.Message):
    __slots__ = ("results",)
    RESULTS_FIELD_NUMBER: _ClassVar[int]
    results: _containers.RepeatedCompositeFieldContainer[AutomationBotActionResult]
    def __init__(self, results: _Optional[_Iterable[_Union[AutomationBotActionResult, _Mapping]]] = ...) -> None: ...

class ResetAutomationCoordinationStateRequest(_message.Message):
    __slots__ = ("instance_id",)
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    def __init__(self, instance_id: _Optional[str] = ...) -> None: ...

class ResetAutomationCoordinationStateResponse(_message.Message):
    __slots__ = ("state",)
    STATE_FIELD_NUMBER: _ClassVar[int]
    state: AutomationCoordinationState
    def __init__(self, state: _Optional[_Union[AutomationCoordinationState, _Mapping]] = ...) -> None: ...

class ReleaseAutomationClaimRequest(_message.Message):
    __slots__ = ("instance_id", "key")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    KEY_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    key: str
    def __init__(self, instance_id: _Optional[str] = ..., key: _Optional[str] = ...) -> None: ...

class ReleaseAutomationClaimResponse(_message.Message):
    __slots__ = ("released", "state")
    RELEASED_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    released: bool
    state: AutomationCoordinationState
    def __init__(self, released: bool = ..., state: _Optional[_Union[AutomationCoordinationState, _Mapping]] = ...) -> None: ...

class ReleaseAutomationBotClaimsRequest(_message.Message):
    __slots__ = ("instance_id", "bot_ids")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_IDS_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, instance_id: _Optional[str] = ..., bot_ids: _Optional[_Iterable[str]] = ...) -> None: ...

class ReleaseAutomationBotClaimsResponse(_message.Message):
    __slots__ = ("results", "state")
    RESULTS_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    results: _containers.RepeatedCompositeFieldContainer[AutomationBotActionResult]
    state: AutomationCoordinationState
    def __init__(self, results: _Optional[_Iterable[_Union[AutomationBotActionResult, _Mapping]]] = ..., state: _Optional[_Union[AutomationCoordinationState, _Mapping]] = ...) -> None: ...

class ApplyAutomationPresetRequest(_message.Message):
    __slots__ = ("instance_id", "bot_ids", "preset")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_IDS_FIELD_NUMBER: _ClassVar[int]
    PRESET_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_ids: _containers.RepeatedScalarFieldContainer[str]
    preset: AutomationPreset
    def __init__(self, instance_id: _Optional[str] = ..., bot_ids: _Optional[_Iterable[str]] = ..., preset: _Optional[_Union[AutomationPreset, str]] = ...) -> None: ...

class ApplyAutomationPresetResponse(_message.Message):
    __slots__ = ("settings", "results")
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    RESULTS_FIELD_NUMBER: _ClassVar[int]
    settings: AutomationInstanceSettings
    results: _containers.RepeatedCompositeFieldContainer[AutomationBotActionResult]
    def __init__(self, settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ..., results: _Optional[_Iterable[_Union[AutomationBotActionResult, _Mapping]]] = ...) -> None: ...

class SetAutomationCollaborationRequest(_message.Message):
    __slots__ = ("instance_id", "enabled")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    enabled: bool
    def __init__(self, instance_id: _Optional[str] = ..., enabled: bool = ...) -> None: ...

class SetAutomationCollaborationResponse(_message.Message):
    __slots__ = ("settings",)
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    settings: AutomationInstanceSettings
    def __init__(self, settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ...) -> None: ...

class SetAutomationRolePolicyRequest(_message.Message):
    __slots__ = ("instance_id", "role_policy")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    ROLE_POLICY_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    role_policy: AutomationRolePolicy
    def __init__(self, instance_id: _Optional[str] = ..., role_policy: _Optional[_Union[AutomationRolePolicy, str]] = ...) -> None: ...

class SetAutomationRolePolicyResponse(_message.Message):
    __slots__ = ("settings",)
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    settings: AutomationInstanceSettings
    def __init__(self, settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ...) -> None: ...

class SetAutomationSharedStructuresRequest(_message.Message):
    __slots__ = ("instance_id", "enabled")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    enabled: bool
    def __init__(self, instance_id: _Optional[str] = ..., enabled: bool = ...) -> None: ...

class SetAutomationSharedStructuresResponse(_message.Message):
    __slots__ = ("settings",)
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    settings: AutomationInstanceSettings
    def __init__(self, settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ...) -> None: ...

class SetAutomationSharedClaimsRequest(_message.Message):
    __slots__ = ("instance_id", "enabled")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    enabled: bool
    def __init__(self, instance_id: _Optional[str] = ..., enabled: bool = ...) -> None: ...

class SetAutomationSharedClaimsResponse(_message.Message):
    __slots__ = ("settings",)
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    settings: AutomationInstanceSettings
    def __init__(self, settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ...) -> None: ...

class SetAutomationSharedEndEntryRequest(_message.Message):
    __slots__ = ("instance_id", "enabled")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    enabled: bool
    def __init__(self, instance_id: _Optional[str] = ..., enabled: bool = ...) -> None: ...

class SetAutomationSharedEndEntryResponse(_message.Message):
    __slots__ = ("settings",)
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    settings: AutomationInstanceSettings
    def __init__(self, settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ...) -> None: ...

class SetAutomationMaxEndBotsRequest(_message.Message):
    __slots__ = ("instance_id", "max_end_bots")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    MAX_END_BOTS_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    max_end_bots: int
    def __init__(self, instance_id: _Optional[str] = ..., max_end_bots: _Optional[int] = ...) -> None: ...

class SetAutomationMaxEndBotsResponse(_message.Message):
    __slots__ = ("settings",)
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    settings: AutomationInstanceSettings
    def __init__(self, settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ...) -> None: ...

class SetAutomationQuotaOverrideRequest(_message.Message):
    __slots__ = ("instance_id", "requirement_key", "target_count")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    REQUIREMENT_KEY_FIELD_NUMBER: _ClassVar[int]
    TARGET_COUNT_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    requirement_key: str
    target_count: int
    def __init__(self, instance_id: _Optional[str] = ..., requirement_key: _Optional[str] = ..., target_count: _Optional[int] = ...) -> None: ...

class SetAutomationQuotaOverrideResponse(_message.Message):
    __slots__ = ("settings",)
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    settings: AutomationInstanceSettings
    def __init__(self, settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ...) -> None: ...

class SetAutomationObjectiveOverrideRequest(_message.Message):
    __slots__ = ("instance_id", "objective")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    OBJECTIVE_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    objective: AutomationTeamObjective
    def __init__(self, instance_id: _Optional[str] = ..., objective: _Optional[_Union[AutomationTeamObjective, str]] = ...) -> None: ...

class SetAutomationObjectiveOverrideResponse(_message.Message):
    __slots__ = ("settings",)
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    settings: AutomationInstanceSettings
    def __init__(self, settings: _Optional[_Union[AutomationInstanceSettings, _Mapping]] = ...) -> None: ...

class SetAutomationRoleOverrideRequest(_message.Message):
    __slots__ = ("instance_id", "bot_ids", "role")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_IDS_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_ids: _containers.RepeatedScalarFieldContainer[str]
    role: AutomationTeamRole
    def __init__(self, instance_id: _Optional[str] = ..., bot_ids: _Optional[_Iterable[str]] = ..., role: _Optional[_Union[AutomationTeamRole, str]] = ...) -> None: ...

class SetAutomationRoleOverrideResponse(_message.Message):
    __slots__ = ("results",)
    RESULTS_FIELD_NUMBER: _ClassVar[int]
    results: _containers.RepeatedCompositeFieldContainer[AutomationBotActionResult]
    def __init__(self, results: _Optional[_Iterable[_Union[AutomationBotActionResult, _Mapping]]] = ...) -> None: ...

class UpdateAutomationBotSettingsRequest(_message.Message):
    __slots__ = ("instance_id", "bot_ids", "enabled", "allow_death_recovery", "memory_scan_radius", "memory_scan_interval_ticks", "retreat_health_threshold", "retreat_food_threshold", "role_override")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_IDS_FIELD_NUMBER: _ClassVar[int]
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    ALLOW_DEATH_RECOVERY_FIELD_NUMBER: _ClassVar[int]
    MEMORY_SCAN_RADIUS_FIELD_NUMBER: _ClassVar[int]
    MEMORY_SCAN_INTERVAL_TICKS_FIELD_NUMBER: _ClassVar[int]
    RETREAT_HEALTH_THRESHOLD_FIELD_NUMBER: _ClassVar[int]
    RETREAT_FOOD_THRESHOLD_FIELD_NUMBER: _ClassVar[int]
    ROLE_OVERRIDE_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_ids: _containers.RepeatedScalarFieldContainer[str]
    enabled: bool
    allow_death_recovery: bool
    memory_scan_radius: int
    memory_scan_interval_ticks: int
    retreat_health_threshold: int
    retreat_food_threshold: int
    role_override: AutomationTeamRole
    def __init__(self, instance_id: _Optional[str] = ..., bot_ids: _Optional[_Iterable[str]] = ..., enabled: bool = ..., allow_death_recovery: bool = ..., memory_scan_radius: _Optional[int] = ..., memory_scan_interval_ticks: _Optional[int] = ..., retreat_health_threshold: _Optional[int] = ..., retreat_food_threshold: _Optional[int] = ..., role_override: _Optional[_Union[AutomationTeamRole, str]] = ...) -> None: ...

class UpdateAutomationBotSettingsResponse(_message.Message):
    __slots__ = ("results",)
    RESULTS_FIELD_NUMBER: _ClassVar[int]
    results: _containers.RepeatedCompositeFieldContainer[AutomationBotActionResult]
    def __init__(self, results: _Optional[_Iterable[_Union[AutomationBotActionResult, _Mapping]]] = ...) -> None: ...
