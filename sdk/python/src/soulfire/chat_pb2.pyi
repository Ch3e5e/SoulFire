from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from soulfire import bot_live_pb2 as _bot_live_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ChatScope(_message.Message):
    __slots__ = ("instance_id", "bot_id")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_ID_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    bot_id: str
    def __init__(self, instance_id: _Optional[str] = ..., bot_id: _Optional[str] = ...) -> None: ...

class SendPublicChatRequest(_message.Message):
    __slots__ = ("scope", "message", "idempotency_key")
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    IDEMPOTENCY_KEY_FIELD_NUMBER: _ClassVar[int]
    scope: ChatScope
    message: str
    idempotency_key: str
    def __init__(self, scope: _Optional[_Union[ChatScope, _Mapping]] = ..., message: _Optional[str] = ..., idempotency_key: _Optional[str] = ...) -> None: ...

class SendCommandRequest(_message.Message):
    __slots__ = ("scope", "command", "idempotency_key")
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    IDEMPOTENCY_KEY_FIELD_NUMBER: _ClassVar[int]
    scope: ChatScope
    command: str
    idempotency_key: str
    def __init__(self, scope: _Optional[_Union[ChatScope, _Mapping]] = ..., command: _Optional[str] = ..., idempotency_key: _Optional[str] = ...) -> None: ...

class SendWhisperRequest(_message.Message):
    __slots__ = ("scope", "recipient", "message", "idempotency_key")
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    RECIPIENT_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    IDEMPOTENCY_KEY_FIELD_NUMBER: _ClassVar[int]
    scope: ChatScope
    recipient: str
    message: str
    idempotency_key: str
    def __init__(self, scope: _Optional[_Union[ChatScope, _Mapping]] = ..., recipient: _Optional[str] = ..., message: _Optional[str] = ..., idempotency_key: _Optional[str] = ...) -> None: ...

class ChatActionResponse(_message.Message):
    __slots__ = ("result",)
    RESULT_FIELD_NUMBER: _ClassVar[int]
    result: _bot_live_pb2.BotActionResult
    def __init__(self, result: _Optional[_Union[_bot_live_pb2.BotActionResult, _Mapping]] = ...) -> None: ...

class TabCompleteRequest(_message.Message):
    __slots__ = ("scope", "input", "cursor")
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    INPUT_FIELD_NUMBER: _ClassVar[int]
    CURSOR_FIELD_NUMBER: _ClassVar[int]
    scope: ChatScope
    input: str
    cursor: int
    def __init__(self, scope: _Optional[_Union[ChatScope, _Mapping]] = ..., input: _Optional[str] = ..., cursor: _Optional[int] = ...) -> None: ...

class TabSuggestion(_message.Message):
    __slots__ = ("text", "tooltip_json")
    TEXT_FIELD_NUMBER: _ClassVar[int]
    TOOLTIP_JSON_FIELD_NUMBER: _ClassVar[int]
    text: str
    tooltip_json: str
    def __init__(self, text: _Optional[str] = ..., tooltip_json: _Optional[str] = ...) -> None: ...

class TabCompleteResponse(_message.Message):
    __slots__ = ("start", "length", "suggestions")
    START_FIELD_NUMBER: _ClassVar[int]
    LENGTH_FIELD_NUMBER: _ClassVar[int]
    SUGGESTIONS_FIELD_NUMBER: _ClassVar[int]
    start: int
    length: int
    suggestions: _containers.RepeatedCompositeFieldContainer[TabSuggestion]
    def __init__(self, start: _Optional[int] = ..., length: _Optional[int] = ..., suggestions: _Optional[_Iterable[_Union[TabSuggestion, _Mapping]]] = ...) -> None: ...
