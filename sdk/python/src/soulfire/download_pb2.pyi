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

class HeaderPair(_message.Message):
    __slots__ = ("key", "value")
    KEY_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    key: str
    value: str
    def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...

class DownloadRequest(_message.Message):
    __slots__ = ("instance_id", "uri", "headers", "proxy")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    URI_FIELD_NUMBER: _ClassVar[int]
    HEADERS_FIELD_NUMBER: _ClassVar[int]
    PROXY_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    uri: str
    headers: _containers.RepeatedCompositeFieldContainer[HeaderPair]
    proxy: _common_pb2.ProxyProto
    def __init__(self, instance_id: _Optional[str] = ..., uri: _Optional[str] = ..., headers: _Optional[_Iterable[_Union[HeaderPair, _Mapping]]] = ..., proxy: _Optional[_Union[_common_pb2.ProxyProto, _Mapping]] = ...) -> None: ...

class DownloadResponse(_message.Message):
    __slots__ = ("data", "headers", "status_code")
    DATA_FIELD_NUMBER: _ClassVar[int]
    HEADERS_FIELD_NUMBER: _ClassVar[int]
    STATUS_CODE_FIELD_NUMBER: _ClassVar[int]
    data: bytes
    headers: _containers.RepeatedCompositeFieldContainer[HeaderPair]
    status_code: int
    def __init__(self, data: _Optional[bytes] = ..., headers: _Optional[_Iterable[_Union[HeaderPair, _Mapping]]] = ..., status_code: _Optional[int] = ...) -> None: ...
