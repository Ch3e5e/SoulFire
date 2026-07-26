from soulfire import api_docs_pb2 as _api_docs_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class LoginRequest(_message.Message):
    __slots__ = ("email",)
    EMAIL_FIELD_NUMBER: _ClassVar[int]
    email: str
    def __init__(self, email: _Optional[str] = ...) -> None: ...

class NextAuthFlowResponse(_message.Message):
    __slots__ = ("auth_flow_token", "email_code", "success", "failure")
    class EmailCode(_message.Message):
        __slots__ = ()
        def __init__(self) -> None: ...
    class Success(_message.Message):
        __slots__ = ("token",)
        TOKEN_FIELD_NUMBER: _ClassVar[int]
        token: str
        def __init__(self, token: _Optional[str] = ...) -> None: ...
    class Failure(_message.Message):
        __slots__ = ("reason",)
        class Reason(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
            __slots__ = ()
            INVALID_CODE: _ClassVar[NextAuthFlowResponse.Failure.Reason]
        INVALID_CODE: NextAuthFlowResponse.Failure.Reason
        REASON_FIELD_NUMBER: _ClassVar[int]
        reason: NextAuthFlowResponse.Failure.Reason
        def __init__(self, reason: _Optional[_Union[NextAuthFlowResponse.Failure.Reason, str]] = ...) -> None: ...
    AUTH_FLOW_TOKEN_FIELD_NUMBER: _ClassVar[int]
    EMAIL_CODE_FIELD_NUMBER: _ClassVar[int]
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    FAILURE_FIELD_NUMBER: _ClassVar[int]
    auth_flow_token: str
    email_code: NextAuthFlowResponse.EmailCode
    success: NextAuthFlowResponse.Success
    failure: NextAuthFlowResponse.Failure
    def __init__(self, auth_flow_token: _Optional[str] = ..., email_code: _Optional[_Union[NextAuthFlowResponse.EmailCode, _Mapping]] = ..., success: _Optional[_Union[NextAuthFlowResponse.Success, _Mapping]] = ..., failure: _Optional[_Union[NextAuthFlowResponse.Failure, _Mapping]] = ...) -> None: ...

class EmailCodeRequest(_message.Message):
    __slots__ = ("auth_flow_token", "code")
    AUTH_FLOW_TOKEN_FIELD_NUMBER: _ClassVar[int]
    CODE_FIELD_NUMBER: _ClassVar[int]
    auth_flow_token: str
    code: str
    def __init__(self, auth_flow_token: _Optional[str] = ..., code: _Optional[str] = ...) -> None: ...
