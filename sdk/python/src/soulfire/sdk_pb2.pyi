from soulfire import api_docs_pb2 as _api_docs_pb2
from soulfire import common_pb2 as _common_pb2
from soulfire import plugin_api_pb2 as _plugin_api_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class SdkTransport(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    SDK_TRANSPORT_UNSPECIFIED: _ClassVar[SdkTransport]
    SDK_TRANSPORT_GRPC: _ClassVar[SdkTransport]
    SDK_TRANSPORT_GRPC_WEB: _ClassVar[SdkTransport]
    SDK_TRANSPORT_UNFRAMED_JSON: _ClassVar[SdkTransport]
    SDK_TRANSPORT_HTTP_JSON_TRANSCODING: _ClassVar[SdkTransport]
SDK_TRANSPORT_UNSPECIFIED: SdkTransport
SDK_TRANSPORT_GRPC: SdkTransport
SDK_TRANSPORT_GRPC_WEB: SdkTransport
SDK_TRANSPORT_UNFRAMED_JSON: SdkTransport
SDK_TRANSPORT_HTTP_JSON_TRANSCODING: SdkTransport

class SdkApiVersion(_message.Message):
    __slots__ = ("major", "minor", "patch")
    MAJOR_FIELD_NUMBER: _ClassVar[int]
    MINOR_FIELD_NUMBER: _ClassVar[int]
    PATCH_FIELD_NUMBER: _ClassVar[int]
    major: int
    minor: int
    patch: int
    def __init__(self, major: _Optional[int] = ..., minor: _Optional[int] = ..., patch: _Optional[int] = ...) -> None: ...

class RequiredPlugin(_message.Message):
    __slots__ = ("plugin_id", "version_range")
    PLUGIN_ID_FIELD_NUMBER: _ClassVar[int]
    VERSION_RANGE_FIELD_NUMBER: _ClassVar[int]
    plugin_id: str
    version_range: str
    def __init__(self, plugin_id: _Optional[str] = ..., version_range: _Optional[str] = ...) -> None: ...

class SdkHandshakeRequest(_message.Message):
    __slots__ = ("sdk_name", "sdk_version", "minimum_api_version", "maximum_api_version", "required_capabilities", "required_plugins")
    SDK_NAME_FIELD_NUMBER: _ClassVar[int]
    SDK_VERSION_FIELD_NUMBER: _ClassVar[int]
    MINIMUM_API_VERSION_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_API_VERSION_FIELD_NUMBER: _ClassVar[int]
    REQUIRED_CAPABILITIES_FIELD_NUMBER: _ClassVar[int]
    REQUIRED_PLUGINS_FIELD_NUMBER: _ClassVar[int]
    sdk_name: str
    sdk_version: str
    minimum_api_version: SdkApiVersion
    maximum_api_version: SdkApiVersion
    required_capabilities: _containers.RepeatedScalarFieldContainer[str]
    required_plugins: _containers.RepeatedCompositeFieldContainer[RequiredPlugin]
    def __init__(self, sdk_name: _Optional[str] = ..., sdk_version: _Optional[str] = ..., minimum_api_version: _Optional[_Union[SdkApiVersion, _Mapping]] = ..., maximum_api_version: _Optional[_Union[SdkApiVersion, _Mapping]] = ..., required_capabilities: _Optional[_Iterable[str]] = ..., required_plugins: _Optional[_Iterable[_Union[RequiredPlugin, _Mapping]]] = ...) -> None: ...

class SdkCapability(_message.Message):
    __slots__ = ("id", "revision")
    ID_FIELD_NUMBER: _ClassVar[int]
    REVISION_FIELD_NUMBER: _ClassVar[int]
    id: str
    revision: int
    def __init__(self, id: _Optional[str] = ..., revision: _Optional[int] = ...) -> None: ...

class SdkLimit(_message.Message):
    __slots__ = ("id", "value")
    ID_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    id: str
    value: int
    def __init__(self, id: _Optional[str] = ..., value: _Optional[int] = ...) -> None: ...

class SdkIdentity(_message.Message):
    __slots__ = ("id", "username", "email", "role", "granted_global_permissions")
    ID_FIELD_NUMBER: _ClassVar[int]
    USERNAME_FIELD_NUMBER: _ClassVar[int]
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    GRANTED_GLOBAL_PERMISSIONS_FIELD_NUMBER: _ClassVar[int]
    id: str
    username: str
    email: str
    role: _common_pb2.UserRole
    granted_global_permissions: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, id: _Optional[str] = ..., username: _Optional[str] = ..., email: _Optional[str] = ..., role: _Optional[_Union[_common_pb2.UserRole, str]] = ..., granted_global_permissions: _Optional[_Iterable[str]] = ...) -> None: ...

class SdkHandshakeResponse(_message.Message):
    __slots__ = ("server_id", "soulfire_version", "commit_hash", "branch_name", "api_version", "native_minecraft_version", "supported_minecraft_versions", "transports", "capabilities", "plugins", "limits", "identity")
    SERVER_ID_FIELD_NUMBER: _ClassVar[int]
    SOULFIRE_VERSION_FIELD_NUMBER: _ClassVar[int]
    COMMIT_HASH_FIELD_NUMBER: _ClassVar[int]
    BRANCH_NAME_FIELD_NUMBER: _ClassVar[int]
    API_VERSION_FIELD_NUMBER: _ClassVar[int]
    NATIVE_MINECRAFT_VERSION_FIELD_NUMBER: _ClassVar[int]
    SUPPORTED_MINECRAFT_VERSIONS_FIELD_NUMBER: _ClassVar[int]
    TRANSPORTS_FIELD_NUMBER: _ClassVar[int]
    CAPABILITIES_FIELD_NUMBER: _ClassVar[int]
    PLUGINS_FIELD_NUMBER: _ClassVar[int]
    LIMITS_FIELD_NUMBER: _ClassVar[int]
    IDENTITY_FIELD_NUMBER: _ClassVar[int]
    server_id: str
    soulfire_version: str
    commit_hash: str
    branch_name: str
    api_version: SdkApiVersion
    native_minecraft_version: str
    supported_minecraft_versions: _containers.RepeatedScalarFieldContainer[str]
    transports: _containers.RepeatedScalarFieldContainer[SdkTransport]
    capabilities: _containers.RepeatedCompositeFieldContainer[SdkCapability]
    plugins: _containers.RepeatedCompositeFieldContainer[_plugin_api_pb2.PluginApiDescriptor]
    limits: _containers.RepeatedCompositeFieldContainer[SdkLimit]
    identity: SdkIdentity
    def __init__(self, server_id: _Optional[str] = ..., soulfire_version: _Optional[str] = ..., commit_hash: _Optional[str] = ..., branch_name: _Optional[str] = ..., api_version: _Optional[_Union[SdkApiVersion, _Mapping]] = ..., native_minecraft_version: _Optional[str] = ..., supported_minecraft_versions: _Optional[_Iterable[str]] = ..., transports: _Optional[_Iterable[_Union[SdkTransport, str]]] = ..., capabilities: _Optional[_Iterable[_Union[SdkCapability, _Mapping]]] = ..., plugins: _Optional[_Iterable[_Union[_plugin_api_pb2.PluginApiDescriptor, _Mapping]]] = ..., limits: _Optional[_Iterable[_Union[SdkLimit, _Mapping]]] = ..., identity: _Optional[_Union[SdkIdentity, _Mapping]] = ...) -> None: ...
