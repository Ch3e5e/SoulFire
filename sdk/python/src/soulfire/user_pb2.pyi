import datetime

from soulfire import common_pb2 as _common_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from soulfire import plugin_api_pb2 as _plugin_api_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class UserCreateRequest(_message.Message):
    __slots__ = ("username", "role", "email")
    USERNAME_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    username: str
    role: _common_pb2.UserRole
    email: str
    def __init__(self, username: _Optional[str] = ..., role: _Optional[_Union[_common_pb2.UserRole, str]] = ..., email: _Optional[str] = ...) -> None: ...

class UserCreateResponse(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class UserDeleteRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class UserDeleteResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class UserListRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class UserListResponse(_message.Message):
    __slots__ = ("users",)
    class User(_message.Message):
        __slots__ = ("id", "username", "role", "email", "created_at", "updated_at", "last_login_at", "min_issued_at")
        ID_FIELD_NUMBER: _ClassVar[int]
        USERNAME_FIELD_NUMBER: _ClassVar[int]
        ROLE_FIELD_NUMBER: _ClassVar[int]
        EMAIL_FIELD_NUMBER: _ClassVar[int]
        CREATED_AT_FIELD_NUMBER: _ClassVar[int]
        UPDATED_AT_FIELD_NUMBER: _ClassVar[int]
        LAST_LOGIN_AT_FIELD_NUMBER: _ClassVar[int]
        MIN_ISSUED_AT_FIELD_NUMBER: _ClassVar[int]
        id: str
        username: str
        role: _common_pb2.UserRole
        email: str
        created_at: _timestamp_pb2.Timestamp
        updated_at: _timestamp_pb2.Timestamp
        last_login_at: _timestamp_pb2.Timestamp
        min_issued_at: _timestamp_pb2.Timestamp
        def __init__(self, id: _Optional[str] = ..., username: _Optional[str] = ..., role: _Optional[_Union[_common_pb2.UserRole, str]] = ..., email: _Optional[str] = ..., created_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., updated_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., last_login_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., min_issued_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...
    USERS_FIELD_NUMBER: _ClassVar[int]
    users: _containers.RepeatedCompositeFieldContainer[UserListResponse.User]
    def __init__(self, users: _Optional[_Iterable[_Union[UserListResponse.User, _Mapping]]] = ...) -> None: ...

class UserInfoRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class UserInfoResponse(_message.Message):
    __slots__ = ("username", "role", "email", "created_at", "updated_at", "last_login_at", "min_issued_at")
    USERNAME_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    UPDATED_AT_FIELD_NUMBER: _ClassVar[int]
    LAST_LOGIN_AT_FIELD_NUMBER: _ClassVar[int]
    MIN_ISSUED_AT_FIELD_NUMBER: _ClassVar[int]
    username: str
    role: _common_pb2.UserRole
    email: str
    created_at: _timestamp_pb2.Timestamp
    updated_at: _timestamp_pb2.Timestamp
    last_login_at: _timestamp_pb2.Timestamp
    min_issued_at: _timestamp_pb2.Timestamp
    def __init__(self, username: _Optional[str] = ..., role: _Optional[_Union[_common_pb2.UserRole, str]] = ..., email: _Optional[str] = ..., created_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., updated_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., last_login_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., min_issued_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class InvalidateSessionsRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class InvalidateSessionsResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class UpdateUserRequest(_message.Message):
    __slots__ = ("id", "username", "role", "email")
    ID_FIELD_NUMBER: _ClassVar[int]
    USERNAME_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    id: str
    username: str
    role: _common_pb2.UserRole
    email: str
    def __init__(self, id: _Optional[str] = ..., username: _Optional[str] = ..., role: _Optional[_Union[_common_pb2.UserRole, str]] = ..., email: _Optional[str] = ...) -> None: ...

class UpdateUserResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GenerateUserAPITokenRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class GenerateUserAPITokenResponse(_message.Message):
    __slots__ = ("token",)
    TOKEN_FIELD_NUMBER: _ClassVar[int]
    token: str
    def __init__(self, token: _Optional[str] = ...) -> None: ...

class UserPluginPermissionGrant(_message.Message):
    __slots__ = ("user_id", "permission_id", "scope", "resource_id", "granted", "active", "created_at", "updated_at")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    PERMISSION_ID_FIELD_NUMBER: _ClassVar[int]
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    RESOURCE_ID_FIELD_NUMBER: _ClassVar[int]
    GRANTED_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    UPDATED_AT_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    permission_id: str
    scope: _plugin_api_pb2.PluginPermissionScope
    resource_id: str
    granted: bool
    active: bool
    created_at: _timestamp_pb2.Timestamp
    updated_at: _timestamp_pb2.Timestamp
    def __init__(self, user_id: _Optional[str] = ..., permission_id: _Optional[str] = ..., scope: _Optional[_Union[_plugin_api_pb2.PluginPermissionScope, str]] = ..., resource_id: _Optional[str] = ..., granted: bool = ..., active: bool = ..., created_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., updated_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class ListUserPluginPermissionGrantsRequest(_message.Message):
    __slots__ = ("user_id",)
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    def __init__(self, user_id: _Optional[str] = ...) -> None: ...

class ListUserPluginPermissionGrantsResponse(_message.Message):
    __slots__ = ("grants",)
    GRANTS_FIELD_NUMBER: _ClassVar[int]
    grants: _containers.RepeatedCompositeFieldContainer[UserPluginPermissionGrant]
    def __init__(self, grants: _Optional[_Iterable[_Union[UserPluginPermissionGrant, _Mapping]]] = ...) -> None: ...

class SetUserPluginPermissionGrantRequest(_message.Message):
    __slots__ = ("user_id", "permission_id", "scope", "resource_id", "granted")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    PERMISSION_ID_FIELD_NUMBER: _ClassVar[int]
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    RESOURCE_ID_FIELD_NUMBER: _ClassVar[int]
    GRANTED_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    permission_id: str
    scope: _plugin_api_pb2.PluginPermissionScope
    resource_id: str
    granted: bool
    def __init__(self, user_id: _Optional[str] = ..., permission_id: _Optional[str] = ..., scope: _Optional[_Union[_plugin_api_pb2.PluginPermissionScope, str]] = ..., resource_id: _Optional[str] = ..., granted: bool = ...) -> None: ...

class DeleteUserPluginPermissionGrantRequest(_message.Message):
    __slots__ = ("user_id", "permission_id", "scope", "resource_id")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    PERMISSION_ID_FIELD_NUMBER: _ClassVar[int]
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    RESOURCE_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    permission_id: str
    scope: _plugin_api_pb2.PluginPermissionScope
    resource_id: str
    def __init__(self, user_id: _Optional[str] = ..., permission_id: _Optional[str] = ..., scope: _Optional[_Union[_plugin_api_pb2.PluginPermissionScope, str]] = ..., resource_id: _Optional[str] = ...) -> None: ...

class DeleteUserPluginPermissionGrantResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
