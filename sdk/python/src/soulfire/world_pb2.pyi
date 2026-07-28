from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from soulfire import bot_live_pb2 as _bot_live_pb2
from soulfire import common_pb2 as _common_pb2
from soulfire import domain_pb2 as _domain_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class QuerySort(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    QUERY_SORT_UNSPECIFIED: _ClassVar[QuerySort]
    QUERY_SORT_NEAREST: _ClassVar[QuerySort]
    QUERY_SORT_FARTHEST: _ClassVar[QuerySort]
    QUERY_SORT_XYZ: _ClassVar[QuerySort]
QUERY_SORT_UNSPECIFIED: QuerySort
QUERY_SORT_NEAREST: QuerySort
QUERY_SORT_FARTHEST: QuerySort
QUERY_SORT_XYZ: QuerySort

class IntRange(_message.Message):
    __slots__ = ("minimum", "maximum")
    MINIMUM_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_FIELD_NUMBER: _ClassVar[int]
    minimum: int
    maximum: int
    def __init__(self, minimum: _Optional[int] = ..., maximum: _Optional[int] = ...) -> None: ...

class FloatRange(_message.Message):
    __slots__ = ("minimum", "maximum")
    MINIMUM_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_FIELD_NUMBER: _ClassVar[int]
    minimum: float
    maximum: float
    def __init__(self, minimum: _Optional[float] = ..., maximum: _Optional[float] = ...) -> None: ...

class BlockSelector(_message.Message):
    __slots__ = ("block_ids", "tags", "properties", "solid", "replaceable", "interactive", "diggable", "effective_tool_tags", "biome_ids", "sky_light", "block_light", "include_block_entity", "require_line_of_sight")
    class PropertiesEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    BLOCK_IDS_FIELD_NUMBER: _ClassVar[int]
    TAGS_FIELD_NUMBER: _ClassVar[int]
    PROPERTIES_FIELD_NUMBER: _ClassVar[int]
    SOLID_FIELD_NUMBER: _ClassVar[int]
    REPLACEABLE_FIELD_NUMBER: _ClassVar[int]
    INTERACTIVE_FIELD_NUMBER: _ClassVar[int]
    DIGGABLE_FIELD_NUMBER: _ClassVar[int]
    EFFECTIVE_TOOL_TAGS_FIELD_NUMBER: _ClassVar[int]
    BIOME_IDS_FIELD_NUMBER: _ClassVar[int]
    SKY_LIGHT_FIELD_NUMBER: _ClassVar[int]
    BLOCK_LIGHT_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_BLOCK_ENTITY_FIELD_NUMBER: _ClassVar[int]
    REQUIRE_LINE_OF_SIGHT_FIELD_NUMBER: _ClassVar[int]
    block_ids: _containers.RepeatedScalarFieldContainer[str]
    tags: _containers.RepeatedScalarFieldContainer[str]
    properties: _containers.ScalarMap[str, str]
    solid: bool
    replaceable: bool
    interactive: bool
    diggable: bool
    effective_tool_tags: _containers.RepeatedScalarFieldContainer[str]
    biome_ids: _containers.RepeatedScalarFieldContainer[str]
    sky_light: IntRange
    block_light: IntRange
    include_block_entity: bool
    require_line_of_sight: bool
    def __init__(self, block_ids: _Optional[_Iterable[str]] = ..., tags: _Optional[_Iterable[str]] = ..., properties: _Optional[_Mapping[str, str]] = ..., solid: bool = ..., replaceable: bool = ..., interactive: bool = ..., diggable: bool = ..., effective_tool_tags: _Optional[_Iterable[str]] = ..., biome_ids: _Optional[_Iterable[str]] = ..., sky_light: _Optional[_Union[IntRange, _Mapping]] = ..., block_light: _Optional[_Union[IntRange, _Mapping]] = ..., include_block_entity: bool = ..., require_line_of_sight: bool = ...) -> None: ...

class EntitySelector(_message.Message):
    __slots__ = ("entity_types", "tags", "categories", "uuid", "network_id", "player_name", "alive", "health", "custom_name", "equipped_item_ids", "effect_ids", "owner_uuid", "require_line_of_sight")
    ENTITY_TYPES_FIELD_NUMBER: _ClassVar[int]
    TAGS_FIELD_NUMBER: _ClassVar[int]
    CATEGORIES_FIELD_NUMBER: _ClassVar[int]
    UUID_FIELD_NUMBER: _ClassVar[int]
    NETWORK_ID_FIELD_NUMBER: _ClassVar[int]
    PLAYER_NAME_FIELD_NUMBER: _ClassVar[int]
    ALIVE_FIELD_NUMBER: _ClassVar[int]
    HEALTH_FIELD_NUMBER: _ClassVar[int]
    CUSTOM_NAME_FIELD_NUMBER: _ClassVar[int]
    EQUIPPED_ITEM_IDS_FIELD_NUMBER: _ClassVar[int]
    EFFECT_IDS_FIELD_NUMBER: _ClassVar[int]
    OWNER_UUID_FIELD_NUMBER: _ClassVar[int]
    REQUIRE_LINE_OF_SIGHT_FIELD_NUMBER: _ClassVar[int]
    entity_types: _containers.RepeatedScalarFieldContainer[str]
    tags: _containers.RepeatedScalarFieldContainer[str]
    categories: _containers.RepeatedScalarFieldContainer[_domain_pb2.EntityCategory]
    uuid: str
    network_id: int
    player_name: str
    alive: bool
    health: FloatRange
    custom_name: str
    equipped_item_ids: _containers.RepeatedScalarFieldContainer[str]
    effect_ids: _containers.RepeatedScalarFieldContainer[str]
    owner_uuid: str
    require_line_of_sight: bool
    def __init__(self, entity_types: _Optional[_Iterable[str]] = ..., tags: _Optional[_Iterable[str]] = ..., categories: _Optional[_Iterable[_Union[_domain_pb2.EntityCategory, str]]] = ..., uuid: _Optional[str] = ..., network_id: _Optional[int] = ..., player_name: _Optional[str] = ..., alive: bool = ..., health: _Optional[_Union[FloatRange, _Mapping]] = ..., custom_name: _Optional[str] = ..., equipped_item_ids: _Optional[_Iterable[str]] = ..., effect_ids: _Optional[_Iterable[str]] = ..., owner_uuid: _Optional[str] = ..., require_line_of_sight: bool = ...) -> None: ...

class QueryRegion(_message.Message):
    __slots__ = ("sphere", "box")
    SPHERE_FIELD_NUMBER: _ClassVar[int]
    BOX_FIELD_NUMBER: _ClassVar[int]
    sphere: SphereRegion
    box: BoxRegion
    def __init__(self, sphere: _Optional[_Union[SphereRegion, _Mapping]] = ..., box: _Optional[_Union[BoxRegion, _Mapping]] = ...) -> None: ...

class SphereRegion(_message.Message):
    __slots__ = ("center", "radius")
    CENTER_FIELD_NUMBER: _ClassVar[int]
    RADIUS_FIELD_NUMBER: _ClassVar[int]
    center: _common_pb2.WorldPosition
    radius: float
    def __init__(self, center: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., radius: _Optional[float] = ...) -> None: ...

class BoxRegion(_message.Message):
    __slots__ = ("minimum", "maximum")
    MINIMUM_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_FIELD_NUMBER: _ClassVar[int]
    minimum: _common_pb2.BlockPosition
    maximum: _common_pb2.BlockPosition
    def __init__(self, minimum: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., maximum: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ...) -> None: ...

class GetPlayerSnapshotRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ...) -> None: ...

class GetPlayerSnapshotResponse(_message.Message):
    __slots__ = ("player",)
    PLAYER_FIELD_NUMBER: _ClassVar[int]
    player: _domain_pb2.PlayerSnapshot
    def __init__(self, player: _Optional[_Union[_domain_pb2.PlayerSnapshot, _Mapping]] = ...) -> None: ...

class GetWorldBlockRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "position", "include_block_entity", "include_shapes")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_BLOCK_ENTITY_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_SHAPES_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    position: _common_pb2.BlockPosition
    include_block_entity: bool
    include_shapes: bool
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., position: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., include_block_entity: bool = ..., include_shapes: bool = ...) -> None: ...

class GetWorldBlockResponse(_message.Message):
    __slots__ = ("block",)
    BLOCK_FIELD_NUMBER: _ClassVar[int]
    block: _domain_pb2.BlockSnapshot
    def __init__(self, block: _Optional[_Union[_domain_pb2.BlockSnapshot, _Mapping]] = ...) -> None: ...

class QueryBlocksRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "region", "selector", "sort", "page_size", "page_token")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    REGION_FIELD_NUMBER: _ClassVar[int]
    SELECTOR_FIELD_NUMBER: _ClassVar[int]
    SORT_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    region: QueryRegion
    selector: BlockSelector
    sort: QuerySort
    page_size: int
    page_token: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., region: _Optional[_Union[QueryRegion, _Mapping]] = ..., selector: _Optional[_Union[BlockSelector, _Mapping]] = ..., sort: _Optional[_Union[QuerySort, str]] = ..., page_size: _Optional[int] = ..., page_token: _Optional[str] = ...) -> None: ...

class QueryBlocksResponse(_message.Message):
    __slots__ = ("blocks", "next_page_token", "world_revision")
    BLOCKS_FIELD_NUMBER: _ClassVar[int]
    NEXT_PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    WORLD_REVISION_FIELD_NUMBER: _ClassVar[int]
    blocks: _containers.RepeatedCompositeFieldContainer[_domain_pb2.BlockSnapshot]
    next_page_token: str
    world_revision: int
    def __init__(self, blocks: _Optional[_Iterable[_Union[_domain_pb2.BlockSnapshot, _Mapping]]] = ..., next_page_token: _Optional[str] = ..., world_revision: _Optional[int] = ...) -> None: ...

class GetWorldEntityRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "entity")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    ENTITY_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    entity: _domain_pb2.EntityReference
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., entity: _Optional[_Union[_domain_pb2.EntityReference, _Mapping]] = ...) -> None: ...

class GetWorldEntityResponse(_message.Message):
    __slots__ = ("entity",)
    ENTITY_FIELD_NUMBER: _ClassVar[int]
    entity: _domain_pb2.EntitySnapshot
    def __init__(self, entity: _Optional[_Union[_domain_pb2.EntitySnapshot, _Mapping]] = ...) -> None: ...

class QueryEntitiesRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "origin", "radius", "selector", "sort", "page_size", "page_token")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    ORIGIN_FIELD_NUMBER: _ClassVar[int]
    RADIUS_FIELD_NUMBER: _ClassVar[int]
    SELECTOR_FIELD_NUMBER: _ClassVar[int]
    SORT_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    origin: _common_pb2.WorldPosition
    radius: float
    selector: EntitySelector
    sort: QuerySort
    page_size: int
    page_token: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., origin: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., radius: _Optional[float] = ..., selector: _Optional[_Union[EntitySelector, _Mapping]] = ..., sort: _Optional[_Union[QuerySort, str]] = ..., page_size: _Optional[int] = ..., page_token: _Optional[str] = ...) -> None: ...

class QueryEntitiesResponse(_message.Message):
    __slots__ = ("entities", "next_page_token", "world_revision")
    ENTITIES_FIELD_NUMBER: _ClassVar[int]
    NEXT_PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    WORLD_REVISION_FIELD_NUMBER: _ClassVar[int]
    entities: _containers.RepeatedCompositeFieldContainer[_domain_pb2.EntitySnapshot]
    next_page_token: str
    world_revision: int
    def __init__(self, entities: _Optional[_Iterable[_Union[_domain_pb2.EntitySnapshot, _Mapping]]] = ..., next_page_token: _Optional[str] = ..., world_revision: _Optional[int] = ...) -> None: ...

class RaycastRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "origin", "direction", "maximum_distance", "include_fluids", "include_entities")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    ORIGIN_FIELD_NUMBER: _ClassVar[int]
    DIRECTION_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_DISTANCE_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_FLUIDS_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_ENTITIES_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    origin: _common_pb2.WorldPosition
    direction: _domain_pb2.Vec3
    maximum_distance: float
    include_fluids: bool
    include_entities: bool
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., origin: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., direction: _Optional[_Union[_domain_pb2.Vec3, _Mapping]] = ..., maximum_distance: _Optional[float] = ..., include_fluids: bool = ..., include_entities: bool = ...) -> None: ...

class RaycastResponse(_message.Message):
    __slots__ = ("block", "entity", "hit_position", "block_face", "distance")
    BLOCK_FIELD_NUMBER: _ClassVar[int]
    ENTITY_FIELD_NUMBER: _ClassVar[int]
    HIT_POSITION_FIELD_NUMBER: _ClassVar[int]
    BLOCK_FACE_FIELD_NUMBER: _ClassVar[int]
    DISTANCE_FIELD_NUMBER: _ClassVar[int]
    block: _domain_pb2.BlockSnapshot
    entity: _domain_pb2.EntitySnapshot
    hit_position: _common_pb2.WorldPosition
    block_face: _bot_live_pb2.BlockFace
    distance: float
    def __init__(self, block: _Optional[_Union[_domain_pb2.BlockSnapshot, _Mapping]] = ..., entity: _Optional[_Union[_domain_pb2.EntitySnapshot, _Mapping]] = ..., hit_position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., block_face: _Optional[_Union[_bot_live_pb2.BlockFace, str]] = ..., distance: _Optional[float] = ...) -> None: ...

class CanSeeBlockRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "position")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    position: _common_pb2.BlockPosition
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., position: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ...) -> None: ...

class CanSeeBlockResponse(_message.Message):
    __slots__ = ("visible", "distance", "block")
    VISIBLE_FIELD_NUMBER: _ClassVar[int]
    DISTANCE_FIELD_NUMBER: _ClassVar[int]
    BLOCK_FIELD_NUMBER: _ClassVar[int]
    visible: bool
    distance: float
    block: _domain_pb2.BlockSnapshot
    def __init__(self, visible: bool = ..., distance: _Optional[float] = ..., block: _Optional[_Union[_domain_pb2.BlockSnapshot, _Mapping]] = ...) -> None: ...

class EstimateDigTimeRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "position")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    position: _common_pb2.BlockPosition
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., position: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ...) -> None: ...

class EstimateDigTimeResponse(_message.Message):
    __slots__ = ("diggable", "instant", "ticks", "duration_ms", "progress_per_tick", "correct_tool_for_drops", "block")
    DIGGABLE_FIELD_NUMBER: _ClassVar[int]
    INSTANT_FIELD_NUMBER: _ClassVar[int]
    TICKS_FIELD_NUMBER: _ClassVar[int]
    DURATION_MS_FIELD_NUMBER: _ClassVar[int]
    PROGRESS_PER_TICK_FIELD_NUMBER: _ClassVar[int]
    CORRECT_TOOL_FOR_DROPS_FIELD_NUMBER: _ClassVar[int]
    BLOCK_FIELD_NUMBER: _ClassVar[int]
    diggable: bool
    instant: bool
    ticks: int
    duration_ms: int
    progress_per_tick: float
    correct_tool_for_drops: bool
    block: _domain_pb2.BlockSnapshot
    def __init__(self, diggable: bool = ..., instant: bool = ..., ticks: _Optional[int] = ..., duration_ms: _Optional[int] = ..., progress_per_tick: _Optional[float] = ..., correct_tool_for_drops: bool = ..., block: _Optional[_Union[_domain_pb2.BlockSnapshot, _Mapping]] = ...) -> None: ...

class EstimateExplosionDamageRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "target", "center", "power")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    TARGET_FIELD_NUMBER: _ClassVar[int]
    CENTER_FIELD_NUMBER: _ClassVar[int]
    POWER_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    target: _domain_pb2.EntityReference
    center: _common_pb2.WorldPosition
    power: float
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., target: _Optional[_Union[_domain_pb2.EntityReference, _Mapping]] = ..., center: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., power: _Optional[float] = ...) -> None: ...

class EstimateExplosionDamageResponse(_message.Message):
    __slots__ = ("distance", "damage_radius", "exposure", "raw_damage", "damage_after_armor", "damage_after_resistance", "damage_after_enchantments", "absorbed_damage", "estimated_health_damage", "invulnerable", "armor_points", "armor_toughness", "resistance_level", "explosion_protection")
    DISTANCE_FIELD_NUMBER: _ClassVar[int]
    DAMAGE_RADIUS_FIELD_NUMBER: _ClassVar[int]
    EXPOSURE_FIELD_NUMBER: _ClassVar[int]
    RAW_DAMAGE_FIELD_NUMBER: _ClassVar[int]
    DAMAGE_AFTER_ARMOR_FIELD_NUMBER: _ClassVar[int]
    DAMAGE_AFTER_RESISTANCE_FIELD_NUMBER: _ClassVar[int]
    DAMAGE_AFTER_ENCHANTMENTS_FIELD_NUMBER: _ClassVar[int]
    ABSORBED_DAMAGE_FIELD_NUMBER: _ClassVar[int]
    ESTIMATED_HEALTH_DAMAGE_FIELD_NUMBER: _ClassVar[int]
    INVULNERABLE_FIELD_NUMBER: _ClassVar[int]
    ARMOR_POINTS_FIELD_NUMBER: _ClassVar[int]
    ARMOR_TOUGHNESS_FIELD_NUMBER: _ClassVar[int]
    RESISTANCE_LEVEL_FIELD_NUMBER: _ClassVar[int]
    EXPLOSION_PROTECTION_FIELD_NUMBER: _ClassVar[int]
    distance: float
    damage_radius: float
    exposure: float
    raw_damage: float
    damage_after_armor: float
    damage_after_resistance: float
    damage_after_enchantments: float
    absorbed_damage: float
    estimated_health_damage: float
    invulnerable: bool
    armor_points: int
    armor_toughness: float
    resistance_level: int
    explosion_protection: int
    def __init__(self, distance: _Optional[float] = ..., damage_radius: _Optional[float] = ..., exposure: _Optional[float] = ..., raw_damage: _Optional[float] = ..., damage_after_armor: _Optional[float] = ..., damage_after_resistance: _Optional[float] = ..., damage_after_enchantments: _Optional[float] = ..., absorbed_damage: _Optional[float] = ..., estimated_health_damage: _Optional[float] = ..., invulnerable: bool = ..., armor_points: _Optional[int] = ..., armor_toughness: _Optional[float] = ..., resistance_level: _Optional[int] = ..., explosion_protection: _Optional[int] = ...) -> None: ...
