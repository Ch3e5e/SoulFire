from google.api import annotations_pb2 as _annotations_pb2
from google.protobuf import struct_pb2 as _struct_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class RegistryKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    REGISTRY_KIND_UNSPECIFIED: _ClassVar[RegistryKind]
    REGISTRY_KIND_BLOCK: _ClassVar[RegistryKind]
    REGISTRY_KIND_ITEM: _ClassVar[RegistryKind]
    REGISTRY_KIND_ENTITY_TYPE: _ClassVar[RegistryKind]
    REGISTRY_KIND_BIOME: _ClassVar[RegistryKind]
    REGISTRY_KIND_DIMENSION: _ClassVar[RegistryKind]
    REGISTRY_KIND_RECIPE: _ClassVar[RegistryKind]
    REGISTRY_KIND_ENCHANTMENT: _ClassVar[RegistryKind]
    REGISTRY_KIND_EFFECT: _ClassVar[RegistryKind]
    REGISTRY_KIND_ATTRIBUTE: _ClassVar[RegistryKind]
    REGISTRY_KIND_GAME_EVENT: _ClassVar[RegistryKind]
    REGISTRY_KIND_SOUND: _ClassVar[RegistryKind]
    REGISTRY_KIND_PARTICLE: _ClassVar[RegistryKind]
    REGISTRY_KIND_CONTAINER: _ClassVar[RegistryKind]
REGISTRY_KIND_UNSPECIFIED: RegistryKind
REGISTRY_KIND_BLOCK: RegistryKind
REGISTRY_KIND_ITEM: RegistryKind
REGISTRY_KIND_ENTITY_TYPE: RegistryKind
REGISTRY_KIND_BIOME: RegistryKind
REGISTRY_KIND_DIMENSION: RegistryKind
REGISTRY_KIND_RECIPE: RegistryKind
REGISTRY_KIND_ENCHANTMENT: RegistryKind
REGISTRY_KIND_EFFECT: RegistryKind
REGISTRY_KIND_ATTRIBUTE: RegistryKind
REGISTRY_KIND_GAME_EVENT: RegistryKind
REGISTRY_KIND_SOUND: RegistryKind
REGISTRY_KIND_PARTICLE: RegistryKind
REGISTRY_KIND_CONTAINER: RegistryKind

class RegistryIdentity(_message.Message):
    __slots__ = ("soulfire_version", "minecraft_version", "protocol_version", "registry_hash")
    SOULFIRE_VERSION_FIELD_NUMBER: _ClassVar[int]
    MINECRAFT_VERSION_FIELD_NUMBER: _ClassVar[int]
    PROTOCOL_VERSION_FIELD_NUMBER: _ClassVar[int]
    REGISTRY_HASH_FIELD_NUMBER: _ClassVar[int]
    soulfire_version: str
    minecraft_version: str
    protocol_version: int
    registry_hash: str
    def __init__(self, soulfire_version: _Optional[str] = ..., minecraft_version: _Optional[str] = ..., protocol_version: _Optional[int] = ..., registry_hash: _Optional[str] = ...) -> None: ...

class MinecraftRegistryEntry(_message.Message):
    __slots__ = ("kind", "id", "numeric_id", "display_name", "properties", "tags")
    KIND_FIELD_NUMBER: _ClassVar[int]
    ID_FIELD_NUMBER: _ClassVar[int]
    NUMERIC_ID_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    PROPERTIES_FIELD_NUMBER: _ClassVar[int]
    TAGS_FIELD_NUMBER: _ClassVar[int]
    kind: RegistryKind
    id: str
    numeric_id: int
    display_name: str
    properties: _struct_pb2.Struct
    tags: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, kind: _Optional[_Union[RegistryKind, str]] = ..., id: _Optional[str] = ..., numeric_id: _Optional[int] = ..., display_name: _Optional[str] = ..., properties: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ..., tags: _Optional[_Iterable[str]] = ...) -> None: ...

class GetRegistryIdentityRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ...) -> None: ...

class GetRegistryIdentityResponse(_message.Message):
    __slots__ = ("identity", "supported_kinds", "protocol_features")
    IDENTITY_FIELD_NUMBER: _ClassVar[int]
    SUPPORTED_KINDS_FIELD_NUMBER: _ClassVar[int]
    PROTOCOL_FEATURES_FIELD_NUMBER: _ClassVar[int]
    identity: RegistryIdentity
    supported_kinds: _containers.RepeatedScalarFieldContainer[RegistryKind]
    protocol_features: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, identity: _Optional[_Union[RegistryIdentity, _Mapping]] = ..., supported_kinds: _Optional[_Iterable[_Union[RegistryKind, str]]] = ..., protocol_features: _Optional[_Iterable[str]] = ...) -> None: ...

class ListRegistryEntriesRequest(_message.Message):
    __slots__ = ("kind", "id_prefix", "tags", "page_size", "page_token", "instance_id", "bot_id")
    KIND_FIELD_NUMBER: _ClassVar[int]
    ID_PREFIX_FIELD_NUMBER: _ClassVar[int]
    TAGS_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    kind: RegistryKind
    id_prefix: str
    tags: _containers.RepeatedScalarFieldContainer[str]
    page_size: int
    page_token: str
    instance_id: str
    bot_id: str
    def __init__(self, kind: _Optional[_Union[RegistryKind, str]] = ..., id_prefix: _Optional[str] = ..., tags: _Optional[_Iterable[str]] = ..., page_size: _Optional[int] = ..., page_token: _Optional[str] = ..., instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ...) -> None: ...

class ListRegistryEntriesResponse(_message.Message):
    __slots__ = ("entries", "next_page_token", "registry_hash")
    ENTRIES_FIELD_NUMBER: _ClassVar[int]
    NEXT_PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    REGISTRY_HASH_FIELD_NUMBER: _ClassVar[int]
    entries: _containers.RepeatedCompositeFieldContainer[MinecraftRegistryEntry]
    next_page_token: str
    registry_hash: str
    def __init__(self, entries: _Optional[_Iterable[_Union[MinecraftRegistryEntry, _Mapping]]] = ..., next_page_token: _Optional[str] = ..., registry_hash: _Optional[str] = ...) -> None: ...

class GetRegistryEntryRequest(_message.Message):
    __slots__ = ("kind", "id", "instance_id", "bot_id")
    KIND_FIELD_NUMBER: _ClassVar[int]
    ID_FIELD_NUMBER: _ClassVar[int]
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    kind: RegistryKind
    id: str
    instance_id: str
    bot_id: str
    def __init__(self, kind: _Optional[_Union[RegistryKind, str]] = ..., id: _Optional[str] = ..., instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ...) -> None: ...

class GetRegistryEntryResponse(_message.Message):
    __slots__ = ("entry", "registry_hash")
    ENTRY_FIELD_NUMBER: _ClassVar[int]
    REGISTRY_HASH_FIELD_NUMBER: _ClassVar[int]
    entry: MinecraftRegistryEntry
    registry_hash: str
    def __init__(self, entry: _Optional[_Union[MinecraftRegistryEntry, _Mapping]] = ..., registry_hash: _Optional[str] = ...) -> None: ...

class ListRegistryTagsRequest(_message.Message):
    __slots__ = ("kind", "prefix", "page_size", "page_token", "instance_id", "bot_id")
    KIND_FIELD_NUMBER: _ClassVar[int]
    PREFIX_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    kind: RegistryKind
    prefix: str
    page_size: int
    page_token: str
    instance_id: str
    bot_id: str
    def __init__(self, kind: _Optional[_Union[RegistryKind, str]] = ..., prefix: _Optional[str] = ..., page_size: _Optional[int] = ..., page_token: _Optional[str] = ..., instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ...) -> None: ...

class RegistryTag(_message.Message):
    __slots__ = ("kind", "id", "values")
    KIND_FIELD_NUMBER: _ClassVar[int]
    ID_FIELD_NUMBER: _ClassVar[int]
    VALUES_FIELD_NUMBER: _ClassVar[int]
    kind: RegistryKind
    id: str
    values: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, kind: _Optional[_Union[RegistryKind, str]] = ..., id: _Optional[str] = ..., values: _Optional[_Iterable[str]] = ...) -> None: ...

class ListRegistryTagsResponse(_message.Message):
    __slots__ = ("tags", "next_page_token", "registry_hash")
    TAGS_FIELD_NUMBER: _ClassVar[int]
    NEXT_PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    REGISTRY_HASH_FIELD_NUMBER: _ClassVar[int]
    tags: _containers.RepeatedCompositeFieldContainer[RegistryTag]
    next_page_token: str
    registry_hash: str
    def __init__(self, tags: _Optional[_Iterable[_Union[RegistryTag, _Mapping]]] = ..., next_page_token: _Optional[str] = ..., registry_hash: _Optional[str] = ...) -> None: ...
