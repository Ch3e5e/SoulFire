from soulfire import api_docs_pb2 as _api_docs_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf import struct_pb2 as _struct_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class AccountTypeCredentials(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    MICROSOFT_JAVA_CREDENTIALS: _ClassVar[AccountTypeCredentials]
    MICROSOFT_BEDROCK_CREDENTIALS: _ClassVar[AccountTypeCredentials]
    OFFLINE: _ClassVar[AccountTypeCredentials]
    MICROSOFT_JAVA_REFRESH_TOKEN: _ClassVar[AccountTypeCredentials]
    MICROSOFT_JAVA_COOKIES: _ClassVar[AccountTypeCredentials]
    MICROSOFT_JAVA_ACCESS_TOKEN: _ClassVar[AccountTypeCredentials]
    THE_ALTENING: _ClassVar[AccountTypeCredentials]

class AccountTypeDeviceCode(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    MICROSOFT_JAVA_DEVICE_CODE: _ClassVar[AccountTypeDeviceCode]
    MICROSOFT_BEDROCK_DEVICE_CODE: _ClassVar[AccountTypeDeviceCode]

class GlobalPermission(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    CREATE_INSTANCE: _ClassVar[GlobalPermission]
    GLOBAL_SUBSCRIBE_LOGS: _ClassVar[GlobalPermission]
    READ_CLIENT_DATA: _ClassVar[GlobalPermission]
    READ_SERVER_CONFIG: _ClassVar[GlobalPermission]
    UPDATE_SERVER_CONFIG: _ClassVar[GlobalPermission]
    CREATE_USER: _ClassVar[GlobalPermission]
    READ_USER: _ClassVar[GlobalPermission]
    UPDATE_USER: _ClassVar[GlobalPermission]
    DELETE_USER: _ClassVar[GlobalPermission]
    GLOBAL_COMMAND_EXECUTION: _ClassVar[GlobalPermission]
    INVALIDATE_SESSIONS: _ClassVar[GlobalPermission]
    GENERATE_SELF_WEBDAV_TOKEN: _ClassVar[GlobalPermission]
    GENERATE_SELF_API_TOKEN: _ClassVar[GlobalPermission]
    UPDATE_SELF_USERNAME: _ClassVar[GlobalPermission]
    UPDATE_SELF_EMAIL: _ClassVar[GlobalPermission]
    GENERATE_API_TOKEN: _ClassVar[GlobalPermission]
    INVALIDATE_SELF_SESSIONS: _ClassVar[GlobalPermission]

class InstancePermission(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    INSTANCE_COMMAND_EXECUTION: _ClassVar[InstancePermission]
    READ_INSTANCE: _ClassVar[InstancePermission]
    UPDATE_INSTANCE_META: _ClassVar[InstancePermission]
    UPDATE_INSTANCE_CONFIG: _ClassVar[InstancePermission]
    DELETE_INSTANCE: _ClassVar[InstancePermission]
    AUTHENTICATE_MC_ACCOUNT: _ClassVar[InstancePermission]
    CHECK_PROXY: _ClassVar[InstancePermission]
    DOWNLOAD_URL: _ClassVar[InstancePermission]
    ACCESS_OBJECT_STORAGE: _ClassVar[InstancePermission]
    INSTANCE_SUBSCRIBE_LOGS: _ClassVar[InstancePermission]
    READ_INSTANCE_AUDIT_LOGS: _ClassVar[InstancePermission]
    READ_BOT_INFO: _ClassVar[InstancePermission]
    UPDATE_BOT_CONFIG: _ClassVar[InstancePermission]
    CONTROL_BOTS: _ClassVar[InstancePermission]
    EXECUTE_SCRIPTS: _ClassVar[InstancePermission]
    CONTROL_BOT_ACTIONS: _ClassVar[InstancePermission]

class UserRole(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ADMIN: _ClassVar[UserRole]
    USER: _ClassVar[UserRole]

class SettingsPageEntryScopeType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    SERVER: _ClassVar[SettingsPageEntryScopeType]
    INSTANCE: _ClassVar[SettingsPageEntryScopeType]
    BOT: _ClassVar[SettingsPageEntryScopeType]
MICROSOFT_JAVA_CREDENTIALS: AccountTypeCredentials
MICROSOFT_BEDROCK_CREDENTIALS: AccountTypeCredentials
OFFLINE: AccountTypeCredentials
MICROSOFT_JAVA_REFRESH_TOKEN: AccountTypeCredentials
MICROSOFT_JAVA_COOKIES: AccountTypeCredentials
MICROSOFT_JAVA_ACCESS_TOKEN: AccountTypeCredentials
THE_ALTENING: AccountTypeCredentials
MICROSOFT_JAVA_DEVICE_CODE: AccountTypeDeviceCode
MICROSOFT_BEDROCK_DEVICE_CODE: AccountTypeDeviceCode
CREATE_INSTANCE: GlobalPermission
GLOBAL_SUBSCRIBE_LOGS: GlobalPermission
READ_CLIENT_DATA: GlobalPermission
READ_SERVER_CONFIG: GlobalPermission
UPDATE_SERVER_CONFIG: GlobalPermission
CREATE_USER: GlobalPermission
READ_USER: GlobalPermission
UPDATE_USER: GlobalPermission
DELETE_USER: GlobalPermission
GLOBAL_COMMAND_EXECUTION: GlobalPermission
INVALIDATE_SESSIONS: GlobalPermission
GENERATE_SELF_WEBDAV_TOKEN: GlobalPermission
GENERATE_SELF_API_TOKEN: GlobalPermission
UPDATE_SELF_USERNAME: GlobalPermission
UPDATE_SELF_EMAIL: GlobalPermission
GENERATE_API_TOKEN: GlobalPermission
INVALIDATE_SELF_SESSIONS: GlobalPermission
INSTANCE_COMMAND_EXECUTION: InstancePermission
READ_INSTANCE: InstancePermission
UPDATE_INSTANCE_META: InstancePermission
UPDATE_INSTANCE_CONFIG: InstancePermission
DELETE_INSTANCE: InstancePermission
AUTHENTICATE_MC_ACCOUNT: InstancePermission
CHECK_PROXY: InstancePermission
DOWNLOAD_URL: InstancePermission
ACCESS_OBJECT_STORAGE: InstancePermission
INSTANCE_SUBSCRIBE_LOGS: InstancePermission
READ_INSTANCE_AUDIT_LOGS: InstancePermission
READ_BOT_INFO: InstancePermission
UPDATE_BOT_CONFIG: InstancePermission
CONTROL_BOTS: InstancePermission
EXECUTE_SCRIPTS: InstancePermission
CONTROL_BOT_ACTIONS: InstancePermission
ADMIN: UserRole
USER: UserRole
SERVER: SettingsPageEntryScopeType
INSTANCE: SettingsPageEntryScopeType
BOT: SettingsPageEntryScopeType

class ProxyProto(_message.Message):
    __slots__ = ("type", "address", "username", "password")
    class Type(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        HTTP: _ClassVar[ProxyProto.Type]
        SOCKS4: _ClassVar[ProxyProto.Type]
        SOCKS5: _ClassVar[ProxyProto.Type]
    HTTP: ProxyProto.Type
    SOCKS4: ProxyProto.Type
    SOCKS5: ProxyProto.Type
    TYPE_FIELD_NUMBER: _ClassVar[int]
    ADDRESS_FIELD_NUMBER: _ClassVar[int]
    USERNAME_FIELD_NUMBER: _ClassVar[int]
    PASSWORD_FIELD_NUMBER: _ClassVar[int]
    type: ProxyProto.Type
    address: str
    username: str
    password: str
    def __init__(self, type: _Optional[_Union[ProxyProto.Type, str]] = ..., address: _Optional[str] = ..., username: _Optional[str] = ..., password: _Optional[str] = ...) -> None: ...

class MinecraftAccountProto(_message.Message):
    __slots__ = ("type", "profile_id", "last_known_name", "online_chain_java_data", "offline_java_data", "bedrock_data", "online_simple_java_data", "the_altening_java_data", "config", "persistent_metadata")
    class AccountTypeProto(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        MICROSOFT_JAVA_CREDENTIALS: _ClassVar[MinecraftAccountProto.AccountTypeProto]
        MICROSOFT_BEDROCK_CREDENTIALS: _ClassVar[MinecraftAccountProto.AccountTypeProto]
        OFFLINE: _ClassVar[MinecraftAccountProto.AccountTypeProto]
        MICROSOFT_JAVA_DEVICE_CODE: _ClassVar[MinecraftAccountProto.AccountTypeProto]
        MICROSOFT_BEDROCK_DEVICE_CODE: _ClassVar[MinecraftAccountProto.AccountTypeProto]
        MICROSOFT_JAVA_REFRESH_TOKEN: _ClassVar[MinecraftAccountProto.AccountTypeProto]
        MICROSOFT_JAVA_COOKIES: _ClassVar[MinecraftAccountProto.AccountTypeProto]
        MICROSOFT_JAVA_ACCESS_TOKEN: _ClassVar[MinecraftAccountProto.AccountTypeProto]
        THE_ALTENING: _ClassVar[MinecraftAccountProto.AccountTypeProto]
    MICROSOFT_JAVA_CREDENTIALS: MinecraftAccountProto.AccountTypeProto
    MICROSOFT_BEDROCK_CREDENTIALS: MinecraftAccountProto.AccountTypeProto
    OFFLINE: MinecraftAccountProto.AccountTypeProto
    MICROSOFT_JAVA_DEVICE_CODE: MinecraftAccountProto.AccountTypeProto
    MICROSOFT_BEDROCK_DEVICE_CODE: MinecraftAccountProto.AccountTypeProto
    MICROSOFT_JAVA_REFRESH_TOKEN: MinecraftAccountProto.AccountTypeProto
    MICROSOFT_JAVA_COOKIES: MinecraftAccountProto.AccountTypeProto
    MICROSOFT_JAVA_ACCESS_TOKEN: MinecraftAccountProto.AccountTypeProto
    THE_ALTENING: MinecraftAccountProto.AccountTypeProto
    class OnlineChainJavaData(_message.Message):
        __slots__ = ("auth_chain",)
        AUTH_CHAIN_FIELD_NUMBER: _ClassVar[int]
        auth_chain: _struct_pb2.Struct
        def __init__(self, auth_chain: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ...) -> None: ...
    class OfflineJavaData(_message.Message):
        __slots__ = ()
        def __init__(self) -> None: ...
    class OnlineSimpleJavaData(_message.Message):
        __slots__ = ("access_token", "expire_time_ms")
        ACCESS_TOKEN_FIELD_NUMBER: _ClassVar[int]
        EXPIRE_TIME_MS_FIELD_NUMBER: _ClassVar[int]
        access_token: str
        expire_time_ms: int
        def __init__(self, access_token: _Optional[str] = ..., expire_time_ms: _Optional[int] = ...) -> None: ...
    class TheAlteningJavaData(_message.Message):
        __slots__ = ("account_token", "access_token")
        ACCOUNT_TOKEN_FIELD_NUMBER: _ClassVar[int]
        ACCESS_TOKEN_FIELD_NUMBER: _ClassVar[int]
        account_token: str
        access_token: str
        def __init__(self, account_token: _Optional[str] = ..., access_token: _Optional[str] = ...) -> None: ...
    class BedrockData(_message.Message):
        __slots__ = ("auth_chain",)
        AUTH_CHAIN_FIELD_NUMBER: _ClassVar[int]
        auth_chain: _struct_pb2.Struct
        def __init__(self, auth_chain: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ...) -> None: ...
    TYPE_FIELD_NUMBER: _ClassVar[int]
    PROFILE_ID_FIELD_NUMBER: _ClassVar[int]
    LAST_KNOWN_NAME_FIELD_NUMBER: _ClassVar[int]
    ONLINE_CHAIN_JAVA_DATA_FIELD_NUMBER: _ClassVar[int]
    OFFLINE_JAVA_DATA_FIELD_NUMBER: _ClassVar[int]
    BEDROCK_DATA_FIELD_NUMBER: _ClassVar[int]
    ONLINE_SIMPLE_JAVA_DATA_FIELD_NUMBER: _ClassVar[int]
    THE_ALTENING_JAVA_DATA_FIELD_NUMBER: _ClassVar[int]
    CONFIG_FIELD_NUMBER: _ClassVar[int]
    PERSISTENT_METADATA_FIELD_NUMBER: _ClassVar[int]
    type: MinecraftAccountProto.AccountTypeProto
    profile_id: str
    last_known_name: str
    online_chain_java_data: MinecraftAccountProto.OnlineChainJavaData
    offline_java_data: MinecraftAccountProto.OfflineJavaData
    bedrock_data: MinecraftAccountProto.BedrockData
    online_simple_java_data: MinecraftAccountProto.OnlineSimpleJavaData
    the_altening_java_data: MinecraftAccountProto.TheAlteningJavaData
    config: _containers.RepeatedCompositeFieldContainer[SettingsNamespace]
    persistent_metadata: _containers.RepeatedCompositeFieldContainer[SettingsNamespace]
    def __init__(self, type: _Optional[_Union[MinecraftAccountProto.AccountTypeProto, str]] = ..., profile_id: _Optional[str] = ..., last_known_name: _Optional[str] = ..., online_chain_java_data: _Optional[_Union[MinecraftAccountProto.OnlineChainJavaData, _Mapping]] = ..., offline_java_data: _Optional[_Union[MinecraftAccountProto.OfflineJavaData, _Mapping]] = ..., bedrock_data: _Optional[_Union[MinecraftAccountProto.BedrockData, _Mapping]] = ..., online_simple_java_data: _Optional[_Union[MinecraftAccountProto.OnlineSimpleJavaData, _Mapping]] = ..., the_altening_java_data: _Optional[_Union[MinecraftAccountProto.TheAlteningJavaData, _Mapping]] = ..., config: _Optional[_Iterable[_Union[SettingsNamespace, _Mapping]]] = ..., persistent_metadata: _Optional[_Iterable[_Union[SettingsNamespace, _Mapping]]] = ...) -> None: ...

class SettingsNamespace(_message.Message):
    __slots__ = ("namespace", "entries")
    class SettingsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: _struct_pb2.Value
        def __init__(self, key: _Optional[str] = ..., value: _Optional[_Union[_struct_pb2.Value, _Mapping]] = ...) -> None: ...
    NAMESPACE_FIELD_NUMBER: _ClassVar[int]
    ENTRIES_FIELD_NUMBER: _ClassVar[int]
    namespace: str
    entries: _containers.RepeatedCompositeFieldContainer[SettingsNamespace.SettingsEntry]
    def __init__(self, namespace: _Optional[str] = ..., entries: _Optional[_Iterable[_Union[SettingsNamespace.SettingsEntry, _Mapping]]] = ...) -> None: ...

class SettingsEntryIdentifier(_message.Message):
    __slots__ = ("namespace", "key")
    NAMESPACE_FIELD_NUMBER: _ClassVar[int]
    KEY_FIELD_NUMBER: _ClassVar[int]
    namespace: str
    key: str
    def __init__(self, namespace: _Optional[str] = ..., key: _Optional[str] = ...) -> None: ...

class StringSetting(_message.Message):
    __slots__ = ("ui_name", "description", "input_type", "placeholder", "min_length", "max_length", "pattern", "disabled")
    class InputType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        TEXT: _ClassVar[StringSetting.InputType]
        PASSWORD: _ClassVar[StringSetting.InputType]
        EMAIL: _ClassVar[StringSetting.InputType]
        SEARCH: _ClassVar[StringSetting.InputType]
        TEL: _ClassVar[StringSetting.InputType]
        URL: _ClassVar[StringSetting.InputType]
        TEXTAREA: _ClassVar[StringSetting.InputType]
    TEXT: StringSetting.InputType
    PASSWORD: StringSetting.InputType
    EMAIL: StringSetting.InputType
    SEARCH: StringSetting.InputType
    TEL: StringSetting.InputType
    URL: StringSetting.InputType
    TEXTAREA: StringSetting.InputType
    UI_NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    DEF_FIELD_NUMBER: _ClassVar[int]
    INPUT_TYPE_FIELD_NUMBER: _ClassVar[int]
    PLACEHOLDER_FIELD_NUMBER: _ClassVar[int]
    MIN_LENGTH_FIELD_NUMBER: _ClassVar[int]
    MAX_LENGTH_FIELD_NUMBER: _ClassVar[int]
    PATTERN_FIELD_NUMBER: _ClassVar[int]
    DISABLED_FIELD_NUMBER: _ClassVar[int]
    ui_name: str
    description: str
    input_type: StringSetting.InputType
    placeholder: str
    min_length: int
    max_length: int
    pattern: str
    disabled: bool
    def __init__(self, ui_name: _Optional[str] = ..., description: _Optional[str] = ..., input_type: _Optional[_Union[StringSetting.InputType, str]] = ..., placeholder: _Optional[str] = ..., min_length: _Optional[int] = ..., max_length: _Optional[int] = ..., pattern: _Optional[str] = ..., disabled: bool = ..., **kwargs) -> None: ...

class IntSetting(_message.Message):
    __slots__ = ("ui_name", "description", "min", "max", "step", "placeholder", "thousand_separator", "disabled")
    UI_NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    DEF_FIELD_NUMBER: _ClassVar[int]
    MIN_FIELD_NUMBER: _ClassVar[int]
    MAX_FIELD_NUMBER: _ClassVar[int]
    STEP_FIELD_NUMBER: _ClassVar[int]
    PLACEHOLDER_FIELD_NUMBER: _ClassVar[int]
    THOUSAND_SEPARATOR_FIELD_NUMBER: _ClassVar[int]
    DISABLED_FIELD_NUMBER: _ClassVar[int]
    ui_name: str
    description: str
    min: int
    max: int
    step: int
    placeholder: str
    thousand_separator: bool
    disabled: bool
    def __init__(self, ui_name: _Optional[str] = ..., description: _Optional[str] = ..., min: _Optional[int] = ..., max: _Optional[int] = ..., step: _Optional[int] = ..., placeholder: _Optional[str] = ..., thousand_separator: bool = ..., disabled: bool = ..., **kwargs) -> None: ...

class DoubleSetting(_message.Message):
    __slots__ = ("ui_name", "description", "min", "max", "step", "placeholder", "thousand_separator", "decimal_scale", "fixed_decimal_scale", "disabled")
    UI_NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    DEF_FIELD_NUMBER: _ClassVar[int]
    MIN_FIELD_NUMBER: _ClassVar[int]
    MAX_FIELD_NUMBER: _ClassVar[int]
    STEP_FIELD_NUMBER: _ClassVar[int]
    PLACEHOLDER_FIELD_NUMBER: _ClassVar[int]
    THOUSAND_SEPARATOR_FIELD_NUMBER: _ClassVar[int]
    DECIMAL_SCALE_FIELD_NUMBER: _ClassVar[int]
    FIXED_DECIMAL_SCALE_FIELD_NUMBER: _ClassVar[int]
    DISABLED_FIELD_NUMBER: _ClassVar[int]
    ui_name: str
    description: str
    min: float
    max: float
    step: float
    placeholder: str
    thousand_separator: bool
    decimal_scale: int
    fixed_decimal_scale: bool
    disabled: bool
    def __init__(self, ui_name: _Optional[str] = ..., description: _Optional[str] = ..., min: _Optional[float] = ..., max: _Optional[float] = ..., step: _Optional[float] = ..., placeholder: _Optional[str] = ..., thousand_separator: bool = ..., decimal_scale: _Optional[int] = ..., fixed_decimal_scale: bool = ..., disabled: bool = ..., **kwargs) -> None: ...

class BoolSetting(_message.Message):
    __slots__ = ("ui_name", "description", "disabled")
    UI_NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    DEF_FIELD_NUMBER: _ClassVar[int]
    DISABLED_FIELD_NUMBER: _ClassVar[int]
    ui_name: str
    description: str
    disabled: bool
    def __init__(self, ui_name: _Optional[str] = ..., description: _Optional[str] = ..., disabled: bool = ..., **kwargs) -> None: ...

class ComboSetting(_message.Message):
    __slots__ = ("ui_name", "description", "options", "disabled")
    class Option(_message.Message):
        __slots__ = ("id", "display_name", "icon_id", "keywords")
        ID_FIELD_NUMBER: _ClassVar[int]
        DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
        ICON_ID_FIELD_NUMBER: _ClassVar[int]
        KEYWORDS_FIELD_NUMBER: _ClassVar[int]
        id: str
        display_name: str
        icon_id: str
        keywords: _containers.RepeatedScalarFieldContainer[str]
        def __init__(self, id: _Optional[str] = ..., display_name: _Optional[str] = ..., icon_id: _Optional[str] = ..., keywords: _Optional[_Iterable[str]] = ...) -> None: ...
    UI_NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    DEF_FIELD_NUMBER: _ClassVar[int]
    DISABLED_FIELD_NUMBER: _ClassVar[int]
    ui_name: str
    description: str
    options: _containers.RepeatedCompositeFieldContainer[ComboSetting.Option]
    disabled: bool
    def __init__(self, ui_name: _Optional[str] = ..., description: _Optional[str] = ..., options: _Optional[_Iterable[_Union[ComboSetting.Option, _Mapping]]] = ..., disabled: bool = ..., **kwargs) -> None: ...

class StringListSetting(_message.Message):
    __slots__ = ("ui_name", "description", "disabled")
    UI_NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    DEF_FIELD_NUMBER: _ClassVar[int]
    DISABLED_FIELD_NUMBER: _ClassVar[int]
    ui_name: str
    description: str
    disabled: bool
    def __init__(self, ui_name: _Optional[str] = ..., description: _Optional[str] = ..., disabled: bool = ..., **kwargs) -> None: ...

class MinMaxSetting(_message.Message):
    __slots__ = ("min", "max", "step", "thousand_separator", "minEntry", "maxEntry", "disabled")
    class Entry(_message.Message):
        __slots__ = ("ui_name", "description", "placeholder")
        UI_NAME_FIELD_NUMBER: _ClassVar[int]
        DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
        DEF_FIELD_NUMBER: _ClassVar[int]
        PLACEHOLDER_FIELD_NUMBER: _ClassVar[int]
        ui_name: str
        description: str
        placeholder: str
        def __init__(self, ui_name: _Optional[str] = ..., description: _Optional[str] = ..., placeholder: _Optional[str] = ..., **kwargs) -> None: ...
    MIN_FIELD_NUMBER: _ClassVar[int]
    MAX_FIELD_NUMBER: _ClassVar[int]
    STEP_FIELD_NUMBER: _ClassVar[int]
    THOUSAND_SEPARATOR_FIELD_NUMBER: _ClassVar[int]
    MINENTRY_FIELD_NUMBER: _ClassVar[int]
    MAXENTRY_FIELD_NUMBER: _ClassVar[int]
    DISABLED_FIELD_NUMBER: _ClassVar[int]
    min: int
    max: int
    step: int
    thousand_separator: bool
    minEntry: MinMaxSetting.Entry
    maxEntry: MinMaxSetting.Entry
    disabled: bool
    def __init__(self, min: _Optional[int] = ..., max: _Optional[int] = ..., step: _Optional[int] = ..., thousand_separator: bool = ..., minEntry: _Optional[_Union[MinMaxSetting.Entry, _Mapping]] = ..., maxEntry: _Optional[_Union[MinMaxSetting.Entry, _Mapping]] = ..., disabled: bool = ...) -> None: ...

class SettingsDefinition(_message.Message):
    __slots__ = ("id", "scope", "string", "int", "double", "bool", "combo", "string_list", "min_max")
    ID_FIELD_NUMBER: _ClassVar[int]
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    STRING_FIELD_NUMBER: _ClassVar[int]
    INT_FIELD_NUMBER: _ClassVar[int]
    DOUBLE_FIELD_NUMBER: _ClassVar[int]
    BOOL_FIELD_NUMBER: _ClassVar[int]
    COMBO_FIELD_NUMBER: _ClassVar[int]
    STRING_LIST_FIELD_NUMBER: _ClassVar[int]
    MIN_MAX_FIELD_NUMBER: _ClassVar[int]
    id: SettingsEntryIdentifier
    scope: SettingsPageEntryScopeType
    string: StringSetting
    int: IntSetting
    double: DoubleSetting
    bool: BoolSetting
    combo: ComboSetting
    string_list: StringListSetting
    min_max: MinMaxSetting
    def __init__(self, id: _Optional[_Union[SettingsEntryIdentifier, _Mapping]] = ..., scope: _Optional[_Union[SettingsPageEntryScopeType, str]] = ..., string: _Optional[_Union[StringSetting, _Mapping]] = ..., int: _Optional[_Union[IntSetting, _Mapping]] = ..., double: _Optional[_Union[DoubleSetting, _Mapping]] = ..., bool: _Optional[_Union[BoolSetting, _Mapping]] = ..., combo: _Optional[_Union[ComboSetting, _Mapping]] = ..., string_list: _Optional[_Union[StringListSetting, _Mapping]] = ..., min_max: _Optional[_Union[MinMaxSetting, _Mapping]] = ...) -> None: ...

class SettingsPage(_message.Message):
    __slots__ = ("id", "owning_plugin_id", "page_name", "entries", "icon_id", "enabled_identifier")
    ID_FIELD_NUMBER: _ClassVar[int]
    OWNING_PLUGIN_ID_FIELD_NUMBER: _ClassVar[int]
    PAGE_NAME_FIELD_NUMBER: _ClassVar[int]
    ENTRIES_FIELD_NUMBER: _ClassVar[int]
    ICON_ID_FIELD_NUMBER: _ClassVar[int]
    ENABLED_IDENTIFIER_FIELD_NUMBER: _ClassVar[int]
    id: str
    owning_plugin_id: str
    page_name: str
    entries: _containers.RepeatedCompositeFieldContainer[SettingsEntryIdentifier]
    icon_id: str
    enabled_identifier: SettingsEntryIdentifier
    def __init__(self, id: _Optional[str] = ..., owning_plugin_id: _Optional[str] = ..., page_name: _Optional[str] = ..., entries: _Optional[_Iterable[_Union[SettingsEntryIdentifier, _Mapping]]] = ..., icon_id: _Optional[str] = ..., enabled_identifier: _Optional[_Union[SettingsEntryIdentifier, _Mapping]] = ...) -> None: ...

class ServerPlugin(_message.Message):
    __slots__ = ("id", "version", "description", "author", "license", "website")
    ID_FIELD_NUMBER: _ClassVar[int]
    VERSION_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    AUTHOR_FIELD_NUMBER: _ClassVar[int]
    LICENSE_FIELD_NUMBER: _ClassVar[int]
    WEBSITE_FIELD_NUMBER: _ClassVar[int]
    id: str
    version: str
    description: str
    author: str
    license: str
    website: str
    def __init__(self, id: _Optional[str] = ..., version: _Optional[str] = ..., description: _Optional[str] = ..., author: _Optional[str] = ..., license: _Optional[str] = ..., website: _Optional[str] = ...) -> None: ...
