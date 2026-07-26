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

class MetricsSnapshot(_message.Message):
    __slots__ = ("timestamp", "bots_online", "bots_total", "packets_sent_total", "packets_received_total", "bytes_sent_total", "bytes_received_total", "packets_sent_per_second", "packets_received_per_second", "bytes_sent_per_second", "bytes_received_per_second", "avg_tick_duration_ms", "max_tick_duration_ms", "avg_health", "avg_food_level", "total_loaded_chunks", "total_tracked_entities", "connections", "disconnections")
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    BOTS_ONLINE_FIELD_NUMBER: _ClassVar[int]
    BOTS_TOTAL_FIELD_NUMBER: _ClassVar[int]
    PACKETS_SENT_TOTAL_FIELD_NUMBER: _ClassVar[int]
    PACKETS_RECEIVED_TOTAL_FIELD_NUMBER: _ClassVar[int]
    BYTES_SENT_TOTAL_FIELD_NUMBER: _ClassVar[int]
    BYTES_RECEIVED_TOTAL_FIELD_NUMBER: _ClassVar[int]
    PACKETS_SENT_PER_SECOND_FIELD_NUMBER: _ClassVar[int]
    PACKETS_RECEIVED_PER_SECOND_FIELD_NUMBER: _ClassVar[int]
    BYTES_SENT_PER_SECOND_FIELD_NUMBER: _ClassVar[int]
    BYTES_RECEIVED_PER_SECOND_FIELD_NUMBER: _ClassVar[int]
    AVG_TICK_DURATION_MS_FIELD_NUMBER: _ClassVar[int]
    MAX_TICK_DURATION_MS_FIELD_NUMBER: _ClassVar[int]
    AVG_HEALTH_FIELD_NUMBER: _ClassVar[int]
    AVG_FOOD_LEVEL_FIELD_NUMBER: _ClassVar[int]
    TOTAL_LOADED_CHUNKS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_TRACKED_ENTITIES_FIELD_NUMBER: _ClassVar[int]
    CONNECTIONS_FIELD_NUMBER: _ClassVar[int]
    DISCONNECTIONS_FIELD_NUMBER: _ClassVar[int]
    timestamp: _timestamp_pb2.Timestamp
    bots_online: int
    bots_total: int
    packets_sent_total: int
    packets_received_total: int
    bytes_sent_total: int
    bytes_received_total: int
    packets_sent_per_second: float
    packets_received_per_second: float
    bytes_sent_per_second: float
    bytes_received_per_second: float
    avg_tick_duration_ms: float
    max_tick_duration_ms: float
    avg_health: float
    avg_food_level: float
    total_loaded_chunks: int
    total_tracked_entities: int
    connections: int
    disconnections: int
    def __init__(self, timestamp: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., bots_online: _Optional[int] = ..., bots_total: _Optional[int] = ..., packets_sent_total: _Optional[int] = ..., packets_received_total: _Optional[int] = ..., bytes_sent_total: _Optional[int] = ..., bytes_received_total: _Optional[int] = ..., packets_sent_per_second: _Optional[float] = ..., packets_received_per_second: _Optional[float] = ..., bytes_sent_per_second: _Optional[float] = ..., bytes_received_per_second: _Optional[float] = ..., avg_tick_duration_ms: _Optional[float] = ..., max_tick_duration_ms: _Optional[float] = ..., avg_health: _Optional[float] = ..., avg_food_level: _Optional[float] = ..., total_loaded_chunks: _Optional[int] = ..., total_tracked_entities: _Optional[int] = ..., connections: _Optional[int] = ..., disconnections: _Optional[int] = ...) -> None: ...

class MetricsDistributions(_message.Message):
    __slots__ = ("health_histogram", "food_histogram", "dimension_counts", "game_mode_counts", "bot_positions")
    class DimensionCountsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: int
        def __init__(self, key: _Optional[str] = ..., value: _Optional[int] = ...) -> None: ...
    class GameModeCountsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: int
        def __init__(self, key: _Optional[str] = ..., value: _Optional[int] = ...) -> None: ...
    HEALTH_HISTOGRAM_FIELD_NUMBER: _ClassVar[int]
    FOOD_HISTOGRAM_FIELD_NUMBER: _ClassVar[int]
    DIMENSION_COUNTS_FIELD_NUMBER: _ClassVar[int]
    GAME_MODE_COUNTS_FIELD_NUMBER: _ClassVar[int]
    BOT_POSITIONS_FIELD_NUMBER: _ClassVar[int]
    health_histogram: _containers.RepeatedScalarFieldContainer[int]
    food_histogram: _containers.RepeatedScalarFieldContainer[int]
    dimension_counts: _containers.ScalarMap[str, int]
    game_mode_counts: _containers.ScalarMap[str, int]
    bot_positions: _containers.RepeatedCompositeFieldContainer[BotPosition]
    def __init__(self, health_histogram: _Optional[_Iterable[int]] = ..., food_histogram: _Optional[_Iterable[int]] = ..., dimension_counts: _Optional[_Mapping[str, int]] = ..., game_mode_counts: _Optional[_Mapping[str, int]] = ..., bot_positions: _Optional[_Iterable[_Union[BotPosition, _Mapping]]] = ...) -> None: ...

class BotPosition(_message.Message):
    __slots__ = ("x", "z", "dimension")
    X_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    DIMENSION_FIELD_NUMBER: _ClassVar[int]
    x: float
    z: float
    dimension: str
    def __init__(self, x: _Optional[float] = ..., z: _Optional[float] = ..., dimension: _Optional[str] = ...) -> None: ...

class GetInstanceMetricsRequest(_message.Message):
    __slots__ = ("instance_id", "since")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    SINCE_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    since: _timestamp_pb2.Timestamp
    def __init__(self, instance_id: _Optional[str] = ..., since: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class GetInstanceMetricsResponse(_message.Message):
    __slots__ = ("snapshots", "distributions")
    SNAPSHOTS_FIELD_NUMBER: _ClassVar[int]
    DISTRIBUTIONS_FIELD_NUMBER: _ClassVar[int]
    snapshots: _containers.RepeatedCompositeFieldContainer[MetricsSnapshot]
    distributions: MetricsDistributions
    def __init__(self, snapshots: _Optional[_Iterable[_Union[MetricsSnapshot, _Mapping]]] = ..., distributions: _Optional[_Union[MetricsDistributions, _Mapping]] = ...) -> None: ...

class ServerMetricsSnapshot(_message.Message):
    __slots__ = ("timestamp", "process_cpu_load", "system_cpu_load", "heap_used_bytes", "heap_committed_bytes", "heap_max_bytes", "non_heap_used_bytes", "thread_count", "daemon_thread_count", "gc_collection_count", "gc_collection_time_ms", "uptime_ms", "available_processors", "total_bots_online", "total_bots_total", "total_bots_desired", "instances_with_desired_bots", "total_bots_starting", "total_bots_retrying", "total_bots_failed")
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    PROCESS_CPU_LOAD_FIELD_NUMBER: _ClassVar[int]
    SYSTEM_CPU_LOAD_FIELD_NUMBER: _ClassVar[int]
    HEAP_USED_BYTES_FIELD_NUMBER: _ClassVar[int]
    HEAP_COMMITTED_BYTES_FIELD_NUMBER: _ClassVar[int]
    HEAP_MAX_BYTES_FIELD_NUMBER: _ClassVar[int]
    NON_HEAP_USED_BYTES_FIELD_NUMBER: _ClassVar[int]
    THREAD_COUNT_FIELD_NUMBER: _ClassVar[int]
    DAEMON_THREAD_COUNT_FIELD_NUMBER: _ClassVar[int]
    GC_COLLECTION_COUNT_FIELD_NUMBER: _ClassVar[int]
    GC_COLLECTION_TIME_MS_FIELD_NUMBER: _ClassVar[int]
    UPTIME_MS_FIELD_NUMBER: _ClassVar[int]
    AVAILABLE_PROCESSORS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_BOTS_ONLINE_FIELD_NUMBER: _ClassVar[int]
    TOTAL_BOTS_TOTAL_FIELD_NUMBER: _ClassVar[int]
    TOTAL_BOTS_DESIRED_FIELD_NUMBER: _ClassVar[int]
    INSTANCES_WITH_DESIRED_BOTS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_BOTS_STARTING_FIELD_NUMBER: _ClassVar[int]
    TOTAL_BOTS_RETRYING_FIELD_NUMBER: _ClassVar[int]
    TOTAL_BOTS_FAILED_FIELD_NUMBER: _ClassVar[int]
    timestamp: _timestamp_pb2.Timestamp
    process_cpu_load: float
    system_cpu_load: float
    heap_used_bytes: int
    heap_committed_bytes: int
    heap_max_bytes: int
    non_heap_used_bytes: int
    thread_count: int
    daemon_thread_count: int
    gc_collection_count: int
    gc_collection_time_ms: int
    uptime_ms: int
    available_processors: int
    total_bots_online: int
    total_bots_total: int
    total_bots_desired: int
    instances_with_desired_bots: int
    total_bots_starting: int
    total_bots_retrying: int
    total_bots_failed: int
    def __init__(self, timestamp: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., process_cpu_load: _Optional[float] = ..., system_cpu_load: _Optional[float] = ..., heap_used_bytes: _Optional[int] = ..., heap_committed_bytes: _Optional[int] = ..., heap_max_bytes: _Optional[int] = ..., non_heap_used_bytes: _Optional[int] = ..., thread_count: _Optional[int] = ..., daemon_thread_count: _Optional[int] = ..., gc_collection_count: _Optional[int] = ..., gc_collection_time_ms: _Optional[int] = ..., uptime_ms: _Optional[int] = ..., available_processors: _Optional[int] = ..., total_bots_online: _Optional[int] = ..., total_bots_total: _Optional[int] = ..., total_bots_desired: _Optional[int] = ..., instances_with_desired_bots: _Optional[int] = ..., total_bots_starting: _Optional[int] = ..., total_bots_retrying: _Optional[int] = ..., total_bots_failed: _Optional[int] = ...) -> None: ...

class GetServerMetricsRequest(_message.Message):
    __slots__ = ("since",)
    SINCE_FIELD_NUMBER: _ClassVar[int]
    since: _timestamp_pb2.Timestamp
    def __init__(self, since: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class GetServerMetricsResponse(_message.Message):
    __slots__ = ("snapshots",)
    SNAPSHOTS_FIELD_NUMBER: _ClassVar[int]
    snapshots: _containers.RepeatedCompositeFieldContainer[ServerMetricsSnapshot]
    def __init__(self, snapshots: _Optional[_Iterable[_Union[ServerMetricsSnapshot, _Mapping]]] = ...) -> None: ...
