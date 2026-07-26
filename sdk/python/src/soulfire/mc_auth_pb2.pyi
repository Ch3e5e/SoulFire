from soulfire import common_pb2 as _common_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class CredentialsAuthRequest(_message.Message):
    __slots__ = ("instance_id", "service", "payload")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    SERVICE_FIELD_NUMBER: _ClassVar[int]
    PAYLOAD_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    service: _common_pb2.AccountTypeCredentials
    payload: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, instance_id: _Optional[str] = ..., service: _Optional[_Union[_common_pb2.AccountTypeCredentials, str]] = ..., payload: _Optional[_Iterable[str]] = ...) -> None: ...

class CredentialsAuthOneSuccess(_message.Message):
    __slots__ = ("account",)
    ACCOUNT_FIELD_NUMBER: _ClassVar[int]
    account: _common_pb2.MinecraftAccountProto
    def __init__(self, account: _Optional[_Union[_common_pb2.MinecraftAccountProto, _Mapping]] = ...) -> None: ...

class CredentialsAuthOneFailure(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class CredentialsAuthEnd(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class CredentialsAuthResponse(_message.Message):
    __slots__ = ("one_success", "one_failure", "end")
    ONE_SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ONE_FAILURE_FIELD_NUMBER: _ClassVar[int]
    END_FIELD_NUMBER: _ClassVar[int]
    one_success: CredentialsAuthOneSuccess
    one_failure: CredentialsAuthOneFailure
    end: CredentialsAuthEnd
    def __init__(self, one_success: _Optional[_Union[CredentialsAuthOneSuccess, _Mapping]] = ..., one_failure: _Optional[_Union[CredentialsAuthOneFailure, _Mapping]] = ..., end: _Optional[_Union[CredentialsAuthEnd, _Mapping]] = ...) -> None: ...

class DeviceCodeAuthRequest(_message.Message):
    __slots__ = ("instance_id", "service")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    SERVICE_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    service: _common_pb2.AccountTypeDeviceCode
    def __init__(self, instance_id: _Optional[str] = ..., service: _Optional[_Union[_common_pb2.AccountTypeDeviceCode, str]] = ...) -> None: ...

class DeviceCode(_message.Message):
    __slots__ = ("device_code", "user_code", "verification_uri", "direct_verification_uri")
    DEVICE_CODE_FIELD_NUMBER: _ClassVar[int]
    USER_CODE_FIELD_NUMBER: _ClassVar[int]
    VERIFICATION_URI_FIELD_NUMBER: _ClassVar[int]
    DIRECT_VERIFICATION_URI_FIELD_NUMBER: _ClassVar[int]
    device_code: str
    user_code: str
    verification_uri: str
    direct_verification_uri: str
    def __init__(self, device_code: _Optional[str] = ..., user_code: _Optional[str] = ..., verification_uri: _Optional[str] = ..., direct_verification_uri: _Optional[str] = ...) -> None: ...

class DeviceCodeAuthResponse(_message.Message):
    __slots__ = ("account", "device_code")
    ACCOUNT_FIELD_NUMBER: _ClassVar[int]
    DEVICE_CODE_FIELD_NUMBER: _ClassVar[int]
    account: _common_pb2.MinecraftAccountProto
    device_code: DeviceCode
    def __init__(self, account: _Optional[_Union[_common_pb2.MinecraftAccountProto, _Mapping]] = ..., device_code: _Optional[_Union[DeviceCode, _Mapping]] = ...) -> None: ...

class RefreshRequest(_message.Message):
    __slots__ = ("instance_id", "account")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    ACCOUNT_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    account: _common_pb2.MinecraftAccountProto
    def __init__(self, instance_id: _Optional[str] = ..., account: _Optional[_Union[_common_pb2.MinecraftAccountProto, _Mapping]] = ...) -> None: ...

class RefreshResponse(_message.Message):
    __slots__ = ("account",)
    ACCOUNT_FIELD_NUMBER: _ClassVar[int]
    account: _common_pb2.MinecraftAccountProto
    def __init__(self, account: _Optional[_Union[_common_pb2.MinecraftAccountProto, _Mapping]] = ...) -> None: ...
