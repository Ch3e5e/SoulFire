from google.protobuf import struct_pb2 as _struct_pb2
from soulfire import bot_pb2 as _bot_pb2
from soulfire import common_pb2 as _common_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class EntityCategory(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ENTITY_CATEGORY_UNSPECIFIED: _ClassVar[EntityCategory]
    ENTITY_CATEGORY_PLAYER: _ClassVar[EntityCategory]
    ENTITY_CATEGORY_HOSTILE: _ClassVar[EntityCategory]
    ENTITY_CATEGORY_PASSIVE: _ClassVar[EntityCategory]
    ENTITY_CATEGORY_PROJECTILE: _ClassVar[EntityCategory]
    ENTITY_CATEGORY_VEHICLE: _ClassVar[EntityCategory]
    ENTITY_CATEGORY_DROPPED_ITEM: _ClassVar[EntityCategory]
    ENTITY_CATEGORY_OTHER: _ClassVar[EntityCategory]
ENTITY_CATEGORY_UNSPECIFIED: EntityCategory
ENTITY_CATEGORY_PLAYER: EntityCategory
ENTITY_CATEGORY_HOSTILE: EntityCategory
ENTITY_CATEGORY_PASSIVE: EntityCategory
ENTITY_CATEGORY_PROJECTILE: EntityCategory
ENTITY_CATEGORY_VEHICLE: EntityCategory
ENTITY_CATEGORY_DROPPED_ITEM: EntityCategory
ENTITY_CATEGORY_OTHER: EntityCategory

class Vec3(_message.Message):
    __slots__ = ("x", "y", "z")
    X_FIELD_NUMBER: _ClassVar[int]
    Y_FIELD_NUMBER: _ClassVar[int]
    Z_FIELD_NUMBER: _ClassVar[int]
    x: float
    y: float
    z: float
    def __init__(self, x: _Optional[float] = ..., y: _Optional[float] = ..., z: _Optional[float] = ...) -> None: ...

class Rotation(_message.Message):
    __slots__ = ("yaw", "pitch", "head_yaw")
    YAW_FIELD_NUMBER: _ClassVar[int]
    PITCH_FIELD_NUMBER: _ClassVar[int]
    HEAD_YAW_FIELD_NUMBER: _ClassVar[int]
    yaw: float
    pitch: float
    head_yaw: float
    def __init__(self, yaw: _Optional[float] = ..., pitch: _Optional[float] = ..., head_yaw: _Optional[float] = ...) -> None: ...

class BoundingBox(_message.Message):
    __slots__ = ("minimum", "maximum")
    MINIMUM_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_FIELD_NUMBER: _ClassVar[int]
    minimum: Vec3
    maximum: Vec3
    def __init__(self, minimum: _Optional[_Union[Vec3, _Mapping]] = ..., maximum: _Optional[_Union[Vec3, _Mapping]] = ...) -> None: ...

class TextComponent(_message.Message):
    __slots__ = ("plain_text", "json")
    PLAIN_TEXT_FIELD_NUMBER: _ClassVar[int]
    JSON_FIELD_NUMBER: _ClassVar[int]
    plain_text: str
    json: str
    def __init__(self, plain_text: _Optional[str] = ..., json: _Optional[str] = ...) -> None: ...

class EnchantmentSnapshot(_message.Message):
    __slots__ = ("enchantment_id", "level")
    ENCHANTMENT_ID_FIELD_NUMBER: _ClassVar[int]
    LEVEL_FIELD_NUMBER: _ClassVar[int]
    enchantment_id: str
    level: int
    def __init__(self, enchantment_id: _Optional[str] = ..., level: _Optional[int] = ...) -> None: ...

class EffectSnapshot(_message.Message):
    __slots__ = ("effect_id", "amplifier", "duration_ticks", "ambient", "visible", "show_icon")
    EFFECT_ID_FIELD_NUMBER: _ClassVar[int]
    AMPLIFIER_FIELD_NUMBER: _ClassVar[int]
    DURATION_TICKS_FIELD_NUMBER: _ClassVar[int]
    AMBIENT_FIELD_NUMBER: _ClassVar[int]
    VISIBLE_FIELD_NUMBER: _ClassVar[int]
    SHOW_ICON_FIELD_NUMBER: _ClassVar[int]
    effect_id: str
    amplifier: int
    duration_ticks: int
    ambient: bool
    visible: bool
    show_icon: bool
    def __init__(self, effect_id: _Optional[str] = ..., amplifier: _Optional[int] = ..., duration_ticks: _Optional[int] = ..., ambient: bool = ..., visible: bool = ..., show_icon: bool = ...) -> None: ...

class AttributeModifierSnapshot(_message.Message):
    __slots__ = ("id", "amount", "operation")
    ID_FIELD_NUMBER: _ClassVar[int]
    AMOUNT_FIELD_NUMBER: _ClassVar[int]
    OPERATION_FIELD_NUMBER: _ClassVar[int]
    id: str
    amount: float
    operation: str
    def __init__(self, id: _Optional[str] = ..., amount: _Optional[float] = ..., operation: _Optional[str] = ...) -> None: ...

class AttributeSnapshot(_message.Message):
    __slots__ = ("attribute_id", "base_value", "value", "modifiers")
    ATTRIBUTE_ID_FIELD_NUMBER: _ClassVar[int]
    BASE_VALUE_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    MODIFIERS_FIELD_NUMBER: _ClassVar[int]
    attribute_id: str
    base_value: float
    value: float
    modifiers: _containers.RepeatedCompositeFieldContainer[AttributeModifierSnapshot]
    def __init__(self, attribute_id: _Optional[str] = ..., base_value: _Optional[float] = ..., value: _Optional[float] = ..., modifiers: _Optional[_Iterable[_Union[AttributeModifierSnapshot, _Mapping]]] = ...) -> None: ...

class FoodProperties(_message.Message):
    __slots__ = ("nutrition", "saturation_modifier", "can_always_eat", "eat_seconds")
    NUTRITION_FIELD_NUMBER: _ClassVar[int]
    SATURATION_MODIFIER_FIELD_NUMBER: _ClassVar[int]
    CAN_ALWAYS_EAT_FIELD_NUMBER: _ClassVar[int]
    EAT_SECONDS_FIELD_NUMBER: _ClassVar[int]
    nutrition: int
    saturation_modifier: float
    can_always_eat: bool
    eat_seconds: float
    def __init__(self, nutrition: _Optional[int] = ..., saturation_modifier: _Optional[float] = ..., can_always_eat: bool = ..., eat_seconds: _Optional[float] = ...) -> None: ...

class ToolProperties(_message.Message):
    __slots__ = ("tool_tags", "default_mining_speed", "harvest_level")
    TOOL_TAGS_FIELD_NUMBER: _ClassVar[int]
    DEFAULT_MINING_SPEED_FIELD_NUMBER: _ClassVar[int]
    HARVEST_LEVEL_FIELD_NUMBER: _ClassVar[int]
    tool_tags: _containers.RepeatedScalarFieldContainer[str]
    default_mining_speed: float
    harvest_level: int
    def __init__(self, tool_tags: _Optional[_Iterable[str]] = ..., default_mining_speed: _Optional[float] = ..., harvest_level: _Optional[int] = ...) -> None: ...

class ArmorProperties(_message.Message):
    __slots__ = ("equipment_slot", "defense", "toughness", "knockback_resistance")
    EQUIPMENT_SLOT_FIELD_NUMBER: _ClassVar[int]
    DEFENSE_FIELD_NUMBER: _ClassVar[int]
    TOUGHNESS_FIELD_NUMBER: _ClassVar[int]
    KNOCKBACK_RESISTANCE_FIELD_NUMBER: _ClassVar[int]
    equipment_slot: str
    defense: int
    toughness: float
    knockback_resistance: float
    def __init__(self, equipment_slot: _Optional[str] = ..., defense: _Optional[int] = ..., toughness: _Optional[float] = ..., knockback_resistance: _Optional[float] = ...) -> None: ...

class PotionProperties(_message.Message):
    __slots__ = ("potion_id", "effects", "color")
    POTION_ID_FIELD_NUMBER: _ClassVar[int]
    EFFECTS_FIELD_NUMBER: _ClassVar[int]
    COLOR_FIELD_NUMBER: _ClassVar[int]
    potion_id: str
    effects: _containers.RepeatedCompositeFieldContainer[EffectSnapshot]
    color: int
    def __init__(self, potion_id: _Optional[str] = ..., effects: _Optional[_Iterable[_Union[EffectSnapshot, _Mapping]]] = ..., color: _Optional[int] = ...) -> None: ...

class ItemStackSnapshot(_message.Message):
    __slots__ = ("item_id", "count", "max_stack_size", "damage", "max_damage", "custom_name", "lore", "enchantments", "food", "tool", "armor", "components", "custom_data_nbt", "fingerprint", "potion")
    ITEM_ID_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    MAX_STACK_SIZE_FIELD_NUMBER: _ClassVar[int]
    DAMAGE_FIELD_NUMBER: _ClassVar[int]
    MAX_DAMAGE_FIELD_NUMBER: _ClassVar[int]
    CUSTOM_NAME_FIELD_NUMBER: _ClassVar[int]
    LORE_FIELD_NUMBER: _ClassVar[int]
    ENCHANTMENTS_FIELD_NUMBER: _ClassVar[int]
    FOOD_FIELD_NUMBER: _ClassVar[int]
    TOOL_FIELD_NUMBER: _ClassVar[int]
    ARMOR_FIELD_NUMBER: _ClassVar[int]
    COMPONENTS_FIELD_NUMBER: _ClassVar[int]
    CUSTOM_DATA_NBT_FIELD_NUMBER: _ClassVar[int]
    FINGERPRINT_FIELD_NUMBER: _ClassVar[int]
    POTION_FIELD_NUMBER: _ClassVar[int]
    item_id: str
    count: int
    max_stack_size: int
    damage: int
    max_damage: int
    custom_name: TextComponent
    lore: _containers.RepeatedCompositeFieldContainer[TextComponent]
    enchantments: _containers.RepeatedCompositeFieldContainer[EnchantmentSnapshot]
    food: FoodProperties
    tool: ToolProperties
    armor: ArmorProperties
    components: _struct_pb2.Struct
    custom_data_nbt: bytes
    fingerprint: str
    potion: PotionProperties
    def __init__(self, item_id: _Optional[str] = ..., count: _Optional[int] = ..., max_stack_size: _Optional[int] = ..., damage: _Optional[int] = ..., max_damage: _Optional[int] = ..., custom_name: _Optional[_Union[TextComponent, _Mapping]] = ..., lore: _Optional[_Iterable[_Union[TextComponent, _Mapping]]] = ..., enchantments: _Optional[_Iterable[_Union[EnchantmentSnapshot, _Mapping]]] = ..., food: _Optional[_Union[FoodProperties, _Mapping]] = ..., tool: _Optional[_Union[ToolProperties, _Mapping]] = ..., armor: _Optional[_Union[ArmorProperties, _Mapping]] = ..., components: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ..., custom_data_nbt: _Optional[bytes] = ..., fingerprint: _Optional[str] = ..., potion: _Optional[_Union[PotionProperties, _Mapping]] = ...) -> None: ...

class EntityReference(_message.Message):
    __slots__ = ("connection_epoch", "network_id", "uuid")
    CONNECTION_EPOCH_FIELD_NUMBER: _ClassVar[int]
    NETWORK_ID_FIELD_NUMBER: _ClassVar[int]
    UUID_FIELD_NUMBER: _ClassVar[int]
    connection_epoch: str
    network_id: int
    uuid: str
    def __init__(self, connection_epoch: _Optional[str] = ..., network_id: _Optional[int] = ..., uuid: _Optional[str] = ...) -> None: ...

class EntitySnapshot(_message.Message):
    __slots__ = ("reference", "entity_type", "category", "position", "velocity", "rotation", "bounding_box", "pose", "on_ground", "display_name", "player_name", "health", "max_health", "equipment", "effects", "attributes", "vehicle", "passengers", "owner", "target", "item", "alive", "metadata", "age_ticks", "tamed")
    class EquipmentEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: ItemStackSnapshot
        def __init__(self, key: _Optional[str] = ..., value: _Optional[_Union[ItemStackSnapshot, _Mapping]] = ...) -> None: ...
    REFERENCE_FIELD_NUMBER: _ClassVar[int]
    ENTITY_TYPE_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_FIELD_NUMBER: _ClassVar[int]
    POSITION_FIELD_NUMBER: _ClassVar[int]
    VELOCITY_FIELD_NUMBER: _ClassVar[int]
    ROTATION_FIELD_NUMBER: _ClassVar[int]
    BOUNDING_BOX_FIELD_NUMBER: _ClassVar[int]
    POSE_FIELD_NUMBER: _ClassVar[int]
    ON_GROUND_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    PLAYER_NAME_FIELD_NUMBER: _ClassVar[int]
    HEALTH_FIELD_NUMBER: _ClassVar[int]
    MAX_HEALTH_FIELD_NUMBER: _ClassVar[int]
    EQUIPMENT_FIELD_NUMBER: _ClassVar[int]
    EFFECTS_FIELD_NUMBER: _ClassVar[int]
    ATTRIBUTES_FIELD_NUMBER: _ClassVar[int]
    VEHICLE_FIELD_NUMBER: _ClassVar[int]
    PASSENGERS_FIELD_NUMBER: _ClassVar[int]
    OWNER_FIELD_NUMBER: _ClassVar[int]
    TARGET_FIELD_NUMBER: _ClassVar[int]
    ITEM_FIELD_NUMBER: _ClassVar[int]
    ALIVE_FIELD_NUMBER: _ClassVar[int]
    METADATA_FIELD_NUMBER: _ClassVar[int]
    AGE_TICKS_FIELD_NUMBER: _ClassVar[int]
    TAMED_FIELD_NUMBER: _ClassVar[int]
    reference: EntityReference
    entity_type: str
    category: EntityCategory
    position: _common_pb2.WorldPosition
    velocity: Vec3
    rotation: Rotation
    bounding_box: BoundingBox
    pose: str
    on_ground: bool
    display_name: TextComponent
    player_name: str
    health: float
    max_health: float
    equipment: _containers.MessageMap[str, ItemStackSnapshot]
    effects: _containers.RepeatedCompositeFieldContainer[EffectSnapshot]
    attributes: _containers.RepeatedCompositeFieldContainer[AttributeSnapshot]
    vehicle: EntityReference
    passengers: _containers.RepeatedCompositeFieldContainer[EntityReference]
    owner: EntityReference
    target: EntityReference
    item: ItemStackSnapshot
    alive: bool
    metadata: _struct_pb2.Struct
    age_ticks: int
    tamed: bool
    def __init__(self, reference: _Optional[_Union[EntityReference, _Mapping]] = ..., entity_type: _Optional[str] = ..., category: _Optional[_Union[EntityCategory, str]] = ..., position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., velocity: _Optional[_Union[Vec3, _Mapping]] = ..., rotation: _Optional[_Union[Rotation, _Mapping]] = ..., bounding_box: _Optional[_Union[BoundingBox, _Mapping]] = ..., pose: _Optional[str] = ..., on_ground: bool = ..., display_name: _Optional[_Union[TextComponent, _Mapping]] = ..., player_name: _Optional[str] = ..., health: _Optional[float] = ..., max_health: _Optional[float] = ..., equipment: _Optional[_Mapping[str, ItemStackSnapshot]] = ..., effects: _Optional[_Iterable[_Union[EffectSnapshot, _Mapping]]] = ..., attributes: _Optional[_Iterable[_Union[AttributeSnapshot, _Mapping]]] = ..., vehicle: _Optional[_Union[EntityReference, _Mapping]] = ..., passengers: _Optional[_Iterable[_Union[EntityReference, _Mapping]]] = ..., owner: _Optional[_Union[EntityReference, _Mapping]] = ..., target: _Optional[_Union[EntityReference, _Mapping]] = ..., item: _Optional[_Union[ItemStackSnapshot, _Mapping]] = ..., alive: bool = ..., metadata: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ..., age_ticks: _Optional[int] = ..., tamed: bool = ...) -> None: ...

class FluidSnapshot(_message.Message):
    __slots__ = ("fluid_id", "source", "height")
    FLUID_ID_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FIELD_NUMBER: _ClassVar[int]
    HEIGHT_FIELD_NUMBER: _ClassVar[int]
    fluid_id: str
    source: bool
    height: float
    def __init__(self, fluid_id: _Optional[str] = ..., source: bool = ..., height: _Optional[float] = ...) -> None: ...

class VoxelShape(_message.Message):
    __slots__ = ("boxes",)
    BOXES_FIELD_NUMBER: _ClassVar[int]
    boxes: _containers.RepeatedCompositeFieldContainer[BoundingBox]
    def __init__(self, boxes: _Optional[_Iterable[_Union[BoundingBox, _Mapping]]] = ...) -> None: ...

class BlockSnapshot(_message.Message):
    __slots__ = ("position", "block_id", "properties", "block_entity", "biome_id", "sky_light", "block_light", "hardness", "diggable", "replaceable", "solid", "interactive", "effective_tool_tags", "fluid", "collision_shape", "interaction_shape", "chunk_revision")
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
    BLOCK_ENTITY_FIELD_NUMBER: _ClassVar[int]
    BIOME_ID_FIELD_NUMBER: _ClassVar[int]
    SKY_LIGHT_FIELD_NUMBER: _ClassVar[int]
    BLOCK_LIGHT_FIELD_NUMBER: _ClassVar[int]
    HARDNESS_FIELD_NUMBER: _ClassVar[int]
    DIGGABLE_FIELD_NUMBER: _ClassVar[int]
    REPLACEABLE_FIELD_NUMBER: _ClassVar[int]
    SOLID_FIELD_NUMBER: _ClassVar[int]
    INTERACTIVE_FIELD_NUMBER: _ClassVar[int]
    EFFECTIVE_TOOL_TAGS_FIELD_NUMBER: _ClassVar[int]
    FLUID_FIELD_NUMBER: _ClassVar[int]
    COLLISION_SHAPE_FIELD_NUMBER: _ClassVar[int]
    INTERACTION_SHAPE_FIELD_NUMBER: _ClassVar[int]
    CHUNK_REVISION_FIELD_NUMBER: _ClassVar[int]
    position: _common_pb2.BlockPosition
    block_id: str
    properties: _containers.ScalarMap[str, str]
    block_entity: _struct_pb2.Struct
    biome_id: str
    sky_light: int
    block_light: int
    hardness: float
    diggable: bool
    replaceable: bool
    solid: bool
    interactive: bool
    effective_tool_tags: _containers.RepeatedScalarFieldContainer[str]
    fluid: FluidSnapshot
    collision_shape: VoxelShape
    interaction_shape: VoxelShape
    chunk_revision: int
    def __init__(self, position: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., block_id: _Optional[str] = ..., properties: _Optional[_Mapping[str, str]] = ..., block_entity: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ..., biome_id: _Optional[str] = ..., sky_light: _Optional[int] = ..., block_light: _Optional[int] = ..., hardness: _Optional[float] = ..., diggable: bool = ..., replaceable: bool = ..., solid: bool = ..., interactive: bool = ..., effective_tool_tags: _Optional[_Iterable[str]] = ..., fluid: _Optional[_Union[FluidSnapshot, _Mapping]] = ..., collision_shape: _Optional[_Union[VoxelShape, _Mapping]] = ..., interaction_shape: _Optional[_Union[VoxelShape, _Mapping]] = ..., chunk_revision: _Optional[int] = ...) -> None: ...

class PlayerAbilitiesSnapshot(_message.Message):
    __slots__ = ("invulnerable", "flying", "may_fly", "instant_build", "flying_speed", "walking_speed")
    INVULNERABLE_FIELD_NUMBER: _ClassVar[int]
    FLYING_FIELD_NUMBER: _ClassVar[int]
    MAY_FLY_FIELD_NUMBER: _ClassVar[int]
    INSTANT_BUILD_FIELD_NUMBER: _ClassVar[int]
    FLYING_SPEED_FIELD_NUMBER: _ClassVar[int]
    WALKING_SPEED_FIELD_NUMBER: _ClassVar[int]
    invulnerable: bool
    flying: bool
    may_fly: bool
    instant_build: bool
    flying_speed: float
    walking_speed: float
    def __init__(self, invulnerable: bool = ..., flying: bool = ..., may_fly: bool = ..., instant_build: bool = ..., flying_speed: _Optional[float] = ..., walking_speed: _Optional[float] = ...) -> None: ...

class ExperienceSnapshot(_message.Message):
    __slots__ = ("level", "progress", "total")
    LEVEL_FIELD_NUMBER: _ClassVar[int]
    PROGRESS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    level: int
    progress: float
    total: int
    def __init__(self, level: _Optional[int] = ..., progress: _Optional[float] = ..., total: _Optional[int] = ...) -> None: ...

class PlayerSnapshot(_message.Message):
    __slots__ = ("position", "velocity", "rotation", "on_ground", "pose", "health", "max_health", "food", "saturation", "exhaustion", "air", "max_air", "fire_ticks", "freezing_ticks", "experience", "game_mode", "abilities", "selected_hotbar_slot", "main_hand", "off_hand", "equipment", "effects", "attributes", "sleeping", "using_item", "vehicle", "spawn_point", "dead", "last_damage", "connection_epoch", "revision")
    class EquipmentEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: ItemStackSnapshot
        def __init__(self, key: _Optional[str] = ..., value: _Optional[_Union[ItemStackSnapshot, _Mapping]] = ...) -> None: ...
    POSITION_FIELD_NUMBER: _ClassVar[int]
    VELOCITY_FIELD_NUMBER: _ClassVar[int]
    ROTATION_FIELD_NUMBER: _ClassVar[int]
    ON_GROUND_FIELD_NUMBER: _ClassVar[int]
    POSE_FIELD_NUMBER: _ClassVar[int]
    HEALTH_FIELD_NUMBER: _ClassVar[int]
    MAX_HEALTH_FIELD_NUMBER: _ClassVar[int]
    FOOD_FIELD_NUMBER: _ClassVar[int]
    SATURATION_FIELD_NUMBER: _ClassVar[int]
    EXHAUSTION_FIELD_NUMBER: _ClassVar[int]
    AIR_FIELD_NUMBER: _ClassVar[int]
    MAX_AIR_FIELD_NUMBER: _ClassVar[int]
    FIRE_TICKS_FIELD_NUMBER: _ClassVar[int]
    FREEZING_TICKS_FIELD_NUMBER: _ClassVar[int]
    EXPERIENCE_FIELD_NUMBER: _ClassVar[int]
    GAME_MODE_FIELD_NUMBER: _ClassVar[int]
    ABILITIES_FIELD_NUMBER: _ClassVar[int]
    SELECTED_HOTBAR_SLOT_FIELD_NUMBER: _ClassVar[int]
    MAIN_HAND_FIELD_NUMBER: _ClassVar[int]
    OFF_HAND_FIELD_NUMBER: _ClassVar[int]
    EQUIPMENT_FIELD_NUMBER: _ClassVar[int]
    EFFECTS_FIELD_NUMBER: _ClassVar[int]
    ATTRIBUTES_FIELD_NUMBER: _ClassVar[int]
    SLEEPING_FIELD_NUMBER: _ClassVar[int]
    USING_ITEM_FIELD_NUMBER: _ClassVar[int]
    VEHICLE_FIELD_NUMBER: _ClassVar[int]
    SPAWN_POINT_FIELD_NUMBER: _ClassVar[int]
    DEAD_FIELD_NUMBER: _ClassVar[int]
    LAST_DAMAGE_FIELD_NUMBER: _ClassVar[int]
    CONNECTION_EPOCH_FIELD_NUMBER: _ClassVar[int]
    REVISION_FIELD_NUMBER: _ClassVar[int]
    position: _common_pb2.WorldPosition
    velocity: Vec3
    rotation: Rotation
    on_ground: bool
    pose: str
    health: float
    max_health: float
    food: int
    saturation: float
    exhaustion: float
    air: int
    max_air: int
    fire_ticks: int
    freezing_ticks: int
    experience: ExperienceSnapshot
    game_mode: _bot_pb2.GameMode
    abilities: PlayerAbilitiesSnapshot
    selected_hotbar_slot: int
    main_hand: ItemStackSnapshot
    off_hand: ItemStackSnapshot
    equipment: _containers.MessageMap[str, ItemStackSnapshot]
    effects: _containers.RepeatedCompositeFieldContainer[EffectSnapshot]
    attributes: _containers.RepeatedCompositeFieldContainer[AttributeSnapshot]
    sleeping: bool
    using_item: bool
    vehicle: EntityReference
    spawn_point: _common_pb2.BlockPosition
    dead: bool
    last_damage: float
    connection_epoch: str
    revision: int
    def __init__(self, position: _Optional[_Union[_common_pb2.WorldPosition, _Mapping]] = ..., velocity: _Optional[_Union[Vec3, _Mapping]] = ..., rotation: _Optional[_Union[Rotation, _Mapping]] = ..., on_ground: bool = ..., pose: _Optional[str] = ..., health: _Optional[float] = ..., max_health: _Optional[float] = ..., food: _Optional[int] = ..., saturation: _Optional[float] = ..., exhaustion: _Optional[float] = ..., air: _Optional[int] = ..., max_air: _Optional[int] = ..., fire_ticks: _Optional[int] = ..., freezing_ticks: _Optional[int] = ..., experience: _Optional[_Union[ExperienceSnapshot, _Mapping]] = ..., game_mode: _Optional[_Union[_bot_pb2.GameMode, str]] = ..., abilities: _Optional[_Union[PlayerAbilitiesSnapshot, _Mapping]] = ..., selected_hotbar_slot: _Optional[int] = ..., main_hand: _Optional[_Union[ItemStackSnapshot, _Mapping]] = ..., off_hand: _Optional[_Union[ItemStackSnapshot, _Mapping]] = ..., equipment: _Optional[_Mapping[str, ItemStackSnapshot]] = ..., effects: _Optional[_Iterable[_Union[EffectSnapshot, _Mapping]]] = ..., attributes: _Optional[_Iterable[_Union[AttributeSnapshot, _Mapping]]] = ..., sleeping: bool = ..., using_item: bool = ..., vehicle: _Optional[_Union[EntityReference, _Mapping]] = ..., spawn_point: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., dead: bool = ..., last_damage: _Optional[float] = ..., connection_epoch: _Optional[str] = ..., revision: _Optional[int] = ...) -> None: ...
