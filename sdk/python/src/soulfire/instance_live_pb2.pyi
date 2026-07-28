from soulfire import api_docs_pb2 as _api_docs_pb2
from soulfire import bot_live_pb2 as _bot_live_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class InstanceEventFilter(_message.Message):
    __slots__ = ("include_chat", "include_lifecycle", "bot_events", "bot_ids")
    INCLUDE_CHAT_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_LIFECYCLE_FIELD_NUMBER: _ClassVar[int]
    BOT_EVENTS_FIELD_NUMBER: _ClassVar[int]
    BOT_IDS_FIELD_NUMBER: _ClassVar[int]
    include_chat: bool
    include_lifecycle: bool
    bot_events: _bot_live_pb2.BotEventFilter
    bot_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, include_chat: bool = ..., include_lifecycle: bool = ..., bot_events: _Optional[_Union[_bot_live_pb2.BotEventFilter, _Mapping]] = ..., bot_ids: _Optional[_Iterable[str]] = ...) -> None: ...

class WatchInstanceEventsRequest(_message.Message):
    __slots__ = ("instance_id", "filter")
    INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    FILTER_FIELD_NUMBER: _ClassVar[int]
    instance_id: str
    filter: InstanceEventFilter
    def __init__(self, instance_id: _Optional[str] = ..., filter: _Optional[_Union[InstanceEventFilter, _Mapping]] = ...) -> None: ...

class InstanceEvent(_message.Message):
    __slots__ = ("bot_profile_id", "bot_name", "chat", "lifecycle", "bot_event")
    BOT_PROFILE_ID_FIELD_NUMBER: _ClassVar[int]
    BOT_NAME_FIELD_NUMBER: _ClassVar[int]
    CHAT_FIELD_NUMBER: _ClassVar[int]
    LIFECYCLE_FIELD_NUMBER: _ClassVar[int]
    BOT_EVENT_FIELD_NUMBER: _ClassVar[int]
    bot_profile_id: str
    bot_name: str
    chat: _bot_live_pb2.BotChatEvent
    lifecycle: _bot_live_pb2.BotLifecycleEvent
    bot_event: _bot_live_pb2.BotEvent
    def __init__(self, bot_profile_id: _Optional[str] = ..., bot_name: _Optional[str] = ..., chat: _Optional[_Union[_bot_live_pb2.BotChatEvent, _Mapping]] = ..., lifecycle: _Optional[_Union[_bot_live_pb2.BotLifecycleEvent, _Mapping]] = ..., bot_event: _Optional[_Union[_bot_live_pb2.BotEvent, _Mapping]] = ...) -> None: ...
