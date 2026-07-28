from soulfire import api_docs_pb2 as _api_docs_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class EchoRequest(_message.Message):
    __slots__ = ("instance_id", "message")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    message: str
    def __init__(self, instance_id: _Optional[str] = ..., message: _Optional[str] = ...) -> None: ...

class EchoResponse(_message.Message):
    __slots__ = ("message",)
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    message: str
    def __init__(self, message: _Optional[str] = ...) -> None: ...

class WatchTicksRequest(_message.Message):
    __slots__ = ("instance_id", "count")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    count: int
    def __init__(self, instance_id: _Optional[str] = ..., count: _Optional[int] = ...) -> None: ...

class Tick(_message.Message):
    __slots__ = ("sequence",)
    SEQUENCE_FIELD_NUMBER: _ClassVar[int]
    sequence: int
    def __init__(self, sequence: _Optional[int] = ...) -> None: ...
