from soulfire import api_docs_pb2 as _api_docs_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class GlobalCommandScope(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class InstanceCommandScope(_message.Message):
    __slots__ = ("instance_id",)
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    def __init__(self, instance_id: _Optional[str] = ...) -> None: ...

class BotCommandScope(_message.Message):
    __slots__ = ("instance_id", "bot_id")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ...) -> None: ...

class CommandScope(_message.Message):
    __slots__ = ("instance", "bot")
    GLOBAL_FIELD_NUMBER: _ClassVar[int]
    INSTANCE_FIELD_NUMBER: _ClassVar[int]
    BOT_FIELD_NUMBER: _ClassVar[int]
    instance: InstanceCommandScope
    bot: BotCommandScope
    def __init__(self, instance: _Optional[_Union[InstanceCommandScope, _Mapping]] = ..., bot: _Optional[_Union[BotCommandScope, _Mapping]] = ..., **kwargs) -> None: ...

class CommandRequest(_message.Message):
    __slots__ = ("scope", "command")
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    scope: CommandScope
    command: str
    def __init__(self, scope: _Optional[_Union[CommandScope, _Mapping]] = ..., command: _Optional[str] = ...) -> None: ...

class CommandResponse(_message.Message):
    __slots__ = ("code",)
    CODE_FIELD_NUMBER: _ClassVar[int]
    code: int
    def __init__(self, code: _Optional[int] = ...) -> None: ...

class CommandCompletionRequest(_message.Message):
    __slots__ = ("scope", "command", "cursor")
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    CURSOR_FIELD_NUMBER: _ClassVar[int]
    scope: CommandScope
    command: str
    cursor: int
    def __init__(self, scope: _Optional[_Union[CommandScope, _Mapping]] = ..., command: _Optional[str] = ..., cursor: _Optional[int] = ...) -> None: ...

class CommandCompletion(_message.Message):
    __slots__ = ("suggestion", "tooltip")
    SUGGESTION_FIELD_NUMBER: _ClassVar[int]
    TOOLTIP_FIELD_NUMBER: _ClassVar[int]
    suggestion: str
    tooltip: str
    def __init__(self, suggestion: _Optional[str] = ..., tooltip: _Optional[str] = ...) -> None: ...

class CommandCompletionResponse(_message.Message):
    __slots__ = ("suggestions",)
    SUGGESTIONS_FIELD_NUMBER: _ClassVar[int]
    suggestions: _containers.RepeatedCompositeFieldContainer[CommandCompletion]
    def __init__(self, suggestions: _Optional[_Iterable[_Union[CommandCompletion, _Mapping]]] = ...) -> None: ...
