from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from soulfire import bot_live_pb2 as _bot_live_pb2
from soulfire import common_pb2 as _common_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class PathStepKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PATH_STEP_KIND_UNSPECIFIED: _ClassVar[PathStepKind]
    PATH_STEP_KIND_MOVE: _ClassVar[PathStepKind]
    PATH_STEP_KIND_BREAK_BLOCK: _ClassVar[PathStepKind]
    PATH_STEP_KIND_PLACE_BLOCK: _ClassVar[PathStepKind]
    PATH_STEP_KIND_JUMP: _ClassVar[PathStepKind]
    PATH_STEP_KIND_INTERACT: _ClassVar[PathStepKind]
    PATH_STEP_KIND_RECALCULATE: _ClassVar[PathStepKind]

class PathPlanStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PATH_PLAN_STATUS_UNSPECIFIED: _ClassVar[PathPlanStatus]
    PATH_PLAN_STATUS_COMPLETE: _ClassVar[PathPlanStatus]
    PATH_PLAN_STATUS_PARTIAL: _ClassVar[PathPlanStatus]
    PATH_PLAN_STATUS_UNREACHABLE: _ClassVar[PathPlanStatus]
    PATH_PLAN_STATUS_SEARCH_EXPIRED: _ClassVar[PathPlanStatus]
    PATH_PLAN_STATUS_CANCELLED: _ClassVar[PathPlanStatus]
PATH_STEP_KIND_UNSPECIFIED: PathStepKind
PATH_STEP_KIND_MOVE: PathStepKind
PATH_STEP_KIND_BREAK_BLOCK: PathStepKind
PATH_STEP_KIND_PLACE_BLOCK: PathStepKind
PATH_STEP_KIND_JUMP: PathStepKind
PATH_STEP_KIND_INTERACT: PathStepKind
PATH_STEP_KIND_RECALCULATE: PathStepKind
PATH_PLAN_STATUS_UNSPECIFIED: PathPlanStatus
PATH_PLAN_STATUS_COMPLETE: PathPlanStatus
PATH_PLAN_STATUS_PARTIAL: PathPlanStatus
PATH_PLAN_STATUS_UNREACHABLE: PathPlanStatus
PATH_PLAN_STATUS_SEARCH_EXPIRED: PathPlanStatus
PATH_PLAN_STATUS_CANCELLED: PathPlanStatus

class PathStep(_message.Message):
    __slots__ = ("index", "kind", "position", "description", "maximum_ticks")
    INDEX_FIELD_NUMBER: _ClassVar[int]
    KIND_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_TICKS_FIELD_NUMBER: _ClassVar[int]
    index: int
    kind: PathStepKind
    position: _common_pb2.BlockPosition
    description: str
    maximum_ticks: int
    def __init__(self, index: _Optional[int] = ..., kind: _Optional[_Union[PathStepKind, str]] = ..., position: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., description: _Optional[str] = ..., maximum_ticks: _Optional[int] = ...) -> None: ...

class PathPlan(_message.Message):
    __slots__ = ("status", "start", "steps", "blocks_to_break", "blocks_to_place", "maximum_ticks", "partial_reason")
    STATUS_FIELD_NUMBER: _ClassVar[int]
    START_FIELD_NUMBER: _ClassVar[int]
    STEPS_FIELD_NUMBER: _ClassVar[int]
    BLOCKS_TO_BREAK_FIELD_NUMBER: _ClassVar[int]
    BLOCKS_TO_PLACE_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_TICKS_FIELD_NUMBER: _ClassVar[int]
    PARTIAL_REASON_FIELD_NUMBER: _ClassVar[int]
    status: PathPlanStatus
    start: _common_pb2.BlockPosition
    steps: _containers.RepeatedCompositeFieldContainer[PathStep]
    blocks_to_break: _containers.RepeatedCompositeFieldContainer[_common_pb2.BlockPosition]
    blocks_to_place: _containers.RepeatedCompositeFieldContainer[_common_pb2.BlockPosition]
    maximum_ticks: int
    partial_reason: str
    def __init__(self, status: _Optional[_Union[PathPlanStatus, str]] = ..., start: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., steps: _Optional[_Iterable[_Union[PathStep, _Mapping]]] = ..., blocks_to_break: _Optional[_Iterable[_Union[_common_pb2.BlockPosition, _Mapping]]] = ..., blocks_to_place: _Optional[_Iterable[_Union[_common_pb2.BlockPosition, _Mapping]]] = ..., maximum_ticks: _Optional[int] = ..., partial_reason: _Optional[str] = ...) -> None: ...

class PlanPathRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "goal", "options", "include_descriptions")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    GOAL_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_DESCRIPTIONS_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    goal: _bot_live_pb2.PathfindGoal
    options: _bot_live_pb2.PathfindOptions
    include_descriptions: bool
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., goal: _Optional[_Union[_bot_live_pb2.PathfindGoal, _Mapping]] = ..., options: _Optional[_Union[_bot_live_pb2.PathfindOptions, _Mapping]] = ..., include_descriptions: bool = ...) -> None: ...

class PlanPathResponse(_message.Message):
    __slots__ = ("plan",)
    PLAN_FIELD_NUMBER: _ClassVar[int]
    plan: PathPlan
    def __init__(self, plan: _Optional[_Union[PathPlan, _Mapping]] = ...) -> None: ...
