import datetime

from soulfire import api_docs_pb2 as _api_docs_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class PluginMetric(_message.Message):
    __slots__ = ("key", "display_name", "value", "unit", "icon")
    KEY_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    UNIT_FIELD_NUMBER: _ClassVar[int]
    ICON_FIELD_NUMBER: _ClassVar[int]
    key: str
    display_name: str
    value: float
    unit: str
    icon: str
    def __init__(self, key: _Optional[str] = ..., display_name: _Optional[str] = ..., value: _Optional[float] = ..., unit: _Optional[str] = ..., icon: _Optional[str] = ...) -> None: ...

class PluginRuntimeStat(_message.Message):
    __slots__ = ("plugin_id", "enabled", "active_bot_count", "running_since", "metrics")
    PLUGIN_ID_FIELD_NUMBER: _ClassVar[int]
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_BOT_COUNT_FIELD_NUMBER: _ClassVar[int]
    RUNNING_SINCE_FIELD_NUMBER: _ClassVar[int]
    METRICS_FIELD_NUMBER: _ClassVar[int]
    plugin_id: str
    enabled: bool
    active_bot_count: int
    running_since: _timestamp_pb2.Timestamp
    metrics: _containers.RepeatedCompositeFieldContainer[PluginMetric]
    def __init__(self, plugin_id: _Optional[str] = ..., enabled: bool = ..., active_bot_count: _Optional[int] = ..., running_since: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., metrics: _Optional[_Iterable[_Union[PluginMetric, _Mapping]]] = ...) -> None: ...

class GetInstancePluginStatsRequest(_message.Message):
    __slots__ = ("instance_id",)
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    def __init__(self, instance_id: _Optional[str] = ...) -> None: ...

class GetInstancePluginStatsResponse(_message.Message):
    __slots__ = ("stats",)
    STATS_FIELD_NUMBER: _ClassVar[int]
    stats: _containers.RepeatedCompositeFieldContainer[PluginRuntimeStat]
    def __init__(self, stats: _Optional[_Iterable[_Union[PluginRuntimeStat, _Mapping]]] = ...) -> None: ...
