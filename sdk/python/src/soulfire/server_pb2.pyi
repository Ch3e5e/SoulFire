from soulfire import common_pb2 as _common_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf import struct_pb2 as _struct_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ServerConfig(_message.Message):
    __slots__ = ("settings",)
    SETTINGS_FIELD_NUMBER: _ClassVar[int]
    settings: _containers.RepeatedCompositeFieldContainer[_common_pb2.SettingsNamespace]
    def __init__(self, settings: _Optional[_Iterable[_Union[_common_pb2.SettingsNamespace, _Mapping]]] = ...) -> None: ...

class ServerInfoRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ServerInfoResponse(_message.Message):
    __slots__ = ("config", "settings_definitions", "server_settings", "plugins")
    CONFIG_FIELD_NUMBER: _ClassVar[int]
    SETTINGS_DEFINITIONS_FIELD_NUMBER: _ClassVar[int]
    SERVER_SETTINGS_FIELD_NUMBER: _ClassVar[int]
    PLUGINS_FIELD_NUMBER: _ClassVar[int]
    config: ServerConfig
    settings_definitions: _containers.RepeatedCompositeFieldContainer[_common_pb2.SettingsDefinition]
    server_settings: _containers.RepeatedCompositeFieldContainer[_common_pb2.SettingsPage]
    plugins: _containers.RepeatedCompositeFieldContainer[_common_pb2.ServerPlugin]
    def __init__(self, config: _Optional[_Union[ServerConfig, _Mapping]] = ..., settings_definitions: _Optional[_Iterable[_Union[_common_pb2.SettingsDefinition, _Mapping]]] = ..., server_settings: _Optional[_Iterable[_Union[_common_pb2.SettingsPage, _Mapping]]] = ..., plugins: _Optional[_Iterable[_Union[_common_pb2.ServerPlugin, _Mapping]]] = ...) -> None: ...

class ServerUpdateConfigRequest(_message.Message):
    __slots__ = ("config",)
    CONFIG_FIELD_NUMBER: _ClassVar[int]
    config: ServerConfig
    def __init__(self, config: _Optional[_Union[ServerConfig, _Mapping]] = ...) -> None: ...

class ServerUpdateConfigResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ServerUpdateConfigEntryRequest(_message.Message):
    __slots__ = ("namespace", "key", "value")
    NAMESPACE_FIELD_NUMBER: _ClassVar[int]
    KEY_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    namespace: str
    key: str
    value: _struct_pb2.Value
    def __init__(self, namespace: _Optional[str] = ..., key: _Optional[str] = ..., value: _Optional[_Union[_struct_pb2.Value, _Mapping]] = ...) -> None: ...

class ServerUpdateConfigEntryResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
