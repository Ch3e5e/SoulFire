import datetime

from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf import timestamp_pb2 as _timestamp_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class PacketDirection(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PACKET_DIRECTION_UNSPECIFIED: _ClassVar[PacketDirection]
    PACKET_DIRECTION_CLIENTBOUND: _ClassVar[PacketDirection]
    PACKET_DIRECTION_SERVERBOUND: _ClassVar[PacketDirection]
PACKET_DIRECTION_UNSPECIFIED: PacketDirection
PACKET_DIRECTION_CLIENTBOUND: PacketDirection
PACKET_DIRECTION_SERVERBOUND: PacketDirection

class BotProtocolRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ...) -> None: ...

class BotProtocolInfo(_message.Message):
    __slots__ = ("minecraft_protocol_version", "minecraft_version_name", "protocol_state", "packet_observation_supported", "raw_packet_sending_enabled", "maximum_packet_bytes", "maximum_sends_per_second", "remote_protocol_version", "remote_version_name")
    MINECRAFT_PROTOCOL_VERSION_FIELD_NUMBER: _ClassVar[int]
    MINECRAFT_VERSION_NAME_FIELD_NUMBER: _ClassVar[int]
    PROTOCOL_STATE_FIELD_NUMBER: _ClassVar[int]
    PACKET_OBSERVATION_SUPPORTED_FIELD_NUMBER: _ClassVar[int]
    RAW_PACKET_SENDING_ENABLED_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_PACKET_BYTES_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_SENDS_PER_SECOND_FIELD_NUMBER: _ClassVar[int]
    REMOTE_PROTOCOL_VERSION_FIELD_NUMBER: _ClassVar[int]
    REMOTE_VERSION_NAME_FIELD_NUMBER: _ClassVar[int]
    minecraft_protocol_version: int
    minecraft_version_name: str
    protocol_state: str
    packet_observation_supported: bool
    raw_packet_sending_enabled: bool
    maximum_packet_bytes: int
    maximum_sends_per_second: int
    remote_protocol_version: int
    remote_version_name: str
    def __init__(self, minecraft_protocol_version: _Optional[int] = ..., minecraft_version_name: _Optional[str] = ..., protocol_state: _Optional[str] = ..., packet_observation_supported: bool = ..., raw_packet_sending_enabled: bool = ..., maximum_packet_bytes: _Optional[int] = ..., maximum_sends_per_second: _Optional[int] = ..., remote_protocol_version: _Optional[int] = ..., remote_version_name: _Optional[str] = ...) -> None: ...

class ListPacketSchemasRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "direction")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    DIRECTION_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    direction: PacketDirection
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., direction: _Optional[_Union[PacketDirection, str]] = ...) -> None: ...

class PacketSchema(_message.Message):
    __slots__ = ("direction", "name", "network_id", "protocol_state")
    DIRECTION_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    NETWORK_ID_FIELD_NUMBER: _ClassVar[int]
    PROTOCOL_STATE_FIELD_NUMBER: _ClassVar[int]
    direction: PacketDirection
    name: str
    network_id: int
    protocol_state: str
    def __init__(self, direction: _Optional[_Union[PacketDirection, str]] = ..., name: _Optional[str] = ..., network_id: _Optional[int] = ..., protocol_state: _Optional[str] = ...) -> None: ...

class ListPacketSchemasResponse(_message.Message):
    __slots__ = ("packets",)
    PACKETS_FIELD_NUMBER: _ClassVar[int]
    packets: _containers.RepeatedCompositeFieldContainer[PacketSchema]
    def __init__(self, packets: _Optional[_Iterable[_Union[PacketSchema, _Mapping]]] = ...) -> None: ...

class WatchPacketsRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "directions", "names", "include_encoded_packet", "maximum_encoded_bytes")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    DIRECTIONS_FIELD_NUMBER: _ClassVar[int]
    NAMES_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_ENCODED_PACKET_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_ENCODED_BYTES_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    directions: _containers.RepeatedScalarFieldContainer[PacketDirection]
    names: _containers.RepeatedScalarFieldContainer[str]
    include_encoded_packet: bool
    maximum_encoded_bytes: int
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., directions: _Optional[_Iterable[_Union[PacketDirection, str]]] = ..., names: _Optional[_Iterable[str]] = ..., include_encoded_packet: bool = ..., maximum_encoded_bytes: _Optional[int] = ...) -> None: ...

class RawPacketEvent(_message.Message):
    __slots__ = ("sequence", "observed_at", "direction", "name", "network_id", "protocol_state", "java_class_name", "encoded_packet", "encoded_packet_truncated", "dropped_before")
    SEQUENCE_FIELD_NUMBER: _ClassVar[int]
    OBSERVED_AT_FIELD_NUMBER: _ClassVar[int]
    DIRECTION_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    NETWORK_ID_FIELD_NUMBER: _ClassVar[int]
    PROTOCOL_STATE_FIELD_NUMBER: _ClassVar[int]
    JAVA_CLASS_NAME_FIELD_NUMBER: _ClassVar[int]
    ENCODED_PACKET_FIELD_NUMBER: _ClassVar[int]
    ENCODED_PACKET_TRUNCATED_FIELD_NUMBER: _ClassVar[int]
    DROPPED_BEFORE_FIELD_NUMBER: _ClassVar[int]
    sequence: int
    observed_at: _timestamp_pb2.Timestamp
    direction: PacketDirection
    name: str
    network_id: int
    protocol_state: str
    java_class_name: str
    encoded_packet: bytes
    encoded_packet_truncated: bool
    dropped_before: int
    def __init__(self, sequence: _Optional[int] = ..., observed_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., direction: _Optional[_Union[PacketDirection, str]] = ..., name: _Optional[str] = ..., network_id: _Optional[int] = ..., protocol_state: _Optional[str] = ..., java_class_name: _Optional[str] = ..., encoded_packet: _Optional[bytes] = ..., encoded_packet_truncated: bool = ..., dropped_before: _Optional[int] = ...) -> None: ...

class SendRawPacketRequest(_message.Message):
    __slots__ = ("instance_id", "bot_id", "encoded_packet", "expected_name")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    ENCODED_PACKET_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_NAME_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    encoded_packet: bytes
    expected_name: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., encoded_packet: _Optional[bytes] = ..., expected_name: _Optional[str] = ...) -> None: ...

class SendRawPacketResponse(_message.Message):
    __slots__ = ("name", "encoded_bytes")
    NAME_FIELD_NUMBER: _ClassVar[int]
    ENCODED_BYTES_FIELD_NUMBER: _ClassVar[int]
    name: str
    encoded_bytes: int
    def __init__(self, name: _Optional[str] = ..., encoded_bytes: _Optional[int] = ...) -> None: ...
