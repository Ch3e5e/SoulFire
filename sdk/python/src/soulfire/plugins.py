from __future__ import annotations

import hashlib
from collections.abc import AsyncIterator, Callable, Iterator
from dataclasses import dataclass
from typing import Any, Protocol, Unpack, cast

from connectrpc.client import ConnectClient, ConnectClientSync
from connectrpc.method import IdempotencyLevel, MethodInfo
from google.protobuf import descriptor_pb2, descriptor_pool, json_format, message_factory
from google.protobuf.descriptor import MethodDescriptor, ServiceDescriptor
from google.protobuf.message import Message

from .plugin_api_connect import PluginApiServiceClient, PluginApiServiceClientSync
from .plugin_api_pb2 import (
    PLUGIN_API_EVENT_KIND_SNAPSHOT,
    GetPluginDescriptorSetRequest,
    ListPluginApisRequest,
    PluginApiDescriptor,
    PluginApiEvent,
    PluginEvent,
    WatchPluginApisRequest,
    WatchPluginEventsRequest,
)
from .tasks import (
    AsyncSoulFireTask,
    AsyncSoulFireTasks,
    SoulFireTask,
    SoulFireTasks,
    TaskStartOptions,
)


class SoulFirePluginNotFoundError(LookupError):
    def __init__(self, plugin_id: str) -> None:
        super().__init__(f"SoulFire plugin is not installed: {plugin_id}")
        self.plugin_id = plugin_id


class SoulFirePluginCompatibilityError(RuntimeError):
    def __init__(self, plugin_id: str, message: str) -> None:
        super().__init__(message)
        self.plugin_id = plugin_id


class SoulFirePluginDescriptorError(RuntimeError):
    def __init__(self, plugin_id: str, message: str) -> None:
        super().__init__(message)
        self.plugin_id = plugin_id


@dataclass(frozen=True, slots=True)
class ReflectiveMessage:
    type_name: str
    value: Message
    json: dict[str, Any]


@dataclass(frozen=True, slots=True)
class TypedPluginEvent[T: Message]:
    event: PluginEvent
    value: T | None = None


@dataclass(frozen=True, slots=True)
class ReflectivePluginEvent:
    event: PluginEvent
    message: ReflectiveMessage | None = None


class _ReflectivePluginBase:
    __slots__ = ("_pool", "descriptor")

    def __init__(
        self,
        descriptor: PluginApiDescriptor,
        descriptor_set: bytes,
    ) -> None:
        self.descriptor = descriptor
        self._pool = _descriptor_pool(descriptor.plugin_id, descriptor_set)

    def _method(
        self,
        service_name: str,
        method_name: str,
        *,
        server_streaming: bool,
    ) -> MethodDescriptor:
        if not any(service.full_name == service_name for service in self.descriptor.services):
            raise SoulFirePluginCompatibilityError(
                self.descriptor.plugin_id,
                f"Plugin {self.descriptor.plugin_id} does not expose {service_name}",
            )
        try:
            service = self._pool.FindServiceByName(service_name)
        except KeyError:
            raise SoulFirePluginDescriptorError(
                self.descriptor.plugin_id,
                f"Plugin descriptor does not contain service {service_name}",
            ) from None
        method = _find_method(service, method_name)
        if method is None:
            raise SoulFirePluginDescriptorError(
                self.descriptor.plugin_id,
                f"Service {service_name} does not contain method {method_name}",
            )
        if method.client_streaming or method.server_streaming != server_streaming:
            shape = "server-streaming" if server_streaming else "unary"
            raise SoulFirePluginDescriptorError(
                self.descriptor.plugin_id,
                f"{service_name}/{method_name} is not a {shape} RPC",
            )
        return method

    def _request(
        self,
        method: MethodDescriptor,
        value: dict[str, Any],
    ) -> Message:
        request_type = message_factory.GetMessageClass(method.input_type)
        return json_format.ParseDict(value, request_type(), descriptor_pool=self._pool)

    def _method_info(self, method: MethodDescriptor) -> MethodInfo[Any, Any]:
        return MethodInfo(
            name=method.name,
            service_name=method.containing_service.full_name,
            input=message_factory.GetMessageClass(method.input_type),
            output=message_factory.GetMessageClass(method.output_type),
            idempotency_level=IdempotencyLevel.UNKNOWN,
        )

    def _response(self, method: MethodDescriptor, value: Message) -> ReflectiveMessage:
        return ReflectiveMessage(
            type_name=method.output_type.full_name,
            value=value,
            json=json_format.MessageToDict(
                value,
                descriptor_pool=self._pool,
            ),
        )

    def _event_response(self, event: PluginEvent) -> ReflectivePluginEvent:
        if not event.HasField("payload"):
            return ReflectivePluginEvent(event)
        type_url = event.type_url or event.payload.type_url
        type_name = _type_name_from_url(type_url)
        try:
            descriptor = self._pool.FindMessageTypeByName(type_name)
        except KeyError:
            raise SoulFirePluginDescriptorError(
                self.descriptor.plugin_id,
                f"Plugin descriptor does not contain event type {type_name}",
            ) from None
        message_type = message_factory.GetMessageClass(descriptor)
        value = message_type.FromString(event.payload.value)
        return ReflectivePluginEvent(
            event,
            ReflectiveMessage(
                type_name=type_name,
                value=value,
                json=json_format.MessageToDict(
                    value,
                    descriptor_pool=self._pool,
                ),
            ),
        )

    def _task(
        self,
        input_type_url: str,
        value: dict[str, Any],
    ) -> tuple[Message, type[Message]]:
        task = next(
            (task for task in self.descriptor.task_types if task.input_type_url == input_type_url),
            None,
        )
        if task is None:
            raise SoulFirePluginCompatibilityError(
                self.descriptor.plugin_id,
                f"Plugin {self.descriptor.plugin_id} does not expose task {input_type_url}",
            )
        input_name = _type_name_from_url(task.input_type_url)
        result_name = _type_name_from_url(task.result_type_url)
        try:
            input_descriptor = self._pool.FindMessageTypeByName(input_name)
            result_descriptor = self._pool.FindMessageTypeByName(result_name)
        except KeyError as error:
            raise SoulFirePluginDescriptorError(
                self.descriptor.plugin_id,
                f"Plugin task descriptor is missing message {error}",
            ) from None
        input_type = message_factory.GetMessageClass(input_descriptor)
        result_type = message_factory.GetMessageClass(result_descriptor)
        return (
            json_format.ParseDict(value, input_type(), descriptor_pool=self._pool),
            result_type,
        )


class AsyncReflectivePlugin(_ReflectivePluginBase):
    __slots__ = ("_client", "_event_client")

    def __init__(
        self,
        descriptor: PluginApiDescriptor,
        descriptor_set: bytes,
        client: ConnectClient,
        event_client: PluginApiServiceClient | None = None,
    ) -> None:
        super().__init__(descriptor, descriptor_set)
        self._client = client
        self._event_client = event_client

    async def call(
        self,
        service_name: str,
        method_name: str,
        value: dict[str, Any],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> ReflectiveMessage:
        method = self._method(service_name, method_name, server_streaming=False)
        response = await self._client.execute_unary(
            request=self._request(method, value),
            method=self._method_info(method),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return self._response(method, cast(Message, response))

    async def start_task(
        self,
        tasks: AsyncSoulFireTasks,
        input_type_url: str,
        value: dict[str, Any],
        **options: Unpack[TaskStartOptions],
    ) -> AsyncSoulFireTask[Message]:
        task_input, result_type = self._task(input_type_url, value)
        return await tasks.start(task_input, result_type, **options)

    async def stream(
        self,
        service_name: str,
        method_name: str,
        value: dict[str, Any],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[ReflectiveMessage]:
        method = self._method(service_name, method_name, server_streaming=True)
        stream = self._client.execute_server_stream(
            request=self._request(method, value),
            method=self._method_info(method),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        async for response in stream:
            yield self._response(method, cast(Message, response))

    async def events(
        self,
        *,
        type_urls: tuple[str, ...] = (),
        instance_id: str | None = None,
        bot_id: str | None = None,
        task_id: str | None = None,
        after_sequence: int = 0,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[ReflectivePluginEvent]:
        if self._event_client is None:
            raise RuntimeError("Plugin event streams are unavailable on this client")
        request = _event_request(
            plugin_ids=(self.descriptor.plugin_id,),
            type_urls=type_urls,
            instance_id=instance_id,
            bot_id=bot_id,
            task_id=task_id,
            after_sequence=after_sequence,
        )
        async for event in self._event_client.watch_plugin_events(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        ):
            yield self._event_response(event)


class ReflectivePlugin(_ReflectivePluginBase):
    __slots__ = ("_client", "_event_client")

    def __init__(
        self,
        descriptor: PluginApiDescriptor,
        descriptor_set: bytes,
        client: ConnectClientSync,
        event_client: PluginApiServiceClientSync | None = None,
    ) -> None:
        super().__init__(descriptor, descriptor_set)
        self._client = client
        self._event_client = event_client

    def call(
        self,
        service_name: str,
        method_name: str,
        value: dict[str, Any],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> ReflectiveMessage:
        method = self._method(service_name, method_name, server_streaming=False)
        response = self._client.execute_unary(
            request=self._request(method, value),
            method=self._method_info(method),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return self._response(method, cast(Message, response))

    def start_task(
        self,
        tasks: SoulFireTasks,
        input_type_url: str,
        value: dict[str, Any],
        **options: Unpack[TaskStartOptions],
    ) -> SoulFireTask[Message]:
        task_input, result_type = self._task(input_type_url, value)
        return tasks.start(task_input, result_type, **options)

    def stream(
        self,
        service_name: str,
        method_name: str,
        value: dict[str, Any],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> Iterator[ReflectiveMessage]:
        method = self._method(service_name, method_name, server_streaming=True)
        for response in self._client.execute_server_stream(
            request=self._request(method, value),
            method=self._method_info(method),
            headers=headers,
            timeout_ms=timeout_ms,
        ):
            yield self._response(method, cast(Message, response))

    def events(
        self,
        *,
        type_urls: tuple[str, ...] = (),
        instance_id: str | None = None,
        bot_id: str | None = None,
        task_id: str | None = None,
        after_sequence: int = 0,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> Iterator[ReflectivePluginEvent]:
        if self._event_client is None:
            raise RuntimeError("Plugin event streams are unavailable on this client")
        request = _event_request(
            plugin_ids=(self.descriptor.plugin_id,),
            type_urls=type_urls,
            instance_id=instance_id,
            bot_id=bot_id,
            task_id=task_id,
            after_sequence=after_sequence,
        )
        for event in self._event_client.watch_plugin_events(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        ):
            yield self._event_response(event)


class ServiceFactory(Protocol):
    def __call__[T](self, client_type: Callable[..., T]) -> T: ...


class AsyncSoulFirePluginModule[T](Protocol):
    plugin_id: str

    def is_compatible(self, descriptor: PluginApiDescriptor) -> bool: ...

    def create(
        self,
        catalog: AsyncPluginCatalog,
        descriptor: PluginApiDescriptor,
    ) -> T: ...


class SoulFirePluginModule[T](Protocol):
    plugin_id: str

    def is_compatible(self, descriptor: PluginApiDescriptor) -> bool: ...

    def create(
        self,
        catalog: PluginCatalog,
        descriptor: PluginApiDescriptor,
    ) -> T: ...


class _PluginCatalogBase:
    __slots__ = ("_plugins", "_revision")

    def __init__(
        self,
        plugins: tuple[PluginApiDescriptor, ...] = (),
        revision: int = 0,
    ) -> None:
        self._plugins = {plugin.plugin_id: plugin for plugin in plugins}
        self._revision = revision

    @property
    def revision(self) -> int:
        return self._revision

    def all(self) -> tuple[PluginApiDescriptor, ...]:
        return tuple(self._plugins.values())

    def get(self, plugin_id: str) -> PluginApiDescriptor | None:
        return self._plugins.get(plugin_id)

    def require_descriptor(self, plugin_id: str) -> PluginApiDescriptor:
        try:
            return self._plugins[plugin_id]
        except KeyError:
            raise SoulFirePluginNotFoundError(plugin_id) from None

    def _require_descriptor(
        self,
        module: AsyncSoulFirePluginModule[object] | SoulFirePluginModule[object],
    ) -> PluginApiDescriptor:
        descriptor = self.require_descriptor(module.plugin_id)
        if not module.is_compatible(descriptor):
            raise SoulFirePluginCompatibilityError(
                module.plugin_id,
                (
                    f"Installed plugin {module.plugin_id} {descriptor.plugin_version} "
                    "is incompatible with its SDK module"
                ),
            )
        return descriptor

    def _replace(self, plugins: tuple[PluginApiDescriptor, ...], revision: int) -> None:
        self._plugins = {plugin.plugin_id: plugin for plugin in plugins}
        self._revision = revision

    def _apply(self, event: PluginApiEvent) -> None:
        if event.kind == PLUGIN_API_EVENT_KIND_SNAPSHOT:
            self._replace(tuple(event.plugins), event.revision)
        elif event.HasField("plugin"):
            self._plugins[event.plugin.plugin_id] = event.plugin
            self._revision = event.revision
        elif event.HasField("removed_plugin_id"):
            self._plugins.pop(event.removed_plugin_id, None)
            self._revision = event.revision

    def _require_event_type[T: Message](
        self,
        plugin_id: str,
        message_type: type[T],
    ) -> str:
        descriptor = self.require_descriptor(plugin_id)
        type_url = f"type.googleapis.com/{message_type.DESCRIPTOR.full_name}"
        event_type_urls = {
            *descriptor.event_type_urls,
            *(event_type.type_url for event_type in descriptor.event_types),
        }
        if type_url not in event_type_urls:
            raise SoulFirePluginCompatibilityError(
                plugin_id,
                f"Plugin {plugin_id} does not publish {type_url}",
            )
        return type_url


class AsyncPluginCatalog(_PluginCatalogBase):
    __slots__ = ("_client", "_reflective_client", "_reflective_plugins", "_service_factory")

    def __init__(
        self,
        client: PluginApiServiceClient,
        service_factory: ServiceFactory,
        plugins: tuple[PluginApiDescriptor, ...] = (),
        reflective_client: ConnectClient | None = None,
    ) -> None:
        super().__init__(plugins)
        self._client = client
        self._service_factory = service_factory
        self._reflective_client = reflective_client
        self._reflective_plugins: dict[str, tuple[str, AsyncReflectivePlugin]] = {}

    def require[T](self, module: AsyncSoulFirePluginModule[T]) -> T:
        return module.create(self, self._require_descriptor(module))

    def service[T](self, client_type: Callable[..., T]) -> T:
        return self._service_factory(client_type)

    async def refresh(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> tuple[PluginApiDescriptor, ...]:
        response = await self._client.list_plugin_apis(
            ListPluginApisRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        self._replace(tuple(response.plugins), response.revision)
        return self.all()

    async def descriptor_set(
        self,
        plugin_id: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> bytes:
        descriptor = self.require_descriptor(plugin_id)
        response = await self._client.get_plugin_descriptor_set(
            GetPluginDescriptorSetRequest(
                plugin_id=plugin_id,
                expected_sha256=descriptor.descriptor_sha256,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        _verify_descriptor(plugin_id, response.descriptor_set, response.descriptor_sha256)
        return response.descriptor_set

    async def reflective(
        self,
        plugin_id: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncReflectivePlugin:
        descriptor = self.require_descriptor(plugin_id)
        cached = self._reflective_plugins.get(plugin_id)
        if cached is not None and cached[0] == descriptor.descriptor_sha256:
            return cached[1]
        if self._reflective_client is None:
            raise RuntimeError("Reflective plugin calls are unavailable on this client")
        descriptor_set = await self.descriptor_set(
            plugin_id,
            headers=headers,
            timeout_ms=timeout_ms,
        )
        plugin = AsyncReflectivePlugin(
            descriptor,
            descriptor_set,
            self._reflective_client,
            self._client,
        )
        self._reflective_plugins[plugin_id] = (descriptor.descriptor_sha256, plugin)
        return plugin

    async def watch(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[PluginApiEvent]:
        async for event in self._client.watch_plugin_apis(
            WatchPluginApisRequest(after_revision=self.revision),
            headers=headers,
            timeout_ms=timeout_ms,
        ):
            self._apply(event)
            yield event

    async def events(
        self,
        *,
        plugin_ids: tuple[str, ...] = (),
        type_urls: tuple[str, ...] = (),
        instance_id: str | None = None,
        bot_id: str | None = None,
        task_id: str | None = None,
        after_sequence: int = 0,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[PluginEvent]:
        request = _event_request(
            plugin_ids=plugin_ids,
            type_urls=type_urls,
            instance_id=instance_id,
            bot_id=bot_id,
            task_id=task_id,
            after_sequence=after_sequence,
        )
        async for event in self._client.watch_plugin_events(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        ):
            yield event

    async def typed_events[T: Message](
        self,
        plugin_id: str,
        message_type: type[T],
        *,
        instance_id: str | None = None,
        bot_id: str | None = None,
        task_id: str | None = None,
        after_sequence: int = 0,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[TypedPluginEvent[T]]:
        type_url = self._require_event_type(plugin_id, message_type)
        async for event in self.events(
            plugin_ids=(plugin_id,),
            type_urls=(type_url,),
            instance_id=instance_id,
            bot_id=bot_id,
            task_id=task_id,
            after_sequence=after_sequence,
            headers=headers,
            timeout_ms=timeout_ms,
        ):
            yield _typed_event(plugin_id, type_url, message_type, event)


class PluginCatalog(_PluginCatalogBase):
    __slots__ = ("_client", "_reflective_client", "_reflective_plugins", "_service_factory")

    def __init__(
        self,
        client: PluginApiServiceClientSync,
        service_factory: ServiceFactory,
        plugins: tuple[PluginApiDescriptor, ...] = (),
        reflective_client: ConnectClientSync | None = None,
    ) -> None:
        super().__init__(plugins)
        self._client = client
        self._service_factory = service_factory
        self._reflective_client = reflective_client
        self._reflective_plugins: dict[str, tuple[str, ReflectivePlugin]] = {}

    def require[T](self, module: SoulFirePluginModule[T]) -> T:
        return module.create(self, self._require_descriptor(module))

    def service[T](self, client_type: Callable[..., T]) -> T:
        return self._service_factory(client_type)

    def refresh(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> tuple[PluginApiDescriptor, ...]:
        response = self._client.list_plugin_apis(
            ListPluginApisRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        self._replace(tuple(response.plugins), response.revision)
        return self.all()

    def descriptor_set(
        self,
        plugin_id: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> bytes:
        descriptor = self.require_descriptor(plugin_id)
        response = self._client.get_plugin_descriptor_set(
            GetPluginDescriptorSetRequest(
                plugin_id=plugin_id,
                expected_sha256=descriptor.descriptor_sha256,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        _verify_descriptor(plugin_id, response.descriptor_set, response.descriptor_sha256)
        return response.descriptor_set

    def reflective(
        self,
        plugin_id: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> ReflectivePlugin:
        descriptor = self.require_descriptor(plugin_id)
        cached = self._reflective_plugins.get(plugin_id)
        if cached is not None and cached[0] == descriptor.descriptor_sha256:
            return cached[1]
        if self._reflective_client is None:
            raise RuntimeError("Reflective plugin calls are unavailable on this client")
        descriptor_set = self.descriptor_set(
            plugin_id,
            headers=headers,
            timeout_ms=timeout_ms,
        )
        plugin = ReflectivePlugin(
            descriptor,
            descriptor_set,
            self._reflective_client,
            self._client,
        )
        self._reflective_plugins[plugin_id] = (descriptor.descriptor_sha256, plugin)
        return plugin

    def watch(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> Iterator[PluginApiEvent]:
        for event in self._client.watch_plugin_apis(
            WatchPluginApisRequest(after_revision=self.revision),
            headers=headers,
            timeout_ms=timeout_ms,
        ):
            self._apply(event)
            yield event

    def events(
        self,
        *,
        plugin_ids: tuple[str, ...] = (),
        type_urls: tuple[str, ...] = (),
        instance_id: str | None = None,
        bot_id: str | None = None,
        task_id: str | None = None,
        after_sequence: int = 0,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> Iterator[PluginEvent]:
        request = _event_request(
            plugin_ids=plugin_ids,
            type_urls=type_urls,
            instance_id=instance_id,
            bot_id=bot_id,
            task_id=task_id,
            after_sequence=after_sequence,
        )
        yield from self._client.watch_plugin_events(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def typed_events[T: Message](
        self,
        plugin_id: str,
        message_type: type[T],
        *,
        instance_id: str | None = None,
        bot_id: str | None = None,
        task_id: str | None = None,
        after_sequence: int = 0,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> Iterator[TypedPluginEvent[T]]:
        type_url = self._require_event_type(plugin_id, message_type)
        for event in self.events(
            plugin_ids=(plugin_id,),
            type_urls=(type_url,),
            instance_id=instance_id,
            bot_id=bot_id,
            task_id=task_id,
            after_sequence=after_sequence,
            headers=headers,
            timeout_ms=timeout_ms,
        ):
            yield _typed_event(plugin_id, type_url, message_type, event)


def _verify_descriptor(plugin_id: str, descriptor_set: bytes, expected_hash: str) -> None:
    actual_hash = hashlib.sha256(descriptor_set).hexdigest()
    if actual_hash != expected_hash.lower():
        raise SoulFirePluginDescriptorError(
            plugin_id,
            f"Descriptor hash mismatch for plugin {plugin_id}",
        )


def _event_request(
    *,
    plugin_ids: tuple[str, ...],
    type_urls: tuple[str, ...],
    instance_id: str | None,
    bot_id: str | None,
    task_id: str | None,
    after_sequence: int,
) -> WatchPluginEventsRequest:
    request = WatchPluginEventsRequest(
        plugin_ids=tuple(dict.fromkeys(plugin_ids)),
        type_urls=tuple(dict.fromkeys(type_urls)),
        after_sequence=after_sequence,
    )
    if instance_id is not None:
        request.instance_id = instance_id
    if bot_id is not None:
        request.bot_id = bot_id
    if task_id is not None:
        request.task_id = task_id
    return request


def _typed_event[T: Message](
    plugin_id: str,
    expected_type_url: str,
    message_type: type[T],
    event: PluginEvent,
) -> TypedPluginEvent[T]:
    if not event.HasField("payload"):
        return TypedPluginEvent(event)
    if event.type_url != expected_type_url or event.payload.type_url != expected_type_url:
        actual_type_url = event.type_url or event.payload.type_url
        raise SoulFirePluginDescriptorError(
            plugin_id,
            f"Expected {expected_type_url}, received {actual_type_url}",
        )
    value = message_type()
    value.ParseFromString(event.payload.value)
    return TypedPluginEvent(event, value)


def _type_name_from_url(type_url: str) -> str:
    type_name = type_url.rsplit("/", 1)[-1]
    if not type_name:
        raise ValueError(f"Invalid protobuf type URL: {type_url}")
    return type_name


def _find_method(
    service: ServiceDescriptor,
    name: str,
) -> MethodDescriptor | None:
    direct = service.methods_by_name.get(name)
    if direct is not None:
        return direct
    normalized = name.replace("_", "").casefold()
    return next(
        (
            method
            for method in service.methods
            if method.name.replace("_", "").casefold() == normalized
        ),
        None,
    )


def _descriptor_pool(plugin_id: str, value: bytes) -> descriptor_pool.DescriptorPool:
    descriptor_set = descriptor_pb2.FileDescriptorSet.FromString(value)
    files = {file.name: file for file in descriptor_set.file}
    pool = descriptor_pool.DescriptorPool()
    pending = set(files)
    while pending:
        progressed = False
        for name in tuple(pending):
            file = files[name]
            if all(
                dependency not in files or dependency not in pending
                for dependency in file.dependency
            ):
                try:
                    pool.Add(file)
                except Exception as error:
                    raise SoulFirePluginDescriptorError(
                        plugin_id,
                        f"Invalid descriptor file {name}: {error}",
                    ) from error
                pending.remove(name)
                progressed = True
        if not progressed:
            unresolved = ", ".join(sorted(pending))
            raise SoulFirePluginDescriptorError(
                plugin_id,
                f"Plugin descriptor dependencies contain a cycle: {unresolved}",
            )
    return pool
