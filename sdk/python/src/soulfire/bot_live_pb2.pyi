import datetime

from soulfire import api_docs_pb2 as _api_docs_pb2
from soulfire import bot_pb2 as _bot_pb2
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

class BlockFace(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BLOCK_FACE_UNSPECIFIED: _ClassVar[BlockFace]
    BLOCK_FACE_DOWN: _ClassVar[BlockFace]
    BLOCK_FACE_UP: _ClassVar[BlockFace]
    BLOCK_FACE_NORTH: _ClassVar[BlockFace]
    BLOCK_FACE_SOUTH: _ClassVar[BlockFace]
    BLOCK_FACE_WEST: _ClassVar[BlockFace]
    BLOCK_FACE_EAST: _ClassVar[BlockFace]

class Hand(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    HAND_UNSPECIFIED: _ClassVar[Hand]
    HAND_MAIN: _ClassVar[Hand]
    HAND_OFF: _ClassVar[Hand]

class ChatSource(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    CHAT_SOURCE_UNSPECIFIED: _ClassVar[ChatSource]
    CHAT_SOURCE_PLAYER: _ClassVar[ChatSource]
    CHAT_SOURCE_SYSTEM: _ClassVar[ChatSource]
    CHAT_SOURCE_ACTION_BAR: _ClassVar[ChatSource]
    CHAT_SOURCE_WHISPER: _ClassVar[ChatSource]

class BotLifecycleKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    BOT_LIFECYCLE_UNSPECIFIED: _ClassVar[BotLifecycleKind]
    BOT_LIFECYCLE_CONNECTING: _ClassVar[BotLifecycleKind]
    BOT_LIFECYCLE_CONNECTED: _ClassVar[BotLifecycleKind]
    BOT_LIFECYCLE_SPAWNED: _ClassVar[BotLifecycleKind]
    BOT_LIFECYCLE_DIED: _ClassVar[BotLifecycleKind]
    BOT_LIFECYCLE_RESPAWNED: _ClassVar[BotLifecycleKind]
    BOT_LIFECYCLE_DISCONNECTED: _ClassVar[BotLifecycleKind]

class EntityEventKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ENTITY_EVENT_UNSPECIFIED: _ClassVar[EntityEventKind]
    ENTITY_EVENT_SPAWN: _ClassVar[EntityEventKind]
    ENTITY_EVENT_UPDATE: _ClassVar[EntityEventKind]
    ENTITY_EVENT_DESPAWN: _ClassVar[EntityEventKind]

class PathfindStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PATHFIND_STATUS_UNSPECIFIED: _ClassVar[PathfindStatus]
    PATHFIND_STATUS_PLANNING: _ClassVar[PathfindStatus]
    PATHFIND_STATUS_MOVING: _ClassVar[PathfindStatus]
    PATHFIND_STATUS_COMPLETED: _ClassVar[PathfindStatus]
    PATHFIND_STATUS_FAILED: _ClassVar[PathfindStatus]
    PATHFIND_STATUS_CANCELLED: _ClassVar[PathfindStatus]
BLOCK_FACE_UNSPECIFIED: BlockFace
BLOCK_FACE_DOWN: BlockFace
BLOCK_FACE_UP: BlockFace
BLOCK_FACE_NORTH: BlockFace
BLOCK_FACE_SOUTH: BlockFace
BLOCK_FACE_WEST: BlockFace
BLOCK_FACE_EAST: BlockFace
HAND_UNSPECIFIED: Hand
HAND_MAIN: Hand
HAND_OFF: Hand
CHAT_SOURCE_UNSPECIFIED: ChatSource
CHAT_SOURCE_PLAYER: ChatSource
CHAT_SOURCE_SYSTEM: ChatSource
CHAT_SOURCE_ACTION_BAR: ChatSource
CHAT_SOURCE_WHISPER: ChatSource
BOT_LIFECYCLE_UNSPECIFIED: BotLifecycleKind
BOT_LIFECYCLE_CONNECTING: BotLifecycleKind
BOT_LIFECYCLE_CONNECTED: BotLifecycleKind
BOT_LIFECYCLE_SPAWNED: BotLifecycleKind
BOT_LIFECYCLE_DIED: BotLifecycleKind
BOT_LIFECYCLE_RESPAWNED: BotLifecycleKind
BOT_LIFECYCLE_DISCONNECTED: BotLifecycleKind
ENTITY_EVENT_UNSPECIFIED: EntityEventKind
ENTITY_EVENT_SPAWN: EntityEventKind
ENTITY_EVENT_UPDATE: EntityEventKind
ENTITY_EVENT_DESPAWN: EntityEventKind
PATHFIND_STATUS_UNSPECIFIED: PathfindStatus
PATHFIND_STATUS_PLANNING: PathfindStatus
PATHFIND_STATUS_MOVING: PathfindStatus
PATHFIND_STATUS_COMPLETED: PathfindStatus
PATHFIND_STATUS_FAILED: PathfindStatus
PATHFIND_STATUS_CANCELLED: PathfindStatus

class BlockPosition(_message.Message):
    __slots__ = ("x", "y", "z", "dimension")
    X_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    DIMENSION_FIELD_NUMBER: _ClassVar[int]
    x: int
    y: int
    z: int
    dimension: str
    def __init__(self, x: _Optional[int] = ..., y: _Optional[int] = ..., z: _Optional[int] = ..., dimension: _Optional[str] = ...) -> None: ...

class WorldPosition(_message.Message):
    __slots__ = ("x", "y", "z", "dimension")
    X_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    DIMENSION_FIELD_NUMBER: _ClassVar[int]
    x: float
    y: float
    z: float
    dimension: str
    def __init__(self, x: _Optional[float] = ..., y: _Optional[float] = ..., z: _Optional[float] = ..., dimension: _Optional[str] = ...) -> None: ...

class BlockState(_message.Message):
    __slots__ = ("position", "block_id", "properties")
    class PropertiesEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    POSITION_FIELD_NUMBER: _ClassVar[int]
    BLOCK_ID_FIELD_NUMBER: _ClassVar[int]
    PROPERTIES_FIELD_NUMBER: _ClassVar[int]
    position: BlockPosition
    block_id: str
    properties: _containers.ScalarMap[str, str]
    def __init__(self, position: _Optional[_Union[BlockPosition, _Mapping]] = ..., block_id: _Optional[str] = ..., properties: _Optional[_Mapping[str, str]] = ...) -> None: ...

class NearbyEntity(_message.Message):
    __slots__ = ("entity_id", "entity_type", "position", "distance", "display_name", "is_player", "health")
    ENTITY_ID_FIELD_NUMBER: _ClassVar[int]
    ENTITY_TYPE_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    DISTANCE_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    IS_PLAYER_FIELD_NUMBER: _ClassVar[int]
    HEALTH_FIELD_NUMBER: _ClassVar[int]
    entity_id: int
    entity_type: str
    position: WorldPosition
    distance: float
    display_name: str
    is_player: bool
    health: float
    def __init__(self, entity_id: _Optional[int] = ..., entity_type: _Optional[str] = ..., position: _Optional[_Union[WorldPosition, _Mapping]] = ..., distance: _Optional[float] = ..., display_name: _Optional[str] = ..., is_player: bool = ..., health: _Optional[float] = ...) -> None: ...

class BotEventFilter(_message.Message):
    __slots__ = ("include_state_deltas", "include_chat", "include_lifecycle", "include_entity_events", "entity_radius", "include_block_updates", "block_radius")
    INCLUDE_STATE_DELTAS_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_CHAT_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_LIFECYCLE_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_ENTITY_EVENTS_FIELD_NUMBER: _ClassVar[int]
    ENTITY_RADIUS_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_BLOCK_UPDATES_FIELD_NUMBER: _ClassVar[int]
    BLOCK_RADIUS_FIELD_NUMBER: _ClassVar[int]
    include_state_deltas: bool
    include_chat: bool
    include_lifecycle: bool
    include_entity_events: bool
    entity_radius: float
    include_block_updates: bool
    block_radius: float
    def __init__(self, include_state_deltas: bool = ..., include_chat: bool = ..., include_lifecycle: bool = ..., include_entity_events: bool = ..., entity_radius: _Optional[float] = ..., include_block_updates: bool = ..., block_radius: _Optional[float] = ...) -> None: ...

class WatchBotEventsRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "filter")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    FILTER_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    filter: BotEventFilter
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., filter: _Optional[_Union[BotEventFilter, _Mapping]] = ...) -> None: ...

class BotStateDelta(_message.Message):
    __slots__ = ("x", "y", "z", "x_rot", "y_rot", "health", "max_health", "food_level", "saturation_level", "selected_hotbar_slot", "dimension", "experience_level", "experience_progress", "game_mode")
    X_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    X_ROT_FIELD_NUMBER: _ClassVar[int]
    Y_ROT_FIELD_NUMBER: _ClassVar[int]
    HEALTH_FIELD_NUMBER: _ClassVar[int]
    MAX_HEALTH_FIELD_NUMBER: _ClassVar[int]
    FOOD_LEVEL_FIELD_NUMBER: _ClassVar[int]
    SATURATION_LEVEL_FIELD_NUMBER: _ClassVar[int]
    SELECTED_HOTBAR_SLOT_FIELD_NUMBER: _ClassVar[int]
    DIMENSION_FIELD_NUMBER: _ClassVar[int]
    EXPERIENCE_LEVEL_FIELD_NUMBER: _ClassVar[int]
    EXPERIENCE_PROGRESS_FIELD_NUMBER: _ClassVar[int]
    GAME_MODE_FIELD_NUMBER: _ClassVar[int]
    x: float
    y: float
    z: float
    x_rot: float
    y_rot: float
    health: float
    max_health: float
    food_level: int
    saturation_level: float
    selected_hotbar_slot: int
    dimension: str
    experience_level: int
    experience_progress: float
    game_mode: _bot_pb2.GameMode
    def __init__(self, x: _Optional[float] = ..., y: _Optional[float] = ..., z: _Optional[float] = ..., x_rot: _Optional[float] = ..., y_rot: _Optional[float] = ..., health: _Optional[float] = ..., max_health: _Optional[float] = ..., food_level: _Optional[int] = ..., saturation_level: _Optional[float] = ..., selected_hotbar_slot: _Optional[int] = ..., dimension: _Optional[str] = ..., experience_level: _Optional[int] = ..., experience_progress: _Optional[float] = ..., game_mode: _Optional[_Union[_bot_pb2.GameMode, str]] = ...) -> None: ...

class BotChatEvent(_message.Message):
    __slots__ = ("source", "plain_text", "json_component", "sender_name", "sender_id", "received_at")
    SOURCE_FIELD_NUMBER: _ClassVar[int]
    PLAIN_TEXT_FIELD_NUMBER: _ClassVar[int]
    JSON_COMPONENT_FIELD_NUMBER: _ClassVar[int]
    SENDER_NAME_FIELD_NUMBER: _ClassVar[int]
    SENDER_ID_FIELD_NUMBER: _ClassVar[int]
    RECEIVED_AT_FIELD_NUMBER: _ClassVar[int]
    source: ChatSource
    plain_text: str
    json_component: str
    sender_name: str
    sender_id: str
    received_at: _timestamp_pb2.Timestamp
    def __init__(self, source: _Optional[_Union[ChatSource, str]] = ..., plain_text: _Optional[str] = ..., json_component: _Optional[str] = ..., sender_name: _Optional[str] = ..., sender_id: _Optional[str] = ..., received_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class BotLifecycleEvent(_message.Message):
    __slots__ = ("kind", "message")
    KIND_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    kind: BotLifecycleKind
    message: str
    def __init__(self, kind: _Optional[_Union[BotLifecycleKind, str]] = ..., message: _Optional[str] = ...) -> None: ...

class BotEntityEvent(_message.Message):
    __slots__ = ("kind", "entity")
    KIND_FIELD_NUMBER: _ClassVar[int]
    ENTITY_FIELD_NUMBER: _ClassVar[int]
    kind: EntityEventKind
    entity: NearbyEntity
    def __init__(self, kind: _Optional[_Union[EntityEventKind, str]] = ..., entity: _Optional[_Union[NearbyEntity, _Mapping]] = ...) -> None: ...

class BotBlockUpdateEvent(_message.Message):
    __slots__ = ("position", "old_block_id", "new_block_id")
    POSITION_FIELD_NUMBER: _ClassVar[int]
    OLD_BLOCK_ID_FIELD_NUMBER: _ClassVar[int]
    NEW_BLOCK_ID_FIELD_NUMBER: _ClassVar[int]
    position: BlockPosition
    old_block_id: str
    new_block_id: str
    def __init__(self, position: _Optional[_Union[BlockPosition, _Mapping]] = ..., old_block_id: _Optional[str] = ..., new_block_id: _Optional[str] = ...) -> None: ...

class BotEvent(_message.Message):
    __slots__ = ("snapshot", "state_delta", "chat", "lifecycle", "entity_event", "block_update")
    SNAPSHOT_FIELD_NUMBER: _ClassVar[int]
    STATE_DELTA_FIELD_NUMBER: _ClassVar[int]
    CHAT_FIELD_NUMBER: _ClassVar[int]
    LIFECYCLE_FIELD_NUMBER: _ClassVar[int]
    ENTITY_EVENT_FIELD_NUMBER: _ClassVar[int]
    BLOCK_UPDATE_FIELD_NUMBER: _ClassVar[int]
    snapshot: _bot_pb2.BotLiveState
    state_delta: BotStateDelta
    chat: BotChatEvent
    lifecycle: BotLifecycleEvent
    entity_event: BotEntityEvent
    block_update: BotBlockUpdateEvent
    def __init__(self, snapshot: _Optional[_Union[_bot_pb2.BotLiveState, _Mapping]] = ..., state_delta: _Optional[_Union[BotStateDelta, _Mapping]] = ..., chat: _Optional[_Union[BotChatEvent, _Mapping]] = ..., lifecycle: _Optional[_Union[BotLifecycleEvent, _Mapping]] = ..., entity_event: _Optional[_Union[BotEntityEvent, _Mapping]] = ..., block_update: _Optional[_Union[BotBlockUpdateEvent, _Mapping]] = ...) -> None: ...

class SendChatRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "message")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    message: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., message: _Optional[str] = ...) -> None: ...

class SendChatResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetBlockRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "position")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    position: BlockPosition
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., position: _Optional[_Union[BlockPosition, _Mapping]] = ...) -> None: ...

class GetBlockResponse(_message.Message):
    __slots__ = ("loaded", "block")
    LOADED_FIELD_NUMBER: _ClassVar[int]
    BLOCK_FIELD_NUMBER: _ClassVar[int]
    loaded: bool
    block: BlockState
    def __init__(self, loaded: bool = ..., block: _Optional[_Union[BlockState, _Mapping]] = ...) -> None: ...

class FindBlocksRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "block_ids", "max_distance", "max_count")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    BLOCK_IDS_FIELD_NUMBER: _ClassVar[int]
    MAX_DISTANCE_FIELD_NUMBER: _ClassVar[int]
    MAX_COUNT_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    block_ids: _containers.RepeatedScalarFieldContainer[str]
    max_distance: int
    max_count: int
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., block_ids: _Optional[_Iterable[str]] = ..., max_distance: _Optional[int] = ..., max_count: _Optional[int] = ...) -> None: ...

class FindBlocksResponse(_message.Message):
    __slots__ = ("blocks",)
    BLOCKS_FIELD_NUMBER: _ClassVar[int]
    blocks: _containers.RepeatedCompositeFieldContainer[BlockState]
    def __init__(self, blocks: _Optional[_Iterable[_Union[BlockState, _Mapping]]] = ...) -> None: ...

class ListNearbyEntitiesRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "radius", "entity_types", "include_players")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    RADIUS_FIELD_NUMBER: _ClassVar[int]
    ENTITY_TYPES_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_PLAYERS_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    radius: float
    entity_types: _containers.RepeatedScalarFieldContainer[str]
    include_players: bool
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., radius: _Optional[float] = ..., entity_types: _Optional[_Iterable[str]] = ..., include_players: bool = ...) -> None: ...

class ListNearbyEntitiesResponse(_message.Message):
    __slots__ = ("entities",)
    ENTITIES_FIELD_NUMBER: _ClassVar[int]
    entities: _containers.RepeatedCompositeFieldContainer[NearbyEntity]
    def __init__(self, entities: _Optional[_Iterable[_Union[NearbyEntity, _Mapping]]] = ...) -> None: ...

class DigBlockRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "position", "cancel")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    CANCEL_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    position: BlockPosition
    cancel: bool
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., position: _Optional[_Union[BlockPosition, _Mapping]] = ..., cancel: bool = ...) -> None: ...

class DigBlockResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class PlaceBlockRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "against", "face", "hand")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    AGAINST_FIELD_NUMBER: _ClassVar[int]
    FACE_FIELD_NUMBER: _ClassVar[int]
    HAND_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    against: BlockPosition
    face: BlockFace
    hand: Hand
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., against: _Optional[_Union[BlockPosition, _Mapping]] = ..., face: _Optional[_Union[BlockFace, str]] = ..., hand: _Optional[_Union[Hand, str]] = ...) -> None: ...

class PlaceBlockResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class UseItemRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "hand")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    HAND_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    hand: Hand
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., hand: _Optional[_Union[Hand, str]] = ...) -> None: ...

class UseItemResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class AttackEntityRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "entity_id", "sprinting")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    ENTITY_ID_FIELD_NUMBER: _ClassVar[int]
    SPRINTING_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    entity_id: int
    sprinting: bool
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., entity_id: _Optional[int] = ..., sprinting: bool = ...) -> None: ...

class AttackEntityResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class InteractEntityRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "entity_id", "hand", "sneaking")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    ENTITY_ID_FIELD_NUMBER: _ClassVar[int]
    HAND_FIELD_NUMBER: _ClassVar[int]
    SNEAKING_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    entity_id: int
    hand: Hand
    sneaking: bool
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., entity_id: _Optional[int] = ..., hand: _Optional[_Union[Hand, str]] = ..., sneaking: bool = ...) -> None: ...

class InteractEntityResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class SwingArmRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "hand")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    HAND_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    hand: Hand
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., hand: _Optional[_Union[Hand, str]] = ...) -> None: ...

class SwingArmResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class PathfindGoal(_message.Message):
    __slots__ = ("block", "near", "entity", "xz")
    class BlockGoal(_message.Message):
        __slots__ = ("position", "radius")
        POSITION_FIELD_NUMBER: _ClassVar[int]
        RADIUS_FIELD_NUMBER: _ClassVar[int]
        position: BlockPosition
        radius: float
        def __init__(self, position: _Optional[_Union[BlockPosition, _Mapping]] = ..., radius: _Optional[float] = ...) -> None: ...
    class NearGoal(_message.Message):
        __slots__ = ("position", "radius")
        POSITION_FIELD_NUMBER: _ClassVar[int]
        RADIUS_FIELD_NUMBER: _ClassVar[int]
        position: WorldPosition
        radius: float
        def __init__(self, position: _Optional[_Union[WorldPosition, _Mapping]] = ..., radius: _Optional[float] = ...) -> None: ...
    class EntityGoal(_message.Message):
        __slots__ = ("entity_id", "radius")
        ENTITY_ID_FIELD_NUMBER: _ClassVar[int]
        RADIUS_FIELD_NUMBER: _ClassVar[int]
        entity_id: int
        radius: float
        def __init__(self, entity_id: _Optional[int] = ..., radius: _Optional[float] = ...) -> None: ...
    class XZGoal(_message.Message):
        __slots__ = ("x", "z", "dimension", "radius")
        X_FIELD_NUMBER: _ClassVar[int]
        Z_FIELD_NUMBER: _ClassVar[int]
        DIMENSION_FIELD_NUMBER: _ClassVar[int]
        RADIUS_FIELD_NUMBER: _ClassVar[int]
        x: float
        z: float
        dimension: str
        radius: float
        def __init__(self, x: _Optional[float] = ..., z: _Optional[float] = ..., dimension: _Optional[str] = ..., radius: _Optional[float] = ...) -> None: ...
    BLOCK_FIELD_NUMBER: _ClassVar[int]
    NEAR_FIELD_NUMBER: _ClassVar[int]
    ENTITY_FIELD_NUMBER: _ClassVar[int]
    XZ_FIELD_NUMBER: _ClassVar[int]
    block: PathfindGoal.BlockGoal
    near: PathfindGoal.NearGoal
    entity: PathfindGoal.EntityGoal
    xz: PathfindGoal.XZGoal
    def __init__(self, block: _Optional[_Union[PathfindGoal.BlockGoal, _Mapping]] = ..., near: _Optional[_Union[PathfindGoal.NearGoal, _Mapping]] = ..., entity: _Optional[_Union[PathfindGoal.EntityGoal, _Mapping]] = ..., xz: _Optional[_Union[PathfindGoal.XZGoal, _Mapping]] = ...) -> None: ...

class PathfindOptions(_message.Message):
    __slots__ = ("allow_mining", "allow_placing", "allow_damage", "timeout_seconds")
    ALLOW_MINING_FIELD_NUMBER: _ClassVar[int]
    ALLOW_PLACING_FIELD_NUMBER: _ClassVar[int]
    ALLOW_DAMAGE_FIELD_NUMBER: _ClassVar[int]
    TIMEOUT_SECONDS_FIELD_NUMBER: _ClassVar[int]
    allow_mining: bool
    allow_placing: bool
    allow_damage: bool
    timeout_seconds: int
    def __init__(self, allow_mining: bool = ..., allow_placing: bool = ..., allow_damage: bool = ..., timeout_seconds: _Optional[int] = ...) -> None: ...

class GoToRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "goal", "options")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    GOAL_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    goal: PathfindGoal
    options: PathfindOptions
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., goal: _Optional[_Union[PathfindGoal, _Mapping]] = ..., options: _Optional[_Union[PathfindOptions, _Mapping]] = ...) -> None: ...

class PathfindProgress(_message.Message):
    __slots__ = ("status", "distance_remaining", "position", "error")
    STATUS_FIELD_NUMBER: _ClassVar[int]
    DISTANCE_REMAINING_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    status: PathfindStatus
    distance_remaining: float
    position: WorldPosition
    error: str
    def __init__(self, status: _Optional[_Union[PathfindStatus, str]] = ..., distance_remaining: _Optional[float] = ..., position: _Optional[_Union[WorldPosition, _Mapping]] = ..., error: _Optional[str] = ...) -> None: ...

class StopPathfindingRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ...) -> None: ...

class StopPathfindingResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
