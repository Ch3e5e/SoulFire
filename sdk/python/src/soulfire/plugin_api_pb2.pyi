import datetime

from soulfire import api_docs_pb2 as _api_docs_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf import any_pb2 as _any_pb2
from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class PluginPermissionScope(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PLUGIN_PERMISSION_SCOPE_UNSPECIFIED: _ClassVar[PluginPermissionScope]
    PLUGIN_PERMISSION_SCOPE_GLOBAL: _ClassVar[PluginPermissionScope]
    PLUGIN_PERMISSION_SCOPE_INSTANCE: _ClassVar[PluginPermissionScope]
    PLUGIN_PERMISSION_SCOPE_BOT: _ClassVar[PluginPermissionScope]
    PLUGIN_PERMISSION_SCOPE_TASK: _ClassVar[PluginPermissionScope]

class PluginPermissionRisk(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PLUGIN_PERMISSION_RISK_UNSPECIFIED: _ClassVar[PluginPermissionRisk]
    PLUGIN_PERMISSION_RISK_READ: _ClassVar[PluginPermissionRisk]
    PLUGIN_PERMISSION_RISK_CONTROL: _ClassVar[PluginPermissionRisk]
    PLUGIN_PERMISSION_RISK_MUTATION: _ClassVar[PluginPermissionRisk]
    PLUGIN_PERMISSION_RISK_DESTRUCTIVE: _ClassVar[PluginPermissionRisk]

class PluginPermissionDefault(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PLUGIN_PERMISSION_DEFAULT_UNSPECIFIED: _ClassVar[PluginPermissionDefault]
    PLUGIN_PERMISSION_DEFAULT_ADMIN_ONLY: _ClassVar[PluginPermissionDefault]
    PLUGIN_PERMISSION_DEFAULT_AUTHENTICATED: _ClassVar[PluginPermissionDefault]
    PLUGIN_PERMISSION_DEFAULT_INSTANCE_OWNER: _ClassVar[PluginPermissionDefault]

class PluginApiStability(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PLUGIN_API_STABILITY_UNSPECIFIED: _ClassVar[PluginApiStability]
    PLUGIN_API_STABILITY_EXPERIMENTAL: _ClassVar[PluginApiStability]
    PLUGIN_API_STABILITY_BETA: _ClassVar[PluginApiStability]
    PLUGIN_API_STABILITY_STABLE: _ClassVar[PluginApiStability]
    PLUGIN_API_STABILITY_DEPRECATED: _ClassVar[PluginApiStability]

class PluginApiEventKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PLUGIN_API_EVENT_KIND_UNSPECIFIED: _ClassVar[PluginApiEventKind]
    PLUGIN_API_EVENT_KIND_SNAPSHOT: _ClassVar[PluginApiEventKind]
    PLUGIN_API_EVENT_KIND_ADDED: _ClassVar[PluginApiEventKind]
    PLUGIN_API_EVENT_KIND_UPDATED: _ClassVar[PluginApiEventKind]
    PLUGIN_API_EVENT_KIND_REMOVED: _ClassVar[PluginApiEventKind]

class PluginEventKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PLUGIN_EVENT_KIND_UNSPECIFIED: _ClassVar[PluginEventKind]
    PLUGIN_EVENT_KIND_READY: _ClassVar[PluginEventKind]
    PLUGIN_EVENT_KIND_DATA: _ClassVar[PluginEventKind]
PLUGIN_PERMISSION_SCOPE_UNSPECIFIED: PluginPermissionScope
PLUGIN_PERMISSION_SCOPE_GLOBAL: PluginPermissionScope
PLUGIN_PERMISSION_SCOPE_INSTANCE: PluginPermissionScope
PLUGIN_PERMISSION_SCOPE_BOT: PluginPermissionScope
PLUGIN_PERMISSION_SCOPE_TASK: PluginPermissionScope
PLUGIN_PERMISSION_RISK_UNSPECIFIED: PluginPermissionRisk
PLUGIN_PERMISSION_RISK_READ: PluginPermissionRisk
PLUGIN_PERMISSION_RISK_CONTROL: PluginPermissionRisk
PLUGIN_PERMISSION_RISK_MUTATION: PluginPermissionRisk
PLUGIN_PERMISSION_RISK_DESTRUCTIVE: PluginPermissionRisk
PLUGIN_PERMISSION_DEFAULT_UNSPECIFIED: PluginPermissionDefault
PLUGIN_PERMISSION_DEFAULT_ADMIN_ONLY: PluginPermissionDefault
PLUGIN_PERMISSION_DEFAULT_AUTHENTICATED: PluginPermissionDefault
PLUGIN_PERMISSION_DEFAULT_INSTANCE_OWNER: PluginPermissionDefault
PLUGIN_API_STABILITY_UNSPECIFIED: PluginApiStability
PLUGIN_API_STABILITY_EXPERIMENTAL: PluginApiStability
PLUGIN_API_STABILITY_BETA: PluginApiStability
PLUGIN_API_STABILITY_STABLE: PluginApiStability
PLUGIN_API_STABILITY_DEPRECATED: PluginApiStability
PLUGIN_API_EVENT_KIND_UNSPECIFIED: PluginApiEventKind
PLUGIN_API_EVENT_KIND_SNAPSHOT: PluginApiEventKind
PLUGIN_API_EVENT_KIND_ADDED: PluginApiEventKind
PLUGIN_API_EVENT_KIND_UPDATED: PluginApiEventKind
PLUGIN_API_EVENT_KIND_REMOVED: PluginApiEventKind
PLUGIN_EVENT_KIND_UNSPECIFIED: PluginEventKind
PLUGIN_EVENT_KIND_READY: PluginEventKind
PLUGIN_EVENT_KIND_DATA: PluginEventKind

class PluginPermissionDescriptor(_message.Message):
    __slots__ = ("id", "plugin_id", "scope", "risk", "display_name", "description", "default_grant")
    ID_FIELD_NUMBER: _ClassVar[int]
    PLUGIN_ID_FIELD_NUMBER: _ClassVar[int]
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    RISK_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    DEFAULT_GRANT_FIELD_NUMBER: _ClassVar[int]
    id: str
    plugin_id: str
    scope: PluginPermissionScope
    risk: PluginPermissionRisk
    display_name: str
    description: str
    default_grant: PluginPermissionDefault
    def __init__(self, id: _Optional[str] = ..., plugin_id: _Optional[str] = ..., scope: _Optional[_Union[PluginPermissionScope, str]] = ..., risk: _Optional[_Union[PluginPermissionRisk, str]] = ..., display_name: _Optional[str] = ..., description: _Optional[str] = ..., default_grant: _Optional[_Union[PluginPermissionDefault, str]] = ...) -> None: ...

class PluginRpcMethodDescriptor(_message.Message):
    __slots__ = ("name", "full_name", "input_type_url", "output_type_url", "client_streaming", "server_streaming", "permissions", "display_name", "description", "exposed_to_mcp", "mcp_requires_confirmation")
    NAME_FIELD_NUMBER: _ClassVar[int]
    FULL_NAME_FIELD_NUMBER: _ClassVar[int]
    INPUT_TYPE_URL_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_TYPE_URL_FIELD_NUMBER: _ClassVar[int]
    CLIENT_STREAMING_FIELD_NUMBER: _ClassVar[int]
    SERVER_STREAMING_FIELD_NUMBER: _ClassVar[int]
    PERMISSIONS_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    EXPOSED_TO_MCP_FIELD_NUMBER: _ClassVar[int]
    MCP_REQUIRES_CONFIRMATION_FIELD_NUMBER: _ClassVar[int]
    name: str
    full_name: str
    input_type_url: str
    output_type_url: str
    client_streaming: bool
    server_streaming: bool
    permissions: _containers.RepeatedScalarFieldContainer[str]
    display_name: str
    description: str
    exposed_to_mcp: bool
    mcp_requires_confirmation: bool
    def __init__(self, name: _Optional[str] = ..., full_name: _Optional[str] = ..., input_type_url: _Optional[str] = ..., output_type_url: _Optional[str] = ..., client_streaming: bool = ..., server_streaming: bool = ..., permissions: _Optional[_Iterable[str]] = ..., display_name: _Optional[str] = ..., description: _Optional[str] = ..., exposed_to_mcp: bool = ..., mcp_requires_confirmation: bool = ...) -> None: ...

class PluginRpcServiceDescriptor(_message.Message):
    __slots__ = ("name", "full_name", "methods")
    NAME_FIELD_NUMBER: _ClassVar[int]
    FULL_NAME_FIELD_NUMBER: _ClassVar[int]
    METHODS_FIELD_NUMBER: _ClassVar[int]
    name: str
    full_name: str
    methods: _containers.RepeatedCompositeFieldContainer[PluginRpcMethodDescriptor]
    def __init__(self, name: _Optional[str] = ..., full_name: _Optional[str] = ..., methods: _Optional[_Iterable[_Union[PluginRpcMethodDescriptor, _Mapping]]] = ...) -> None: ...

class PluginEventTypeDescriptor(_message.Message):
    __slots__ = ("type_url", "permissions")
    TYPE_URL_FIELD_NUMBER: _ClassVar[int]
    PERMISSIONS_FIELD_NUMBER: _ClassVar[int]
    type_url: str
    permissions: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, type_url: _Optional[str] = ..., permissions: _Optional[_Iterable[str]] = ...) -> None: ...

class PluginTaskTypeDescriptor(_message.Message):
    __slots__ = ("input_type_url", "result_type_url", "progress_type_url", "permissions")
    INPUT_TYPE_URL_FIELD_NUMBER: _ClassVar[int]
    RESULT_TYPE_URL_FIELD_NUMBER: _ClassVar[int]
    PROGRESS_TYPE_URL_FIELD_NUMBER: _ClassVar[int]
    PERMISSIONS_FIELD_NUMBER: _ClassVar[int]
    input_type_url: str
    result_type_url: str
    progress_type_url: str
    permissions: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, input_type_url: _Optional[str] = ..., result_type_url: _Optional[str] = ..., progress_type_url: _Optional[str] = ..., permissions: _Optional[_Iterable[str]] = ...) -> None: ...

class PluginSdkPackages(_message.Message):
    __slots__ = ("typescript_package", "python_package", "maven_artifact")
    TYPESCRIPT_PACKAGE_FIELD_NUMBER: _ClassVar[int]
    PYTHON_PACKAGE_FIELD_NUMBER: _ClassVar[int]
    MAVEN_ARTIFACT_FIELD_NUMBER: _ClassVar[int]
    typescript_package: str
    python_package: str
    maven_artifact: str
    def __init__(self, typescript_package: _Optional[str] = ..., python_package: _Optional[str] = ..., maven_artifact: _Optional[str] = ...) -> None: ...

class PluginApiDescriptor(_message.Message):
    __slots__ = ("plugin_id", "plugin_version", "description", "author", "license", "website_url", "required_soulfire_version", "api_major_version", "descriptor_sha256", "services", "permissions", "event_type_urls", "task_type_urls", "stability", "sdk_packages", "documentation_url", "source_url", "event_types", "task_types")
    PLUGIN_ID_FIELD_NUMBER: _ClassVar[int]
    PLUGIN_VERSION_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    AUTHOR_FIELD_NUMBER: _ClassVar[int]
    LICENSE_FIELD_NUMBER: _ClassVar[int]
    WEBSITE_URL_FIELD_NUMBER: _ClassVar[int]
    REQUIRED_SOULFIRE_VERSION_FIELD_NUMBER: _ClassVar[int]
    API_MAJOR_VERSION_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTOR_SHA256_FIELD_NUMBER: _ClassVar[int]
    SERVICES_FIELD_NUMBER: _ClassVar[int]
    PERMISSIONS_FIELD_NUMBER: _ClassVar[int]
    EVENT_TYPE_URLS_FIELD_NUMBER: _ClassVar[int]
    TASK_TYPE_URLS_FIELD_NUMBER: _ClassVar[int]
    STABILITY_FIELD_NUMBER: _ClassVar[int]
    SDK_PACKAGES_FIELD_NUMBER: _ClassVar[int]
    DOCUMENTATION_URL_FIELD_NUMBER: _ClassVar[int]
    SOURCE_URL_FIELD_NUMBER: _ClassVar[int]
    EVENT_TYPES_FIELD_NUMBER: _ClassVar[int]
    TASK_TYPES_FIELD_NUMBER: _ClassVar[int]
    plugin_id: str
    plugin_version: str
    description: str
    author: str
    license: str
    website_url: str
    required_soulfire_version: str
    api_major_version: int
    descriptor_sha256: str
    services: _containers.RepeatedCompositeFieldContainer[PluginRpcServiceDescriptor]
    permissions: _containers.RepeatedCompositeFieldContainer[PluginPermissionDescriptor]
    event_type_urls: _containers.RepeatedScalarFieldContainer[str]
    task_type_urls: _containers.RepeatedScalarFieldContainer[str]
    stability: PluginApiStability
    sdk_packages: PluginSdkPackages
    documentation_url: str
    source_url: str
    event_types: _containers.RepeatedCompositeFieldContainer[PluginEventTypeDescriptor]
    task_types: _containers.RepeatedCompositeFieldContainer[PluginTaskTypeDescriptor]
    def __init__(self, plugin_id: _Optional[str] = ..., plugin_version: _Optional[str] = ..., description: _Optional[str] = ..., author: _Optional[str] = ..., license: _Optional[str] = ..., website_url: _Optional[str] = ..., required_soulfire_version: _Optional[str] = ..., api_major_version: _Optional[int] = ..., descriptor_sha256: _Optional[str] = ..., services: _Optional[_Iterable[_Union[PluginRpcServiceDescriptor, _Mapping]]] = ..., permissions: _Optional[_Iterable[_Union[PluginPermissionDescriptor, _Mapping]]] = ..., event_type_urls: _Optional[_Iterable[str]] = ..., task_type_urls: _Optional[_Iterable[str]] = ..., stability: _Optional[_Union[PluginApiStability, str]] = ..., sdk_packages: _Optional[_Union[PluginSdkPackages, _Mapping]] = ..., documentation_url: _Optional[str] = ..., source_url: _Optional[str] = ..., event_types: _Optional[_Iterable[_Union[PluginEventTypeDescriptor, _Mapping]]] = ..., task_types: _Optional[_Iterable[_Union[PluginTaskTypeDescriptor, _Mapping]]] = ...) -> None: ...

class ListPluginApisRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListPluginApisResponse(_message.Message):
    __slots__ = ("plugins", "revision")
    PLUGINS_FIELD_NUMBER: _ClassVar[int]
    REVISION_FIELD_NUMBER: _ClassVar[int]
    plugins: _containers.RepeatedCompositeFieldContainer[PluginApiDescriptor]
    revision: int
    def __init__(self, plugins: _Optional[_Iterable[_Union[PluginApiDescriptor, _Mapping]]] = ..., revision: _Optional[int] = ...) -> None: ...

class GetPluginApiRequest(_message.Message):
    __slots__ = ("plugin_id",)
    PLUGIN_ID_FIELD_NUMBER: _ClassVar[int]
    plugin_id: str
    def __init__(self, plugin_id: _Optional[str] = ...) -> None: ...

class GetPluginApiResponse(_message.Message):
    __slots__ = ("plugin", "revision")
    PLUGIN_FIELD_NUMBER: _ClassVar[int]
    REVISION_FIELD_NUMBER: _ClassVar[int]
    plugin: PluginApiDescriptor
    revision: int
    def __init__(self, plugin: _Optional[_Union[PluginApiDescriptor, _Mapping]] = ..., revision: _Optional[int] = ...) -> None: ...

class GetPluginDescriptorSetRequest(_message.Message):
    __slots__ = ("plugin_id", "expected_sha256")
    PLUGIN_ID_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_SHA256_FIELD_NUMBER: _ClassVar[int]
    plugin_id: str
    expected_sha256: str
    def __init__(self, plugin_id: _Optional[str] = ..., expected_sha256: _Optional[str] = ...) -> None: ...

class GetPluginDescriptorSetResponse(_message.Message):
    __slots__ = ("plugin_id", "plugin_version", "descriptor_sha256", "descriptor_set")
    PLUGIN_ID_FIELD_NUMBER: _ClassVar[int]
    PLUGIN_VERSION_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTOR_SHA256_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTOR_SET_FIELD_NUMBER: _ClassVar[int]
    plugin_id: str
    plugin_version: str
    descriptor_sha256: str
    descriptor_set: bytes
    def __init__(self, plugin_id: _Optional[str] = ..., plugin_version: _Optional[str] = ..., descriptor_sha256: _Optional[str] = ..., descriptor_set: _Optional[bytes] = ...) -> None: ...

class WatchPluginApisRequest(_message.Message):
    __slots__ = ("after_revision",)
    AFTER_REVISION_FIELD_NUMBER: _ClassVar[int]
    after_revision: int
    def __init__(self, after_revision: _Optional[int] = ...) -> None: ...

class PluginApiEvent(_message.Message):
    __slots__ = ("revision", "kind", "plugin", "plugins", "removed_plugin_id")
    REVISION_FIELD_NUMBER: _ClassVar[int]
    KIND_FIELD_NUMBER: _ClassVar[int]
    PLUGIN_FIELD_NUMBER: _ClassVar[int]
    PLUGINS_FIELD_NUMBER: _ClassVar[int]
    REMOVED_PLUGIN_ID_FIELD_NUMBER: _ClassVar[int]
    revision: int
    kind: PluginApiEventKind
    plugin: PluginApiDescriptor
    plugins: _containers.RepeatedCompositeFieldContainer[PluginApiDescriptor]
    removed_plugin_id: str
    def __init__(self, revision: _Optional[int] = ..., kind: _Optional[_Union[PluginApiEventKind, str]] = ..., plugin: _Optional[_Union[PluginApiDescriptor, _Mapping]] = ..., plugins: _Optional[_Iterable[_Union[PluginApiDescriptor, _Mapping]]] = ..., removed_plugin_id: _Optional[str] = ...) -> None: ...

class PluginEventScope(_message.Message):
    __slots__ = ("instance_id", "bot_id", "task_id")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    task_id: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., task_id: _Optional[str] = ...) -> None: ...

class WatchPluginEventsRequest(_message.Message):
    __slots__ = ("plugin_ids", "type_urls", "instance_id", "bot_id", "task_id", "after_sequence")
    PLUGIN_IDS_FIELD_NUMBER: _ClassVar[int]
    TYPE_URLS_FIELD_NUMBER: _ClassVar[int]
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    AFTER_SEQUENCE_FIELD_NUMBER: _ClassVar[int]
    plugin_ids: _containers.RepeatedScalarFieldContainer[str]
    type_urls: _containers.RepeatedScalarFieldContainer[str]
    instance_id: str
    bot_id: str
    task_id: str
    after_sequence: int
    def __init__(self, plugin_ids: _Optional[_Iterable[str]] = ..., type_urls: _Optional[_Iterable[str]] = ..., instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ..., task_id: _Optional[str] = ..., after_sequence: _Optional[int] = ...) -> None: ...

class PluginEvent(_message.Message):
    __slots__ = ("sequence", "emitted_at", "kind", "plugin_id", "type_url", "scope", "payload", "dropped_before", "resume_gap")
    SEQUENCE_FIELD_NUMBER: _ClassVar[int]
    EMITTED_AT_FIELD_NUMBER: _ClassVar[int]
    KIND_FIELD_NUMBER: _ClassVar[int]
    PLUGIN_ID_FIELD_NUMBER: _ClassVar[int]
    TYPE_URL_FIELD_NUMBER: _ClassVar[int]
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    PAYLOAD_FIELD_NUMBER: _ClassVar[int]
    DROPPED_BEFORE_FIELD_NUMBER: _ClassVar[int]
    RESUME_GAP_FIELD_NUMBER: _ClassVar[int]
    sequence: int
    emitted_at: _timestamp_pb2.Timestamp
    kind: PluginEventKind
    plugin_id: str
    type_url: str
    scope: PluginEventScope
    payload: _any_pb2.Any
    dropped_before: int
    resume_gap: bool
    def __init__(self, sequence: _Optional[int] = ..., emitted_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., kind: _Optional[_Union[PluginEventKind, str]] = ..., plugin_id: _Optional[str] = ..., type_url: _Optional[str] = ..., scope: _Optional[_Union[PluginEventScope, _Mapping]] = ..., payload: _Optional[_Union[_any_pb2.Any, _Mapping]] = ..., dropped_before: _Optional[int] = ..., resume_gap: bool = ...) -> None: ...
