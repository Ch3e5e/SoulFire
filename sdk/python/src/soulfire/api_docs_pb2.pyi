from google.protobuf import descriptor_pb2 as _descriptor_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor
API_METHOD_FIELD_NUMBER: _ClassVar[int]
api_method: _descriptor.FieldDescriptor
API_FIELD_FIELD_NUMBER: _ClassVar[int]
api_field: _descriptor.FieldDescriptor

class ApiMethodDocs(_message.Message):
    __slots__ = ("display_name", "description", "permissions", "scope", "preconditions", "execution", "side_effects", "expose_to_mcp", "mcp_requires_confirmation")
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    PERMISSIONS_FIELD_NUMBER: _ClassVar[int]
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    PRECONDITIONS_FIELD_NUMBER: _ClassVar[int]
    EXECUTION_FIELD_NUMBER: _ClassVar[int]
    SIDE_EFFECTS_FIELD_NUMBER: _ClassVar[int]
    EXPOSE_TO_MCP_FIELD_NUMBER: _ClassVar[int]
    MCP_REQUIRES_CONFIRMATION_FIELD_NUMBER: _ClassVar[int]
    display_name: str
    description: str
    permissions: _containers.RepeatedScalarFieldContainer[str]
    scope: str
    preconditions: _containers.RepeatedScalarFieldContainer[str]
    execution: str
    side_effects: _containers.RepeatedScalarFieldContainer[str]
    expose_to_mcp: bool
    mcp_requires_confirmation: bool
    def __init__(self, display_name: _Optional[str] = ..., description: _Optional[str] = ..., permissions: _Optional[_Iterable[str]] = ..., scope: _Optional[str] = ..., preconditions: _Optional[_Iterable[str]] = ..., execution: _Optional[str] = ..., side_effects: _Optional[_Iterable[str]] = ..., expose_to_mcp: bool = ..., mcp_requires_confirmation: bool = ...) -> None: ...

class ApiFieldDocs(_message.Message):
    __slots__ = ("format", "example")
    FORMAT_FIELD_NUMBER: _ClassVar[int]
    EXAMPLE_FIELD_NUMBER: _ClassVar[int]
    format: str
    example: str
    def __init__(self, format: _Optional[str] = ..., example: _Optional[str] = ...) -> None: ...
