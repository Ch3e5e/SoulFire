from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

from .plugin.example.v1.example_connect import (
    ExamplePluginServiceClient,
    ExamplePluginServiceClientSync,
)
from .plugin.example.v1.example_pb2 import (
    EchoRequest,
    EchoResponse,
    Tick,
    WatchTicksRequest,
)
from .plugin_api_pb2 import PluginApiDescriptor
from .plugins import AsyncPluginCatalog, PluginCatalog

_PLUGIN_ID = "example"
_SERVICE_NAME = "soulfire.plugin.example.v1.ExamplePluginService"


class AsyncExamplePluginClient:
    __slots__ = ("_client",)

    def __init__(self, client: ExamplePluginServiceClient) -> None:
        self._client = client

    async def echo(
        self,
        instance_id: str,
        message: str,
        *,
        timeout_ms: int | None = None,
    ) -> EchoResponse:
        return await self._client.echo(
            EchoRequest(instance_id=instance_id, message=message),
            timeout_ms=timeout_ms,
        )

    def watch_ticks(
        self,
        instance_id: str,
        count: int,
        *,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[Tick]:
        return self._client.watch_ticks(
            WatchTicksRequest(instance_id=instance_id, count=count),
            timeout_ms=timeout_ms,
        )


class ExamplePluginClient:
    __slots__ = ("_client",)

    def __init__(self, client: ExamplePluginServiceClientSync) -> None:
        self._client = client

    def echo(
        self,
        instance_id: str,
        message: str,
        *,
        timeout_ms: int | None = None,
    ) -> EchoResponse:
        return self._client.echo(
            EchoRequest(instance_id=instance_id, message=message),
            timeout_ms=timeout_ms,
        )

    def watch_ticks(
        self,
        instance_id: str,
        count: int,
        *,
        timeout_ms: int | None = None,
    ) -> Iterator[Tick]:
        return self._client.watch_ticks(
            WatchTicksRequest(instance_id=instance_id, count=count),
            timeout_ms=timeout_ms,
        )


class _AsyncExamplePluginModule:
    plugin_id = _PLUGIN_ID

    @staticmethod
    def is_compatible(descriptor: PluginApiDescriptor) -> bool:
        return _is_compatible(descriptor)

    @staticmethod
    def create(
        catalog: AsyncPluginCatalog,
        _: PluginApiDescriptor,
    ) -> AsyncExamplePluginClient:
        return AsyncExamplePluginClient(catalog.service(ExamplePluginServiceClient))


class _ExamplePluginModule:
    plugin_id = _PLUGIN_ID

    @staticmethod
    def is_compatible(descriptor: PluginApiDescriptor) -> bool:
        return _is_compatible(descriptor)

    @staticmethod
    def create(
        catalog: PluginCatalog,
        _: PluginApiDescriptor,
    ) -> ExamplePluginClient:
        return ExamplePluginClient(catalog.service(ExamplePluginServiceClientSync))


async_example_plugin = _AsyncExamplePluginModule()
example_plugin = _ExamplePluginModule()


def _is_compatible(descriptor: PluginApiDescriptor) -> bool:
    return descriptor.api_major_version == 1 and any(
        service.full_name == _SERVICE_NAME for service in descriptor.services
    )
