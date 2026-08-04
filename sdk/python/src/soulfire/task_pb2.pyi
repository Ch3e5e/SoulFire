import datetime

from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf import any_pb2 as _any_pb2
from google.protobuf import timestamp_pb2 as _timestamp_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from soulfire import bot_live_pb2 as _bot_live_pb2
from soulfire import common_pb2 as _common_pb2
from soulfire import domain_pb2 as _domain_pb2
from soulfire import inventory_pb2 as _inventory_pb2
from soulfire import world_pb2 as _world_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class BotTaskResource(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BOT_TASK_RESOURCE_UNSPECIFIED: _ClassVar[BotTaskResource]
    BOT_TASK_RESOURCE_MOVEMENT: _ClassVar[BotTaskResource]
    BOT_TASK_RESOURCE_ROTATION: _ClassVar[BotTaskResource]
    BOT_TASK_RESOURCE_MAIN_HAND: _ClassVar[BotTaskResource]
    BOT_TASK_RESOURCE_OFF_HAND: _ClassVar[BotTaskResource]
    BOT_TASK_RESOURCE_INVENTORY: _ClassVar[BotTaskResource]
    BOT_TASK_RESOURCE_CONTAINER: _ClassVar[BotTaskResource]
    BOT_TASK_RESOURCE_CHAT: _ClassVar[BotTaskResource]
    BOT_TASK_RESOURCE_VEHICLE: _ClassVar[BotTaskResource]
    BOT_TASK_RESOURCE_CAMERA: _ClassVar[BotTaskResource]
    BOT_TASK_RESOURCE_PROTOCOL: _ClassVar[BotTaskResource]

class BotTaskStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BOT_TASK_STATUS_UNSPECIFIED: _ClassVar[BotTaskStatus]
    BOT_TASK_STATUS_QUEUED: _ClassVar[BotTaskStatus]
    BOT_TASK_STATUS_WAITING_FOR_RESOURCES: _ClassVar[BotTaskStatus]
    BOT_TASK_STATUS_RUNNING: _ClassVar[BotTaskStatus]
    BOT_TASK_STATUS_SUSPENDED: _ClassVar[BotTaskStatus]
    BOT_TASK_STATUS_RECOVERING: _ClassVar[BotTaskStatus]
    BOT_TASK_STATUS_COMPLETED: _ClassVar[BotTaskStatus]
    BOT_TASK_STATUS_CANCELLED: _ClassVar[BotTaskStatus]
    BOT_TASK_STATUS_FAILED: _ClassVar[BotTaskStatus]
    BOT_TASK_STATUS_TIMED_OUT: _ClassVar[BotTaskStatus]

class BotTaskConflictPolicy(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BOT_TASK_CONFLICT_POLICY_UNSPECIFIED: _ClassVar[BotTaskConflictPolicy]
    BOT_TASK_CONFLICT_POLICY_REJECT: _ClassVar[BotTaskConflictPolicy]
    BOT_TASK_CONFLICT_POLICY_QUEUE: _ClassVar[BotTaskConflictPolicy]
    BOT_TASK_CONFLICT_POLICY_REPLACE: _ClassVar[BotTaskConflictPolicy]
    BOT_TASK_CONFLICT_POLICY_SUSPEND_LOWER_PRIORITY: _ClassVar[BotTaskConflictPolicy]

class BotTaskReconnectPolicy(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BOT_TASK_RECONNECT_POLICY_UNSPECIFIED: _ClassVar[BotTaskReconnectPolicy]
    BOT_TASK_RECONNECT_POLICY_FAIL: _ClassVar[BotTaskReconnectPolicy]
    BOT_TASK_RECONNECT_POLICY_PAUSE_AND_RESUME: _ClassVar[BotTaskReconnectPolicy]
    BOT_TASK_RECONNECT_POLICY_CONTINUE: _ClassVar[BotTaskReconnectPolicy]

class BotTaskDisconnectPolicy(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BOT_TASK_DISCONNECT_POLICY_UNSPECIFIED: _ClassVar[BotTaskDisconnectPolicy]
    BOT_TASK_DISCONNECT_POLICY_CONTINUE: _ClassVar[BotTaskDisconnectPolicy]
    BOT_TASK_DISCONNECT_POLICY_CANCEL_WITH_CALL: _ClassVar[BotTaskDisconnectPolicy]

class BotTaskPriority(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BOT_TASK_PRIORITY_UNSPECIFIED: _ClassVar[BotTaskPriority]
    BOT_TASK_PRIORITY_LOW: _ClassVar[BotTaskPriority]
    BOT_TASK_PRIORITY_NORMAL: _ClassVar[BotTaskPriority]
    BOT_TASK_PRIORITY_HIGH: _ClassVar[BotTaskPriority]
    BOT_TASK_PRIORITY_CRITICAL: _ClassVar[BotTaskPriority]

class FollowEntityCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    FOLLOW_ENTITY_COMPLETION_REASON_UNSPECIFIED: _ClassVar[FollowEntityCompletionReason]
    FOLLOW_ENTITY_COMPLETION_REASON_TARGET_UNAVAILABLE: _ClassVar[FollowEntityCompletionReason]

class AttackEntityCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ATTACK_ENTITY_COMPLETION_REASON_UNSPECIFIED: _ClassVar[AttackEntityCompletionReason]
    ATTACK_ENTITY_COMPLETION_REASON_TARGET_DEFEATED: _ClassVar[AttackEntityCompletionReason]
    ATTACK_ENTITY_COMPLETION_REASON_TARGET_UNAVAILABLE: _ClassVar[AttackEntityCompletionReason]
    ATTACK_ENTITY_COMPLETION_REASON_ATTACK_LIMIT_REACHED: _ClassVar[AttackEntityCompletionReason]

class AttackNearestCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ATTACK_NEAREST_COMPLETION_REASON_UNSPECIFIED: _ClassVar[AttackNearestCompletionReason]
    ATTACK_NEAREST_COMPLETION_REASON_TARGET_LIMIT_REACHED: _ClassVar[AttackNearestCompletionReason]
    ATTACK_NEAREST_COMPLETION_REASON_ATTACK_LIMIT_REACHED: _ClassVar[AttackNearestCompletionReason]
    ATTACK_NEAREST_COMPLETION_REASON_NO_TARGET: _ClassVar[AttackNearestCompletionReason]

class RangedAttackCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    RANGED_ATTACK_COMPLETION_REASON_UNSPECIFIED: _ClassVar[RangedAttackCompletionReason]
    RANGED_ATTACK_COMPLETION_REASON_TARGET_DEFEATED: _ClassVar[RangedAttackCompletionReason]
    RANGED_ATTACK_COMPLETION_REASON_TARGET_UNAVAILABLE: _ClassVar[RangedAttackCompletionReason]
    RANGED_ATTACK_COMPLETION_REASON_SHOT_LIMIT_REACHED: _ClassVar[RangedAttackCompletionReason]
    RANGED_ATTACK_COMPLETION_REASON_NO_WEAPON: _ClassVar[RangedAttackCompletionReason]
    RANGED_ATTACK_COMPLETION_REASON_NO_AMMUNITION: _ClassVar[RangedAttackCompletionReason]

class FleeCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    FLEE_COMPLETION_REASON_UNSPECIFIED: _ClassVar[FleeCompletionReason]
    FLEE_COMPLETION_REASON_SAFE: _ClassVar[FleeCompletionReason]
    FLEE_COMPLETION_REASON_ESCAPE_LIMIT_REACHED: _ClassVar[FleeCompletionReason]

class GuardCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    GUARD_COMPLETION_REASON_UNSPECIFIED: _ClassVar[GuardCompletionReason]
    GUARD_COMPLETION_REASON_AREA_CLEAR: _ClassVar[GuardCompletionReason]
    GUARD_COMPLETION_REASON_TARGET_LIMIT_REACHED: _ClassVar[GuardCompletionReason]
    GUARD_COMPLETION_REASON_ATTACK_LIMIT_REACHED: _ClassVar[GuardCompletionReason]
    GUARD_COMPLETION_REASON_SUBJECT_UNAVAILABLE: _ClassVar[GuardCompletionReason]

class SleepCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    SLEEP_COMPLETION_REASON_UNSPECIFIED: _ClassVar[SleepCompletionReason]
    SLEEP_COMPLETION_REASON_SLEEPING: _ClassVar[SleepCompletionReason]
    SLEEP_COMPLETION_REASON_ALREADY_SLEEPING: _ClassVar[SleepCompletionReason]
    SLEEP_COMPLETION_REASON_NO_BED_FOUND: _ClassVar[SleepCompletionReason]

class FishCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    FISH_COMPLETION_REASON_UNSPECIFIED: _ClassVar[FishCompletionReason]
    FISH_COMPLETION_REASON_CATCH_LIMIT_REACHED: _ClassVar[FishCompletionReason]
    FISH_COMPLETION_REASON_NO_ROD: _ClassVar[FishCompletionReason]
    FISH_COMPLETION_REASON_FAILED_CAST_LIMIT_REACHED: _ClassVar[FishCompletionReason]

class FarmCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    FARM_COMPLETION_REASON_UNSPECIFIED: _ClassVar[FarmCompletionReason]
    FARM_COMPLETION_REASON_HARVEST_LIMIT_REACHED: _ClassVar[FarmCompletionReason]
    FARM_COMPLETION_REASON_NO_MATURE_CROPS: _ClassVar[FarmCompletionReason]
    FARM_COMPLETION_REASON_NO_REPLANT_ITEM: _ClassVar[FarmCompletionReason]

class BreedCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BREED_COMPLETION_REASON_UNSPECIFIED: _ClassVar[BreedCompletionReason]
    BREED_COMPLETION_REASON_PAIR_LIMIT_REACHED: _ClassVar[BreedCompletionReason]
    BREED_COMPLETION_REASON_NO_COMPATIBLE_PAIR: _ClassVar[BreedCompletionReason]
    BREED_COMPLETION_REASON_NO_FOOD: _ClassVar[BreedCompletionReason]

class ExploreCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    EXPLORE_COMPLETION_REASON_UNSPECIFIED: _ClassVar[ExploreCompletionReason]
    EXPLORE_COMPLETION_REASON_WAYPOINT_LIMIT_REACHED: _ClassVar[ExploreCompletionReason]
    EXPLORE_COMPLETION_REASON_AREA_EXHAUSTED: _ClassVar[ExploreCompletionReason]
    EXPLORE_COMPLETION_REASON_RETURNED_TO_ORIGIN: _ClassVar[ExploreCompletionReason]

class ContainerTransferDirection(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    CONTAINER_TRANSFER_DIRECTION_UNSPECIFIED: _ClassVar[ContainerTransferDirection]
    CONTAINER_TRANSFER_DIRECTION_DEPOSIT: _ClassVar[ContainerTransferDirection]
    CONTAINER_TRANSFER_DIRECTION_WITHDRAW: _ClassVar[ContainerTransferDirection]

class ContainerTransferCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    CONTAINER_TRANSFER_COMPLETION_REASON_UNSPECIFIED: _ClassVar[ContainerTransferCompletionReason]
    CONTAINER_TRANSFER_COMPLETION_REASON_COMPLETED: _ClassVar[ContainerTransferCompletionReason]
    CONTAINER_TRANSFER_COMPLETION_REASON_PARTIAL: _ClassVar[ContainerTransferCompletionReason]

class AutoEatCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AUTO_EAT_COMPLETION_REASON_UNSPECIFIED: _ClassVar[AutoEatCompletionReason]
    AUTO_EAT_COMPLETION_REASON_MEAL_LIMIT_REACHED: _ClassVar[AutoEatCompletionReason]
    AUTO_EAT_COMPLETION_REASON_NO_FOOD: _ClassVar[AutoEatCompletionReason]
    AUTO_EAT_COMPLETION_REASON_FOOD_LEVEL_REACHED: _ClassVar[AutoEatCompletionReason]

class AutoRespawnCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AUTO_RESPAWN_COMPLETION_REASON_UNSPECIFIED: _ClassVar[AutoRespawnCompletionReason]
    AUTO_RESPAWN_COMPLETION_REASON_RESPAWN_LIMIT_REACHED: _ClassVar[AutoRespawnCompletionReason]

class AutoTotemCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AUTO_TOTEM_COMPLETION_REASON_UNSPECIFIED: _ClassVar[AutoTotemCompletionReason]
    AUTO_TOTEM_COMPLETION_REASON_EQUIP_LIMIT_REACHED: _ClassVar[AutoTotemCompletionReason]
    AUTO_TOTEM_COMPLETION_REASON_NO_TOTEM: _ClassVar[AutoTotemCompletionReason]

class AutoArmorCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AUTO_ARMOR_COMPLETION_REASON_UNSPECIFIED: _ClassVar[AutoArmorCompletionReason]
    AUTO_ARMOR_COMPLETION_REASON_EQUIP_LIMIT_REACHED: _ClassVar[AutoArmorCompletionReason]
    AUTO_ARMOR_COMPLETION_REASON_NO_UPGRADE: _ClassVar[AutoArmorCompletionReason]

class CollectBlocksCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    COLLECT_BLOCKS_COMPLETION_REASON_UNSPECIFIED: _ClassVar[CollectBlocksCompletionReason]
    COLLECT_BLOCKS_COMPLETION_REASON_TARGET_REACHED: _ClassVar[CollectBlocksCompletionReason]
    COLLECT_BLOCKS_COMPLETION_REASON_NO_MATCHING_BLOCKS: _ClassVar[CollectBlocksCompletionReason]
    COLLECT_BLOCKS_COMPLETION_REASON_NO_REACHABLE_BLOCKS: _ClassVar[CollectBlocksCompletionReason]

class ExcavateCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    EXCAVATE_COMPLETION_REASON_UNSPECIFIED: _ClassVar[ExcavateCompletionReason]
    EXCAVATE_COMPLETION_REASON_AREA_CLEARED: _ClassVar[ExcavateCompletionReason]
    EXCAVATE_COMPLETION_REASON_BLOCK_LIMIT_REACHED: _ClassVar[ExcavateCompletionReason]
    EXCAVATE_COMPLETION_REASON_NO_REACHABLE_BLOCKS: _ClassVar[ExcavateCompletionReason]

class BuildRotation(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BUILD_ROTATION_UNSPECIFIED: _ClassVar[BuildRotation]
    BUILD_ROTATION_NONE: _ClassVar[BuildRotation]
    BUILD_ROTATION_CLOCKWISE_90: _ClassVar[BuildRotation]
    BUILD_ROTATION_HALF: _ClassVar[BuildRotation]
    BUILD_ROTATION_COUNTERCLOCKWISE_90: _ClassVar[BuildRotation]

class BuildMirror(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BUILD_MIRROR_UNSPECIFIED: _ClassVar[BuildMirror]
    BUILD_MIRROR_NONE: _ClassVar[BuildMirror]
    BUILD_MIRROR_X: _ClassVar[BuildMirror]
    BUILD_MIRROR_Z: _ClassVar[BuildMirror]

class BuildBlockStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BUILD_BLOCK_STATUS_UNSPECIFIED: _ClassVar[BuildBlockStatus]
    BUILD_BLOCK_STATUS_PLACED: _ClassVar[BuildBlockStatus]
    BUILD_BLOCK_STATUS_ALREADY_CORRECT: _ClassVar[BuildBlockStatus]
    BUILD_BLOCK_STATUS_MISSING_MATERIAL: _ClassVar[BuildBlockStatus]
    BUILD_BLOCK_STATUS_UNREACHABLE: _ClassVar[BuildBlockStatus]
    BUILD_BLOCK_STATUS_UNSUPPORTED: _ClassVar[BuildBlockStatus]
    BUILD_BLOCK_STATUS_STATE_MISMATCH: _ClassVar[BuildBlockStatus]
    BUILD_BLOCK_STATUS_INCORRECT_BLOCK: _ClassVar[BuildBlockStatus]

class BuildCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BUILD_COMPLETION_REASON_UNSPECIFIED: _ClassVar[BuildCompletionReason]
    BUILD_COMPLETION_REASON_COMPLETED: _ClassVar[BuildCompletionReason]
    BUILD_COMPLETION_REASON_PARTIAL: _ClassVar[BuildCompletionReason]

class MaintainLoadoutCompletionReason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    MAINTAIN_LOADOUT_COMPLETION_REASON_UNSPECIFIED: _ClassVar[MaintainLoadoutCompletionReason]
    MAINTAIN_LOADOUT_COMPLETION_REASON_SATISFIED: _ClassVar[MaintainLoadoutCompletionReason]
    MAINTAIN_LOADOUT_COMPLETION_REASON_REBALANCE_LIMIT_REACHED: _ClassVar[MaintainLoadoutCompletionReason]
    MAINTAIN_LOADOUT_COMPLETION_REASON_CONTAINER_EXHAUSTED: _ClassVar[MaintainLoadoutCompletionReason]
BOT_TASK_RESOURCE_UNSPECIFIED: BotTaskResource
BOT_TASK_RESOURCE_MOVEMENT: BotTaskResource
BOT_TASK_RESOURCE_ROTATION: BotTaskResource
BOT_TASK_RESOURCE_MAIN_HAND: BotTaskResource
BOT_TASK_RESOURCE_OFF_HAND: BotTaskResource
BOT_TASK_RESOURCE_INVENTORY: BotTaskResource
BOT_TASK_RESOURCE_CONTAINER: BotTaskResource
BOT_TASK_RESOURCE_CHAT: BotTaskResource
BOT_TASK_RESOURCE_VEHICLE: BotTaskResource
BOT_TASK_RESOURCE_CAMERA: BotTaskResource
BOT_TASK_RESOURCE_PROTOCOL: BotTaskResource
BOT_TASK_STATUS_UNSPECIFIED: BotTaskStatus
BOT_TASK_STATUS_QUEUED: BotTaskStatus
BOT_TASK_STATUS_WAITING_FOR_RESOURCES: BotTaskStatus
BOT_TASK_STATUS_RUNNING: BotTaskStatus
BOT_TASK_STATUS_SUSPENDED: BotTaskStatus
BOT_TASK_STATUS_RECOVERING: BotTaskStatus
BOT_TASK_STATUS_COMPLETED: BotTaskStatus
BOT_TASK_STATUS_CANCELLED: BotTaskStatus
BOT_TASK_STATUS_FAILED: BotTaskStatus
BOT_TASK_STATUS_TIMED_OUT: BotTaskStatus
BOT_TASK_CONFLICT_POLICY_UNSPECIFIED: BotTaskConflictPolicy
BOT_TASK_CONFLICT_POLICY_REJECT: BotTaskConflictPolicy
BOT_TASK_CONFLICT_POLICY_QUEUE: BotTaskConflictPolicy
BOT_TASK_CONFLICT_POLICY_REPLACE: BotTaskConflictPolicy
BOT_TASK_CONFLICT_POLICY_SUSPEND_LOWER_PRIORITY: BotTaskConflictPolicy
BOT_TASK_RECONNECT_POLICY_UNSPECIFIED: BotTaskReconnectPolicy
BOT_TASK_RECONNECT_POLICY_FAIL: BotTaskReconnectPolicy
BOT_TASK_RECONNECT_POLICY_PAUSE_AND_RESUME: BotTaskReconnectPolicy
BOT_TASK_RECONNECT_POLICY_CONTINUE: BotTaskReconnectPolicy
BOT_TASK_DISCONNECT_POLICY_UNSPECIFIED: BotTaskDisconnectPolicy
BOT_TASK_DISCONNECT_POLICY_CONTINUE: BotTaskDisconnectPolicy
BOT_TASK_DISCONNECT_POLICY_CANCEL_WITH_CALL: BotTaskDisconnectPolicy
BOT_TASK_PRIORITY_UNSPECIFIED: BotTaskPriority
BOT_TASK_PRIORITY_LOW: BotTaskPriority
BOT_TASK_PRIORITY_NORMAL: BotTaskPriority
BOT_TASK_PRIORITY_HIGH: BotTaskPriority
BOT_TASK_PRIORITY_CRITICAL: BotTaskPriority
FOLLOW_ENTITY_COMPLETION_REASON_UNSPECIFIED: FollowEntityCompletionReason
FOLLOW_ENTITY_COMPLETION_REASON_TARGET_UNAVAILABLE: FollowEntityCompletionReason
ATTACK_ENTITY_COMPLETION_REASON_UNSPECIFIED: AttackEntityCompletionReason
ATTACK_ENTITY_COMPLETION_REASON_TARGET_DEFEATED: AttackEntityCompletionReason
ATTACK_ENTITY_COMPLETION_REASON_TARGET_UNAVAILABLE: AttackEntityCompletionReason
ATTACK_ENTITY_COMPLETION_REASON_ATTACK_LIMIT_REACHED: AttackEntityCompletionReason
ATTACK_NEAREST_COMPLETION_REASON_UNSPECIFIED: AttackNearestCompletionReason
ATTACK_NEAREST_COMPLETION_REASON_TARGET_LIMIT_REACHED: AttackNearestCompletionReason
ATTACK_NEAREST_COMPLETION_REASON_ATTACK_LIMIT_REACHED: AttackNearestCompletionReason
ATTACK_NEAREST_COMPLETION_REASON_NO_TARGET: AttackNearestCompletionReason
RANGED_ATTACK_COMPLETION_REASON_UNSPECIFIED: RangedAttackCompletionReason
RANGED_ATTACK_COMPLETION_REASON_TARGET_DEFEATED: RangedAttackCompletionReason
RANGED_ATTACK_COMPLETION_REASON_TARGET_UNAVAILABLE: RangedAttackCompletionReason
RANGED_ATTACK_COMPLETION_REASON_SHOT_LIMIT_REACHED: RangedAttackCompletionReason
RANGED_ATTACK_COMPLETION_REASON_NO_WEAPON: RangedAttackCompletionReason
RANGED_ATTACK_COMPLETION_REASON_NO_AMMUNITION: RangedAttackCompletionReason
FLEE_COMPLETION_REASON_UNSPECIFIED: FleeCompletionReason
FLEE_COMPLETION_REASON_SAFE: FleeCompletionReason
FLEE_COMPLETION_REASON_ESCAPE_LIMIT_REACHED: FleeCompletionReason
GUARD_COMPLETION_REASON_UNSPECIFIED: GuardCompletionReason
GUARD_COMPLETION_REASON_AREA_CLEAR: GuardCompletionReason
GUARD_COMPLETION_REASON_TARGET_LIMIT_REACHED: GuardCompletionReason
GUARD_COMPLETION_REASON_ATTACK_LIMIT_REACHED: GuardCompletionReason
GUARD_COMPLETION_REASON_SUBJECT_UNAVAILABLE: GuardCompletionReason
SLEEP_COMPLETION_REASON_UNSPECIFIED: SleepCompletionReason
SLEEP_COMPLETION_REASON_SLEEPING: SleepCompletionReason
SLEEP_COMPLETION_REASON_ALREADY_SLEEPING: SleepCompletionReason
SLEEP_COMPLETION_REASON_NO_BED_FOUND: SleepCompletionReason
FISH_COMPLETION_REASON_UNSPECIFIED: FishCompletionReason
FISH_COMPLETION_REASON_CATCH_LIMIT_REACHED: FishCompletionReason
FISH_COMPLETION_REASON_NO_ROD: FishCompletionReason
FISH_COMPLETION_REASON_FAILED_CAST_LIMIT_REACHED: FishCompletionReason
FARM_COMPLETION_REASON_UNSPECIFIED: FarmCompletionReason
FARM_COMPLETION_REASON_HARVEST_LIMIT_REACHED: FarmCompletionReason
FARM_COMPLETION_REASON_NO_MATURE_CROPS: FarmCompletionReason
FARM_COMPLETION_REASON_NO_REPLANT_ITEM: FarmCompletionReason
BREED_COMPLETION_REASON_UNSPECIFIED: BreedCompletionReason
BREED_COMPLETION_REASON_PAIR_LIMIT_REACHED: BreedCompletionReason
BREED_COMPLETION_REASON_NO_COMPATIBLE_PAIR: BreedCompletionReason
BREED_COMPLETION_REASON_NO_FOOD: BreedCompletionReason
EXPLORE_COMPLETION_REASON_UNSPECIFIED: ExploreCompletionReason
EXPLORE_COMPLETION_REASON_WAYPOINT_LIMIT_REACHED: ExploreCompletionReason
EXPLORE_COMPLETION_REASON_AREA_EXHAUSTED: ExploreCompletionReason
EXPLORE_COMPLETION_REASON_RETURNED_TO_ORIGIN: ExploreCompletionReason
CONTAINER_TRANSFER_DIRECTION_UNSPECIFIED: ContainerTransferDirection
CONTAINER_TRANSFER_DIRECTION_DEPOSIT: ContainerTransferDirection
CONTAINER_TRANSFER_DIRECTION_WITHDRAW: ContainerTransferDirection
CONTAINER_TRANSFER_COMPLETION_REASON_UNSPECIFIED: ContainerTransferCompletionReason
CONTAINER_TRANSFER_COMPLETION_REASON_COMPLETED: ContainerTransferCompletionReason
CONTAINER_TRANSFER_COMPLETION_REASON_PARTIAL: ContainerTransferCompletionReason
AUTO_EAT_COMPLETION_REASON_UNSPECIFIED: AutoEatCompletionReason
AUTO_EAT_COMPLETION_REASON_MEAL_LIMIT_REACHED: AutoEatCompletionReason
AUTO_EAT_COMPLETION_REASON_NO_FOOD: AutoEatCompletionReason
AUTO_EAT_COMPLETION_REASON_FOOD_LEVEL_REACHED: AutoEatCompletionReason
AUTO_RESPAWN_COMPLETION_REASON_UNSPECIFIED: AutoRespawnCompletionReason
AUTO_RESPAWN_COMPLETION_REASON_RESPAWN_LIMIT_REACHED: AutoRespawnCompletionReason
AUTO_TOTEM_COMPLETION_REASON_UNSPECIFIED: AutoTotemCompletionReason
AUTO_TOTEM_COMPLETION_REASON_EQUIP_LIMIT_REACHED: AutoTotemCompletionReason
AUTO_TOTEM_COMPLETION_REASON_NO_TOTEM: AutoTotemCompletionReason
AUTO_ARMOR_COMPLETION_REASON_UNSPECIFIED: AutoArmorCompletionReason
AUTO_ARMOR_COMPLETION_REASON_EQUIP_LIMIT_REACHED: AutoArmorCompletionReason
AUTO_ARMOR_COMPLETION_REASON_NO_UPGRADE: AutoArmorCompletionReason
COLLECT_BLOCKS_COMPLETION_REASON_UNSPECIFIED: CollectBlocksCompletionReason
COLLECT_BLOCKS_COMPLETION_REASON_TARGET_REACHED: CollectBlocksCompletionReason
COLLECT_BLOCKS_COMPLETION_REASON_NO_MATCHING_BLOCKS: CollectBlocksCompletionReason
COLLECT_BLOCKS_COMPLETION_REASON_NO_REACHABLE_BLOCKS: CollectBlocksCompletionReason
EXCAVATE_COMPLETION_REASON_UNSPECIFIED: ExcavateCompletionReason
EXCAVATE_COMPLETION_REASON_AREA_CLEARED: ExcavateCompletionReason
EXCAVATE_COMPLETION_REASON_BLOCK_LIMIT_REACHED: ExcavateCompletionReason
EXCAVATE_COMPLETION_REASON_NO_REACHABLE_BLOCKS: ExcavateCompletionReason
BUILD_ROTATION_UNSPECIFIED: BuildRotation
BUILD_ROTATION_NONE: BuildRotation
BUILD_ROTATION_CLOCKWISE_90: BuildRotation
BUILD_ROTATION_HALF: BuildRotation
BUILD_ROTATION_COUNTERCLOCKWISE_90: BuildRotation
BUILD_MIRROR_UNSPECIFIED: BuildMirror
BUILD_MIRROR_NONE: BuildMirror
BUILD_MIRROR_X: BuildMirror
BUILD_MIRROR_Z: BuildMirror
BUILD_BLOCK_STATUS_UNSPECIFIED: BuildBlockStatus
BUILD_BLOCK_STATUS_PLACED: BuildBlockStatus
BUILD_BLOCK_STATUS_ALREADY_CORRECT: BuildBlockStatus
BUILD_BLOCK_STATUS_MISSING_MATERIAL: BuildBlockStatus
BUILD_BLOCK_STATUS_UNREACHABLE: BuildBlockStatus
BUILD_BLOCK_STATUS_UNSUPPORTED: BuildBlockStatus
BUILD_BLOCK_STATUS_STATE_MISMATCH: BuildBlockStatus
BUILD_BLOCK_STATUS_INCORRECT_BLOCK: BuildBlockStatus
BUILD_COMPLETION_REASON_UNSPECIFIED: BuildCompletionReason
BUILD_COMPLETION_REASON_COMPLETED: BuildCompletionReason
BUILD_COMPLETION_REASON_PARTIAL: BuildCompletionReason
MAINTAIN_LOADOUT_COMPLETION_REASON_UNSPECIFIED: MaintainLoadoutCompletionReason
MAINTAIN_LOADOUT_COMPLETION_REASON_SATISFIED: MaintainLoadoutCompletionReason
MAINTAIN_LOADOUT_COMPLETION_REASON_REBALANCE_LIMIT_REACHED: MaintainLoadoutCompletionReason
MAINTAIN_LOADOUT_COMPLETION_REASON_CONTAINER_EXHAUSTED: MaintainLoadoutCompletionReason

class BotTaskProgress(_message.Message):
    __slots__ = ("fraction", "current", "total", "message", "detail")
    FRACTION_FIELD_NUMBER: _ClassVar[int]
    CURRENT_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    DETAIL_FIELD_NUMBER: _ClassVar[int]
    fraction: float
    current: int
    total: int
    message: str
    detail: _any_pb2.Any
    def __init__(self, fraction: _Optional[float] = ..., current: _Optional[int] = ..., total: _Optional[int] = ..., message: _Optional[str] = ..., detail: _Optional[_Union[_any_pb2.Any, _Mapping]] = ...) -> None: ...

class BotTaskFailure(_message.Message):
    __slots__ = ("code", "message", "retryable", "detail")
    CODE_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    RETRYABLE_FIELD_NUMBER: _ClassVar[int]
    DETAIL_FIELD_NUMBER: _ClassVar[int]
    code: str
    message: str
    retryable: bool
    detail: _any_pb2.Any
    def __init__(self, code: _Optional[str] = ..., message: _Optional[str] = ..., retryable: bool = ..., detail: _Optional[_Union[_any_pb2.Any, _Mapping]] = ...) -> None: ...

class BotTask(_message.Message):
    __slots__ = ("task_id", "instance_id", "bot_id", "task_type", "owner_id", "owner_name", "status", "progress", "summary", "failure", "created_at", "started_at", "updated_at", "completed_at", "deadline", "claimed_resources", "parent_task_id", "child_task_ids", "causation_id", "idempotency_key", "reconnect_policy", "disconnect_policy", "conflict_policy", "priority", "input", "result", "revision")
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    TASK_TYPE_FIELD_NUMBER: _ClassVar[int]
    OWNER_ID_FIELD_NUMBER: _ClassVar[int]
    OWNER_NAME_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    PROGRESS_FIELD_NUMBER: _ClassVar[int]
    SUMMARY_FIELD_NUMBER: _ClassVar[int]
    FAILURE_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    STARTED_AT_FIELD_NUMBER: _ClassVar[int]
    UPDATED_AT_FIELD_NUMBER: _ClassVar[int]
    COMPLETED_AT_FIELD_NUMBER: _ClassVar[int]
    DEADLINE_FIELD_NUMBER: _ClassVar[int]
    CLAIMED_RESOURCES_FIELD_NUMBER: _ClassVar[int]
    PARENT_TASK_ID_FIELD_NUMBER: _ClassVar[int]
    CHILD_TASK_IDS_FIELD_NUMBER: _ClassVar[int]
    CAUSATION_ID_FIELD_NUMBER: _ClassVar[int]
    IDEMPOTENCY_KEY_FIELD_NUMBER: _ClassVar[int]
    RECONNECT_POLICY_FIELD_NUMBER: _ClassVar[int]
    DISCONNECT_POLICY_FIELD_NUMBER: _ClassVar[int]
    CONFLICT_POLICY_FIELD_NUMBER: _ClassVar[int]
    PRIORITY_FIELD_NUMBER: _ClassVar[int]
    INPUT_FIELD_NUMBER: _ClassVar[int]
    RESULT_FIELD_NUMBER: _ClassVar[int]
    REVISION_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    instance_id: str
    bot_id: str
    task_type: str
    owner_id: str
    owner_name: str
    status: BotTaskStatus
    progress: BotTaskProgress
    summary: str
    failure: BotTaskFailure
    created_at: _timestamp_pb2.Timestamp
    started_at: _timestamp_pb2.Timestamp
    updated_at: _timestamp_pb2.Timestamp
    completed_at: _timestamp_pb2.Timestamp
    deadline: _timestamp_pb2.Timestamp
    claimed_resources: _containers.RepeatedScalarFieldContainer[BotTaskResource]
    parent_task_id: str
    child_task_ids: _containers.RepeatedScalarFieldContainer[str]
    causation_id: str
    idempotency_key: str
    reconnect_policy: BotTaskReconnectPolicy
    disconnect_policy: BotTaskDisconnectPolicy
    conflict_policy: BotTaskConflictPolicy
    priority: BotTaskPriority
    input: _any_pb2.Any
    result: _any_pb2.Any
    revision: int
    def __init__(self, task_id: _Optional[str] = ..., instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., task_type: _Optional[str] = ..., owner_id: _Optional[str] = ..., owner_name: _Optional[str] = ..., status: _Optional[_Union[BotTaskStatus, str]] = ..., progress: _Optional[_Union[BotTaskProgress, _Mapping]] = ..., summary: _Optional[str] = ..., failure: _Optional[_Union[BotTaskFailure, _Mapping]] = ..., created_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., started_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., updated_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., completed_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., deadline: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., claimed_resources: _Optional[_Iterable[_Union[BotTaskResource, str]]] = ..., parent_task_id: _Optional[str] = ..., child_task_ids: _Optional[_Iterable[str]] = ..., causation_id: _Optional[str] = ..., idempotency_key: _Optional[str] = ..., reconnect_policy: _Optional[_Union[BotTaskReconnectPolicy, str]] = ..., disconnect_policy: _Optional[_Union[BotTaskDisconnectPolicy, str]] = ..., conflict_policy: _Optional[_Union[BotTaskConflictPolicy, str]] = ..., priority: _Optional[_Union[BotTaskPriority, str]] = ..., input: _Optional[_Union[_any_pb2.Any, _Mapping]] = ..., result: _Optional[_Union[_any_pb2.Any, _Mapping]] = ..., revision: _Optional[int] = ...) -> None: ...

class StartBotTaskRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "input", "conflict_policy", "reconnect_policy", "disconnect_policy", "priority", "deadline", "parent_task_id", "causation_id", "idempotency_key")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    INPUT_FIELD_NUMBER: _ClassVar[int]
    CONFLICT_POLICY_FIELD_NUMBER: _ClassVar[int]
    RECONNECT_POLICY_FIELD_NUMBER: _ClassVar[int]
    DISCONNECT_POLICY_FIELD_NUMBER: _ClassVar[int]
    PRIORITY_FIELD_NUMBER: _ClassVar[int]
    DEADLINE_FIELD_NUMBER: _ClassVar[int]
    PARENT_TASK_ID_FIELD_NUMBER: _ClassVar[int]
    CAUSATION_ID_FIELD_NUMBER: _ClassVar[int]
    IDEMPOTENCY_KEY_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    input: _any_pb2.Any
    conflict_policy: BotTaskConflictPolicy
    reconnect_policy: BotTaskReconnectPolicy
    disconnect_policy: BotTaskDisconnectPolicy
    priority: BotTaskPriority
    deadline: _timestamp_pb2.Timestamp
    parent_task_id: str
    causation_id: str
    idempotency_key: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., input: _Optional[_Union[_any_pb2.Any, _Mapping]] = ..., conflict_policy: _Optional[_Union[BotTaskConflictPolicy, str]] = ..., reconnect_policy: _Optional[_Union[BotTaskReconnectPolicy, str]] = ..., disconnect_policy: _Optional[_Union[BotTaskDisconnectPolicy, str]] = ..., priority: _Optional[_Union[BotTaskPriority, str]] = ..., deadline: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., parent_task_id: _Optional[str] = ..., causation_id: _Optional[str] = ..., idempotency_key: _Optional[str] = ...) -> None: ...

class GetBotTaskRequest(_message.Message):
    __slots__ = ("task_id",)
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    def __init__(self, task_id: _Optional[str] = ...) -> None: ...

class ListBotTasksRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "statuses", "page_size", "page_token", "include_terminal")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    STATUSES_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_TERMINAL_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    statuses: _containers.RepeatedScalarFieldContainer[BotTaskStatus]
    page_size: int
    page_token: str
    include_terminal: bool
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., statuses: _Optional[_Iterable[_Union[BotTaskStatus, str]]] = ..., page_size: _Optional[int] = ..., page_token: _Optional[str] = ..., include_terminal: bool = ...) -> None: ...

class ListBotTasksResponse(_message.Message):
    __slots__ = ("tasks", "next_page_token")
    TASKS_FIELD_NUMBER: _ClassVar[int]
    NEXT_PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    tasks: _containers.RepeatedCompositeFieldContainer[BotTask]
    next_page_token: str
    def __init__(self, tasks: _Optional[_Iterable[_Union[BotTask, _Mapping]]] = ..., next_page_token: _Optional[str] = ...) -> None: ...

class WatchBotTaskRequest(_message.Message):
    __slots__ = ("task_id", "after_revision", "follow")
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    AFTER_REVISION_FIELD_NUMBER: _ClassVar[int]
    FOLLOW_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    after_revision: int
    follow: bool
    def __init__(self, task_id: _Optional[str] = ..., after_revision: _Optional[int] = ..., follow: bool = ...) -> None: ...

class WatchBotTasksRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "statuses", "after_sequence", "include_snapshot")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    STATUSES_FIELD_NUMBER: _ClassVar[int]
    AFTER_SEQUENCE_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_SNAPSHOT_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    statuses: _containers.RepeatedScalarFieldContainer[BotTaskStatus]
    after_sequence: int
    include_snapshot: bool
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., statuses: _Optional[_Iterable[_Union[BotTaskStatus, str]]] = ..., after_sequence: _Optional[int] = ..., include_snapshot: bool = ...) -> None: ...

class BotTaskEvent(_message.Message):
    __slots__ = ("sequence", "observed_at", "task")
    SEQUENCE_FIELD_NUMBER: _ClassVar[int]
    OBSERVED_AT_FIELD_NUMBER: _ClassVar[int]
    TASK_FIELD_NUMBER: _ClassVar[int]
    sequence: int
    observed_at: _timestamp_pb2.Timestamp
    task: BotTask
    def __init__(self, sequence: _Optional[int] = ..., observed_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., task: _Optional[_Union[BotTask, _Mapping]] = ...) -> None: ...

class CancelBotTaskRequest(_message.Message):
    __slots__ = ("task_id", "reason")
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    reason: str
    def __init__(self, task_id: _Optional[str] = ..., reason: _Optional[str] = ...) -> None: ...

class GoToTask(_message.Message):
    __slots__ = ("goal", "options")
    GOAL_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    goal: _bot_live_pb2.PathfindGoal
    options: _bot_live_pb2.PathfindOptions
    def __init__(self, goal: _Optional[_Union[_bot_live_pb2.PathfindGoal, _Mapping]] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ...) -> None: ...

class GoToTaskResult(_message.Message):
    __slots__ = ("final_position",)
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    final_position: _common_pb2.WorldPosition
    def __init__(self, final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ...) -> None: ...

class FollowEntityTask(_message.Message):
    __slots__ = ("target", "options", "target_unavailable_timeout_seconds")
    TARGET_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    TARGET_UNAVAILABLE_TIMEOUT_SECONDS_FIELD_NUMBER: _ClassVar[int]
    target: _bot_live_pb2.PathfindGoal.EntityGoal
    options: _bot_live_pb2.PathfindOptions
    target_unavailable_timeout_seconds: int
    def __init__(self, target: _Optional[_Union[_bot_live_pb2.PathfindGoal.EntityGoal, _Mapping]] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., target_unavailable_timeout_seconds: _Optional[int] = ...) -> None: ...

class FollowEntityTaskResult(_message.Message):
    __slots__ = ("final_position", "reason")
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    final_position: _common_pb2.WorldPosition
    reason: FollowEntityCompletionReason
    def __init__(self, final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., reason: _Optional[_Union[FollowEntityCompletionReason, str]] = ...) -> None: ...

class AttackEntityTask(_message.Message):
    __slots__ = ("target", "options", "attack_range", "sprinting", "maximum_attacks", "target_unavailable_timeout_seconds", "select_best_weapon", "weapon", "restore_selected_slot", "use_offhand_shield")
    TARGET_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    ATTACK_RANGE_FIELD_NUMBER: _ClassVar[int]
    SPRINTING_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_ATTACKS_FIELD_NUMBER: _ClassVar[int]
    TARGET_UNAVAILABLE_TIMEOUT_SECONDS_FIELD_NUMBER: _ClassVar[int]
    SELECT_BEST_WEAPON_FIELD_NUMBER: _ClassVar[int]
    WEAPON_FIELD_NUMBER: _ClassVar[int]
    RESTORE_SELECTED_SLOT_FIELD_NUMBER: _ClassVar[int]
    USE_OFFHAND_SHIELD_FIELD_NUMBER: _ClassVar[int]
    target: _domain_pb2.EntityReference
    options: _bot_live_pb2.PathfindOptions
    attack_range: float
    sprinting: bool
    maximum_attacks: int
    target_unavailable_timeout_seconds: int
    select_best_weapon: bool
    weapon: _inventory_pb2.ItemSelector
    restore_selected_slot: bool
    use_offhand_shield: bool
    def __init__(self, target: _Optional[_Union[_domain_pb2.EntityReference, _Mapping]] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., attack_range: _Optional[float] = ..., sprinting: bool = ..., maximum_attacks: _Optional[int] = ..., target_unavailable_timeout_seconds: _Optional[int] = ..., select_best_weapon: bool = ..., weapon: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., restore_selected_slot: bool = ..., use_offhand_shield: bool = ...) -> None: ...

class AttackEntityTaskResult(_message.Message):
    __slots__ = ("final_position", "reason", "attacks", "target_alive")
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    ATTACKS_FIELD_NUMBER: _ClassVar[int]
    TARGET_ALIVE_FIELD_NUMBER: _ClassVar[int]
    final_position: _common_pb2.WorldPosition
    reason: AttackEntityCompletionReason
    attacks: int
    target_alive: bool
    def __init__(self, final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., reason: _Optional[_Union[AttackEntityCompletionReason, str]] = ..., attacks: _Optional[int] = ..., target_alive: bool = ...) -> None: ...

class AttackNearestTask(_message.Message):
    __slots__ = ("selector", "radius", "options", "attack_range", "sprinting", "maximum_attacks", "maximum_targets", "no_target_timeout_seconds", "complete_when_no_target", "select_best_weapon", "weapon", "restore_selected_slot")
    SELECTOR_FIELD_NUMBER: _ClassVar[int]
    RADIUS_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    ATTACK_RANGE_FIELD_NUMBER: _ClassVar[int]
    SPRINTING_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_ATTACKS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_TARGETS_FIELD_NUMBER: _ClassVar[int]
    NO_TARGET_TIMEOUT_SECONDS_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_NO_TARGET_FIELD_NUMBER: _ClassVar[int]
    SELECT_BEST_WEAPON_FIELD_NUMBER: _ClassVar[int]
    WEAPON_FIELD_NUMBER: _ClassVar[int]
    RESTORE_SELECTED_SLOT_FIELD_NUMBER: _ClassVar[int]
    selector: _world_pb2.EntitySelector
    radius: float
    options: _bot_live_pb2.PathfindOptions
    attack_range: float
    sprinting: bool
    maximum_attacks: int
    maximum_targets: int
    no_target_timeout_seconds: int
    complete_when_no_target: bool
    select_best_weapon: bool
    weapon: _inventory_pb2.ItemSelector
    restore_selected_slot: bool
    def __init__(self, selector: _Optional[_Union[_world_pb2.EntitySelector, _Mapping]] = ..., radius: _Optional[float] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., attack_range: _Optional[float] = ..., sprinting: bool = ..., maximum_attacks: _Optional[int] = ..., maximum_targets: _Optional[int] = ..., no_target_timeout_seconds: _Optional[int] = ..., complete_when_no_target: bool = ..., select_best_weapon: bool = ..., weapon: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., restore_selected_slot: bool = ...) -> None: ...

class AttackNearestTaskResult(_message.Message):
    __slots__ = ("final_position", "reason", "attacks", "targets_defeated")
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    ATTACKS_FIELD_NUMBER: _ClassVar[int]
    TARGETS_DEFEATED_FIELD_NUMBER: _ClassVar[int]
    final_position: _common_pb2.WorldPosition
    reason: AttackNearestCompletionReason
    attacks: int
    targets_defeated: int
    def __init__(self, final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., reason: _Optional[_Union[AttackNearestCompletionReason, str]] = ..., attacks: _Optional[int] = ..., targets_defeated: _Optional[int] = ...) -> None: ...

class RangedAttackTask(_message.Message):
    __slots__ = ("target", "options", "minimum_range", "maximum_range", "maximum_shots", "target_unavailable_timeout_seconds", "weapon", "bow_draw_ticks", "lead_target", "compensate_gravity", "strafe", "restore_selected_slot")
    TARGET_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    MINIMUM_RANGE_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_RANGE_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_SHOTS_FIELD_NUMBER: _ClassVar[int]
    TARGET_UNAVAILABLE_TIMEOUT_SECONDS_FIELD_NUMBER: _ClassVar[int]
    WEAPON_FIELD_NUMBER: _ClassVar[int]
    BOW_DRAW_TICKS_FIELD_NUMBER: _ClassVar[int]
    LEAD_TARGET_FIELD_NUMBER: _ClassVar[int]
    COMPENSATE_GRAVITY_FIELD_NUMBER: _ClassVar[int]
    STRAFE_FIELD_NUMBER: _ClassVar[int]
    RESTORE_SELECTED_SLOT_FIELD_NUMBER: _ClassVar[int]
    target: _domain_pb2.EntityReference
    options: _bot_live_pb2.PathfindOptions
    minimum_range: float
    maximum_range: float
    maximum_shots: int
    target_unavailable_timeout_seconds: int
    weapon: _inventory_pb2.ItemSelector
    bow_draw_ticks: int
    lead_target: bool
    compensate_gravity: bool
    strafe: bool
    restore_selected_slot: bool
    def __init__(self, target: _Optional[_Union[_domain_pb2.EntityReference, _Mapping]] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., minimum_range: _Optional[float] = ..., maximum_range: _Optional[float] = ..., maximum_shots: _Optional[int] = ..., target_unavailable_timeout_seconds: _Optional[int] = ..., weapon: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., bow_draw_ticks: _Optional[int] = ..., lead_target: bool = ..., compensate_gravity: bool = ..., strafe: bool = ..., restore_selected_slot: bool = ...) -> None: ...

class RangedAttackTaskResult(_message.Message):
    __slots__ = ("final_position", "reason", "shots_released", "target_alive")
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    SHOTS_RELEASED_FIELD_NUMBER: _ClassVar[int]
    TARGET_ALIVE_FIELD_NUMBER: _ClassVar[int]
    final_position: _common_pb2.WorldPosition
    reason: RangedAttackCompletionReason
    shots_released: int
    target_alive: bool
    def __init__(self, final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., reason: _Optional[_Union[RangedAttackCompletionReason, str]] = ..., shots_released: _Optional[int] = ..., target_alive: bool = ...) -> None: ...

class FleeTask(_message.Message):
    __slots__ = ("threats", "trigger_radius", "safe_distance", "options", "safe_seconds", "complete_when_safe", "maximum_escapes")
    THREATS_FIELD_NUMBER: _ClassVar[int]
    TRIGGER_RADIUS_FIELD_NUMBER: _ClassVar[int]
    SAFE_DISTANCE_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    SAFE_SECONDS_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_SAFE_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_ESCAPES_FIELD_NUMBER: _ClassVar[int]
    threats: _world_pb2.EntitySelector
    trigger_radius: float
    safe_distance: float
    options: _bot_live_pb2.PathfindOptions
    safe_seconds: int
    complete_when_safe: bool
    maximum_escapes: int
    def __init__(self, threats: _Optional[_Union[_world_pb2.EntitySelector, _Mapping]] = ..., trigger_radius: _Optional[float] = ..., safe_distance: _Optional[float] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., safe_seconds: _Optional[int] = ..., complete_when_safe: bool = ..., maximum_escapes: _Optional[int] = ...) -> None: ...

class FleeTaskResult(_message.Message):
    __slots__ = ("final_position", "reason", "escapes")
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    ESCAPES_FIELD_NUMBER: _ClassVar[int]
    final_position: _common_pb2.WorldPosition
    reason: FleeCompletionReason
    escapes: int
    def __init__(self, final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., reason: _Optional[_Union[FleeCompletionReason, str]] = ..., escapes: _Optional[int] = ...) -> None: ...

class GuardTask(_message.Message):
    __slots__ = ("position", "entity", "threats", "guard_radius", "maximum_pursuit_distance", "return_radius", "options", "attack_range", "sprinting", "maximum_attacks", "maximum_targets", "complete_when_clear", "clear_seconds", "select_best_weapon", "weapon", "restore_selected_slot")
    POSITION_FIELD_NUMBER: _ClassVar[int]
    ENTITY_FIELD_NUMBER: _ClassVar[int]
    THREATS_FIELD_NUMBER: _ClassVar[int]
    GUARD_RADIUS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_PURSUIT_DISTANCE_FIELD_NUMBER: _ClassVar[int]
    RETURN_RADIUS_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    ATTACK_RANGE_FIELD_NUMBER: _ClassVar[int]
    SPRINTING_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_ATTACKS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_TARGETS_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_CLEAR_FIELD_NUMBER: _ClassVar[int]
    CLEAR_SECONDS_FIELD_NUMBER: _ClassVar[int]
    SELECT_BEST_WEAPON_FIELD_NUMBER: _ClassVar[int]
    WEAPON_FIELD_NUMBER: _ClassVar[int]
    RESTORE_SELECTED_SLOT_FIELD_NUMBER: _ClassVar[int]
    position: _common_pb2.BlockPosition
    entity: _domain_pb2.EntityReference
    threats: _world_pb2.EntitySelector
    guard_radius: float
    maximum_pursuit_distance: float
    return_radius: float
    options: _bot_live_pb2.PathfindOptions
    attack_range: float
    sprinting: bool
    maximum_attacks: int
    maximum_targets: int
    complete_when_clear: bool
    clear_seconds: int
    select_best_weapon: bool
    weapon: _inventory_pb2.ItemSelector
    restore_selected_slot: bool
    def __init__(self, position: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., entity: _Optional[_Union[_domain_pb2.EntityReference, _Mapping]] = ..., threats: _Optional[_Union[_world_pb2.EntitySelector, _Mapping]] = ..., guard_radius: _Optional[float] = ..., maximum_pursuit_distance: _Optional[float] = ..., return_radius: _Optional[float] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., attack_range: _Optional[float] = ..., sprinting: bool = ..., maximum_attacks: _Optional[int] = ..., maximum_targets: _Optional[int] = ..., complete_when_clear: bool = ..., clear_seconds: _Optional[int] = ..., select_best_weapon: bool = ..., weapon: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., restore_selected_slot: bool = ...) -> None: ...

class GuardTaskResult(_message.Message):
    __slots__ = ("final_position", "reason", "attacks", "targets_defeated")
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    ATTACKS_FIELD_NUMBER: _ClassVar[int]
    TARGETS_DEFEATED_FIELD_NUMBER: _ClassVar[int]
    final_position: _common_pb2.WorldPosition
    reason: GuardCompletionReason
    attacks: int
    targets_defeated: int
    def __init__(self, final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., reason: _Optional[_Union[GuardCompletionReason, str]] = ..., attacks: _Optional[int] = ..., targets_defeated: _Optional[int] = ...) -> None: ...

class SleepTask(_message.Message):
    __slots__ = ("bed", "search_radius", "options", "wait_until_possible", "retry_interval_ticks")
    BED_FIELD_NUMBER: _ClassVar[int]
    SEARCH_RADIUS_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    WAIT_UNTIL_POSSIBLE_FIELD_NUMBER: _ClassVar[int]
    RETRY_INTERVAL_TICKS_FIELD_NUMBER: _ClassVar[int]
    bed: _common_pb2.BlockPosition
    search_radius: int
    options: _bot_live_pb2.PathfindOptions
    wait_until_possible: bool
    retry_interval_ticks: int
    def __init__(self, bed: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., search_radius: _Optional[int] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., wait_until_possible: bool = ..., retry_interval_ticks: _Optional[int] = ...) -> None: ...

class SleepTaskResult(_message.Message):
    __slots__ = ("bed", "reason")
    BED_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    bed: _common_pb2.BlockPosition
    reason: SleepCompletionReason
    def __init__(self, bed: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., reason: _Optional[_Union[SleepCompletionReason, str]] = ...) -> None: ...

class FishTask(_message.Message):
    __slots__ = ("maximum_catches", "rod", "cast_timeout_ticks", "bite_timeout_ticks", "complete_when_no_rod", "restore_selected_slot", "maximum_failed_casts")
    MAXIMUM_CATCHES_FIELD_NUMBER: _ClassVar[int]
    ROD_FIELD_NUMBER: _ClassVar[int]
    CAST_TIMEOUT_TICKS_FIELD_NUMBER: _ClassVar[int]
    BITE_TIMEOUT_TICKS_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_NO_ROD_FIELD_NUMBER: _ClassVar[int]
    RESTORE_SELECTED_SLOT_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_FAILED_CASTS_FIELD_NUMBER: _ClassVar[int]
    maximum_catches: int
    rod: _inventory_pb2.ItemSelector
    cast_timeout_ticks: int
    bite_timeout_ticks: int
    complete_when_no_rod: bool
    restore_selected_slot: bool
    maximum_failed_casts: int
    def __init__(self, maximum_catches: _Optional[int] = ..., rod: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., cast_timeout_ticks: _Optional[int] = ..., bite_timeout_ticks: _Optional[int] = ..., complete_when_no_rod: bool = ..., restore_selected_slot: bool = ..., maximum_failed_casts: _Optional[int] = ...) -> None: ...

class FishTaskResult(_message.Message):
    __slots__ = ("reason", "catches", "failed_casts")
    REASON_FIELD_NUMBER: _ClassVar[int]
    CATCHES_FIELD_NUMBER: _ClassVar[int]
    FAILED_CASTS_FIELD_NUMBER: _ClassVar[int]
    reason: FishCompletionReason
    catches: int
    failed_casts: int
    def __init__(self, reason: _Optional[_Union[FishCompletionReason, str]] = ..., catches: _Optional[int] = ..., failed_casts: _Optional[int] = ...) -> None: ...

class FarmTask(_message.Message):
    __slots__ = ("crop_ids", "center", "radius", "maximum_harvests", "replant", "complete_when_no_mature_crops", "options", "rescan_interval_ticks", "restore_selected_slot")
    CROP_IDS_FIELD_NUMBER: _ClassVar[int]
    CENTER_FIELD_NUMBER: _ClassVar[int]
    RADIUS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_HARVESTS_FIELD_NUMBER: _ClassVar[int]
    REPLANT_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_NO_MATURE_CROPS_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    RESCAN_INTERVAL_TICKS_FIELD_NUMBER: _ClassVar[int]
    RESTORE_SELECTED_SLOT_FIELD_NUMBER: _ClassVar[int]
    crop_ids: _containers.RepeatedScalarFieldContainer[str]
    center: _common_pb2.BlockPosition
    radius: int
    maximum_harvests: int
    replant: bool
    complete_when_no_mature_crops: bool
    options: _bot_live_pb2.PathfindOptions
    rescan_interval_ticks: int
    restore_selected_slot: bool
    def __init__(self, crop_ids: _Optional[_Iterable[str]] = ..., center: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., radius: _Optional[int] = ..., maximum_harvests: _Optional[int] = ..., replant: bool = ..., complete_when_no_mature_crops: bool = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., rescan_interval_ticks: _Optional[int] = ..., restore_selected_slot: bool = ...) -> None: ...

class FarmTaskResult(_message.Message):
    __slots__ = ("reason", "crops_harvested", "crops_replanted", "failed_harvests", "final_position")
    REASON_FIELD_NUMBER: _ClassVar[int]
    CROPS_HARVESTED_FIELD_NUMBER: _ClassVar[int]
    CROPS_REPLANTED_FIELD_NUMBER: _ClassVar[int]
    FAILED_HARVESTS_FIELD_NUMBER: _ClassVar[int]
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    reason: FarmCompletionReason
    crops_harvested: int
    crops_replanted: int
    failed_harvests: int
    final_position: _common_pb2.WorldPosition
    def __init__(self, reason: _Optional[_Union[FarmCompletionReason, str]] = ..., crops_harvested: _Optional[int] = ..., crops_replanted: _Optional[int] = ..., failed_harvests: _Optional[int] = ..., final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ...) -> None: ...

class BreedTask(_message.Message):
    __slots__ = ("animals", "food", "center", "radius", "maximum_pairs", "complete_when_no_pair", "complete_when_no_food", "options", "rescan_interval_ticks", "breeding_timeout_ticks", "restore_selected_slot")
    ANIMALS_FIELD_NUMBER: _ClassVar[int]
    FOOD_FIELD_NUMBER: _ClassVar[int]
    CENTER_FIELD_NUMBER: _ClassVar[int]
    RADIUS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_PAIRS_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_NO_PAIR_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_NO_FOOD_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    RESCAN_INTERVAL_TICKS_FIELD_NUMBER: _ClassVar[int]
    BREEDING_TIMEOUT_TICKS_FIELD_NUMBER: _ClassVar[int]
    RESTORE_SELECTED_SLOT_FIELD_NUMBER: _ClassVar[int]
    animals: _world_pb2.EntitySelector
    food: _inventory_pb2.ItemSelector
    center: _common_pb2.BlockPosition
    radius: int
    maximum_pairs: int
    complete_when_no_pair: bool
    complete_when_no_food: bool
    options: _bot_live_pb2.PathfindOptions
    rescan_interval_ticks: int
    breeding_timeout_ticks: int
    restore_selected_slot: bool
    def __init__(self, animals: _Optional[_Union[_world_pb2.EntitySelector, _Mapping]] = ..., food: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., center: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., radius: _Optional[int] = ..., maximum_pairs: _Optional[int] = ..., complete_when_no_pair: bool = ..., complete_when_no_food: bool = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., rescan_interval_ticks: _Optional[int] = ..., breeding_timeout_ticks: _Optional[int] = ..., restore_selected_slot: bool = ...) -> None: ...

class BreedTaskResult(_message.Message):
    __slots__ = ("reason", "pairs_started", "animals_fed", "failed_pairs", "final_position")
    REASON_FIELD_NUMBER: _ClassVar[int]
    PAIRS_STARTED_FIELD_NUMBER: _ClassVar[int]
    ANIMALS_FED_FIELD_NUMBER: _ClassVar[int]
    FAILED_PAIRS_FIELD_NUMBER: _ClassVar[int]
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    reason: BreedCompletionReason
    pairs_started: int
    animals_fed: int
    failed_pairs: int
    final_position: _common_pb2.WorldPosition
    def __init__(self, reason: _Optional[_Union[BreedCompletionReason, str]] = ..., pairs_started: _Optional[int] = ..., animals_fed: _Optional[int] = ..., failed_pairs: _Optional[int] = ..., final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ...) -> None: ...

class ExploreTask(_message.Message):
    __slots__ = ("origin", "radius", "waypoint_spacing", "maximum_waypoints", "options", "return_to_origin", "purpose")
    ORIGIN_FIELD_NUMBER: _ClassVar[int]
    RADIUS_FIELD_NUMBER: _ClassVar[int]
    WAYPOINT_SPACING_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_WAYPOINTS_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    RETURN_TO_ORIGIN_FIELD_NUMBER: _ClassVar[int]
    PURPOSE_FIELD_NUMBER: _ClassVar[int]
    origin: _common_pb2.BlockPosition
    radius: int
    waypoint_spacing: int
    maximum_waypoints: int
    options: _bot_live_pb2.PathfindOptions
    return_to_origin: bool
    purpose: str
    def __init__(self, origin: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., radius: _Optional[int] = ..., waypoint_spacing: _Optional[int] = ..., maximum_waypoints: _Optional[int] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., return_to_origin: bool = ..., purpose: _Optional[str] = ...) -> None: ...

class ExploreTaskResult(_message.Message):
    __slots__ = ("reason", "waypoints_visited", "failed_routes", "horizontal_distance_traveled", "final_position")
    REASON_FIELD_NUMBER: _ClassVar[int]
    WAYPOINTS_VISITED_FIELD_NUMBER: _ClassVar[int]
    FAILED_ROUTES_FIELD_NUMBER: _ClassVar[int]
    HORIZONTAL_DISTANCE_TRAVELED_FIELD_NUMBER: _ClassVar[int]
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    reason: ExploreCompletionReason
    waypoints_visited: int
    failed_routes: int
    horizontal_distance_traveled: float
    final_position: _common_pb2.WorldPosition
    def __init__(self, reason: _Optional[_Union[ExploreCompletionReason, str]] = ..., waypoints_visited: _Optional[int] = ..., failed_routes: _Optional[int] = ..., horizontal_distance_traveled: _Optional[float] = ..., final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ...) -> None: ...

class ContainerTransferOperation(_message.Message):
    __slots__ = ("selector", "count", "allow_partial")
    SELECTOR_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    ALLOW_PARTIAL_FIELD_NUMBER: _ClassVar[int]
    selector: _inventory_pb2.ItemSelector
    count: int
    allow_partial: bool
    def __init__(self, selector: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., count: _Optional[int] = ..., allow_partial: bool = ...) -> None: ...

class ContainerTransferTask(_message.Message):
    __slots__ = ("container", "direction", "operations", "options", "close_container")
    CONTAINER_FIELD_NUMBER: _ClassVar[int]
    DIRECTION_FIELD_NUMBER: _ClassVar[int]
    OPERATIONS_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    CLOSE_CONTAINER_FIELD_NUMBER: _ClassVar[int]
    container: _common_pb2.BlockPosition
    direction: ContainerTransferDirection
    operations: _containers.RepeatedCompositeFieldContainer[ContainerTransferOperation]
    options: _bot_live_pb2.PathfindOptions
    close_container: bool
    def __init__(self, container: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., direction: _Optional[_Union[ContainerTransferDirection, str]] = ..., operations: _Optional[_Iterable[_Union[ContainerTransferOperation, _Mapping]]] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., close_container: bool = ...) -> None: ...

class ContainerTransferOutcome(_message.Message):
    __slots__ = ("selector", "requested", "transferred")
    SELECTOR_FIELD_NUMBER: _ClassVar[int]
    REQUESTED_FIELD_NUMBER: _ClassVar[int]
    TRANSFERRED_FIELD_NUMBER: _ClassVar[int]
    selector: _inventory_pb2.ItemSelector
    requested: int
    transferred: int
    def __init__(self, selector: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., requested: _Optional[int] = ..., transferred: _Optional[int] = ...) -> None: ...

class ContainerTransferTaskResult(_message.Message):
    __slots__ = ("reason", "outcomes", "total_transferred", "container_revision", "final_position")
    REASON_FIELD_NUMBER: _ClassVar[int]
    OUTCOMES_FIELD_NUMBER: _ClassVar[int]
    TOTAL_TRANSFERRED_FIELD_NUMBER: _ClassVar[int]
    CONTAINER_REVISION_FIELD_NUMBER: _ClassVar[int]
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    reason: ContainerTransferCompletionReason
    outcomes: _containers.RepeatedCompositeFieldContainer[ContainerTransferOutcome]
    total_transferred: int
    container_revision: int
    final_position: _common_pb2.WorldPosition
    def __init__(self, reason: _Optional[_Union[ContainerTransferCompletionReason, str]] = ..., outcomes: _Optional[_Iterable[_Union[ContainerTransferOutcome, _Mapping]]] = ..., total_transferred: _Optional[int] = ..., container_revision: _Optional[int] = ..., final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ...) -> None: ...

class AutoEatTask(_message.Message):
    __slots__ = ("food_item_ids", "food_level", "check_interval_ticks", "maximum_meals", "complete_when_no_food", "restore_selected_slot")
    FOOD_ITEM_IDS_FIELD_NUMBER: _ClassVar[int]
    FOOD_LEVEL_FIELD_NUMBER: _ClassVar[int]
    CHECK_INTERVAL_TICKS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_MEALS_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_NO_FOOD_FIELD_NUMBER: _ClassVar[int]
    RESTORE_SELECTED_SLOT_FIELD_NUMBER: _ClassVar[int]
    food_item_ids: _containers.RepeatedScalarFieldContainer[str]
    food_level: int
    check_interval_ticks: int
    maximum_meals: int
    complete_when_no_food: bool
    restore_selected_slot: bool
    def __init__(self, food_item_ids: _Optional[_Iterable[str]] = ..., food_level: _Optional[int] = ..., check_interval_ticks: _Optional[int] = ..., maximum_meals: _Optional[int] = ..., complete_when_no_food: bool = ..., restore_selected_slot: bool = ...) -> None: ...

class AutoEatTaskResult(_message.Message):
    __slots__ = ("reason", "meals_eaten", "final_food_level")
    REASON_FIELD_NUMBER: _ClassVar[int]
    MEALS_EATEN_FIELD_NUMBER: _ClassVar[int]
    FINAL_FOOD_LEVEL_FIELD_NUMBER: _ClassVar[int]
    reason: AutoEatCompletionReason
    meals_eaten: int
    final_food_level: int
    def __init__(self, reason: _Optional[_Union[AutoEatCompletionReason, str]] = ..., meals_eaten: _Optional[int] = ..., final_food_level: _Optional[int] = ...) -> None: ...

class AutoRespawnTask(_message.Message):
    __slots__ = ("respawn_delay_ticks", "maximum_respawns")
    RESPAWN_DELAY_TICKS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_RESPAWNS_FIELD_NUMBER: _ClassVar[int]
    respawn_delay_ticks: int
    maximum_respawns: int
    def __init__(self, respawn_delay_ticks: _Optional[int] = ..., maximum_respawns: _Optional[int] = ...) -> None: ...

class AutoRespawnTaskResult(_message.Message):
    __slots__ = ("reason", "respawns")
    REASON_FIELD_NUMBER: _ClassVar[int]
    RESPAWNS_FIELD_NUMBER: _ClassVar[int]
    reason: AutoRespawnCompletionReason
    respawns: int
    def __init__(self, reason: _Optional[_Union[AutoRespawnCompletionReason, str]] = ..., respawns: _Optional[int] = ...) -> None: ...

class AutoTotemTask(_message.Message):
    __slots__ = ("check_interval_ticks", "maximum_equips", "complete_when_no_totem", "replace_occupied_offhand")
    CHECK_INTERVAL_TICKS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_EQUIPS_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_NO_TOTEM_FIELD_NUMBER: _ClassVar[int]
    REPLACE_OCCUPIED_OFFHAND_FIELD_NUMBER: _ClassVar[int]
    check_interval_ticks: int
    maximum_equips: int
    complete_when_no_totem: bool
    replace_occupied_offhand: bool
    def __init__(self, check_interval_ticks: _Optional[int] = ..., maximum_equips: _Optional[int] = ..., complete_when_no_totem: bool = ..., replace_occupied_offhand: bool = ...) -> None: ...

class AutoTotemTaskResult(_message.Message):
    __slots__ = ("reason", "equips")
    REASON_FIELD_NUMBER: _ClassVar[int]
    EQUIPS_FIELD_NUMBER: _ClassVar[int]
    reason: AutoTotemCompletionReason
    equips: int
    def __init__(self, reason: _Optional[_Union[AutoTotemCompletionReason, str]] = ..., equips: _Optional[int] = ...) -> None: ...

class AutoArmorTask(_message.Message):
    __slots__ = ("check_interval_ticks", "maximum_equips", "complete_when_no_upgrade")
    CHECK_INTERVAL_TICKS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_EQUIPS_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_NO_UPGRADE_FIELD_NUMBER: _ClassVar[int]
    check_interval_ticks: int
    maximum_equips: int
    complete_when_no_upgrade: bool
    def __init__(self, check_interval_ticks: _Optional[int] = ..., maximum_equips: _Optional[int] = ..., complete_when_no_upgrade: bool = ...) -> None: ...

class AutoArmorTaskResult(_message.Message):
    __slots__ = ("reason", "equips")
    REASON_FIELD_NUMBER: _ClassVar[int]
    EQUIPS_FIELD_NUMBER: _ClassVar[int]
    reason: AutoArmorCompletionReason
    equips: int
    def __init__(self, reason: _Optional[_Union[AutoArmorCompletionReason, str]] = ..., equips: _Optional[int] = ...) -> None: ...

class CollectBlocksTask(_message.Message):
    __slots__ = ("block_ids", "tags", "count", "search_radius", "options", "avoid_submerged_targets", "require_line_of_sight", "target_y_range")
    BLOCK_IDS_FIELD_NUMBER: _ClassVar[int]
    TAGS_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    SEARCH_RADIUS_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    AVOID_SUBMERGED_TARGETS_FIELD_NUMBER: _ClassVar[int]
    REQUIRE_LINE_OF_SIGHT_FIELD_NUMBER: _ClassVar[int]
    TARGET_Y_RANGE_FIELD_NUMBER: _ClassVar[int]
    block_ids: _containers.RepeatedScalarFieldContainer[str]
    tags: _containers.RepeatedScalarFieldContainer[str]
    count: int
    search_radius: int
    options: _bot_live_pb2.PathfindOptions
    avoid_submerged_targets: bool
    require_line_of_sight: bool
    target_y_range: _world_pb2.IntRange
    def __init__(self, block_ids: _Optional[_Iterable[str]] = ..., tags: _Optional[_Iterable[str]] = ..., count: _Optional[int] = ..., search_radius: _Optional[int] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., avoid_submerged_targets: bool = ..., require_line_of_sight: bool = ..., target_y_range: _Optional[_Union[_world_pb2.IntRange, _Mapping]] = ...) -> None: ...

class CollectBlocksTaskResult(_message.Message):
    __slots__ = ("reason", "blocks_broken", "final_position")
    REASON_FIELD_NUMBER: _ClassVar[int]
    BLOCKS_BROKEN_FIELD_NUMBER: _ClassVar[int]
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    reason: CollectBlocksCompletionReason
    blocks_broken: int
    final_position: _common_pb2.WorldPosition
    def __init__(self, reason: _Optional[_Union[CollectBlocksCompletionReason, str]] = ..., blocks_broken: _Optional[int] = ..., final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ...) -> None: ...

class CollectBlocksTaskProgressDetail(_message.Message):
    __slots__ = ("phase", "player_position", "active_targets", "rejected_targets", "failed_approaches", "path_planning", "path_current_movement", "path_total_movements", "completed_breaks", "consecutive_stalled_paths")
    class Phase(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        PHASE_UNSPECIFIED: _ClassVar[CollectBlocksTaskProgressDetail.Phase]
        PHASE_SEARCHING: _ClassVar[CollectBlocksTaskProgressDetail.Phase]
        PHASE_PLANNING_ROUTE: _ClassVar[CollectBlocksTaskProgressDetail.Phase]
        PHASE_FOLLOWING_ROUTE: _ClassVar[CollectBlocksTaskProgressDetail.Phase]
        PHASE_BREAKING_BLOCK: _ClassVar[CollectBlocksTaskProgressDetail.Phase]
        PHASE_RETRYING_APPROACH: _ClassVar[CollectBlocksTaskProgressDetail.Phase]
        PHASE_SKIPPING_TARGET: _ClassVar[CollectBlocksTaskProgressDetail.Phase]
    PHASE_UNSPECIFIED: CollectBlocksTaskProgressDetail.Phase
    PHASE_SEARCHING: CollectBlocksTaskProgressDetail.Phase
    PHASE_PLANNING_ROUTE: CollectBlocksTaskProgressDetail.Phase
    PHASE_FOLLOWING_ROUTE: CollectBlocksTaskProgressDetail.Phase
    PHASE_BREAKING_BLOCK: CollectBlocksTaskProgressDetail.Phase
    PHASE_RETRYING_APPROACH: CollectBlocksTaskProgressDetail.Phase
    PHASE_SKIPPING_TARGET: CollectBlocksTaskProgressDetail.Phase
    class FailedApproach(_message.Message):
        __slots__ = ("target", "player_positions")
        TARGET_FIELD_NUMBER: _ClassVar[int]
        PLAYER_POSITIONS_FIELD_NUMBER: _ClassVar[int]
        target: _common_pb2.BlockPosition
        player_positions: _containers.RepeatedCompositeFieldContainer[_common_pb2.BlockPosition]
        def __init__(self, target: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., player_positions: _Optional[_Iterable[_Union[_common_pb2.BlockPosition, _Mapping]]] = ...) -> None: ...
    PHASE_FIELD_NUMBER: _ClassVar[int]
    PLAYER_POSITION_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_TARGETS_FIELD_NUMBER: _ClassVar[int]
    REJECTED_TARGETS_FIELD_NUMBER: _ClassVar[int]
    FAILED_APPROACHES_FIELD_NUMBER: _ClassVar[int]
    PATH_PLANNING_FIELD_NUMBER: _ClassVar[int]
    PATH_CURRENT_MOVEMENT_FIELD_NUMBER: _ClassVar[int]
    PATH_TOTAL_MOVEMENTS_FIELD_NUMBER: _ClassVar[int]
    COMPLETED_BREAKS_FIELD_NUMBER: _ClassVar[int]
    CONSECUTIVE_STALLED_PATHS_FIELD_NUMBER: _ClassVar[int]
    phase: CollectBlocksTaskProgressDetail.Phase
    player_position: _common_pb2.BlockPosition
    active_targets: _containers.RepeatedCompositeFieldContainer[_common_pb2.BlockPosition]
    rejected_targets: _containers.RepeatedCompositeFieldContainer[_common_pb2.BlockPosition]
    failed_approaches: _containers.RepeatedCompositeFieldContainer[CollectBlocksTaskProgressDetail.FailedApproach]
    path_planning: bool
    path_current_movement: int
    path_total_movements: int
    completed_breaks: _containers.RepeatedCompositeFieldContainer[_common_pb2.BlockPosition]
    consecutive_stalled_paths: int
    def __init__(self, phase: _Optional[_Union[CollectBlocksTaskProgressDetail.Phase, str]] = ..., player_position: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., active_targets: _Optional[_Iterable[_Union[_common_pb2.BlockPosition, _Mapping]]] = ..., rejected_targets: _Optional[_Iterable[_Union[_common_pb2.BlockPosition, _Mapping]]] = ..., failed_approaches: _Optional[_Iterable[_Union[CollectBlocksTaskProgressDetail.FailedApproach, _Mapping]]] = ..., path_planning: bool = ..., path_current_movement: _Optional[int] = ..., path_total_movements: _Optional[int] = ..., completed_breaks: _Optional[_Iterable[_Union[_common_pb2.BlockPosition, _Mapping]]] = ..., consecutive_stalled_paths: _Optional[int] = ...) -> None: ...

class ExcavateTask(_message.Message):
    __slots__ = ("corner_a", "corner_b", "options", "maximum_blocks")
    CORNER_A_FIELD_NUMBER: _ClassVar[int]
    CORNER_B_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_BLOCKS_FIELD_NUMBER: _ClassVar[int]
    corner_a: _common_pb2.BlockPosition
    corner_b: _common_pb2.BlockPosition
    options: _bot_live_pb2.PathfindOptions
    maximum_blocks: int
    def __init__(self, corner_a: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., corner_b: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., maximum_blocks: _Optional[int] = ...) -> None: ...

class ExcavateTaskResult(_message.Message):
    __slots__ = ("reason", "blocks_broken", "blocks_skipped", "unreachable_blocks", "final_position")
    REASON_FIELD_NUMBER: _ClassVar[int]
    BLOCKS_BROKEN_FIELD_NUMBER: _ClassVar[int]
    BLOCKS_SKIPPED_FIELD_NUMBER: _ClassVar[int]
    UNREACHABLE_BLOCKS_FIELD_NUMBER: _ClassVar[int]
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    reason: ExcavateCompletionReason
    blocks_broken: int
    blocks_skipped: int
    unreachable_blocks: int
    final_position: _common_pb2.WorldPosition
    def __init__(self, reason: _Optional[_Union[ExcavateCompletionReason, str]] = ..., blocks_broken: _Optional[int] = ..., blocks_skipped: _Optional[int] = ..., unreachable_blocks: _Optional[int] = ..., final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ...) -> None: ...

class BuildOffset(_message.Message):
    __slots__ = ("x", "y", "z")
    X_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    x: int
    y: int
    z: int
    def __init__(self, x: _Optional[int] = ..., y: _Optional[int] = ..., z: _Optional[int] = ...) -> None: ...

class BuildBlock(_message.Message):
    __slots__ = ("offset", "block_id", "properties")
    class PropertiesEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    OFFSET_FIELD_NUMBER: _ClassVar[int]
    BLOCK_ID_FIELD_NUMBER: _ClassVar[int]
    PROPERTIES_FIELD_NUMBER: _ClassVar[int]
    offset: BuildOffset
    block_id: str
    properties: _containers.ScalarMap[str, str]
    def __init__(self, offset: _Optional[_Union[BuildOffset, _Mapping]] = ..., block_id: _Optional[str] = ..., properties: _Optional[_Mapping[str, str]] = ...) -> None: ...

class BuildMaterialSubstitution(_message.Message):
    __slots__ = ("source_block_id", "replacement_block_ids")
    SOURCE_BLOCK_ID_FIELD_NUMBER: _ClassVar[int]
    REPLACEMENT_BLOCK_IDS_FIELD_NUMBER: _ClassVar[int]
    source_block_id: str
    replacement_block_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, source_block_id: _Optional[str] = ..., replacement_block_ids: _Optional[_Iterable[str]] = ...) -> None: ...

class BuildTask(_message.Message):
    __slots__ = ("origin", "blocks", "rotation", "mirror", "substitutions", "options", "break_incorrect_blocks", "restore_selected_slot", "partition_index", "partition_count")
    ORIGIN_FIELD_NUMBER: _ClassVar[int]
    BLOCKS_FIELD_NUMBER: _ClassVar[int]
    ROTATION_FIELD_NUMBER: _ClassVar[int]
    MIRROR_FIELD_NUMBER: _ClassVar[int]
    SUBSTITUTIONS_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    BREAK_INCORRECT_BLOCKS_FIELD_NUMBER: _ClassVar[int]
    RESTORE_SELECTED_SLOT_FIELD_NUMBER: _ClassVar[int]
    PARTITION_INDEX_FIELD_NUMBER: _ClassVar[int]
    PARTITION_COUNT_FIELD_NUMBER: _ClassVar[int]
    origin: _common_pb2.BlockPosition
    blocks: _containers.RepeatedCompositeFieldContainer[BuildBlock]
    rotation: BuildRotation
    mirror: BuildMirror
    substitutions: _containers.RepeatedCompositeFieldContainer[BuildMaterialSubstitution]
    options: _bot_live_pb2.PathfindOptions
    break_incorrect_blocks: bool
    restore_selected_slot: bool
    partition_index: int
    partition_count: int
    def __init__(self, origin: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., blocks: _Optional[_Iterable[_Union[BuildBlock, _Mapping]]] = ..., rotation: _Optional[_Union[BuildRotation, str]] = ..., mirror: _Optional[_Union[BuildMirror, str]] = ..., substitutions: _Optional[_Iterable[_Union[BuildMaterialSubstitution, _Mapping]]] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., break_incorrect_blocks: bool = ..., restore_selected_slot: bool = ..., partition_index: _Optional[int] = ..., partition_count: _Optional[int] = ...) -> None: ...

class BuildBlockOutcome(_message.Message):
    __slots__ = ("position", "requested_block_id", "placed_block_id", "status", "message")
    POSITION_FIELD_NUMBER: _ClassVar[int]
    REQUESTED_BLOCK_ID_FIELD_NUMBER: _ClassVar[int]
    PLACED_BLOCK_ID_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    position: _common_pb2.BlockPosition
    requested_block_id: str
    placed_block_id: str
    status: BuildBlockStatus
    message: str
    def __init__(self, position: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., requested_block_id: _Optional[str] = ..., placed_block_id: _Optional[str] = ..., status: _Optional[_Union[BuildBlockStatus, str]] = ..., message: _Optional[str] = ...) -> None: ...

class BuildTaskResult(_message.Message):
    __slots__ = ("reason", "blocks_placed", "blocks_already_correct", "incorrect_blocks_broken", "blocks_failed", "outcomes", "final_position")
    REASON_FIELD_NUMBER: _ClassVar[int]
    BLOCKS_PLACED_FIELD_NUMBER: _ClassVar[int]
    BLOCKS_ALREADY_CORRECT_FIELD_NUMBER: _ClassVar[int]
    INCORRECT_BLOCKS_BROKEN_FIELD_NUMBER: _ClassVar[int]
    BLOCKS_FAILED_FIELD_NUMBER: _ClassVar[int]
    OUTCOMES_FIELD_NUMBER: _ClassVar[int]
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    reason: BuildCompletionReason
    blocks_placed: int
    blocks_already_correct: int
    incorrect_blocks_broken: int
    blocks_failed: int
    outcomes: _containers.RepeatedCompositeFieldContainer[BuildBlockOutcome]
    final_position: _common_pb2.WorldPosition
    def __init__(self, reason: _Optional[_Union[BuildCompletionReason, str]] = ..., blocks_placed: _Optional[int] = ..., blocks_already_correct: _Optional[int] = ..., incorrect_blocks_broken: _Optional[int] = ..., blocks_failed: _Optional[int] = ..., outcomes: _Optional[_Iterable[_Union[BuildBlockOutcome, _Mapping]]] = ..., final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ...) -> None: ...

class LoadoutRequirement(_message.Message):
    __slots__ = ("selector", "minimum_count", "target_count", "maximum_count")
    SELECTOR_FIELD_NUMBER: _ClassVar[int]
    MINIMUM_COUNT_FIELD_NUMBER: _ClassVar[int]
    TARGET_COUNT_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_COUNT_FIELD_NUMBER: _ClassVar[int]
    selector: _inventory_pb2.ItemSelector
    minimum_count: int
    target_count: int
    maximum_count: int
    def __init__(self, selector: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., minimum_count: _Optional[int] = ..., target_count: _Optional[int] = ..., maximum_count: _Optional[int] = ...) -> None: ...

class MaintainLoadoutTask(_message.Message):
    __slots__ = ("container", "requirements", "options", "check_interval_ticks", "maximum_rebalances", "complete_when_satisfied", "close_container")
    CONTAINER_FIELD_NUMBER: _ClassVar[int]
    REQUIREMENTS_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    CHECK_INTERVAL_TICKS_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_REBALANCES_FIELD_NUMBER: _ClassVar[int]
    COMPLETE_WHEN_SATISFIED_FIELD_NUMBER: _ClassVar[int]
    CLOSE_CONTAINER_FIELD_NUMBER: _ClassVar[int]
    container: _common_pb2.BlockPosition
    requirements: _containers.RepeatedCompositeFieldContainer[LoadoutRequirement]
    options: _bot_live_pb2.PathfindOptions
    check_interval_ticks: int
    maximum_rebalances: int
    complete_when_satisfied: bool
    close_container: bool
    def __init__(self, container: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., requirements: _Optional[_Iterable[_Union[LoadoutRequirement, _Mapping]]] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., check_interval_ticks: _Optional[int] = ..., maximum_rebalances: _Optional[int] = ..., complete_when_satisfied: bool = ..., close_container: bool = ...) -> None: ...

class LoadoutRequirementResult(_message.Message):
    __slots__ = ("selector", "final_count", "withdrawn", "deposited", "satisfied")
    SELECTOR_FIELD_NUMBER: _ClassVar[int]
    FINAL_COUNT_FIELD_NUMBER: _ClassVar[int]
    WITHDRAWN_FIELD_NUMBER: _ClassVar[int]
    DEPOSITED_FIELD_NUMBER: _ClassVar[int]
    SATISFIED_FIELD_NUMBER: _ClassVar[int]
    selector: _inventory_pb2.ItemSelector
    final_count: int
    withdrawn: int
    deposited: int
    satisfied: bool
    def __init__(self, selector: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., final_count: _Optional[int] = ..., withdrawn: _Optional[int] = ..., deposited: _Optional[int] = ..., satisfied: bool = ...) -> None: ...

class MaintainLoadoutTaskResult(_message.Message):
    __slots__ = ("reason", "rebalances", "total_withdrawn", "total_deposited", "requirements", "final_position")
    REASON_FIELD_NUMBER: _ClassVar[int]
    REBALANCES_FIELD_NUMBER: _ClassVar[int]
    TOTAL_WITHDRAWN_FIELD_NUMBER: _ClassVar[int]
    TOTAL_DEPOSITED_FIELD_NUMBER: _ClassVar[int]
    REQUIREMENTS_FIELD_NUMBER: _ClassVar[int]
    FINAL_POSITION_FIELD_NUMBER: _ClassVar[int]
    reason: MaintainLoadoutCompletionReason
    rebalances: int
    total_withdrawn: int
    total_deposited: int
    requirements: _containers.RepeatedCompositeFieldContainer[LoadoutRequirementResult]
    final_position: _common_pb2.WorldPosition
    def __init__(self, reason: _Optional[_Union[MaintainLoadoutCompletionReason, str]] = ..., rebalances: _Optional[int] = ..., total_withdrawn: _Optional[int] = ..., total_deposited: _Optional[int] = ..., requirements: _Optional[_Iterable[_Union[LoadoutRequirementResult, _Mapping]]] = ..., final_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ...) -> None: ...
