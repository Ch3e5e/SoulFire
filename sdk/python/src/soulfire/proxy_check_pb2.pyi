from soulfire import common_pb2 as _common_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ProxyCheckRequest(_message.Message):
    __slots__ = ("instance_id", "proxy")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    PROXY_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    proxy: _containers.RepeatedCompositeFieldContainer[_common_pb2.ProxyProto]
    def __init__(self, instance_id: _Optional[str] = ..., proxy: _Optional[_Iterable[_Union[_common_pb2.ProxyProto, _Mapping]]] = ...) -> None: ...

class ProxyCheckResponseSingle(_message.Message):
    __slots__ = ("proxy", "valid", "latency", "real_ip")
    PROXY_FIELD_NUMBER: _ClassVar[int]
    VALID_FIELD_NUMBER: _ClassVar[int]
    LATENCY_FIELD_NUMBER: _ClassVar[int]
    REAL_IP_FIELD_NUMBER: _ClassVar[int]
    proxy: _common_pb2.ProxyProto
    valid: bool
    latency: int
    real_ip: str
    def __init__(self, proxy: _Optional[_Union[_common_pb2.ProxyProto, _Mapping]] = ..., valid: bool = ..., latency: _Optional[int] = ..., real_ip: _Optional[str] = ...) -> None: ...

class ProxyCheckEnd(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ProxyCheckResponse(_message.Message):
    __slots__ = ("single", "end")
    SINGLE_FIELD_NUMBER: _ClassVar[int]
    END_FIELD_NUMBER: _ClassVar[int]
    single: ProxyCheckResponseSingle
    end: ProxyCheckEnd
    def __init__(self, single: _Optional[_Union[ProxyCheckResponseSingle, _Mapping]] = ..., end: _Optional[_Union[ProxyCheckEnd, _Mapping]] = ...) -> None: ...
