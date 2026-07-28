from __future__ import annotations

import asyncio
import os
import random
from collections.abc import AsyncIterator, Callable, Iterable, Iterator
from types import MappingProxyType, TracebackType
from typing import Any, cast

from connectrpc.client import ConnectClient, ConnectClientSync
from connectrpc.code import Code
from connectrpc.errors import ConnectError
from connectrpc.interceptor import (
    BidiStreamInterceptor,
    BidiStreamInterceptorSync,
    ClientStreamInterceptor,
    ClientStreamInterceptorSync,
    Interceptor,
    InterceptorSync,
    MetadataInterceptor,
    MetadataInterceptorSync,
    ServerStreamInterceptor,
    ServerStreamInterceptorSync,
    UnaryInterceptor,
    UnaryInterceptorSync,
)
from connectrpc.protocol import ProtocolType
from google.protobuf import json_format
from google.protobuf.struct_pb2 import Value

from ._auth import BearerAuthInterceptor, BearerAuthInterceptorSync, TokenProvider
from ._install import LocalServerHandle, LocalSoulFireServer
from .admin import AsyncSoulFireAdmin, SoulFireAdmin
from .bot import AsyncSoulFireBot, SoulFireBot
from .bot_connect import BotServiceClient, BotServiceClientSync
from .bot_live_connect import BotLiveServiceClient, BotLiveServiceClientSync
from .bot_live_pb2 import BotEventFilter
from .bot_pb2 import (
    BOT_DESIRED_STATE_RUNNING,
    BOT_DESIRED_STATE_STOPPED,
    BotListEntry,
    BotListRequest,
    BotStatus,
    RestartBotsRequest,
    SetBotsDesiredStateRequest,
    WatchBotStatusesRequest,
    WatchBotStatusesResponse,
)
from .chat_connect import ChatServiceClient, ChatServiceClientSync
from .client_connect import ClientServiceClient, ClientServiceClientSync
from .command_connect import CommandServiceClient, CommandServiceClientSync
from .common_pb2 import (
    AccountTypeCredentials,
    AccountTypeDeviceCode,
    MinecraftAccountProto,
    ProxyProto,
)
from .connection import (
    SDK_API_VERSION,
    SDK_VERSION,
    CapabilitySet,
    ConnectionMetadata,
    RequiredPlugin,
    ServerMetadata,
    SoulFireCompatibilityError,
)
from .download_connect import DownloadServiceClient, DownloadServiceClientSync
from .errors import RpcErrorInterceptor, RpcErrorInterceptorSync
from .fleet import AsyncSoulFireFleet, SoulFireFleet
from .instance_connect import InstanceServiceClient, InstanceServiceClientSync
from .instance_live_connect import (
    InstanceLiveServiceClient,
    InstanceLiveServiceClientSync,
)
from .instance_live_pb2 import (
    InstanceEvent,
    InstanceEventFilter,
    WatchInstanceEventsRequest,
)
from .instance_pb2 import (
    InstanceAddAccountsBatchRequest,
    InstanceAddProxiesBatchRequest,
    InstanceCreateRequest,
    InstanceDeleteRequest,
    InstanceInfo,
    InstanceInfoRequest,
    InstanceListRequest,
    InstanceListResponse,
    InstanceRemoveAccountsBatchRequest,
    InstanceRemoveProxiesBatchRequest,
    InstanceUpdateConfigEntryRequest,
    InstanceUpdateMetaRequest,
)
from .inventory_connect import InventoryServiceClient, InventoryServiceClientSync
from .login_connect import LoginServiceClient, LoginServiceClientSync
from .login_pb2 import EmailCodeRequest, LoginRequest, NextAuthFlowResponse
from .logs_connect import LogsServiceClient, LogsServiceClientSync
from .mc_auth_connect import MCAuthServiceClient, MCAuthServiceClientSync
from .mc_auth_pb2 import (
    CredentialsAuthRequest,
    CredentialsAuthResponse,
    DeviceCodeAuthRequest,
    DeviceCodeAuthResponse,
    RefreshRequest,
    RefreshResponse,
)
from .metrics_connect import MetricsServiceClient, MetricsServiceClientSync
from .pathfinding_connect import (
    PathfinderServiceClient,
    PathfinderServiceClientSync,
)
from .plugin_api_connect import PluginApiServiceClient, PluginApiServiceClientSync
from .plugin_stats_connect import (
    PluginStatsServiceClient,
    PluginStatsServiceClientSync,
)
from .plugins import AsyncPluginCatalog, PluginCatalog
from .protocol_connect import BotProtocolServiceClient, BotProtocolServiceClientSync
from .recipe_connect import RecipeServiceClient, RecipeServiceClientSync
from .registry_connect import RegistryServiceClient, RegistryServiceClientSync
from .script_connect import ScriptServiceClient, ScriptServiceClientSync
from .sdk_connect import SdkServiceClient, SdkServiceClientSync
from .sdk_pb2 import RequiredPlugin as RequiredPluginMessage
from .sdk_pb2 import SdkHandshakeRequest, SdkIdentity
from .server_connect import ServerServiceClient, ServerServiceClientSync
from .task_connect import BotTaskServiceClient, BotTaskServiceClientSync
from .user_connect import UserServiceClient, UserServiceClientSync
from .world_connect import WorldServiceClient, WorldServiceClientSync

type AsyncClientInterceptor = (
    UnaryInterceptor
    | ClientStreamInterceptor
    | ServerStreamInterceptor
    | BidiStreamInterceptor
    | MetadataInterceptor[Any]
)
type SyncClientInterceptor = (
    UnaryInterceptorSync
    | ClientStreamInterceptorSync
    | ServerStreamInterceptorSync
    | BidiStreamInterceptorSync
    | MetadataInterceptorSync[Any]
)


def normalize_base_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    if not normalized:
        raise ValueError("SoulFire base_url must not be empty")
    return normalized


class AsyncSoulFire:
    def __init__(
        self,
        base_url: str,
        *,
        token: TokenProvider | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[AsyncClientInterceptor] = (),
        required_capabilities: Iterable[str] = (),
        required_plugins: Iterable[RequiredPlugin] = (),
    ) -> None:
        self._token = token
        self._address = normalize_base_url(base_url)
        self._timeout_ms = timeout_ms
        self._interceptors = (
            BearerAuthInterceptor(lambda: self._token),
            RpcErrorInterceptor(),
            *interceptors,
        )
        self._clients: list[Any] = []
        self._local_server_handle: LocalServerHandle | None = None
        self._required_capabilities = tuple(required_capabilities)
        self._required_plugins = tuple(required_plugins)
        self._connection: ConnectionMetadata | None = None
        self._plugins: AsyncPluginCatalog | None = None
        self.bot_service = self.service(BotServiceClient)
        self.bot_live = self.service(BotLiveServiceClient)
        self.bot_tasks = self.service(BotTaskServiceClient)
        self.pathfinder_service = self.service(PathfinderServiceClient)
        self.chat_service = self.service(ChatServiceClient)
        self.inventory_service = self.service(InventoryServiceClient)
        self.recipe_service = self.service(RecipeServiceClient)
        self.registry_service = self.service(RegistryServiceClient)
        self.world_service = self.service(WorldServiceClient)
        self.protocol_service = self.service(BotProtocolServiceClient)
        self.client_service = self.service(ClientServiceClient)
        self.command_service = self.service(CommandServiceClient)
        self.download_service = self.service(DownloadServiceClient)
        self.logs_service = self.service(LogsServiceClient)
        self.metrics_service = self.service(MetricsServiceClient)
        self.plugin_stats_service = self.service(PluginStatsServiceClient)
        self.script_service = self.service(ScriptServiceClient)
        self.server_service = self.service(ServerServiceClient)
        self.user_service = self.service(UserServiceClient)
        self.instance_service = self.service(InstanceServiceClient)
        self.instance_live = self.service(InstanceLiveServiceClient)
        self.login_service = self.service(LoginServiceClient)
        self.mc_auth_service = self.service(MCAuthServiceClient)
        self._sdk_service = self.service(SdkServiceClient)
        self._plugin_api_service = self.service(PluginApiServiceClient)
        self._reflective_plugin_client = ConnectClient(
            self._address,
            protocol=ProtocolType.GRPC_WEB,
            timeout_ms=self._timeout_ms,
            interceptors=cast(Iterable[Interceptor], self._interceptors),
        )
        self._clients.append(self._reflective_plugin_client)

    @classmethod
    def connect(
        cls,
        base_url: str,
        *,
        token: TokenProvider | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[AsyncClientInterceptor] = (),
        required_capabilities: Iterable[str] = (),
        required_plugins: Iterable[RequiredPlugin] = (),
    ) -> AsyncSoulFireConnection:
        return AsyncSoulFireConnection(
            cls(
                base_url,
                token=token,
                timeout_ms=timeout_ms,
                interceptors=interceptors,
                required_capabilities=required_capabilities,
                required_plugins=required_plugins,
            )
        )

    @classmethod
    def unauthenticated(
        cls,
        base_url: str,
        *,
        token: TokenProvider | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[AsyncClientInterceptor] = (),
    ) -> AsyncSoulFire:
        return cls(
            base_url,
            token=token,
            timeout_ms=timeout_ms,
            interceptors=interceptors,
        )

    @classmethod
    async def install(
        cls,
        *,
        directory: str | os.PathLike[str] | None = None,
        version: str | None = None,
        java_args: Iterable[str] = (),
        port: int | None = None,
        startup_timeout: float = 120.0,
        on_log: Callable[[str], None] | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[AsyncClientInterceptor] = (),
    ) -> AsyncSoulFire:
        from ._install import install_local_server

        local_server = await asyncio.to_thread(
            install_local_server,
            directory=directory,
            version=version,
            java_args=tuple(java_args),
            port=port,
            startup_timeout=startup_timeout,
            on_log=on_log,
        )
        try:
            client = cls(
                local_server.info.base_url,
                token=local_server.token,
                timeout_ms=timeout_ms,
                interceptors=interceptors,
            )
            await client.negotiate()
        except BaseException:
            await asyncio.to_thread(local_server.close)
            raise
        client._local_server_handle = local_server
        return client

    def set_token(self, token: TokenProvider | None) -> None:
        self._token = token

    @property
    def local_server(self) -> LocalSoulFireServer | None:
        handle = self._local_server_handle
        return None if handle is None else handle.info

    @property
    def server(self) -> ServerMetadata:
        return self._require_connection().server

    @property
    def identity(self) -> SdkIdentity:
        return self._require_connection().identity

    @property
    def capabilities(self) -> CapabilitySet:
        return self._require_connection().capabilities

    @property
    def limits(self) -> MappingProxyType[str, int]:
        return self._require_connection().limits

    @property
    def plugins(self) -> AsyncPluginCatalog:
        if self._plugins is None:
            raise RuntimeError("SoulFire connection has not completed its SDK handshake")
        return self._plugins

    @property
    def admin(self) -> AsyncSoulFireAdmin:
        return AsyncSoulFireAdmin(
            client=self.client_service,
            server=self.server_service,
            users=self.user_service,
            logs=self.logs_service,
            metrics=self.metrics_service,
            commands=self.command_service,
            downloads=self.download_service,
            plugin_stats=self.plugin_stats_service,
            scripts=self.script_service,
            instances=self.instance_service,
        )

    @property
    def local_server_logs(self) -> tuple[str, ...]:
        handle = self._local_server_handle
        return () if handle is None else handle.logs

    @property
    def is_local_server_running(self) -> bool:
        handle = self._local_server_handle
        return handle is not None and handle.is_running

    async def restart_local_server(self) -> None:
        handle = self._require_local_server()
        await asyncio.to_thread(handle.restart)

    async def stop_local_server(self) -> None:
        handle = self._require_local_server()
        await asyncio.to_thread(handle.stop)

    def service[ClientT](self, client_type: Callable[..., ClientT]) -> ClientT:
        client = client_type(
            self._address,
            protocol=ProtocolType.GRPC_WEB,
            timeout_ms=self._timeout_ms,
            interceptors=self._interceptors,
        )
        self._clients.append(client)
        return client

    def instance(self, instance_id: str) -> AsyncSoulFireInstance:
        return AsyncSoulFireInstance(
            instance_id,
            self.bot_service,
            self.bot_live,
            self.instance_service,
            self.mc_auth_service,
            self.bot_tasks,
            self.pathfinder_service,
            self.chat_service,
            self.inventory_service,
            self.recipe_service,
            self.registry_service,
            self.world_service,
            self.protocol_service,
            None if self._connection is None else self._connection.capabilities,
            self.instance_live,
        )

    async def instances(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> list[InstanceListResponse.Instance]:
        response = await self.instance_service.list_instances(
            InstanceListRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.instances)

    async def create_instance(
        self,
        friendly_name: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncSoulFireInstance:
        response = await self.instance_service.create_instance(
            InstanceCreateRequest(friendlyName=friendly_name),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return self.instance(response.id)

    async def begin_login(
        self,
        email: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> NextAuthFlowResponse:
        return await self.login_service.login(
            LoginRequest(email=email),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def complete_login(
        self,
        auth_flow_token: str,
        code: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> NextAuthFlowResponse:
        response = await self.login_service.email_code(
            EmailCodeRequest(auth_flow_token=auth_flow_token, code=code),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        if response.WhichOneof("next") == "success":
            self.set_token(response.success.token)
            await self.negotiate()
        return response

    async def close(self) -> None:
        try:
            for client in reversed(self._clients):
                await client.close()
            self._clients.clear()
        finally:
            local_server = self._local_server_handle
            self._local_server_handle = None
            if local_server is not None:
                await asyncio.to_thread(local_server.close)

    async def __aenter__(self) -> AsyncSoulFire:
        return self

    async def __aexit__(
        self,
        _exc_type: type[BaseException] | None,
        _exc_value: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        await self.close()

    def _require_local_server(self) -> LocalServerHandle:
        if self._local_server_handle is None:
            raise RuntimeError("This client does not manage a local SoulFire server")
        return self._local_server_handle

    def _require_connection(self) -> ConnectionMetadata:
        if self._connection is None:
            raise RuntimeError("SoulFire connection has not completed its SDK handshake")
        return self._connection

    async def negotiate(self) -> None:
        try:
            response = await self._sdk_service.handshake(self._handshake_request())
        except ConnectError as error:
            if error.code == Code.FAILED_PRECONDITION:
                raise SoulFireCompatibilityError(str(error)) from error
            raise
        self._connection = ConnectionMetadata.from_response(response)
        self._plugins = AsyncPluginCatalog(
            self._plugin_api_service,
            self.service,
            self._connection.plugins,
            self._reflective_plugin_client,
        )

    def _handshake_request(self) -> SdkHandshakeRequest:
        return SdkHandshakeRequest(
            sdk_name="soulfire",
            sdk_version=SDK_VERSION,
            minimum_api_version=SDK_API_VERSION,
            maximum_api_version=SDK_API_VERSION,
            required_capabilities=self._required_capabilities,
            required_plugins=[
                RequiredPluginMessage(
                    plugin_id=plugin.plugin_id,
                    **(
                        {}
                        if plugin.version_range is None
                        else {"version_range": plugin.version_range}
                    ),
                )
                for plugin in self._required_plugins
            ],
        )


class AsyncSoulFireConnection:
    __slots__ = ("_client", "_task")

    def __init__(self, client: AsyncSoulFire) -> None:
        self._client = client
        self._task: asyncio.Task[AsyncSoulFire] | None = None

    def __await__(self):
        return self._ready().__await__()

    async def __aenter__(self) -> AsyncSoulFire:
        return await self._ready()

    async def __aexit__(
        self,
        _exc_type: type[BaseException] | None,
        _exc_value: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        await self._client.close()

    async def _ready(self) -> AsyncSoulFire:
        if self._task is None:
            self._task = asyncio.create_task(self._connect())
        return await self._task

    async def _connect(self) -> AsyncSoulFire:
        try:
            await self._client.negotiate()
        except BaseException:
            await self._client.close()
            raise
        return self._client


class AsyncSoulFireInstance:
    def __init__(
        self,
        instance_id: str,
        bot_service: BotServiceClient,
        bot_live: BotLiveServiceClient,
        instance_service: InstanceServiceClient,
        mc_auth_service: MCAuthServiceClient | None = None,
        bot_tasks: BotTaskServiceClient | None = None,
        pathfinder_service: PathfinderServiceClient | None = None,
        chat_service: ChatServiceClient | None = None,
        inventory_service: InventoryServiceClient | None = None,
        recipe_service: RecipeServiceClient | None = None,
        registry_service: RegistryServiceClient | None = None,
        world_service: WorldServiceClient | None = None,
        protocol_service: BotProtocolServiceClient | None = None,
        capabilities: CapabilitySet | None = None,
        instance_live: InstanceLiveServiceClient | None = None,
    ) -> None:
        self.id = instance_id
        self._bot_service = bot_service
        self._bot_live = bot_live
        self._instance_service = instance_service
        self._mc_auth_service = mc_auth_service
        self._bot_tasks = bot_tasks
        self._pathfinder_service = pathfinder_service
        self._chat_service = chat_service
        self._inventory_service = inventory_service
        self._recipe_service = recipe_service
        self._registry_service = registry_service
        self._world_service = world_service
        self._protocol_service = protocol_service
        self._capabilities = capabilities
        self._instance_live = instance_live

    @property
    def fleet(self) -> AsyncSoulFireFleet:
        return AsyncSoulFireFleet(self, self._capabilities)

    def bot(self, bot_id: str) -> AsyncSoulFireBot:
        return AsyncSoulFireBot(
            self.id,
            bot_id,
            self._bot_service,
            self._bot_live,
            self._bot_tasks,
            self._pathfinder_service,
            self._chat_service,
            self._inventory_service,
            self._recipe_service,
            self._registry_service,
            self._world_service,
            self._protocol_service,
        )

    async def info(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> InstanceInfo:
        response = await self._instance_service.get_instance_info(
            InstanceInfoRequest(id=self.id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        if response.WhichOneof("result") != "info":
            raise RuntimeError(f"SoulFire did not return instance {self.id}")
        return response.info

    async def delete(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._instance_service.delete_instance(
            InstanceDeleteRequest(id=self.id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def update_name(
        self,
        friendly_name: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._instance_service.update_instance_meta(
            InstanceUpdateMetaRequest(id=self.id, friendly_name=friendly_name),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def set_config_entry(
        self,
        namespace: str,
        key: str,
        value: Any,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._instance_service.update_instance_config_entry(
            InstanceUpdateConfigEntryRequest(
                id=self.id,
                namespace=namespace,
                key=key,
                value=_to_proto_value(value),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def add_accounts(
        self,
        accounts: Iterable[MinecraftAccountProto],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._instance_service.add_instance_accounts_batch(
            InstanceAddAccountsBatchRequest(id=self.id, accounts=accounts),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def remove_accounts(
        self,
        profile_ids: Iterable[str],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._instance_service.remove_instance_accounts_batch(
            InstanceRemoveAccountsBatchRequest(
                id=self.id,
                profile_ids=dict.fromkeys(profile_ids),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def add_proxies(
        self,
        proxies: Iterable[ProxyProto],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._instance_service.add_instance_proxies_batch(
            InstanceAddProxiesBatchRequest(id=self.id, proxies=proxies),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def remove_proxies(
        self,
        addresses: Iterable[str],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._instance_service.remove_instance_proxies_batch(
            InstanceRemoveProxiesBatchRequest(
                id=self.id,
                addresses=dict.fromkeys(addresses),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def login_credentials(
        self,
        service: AccountTypeCredentials,
        payload: Iterable[str],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[CredentialsAuthResponse]:
        return self._require_mc_auth().login_credentials(
            CredentialsAuthRequest(
                instance_id=self.id,
                service=service,
                payload=payload,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def login_device_code(
        self,
        service: AccountTypeDeviceCode,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[DeviceCodeAuthResponse]:
        return self._require_mc_auth().login_device_code(
            DeviceCodeAuthRequest(instance_id=self.id, service=service),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def refresh_account(
        self,
        account: MinecraftAccountProto,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> RefreshResponse:
        return await self._require_mc_auth().refresh(
            RefreshRequest(instance_id=self.id, account=account),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def _require_mc_auth(self) -> MCAuthServiceClient:
        if self._mc_auth_service is None:
            raise RuntimeError("Minecraft authentication is unavailable")
        return self._mc_auth_service

    async def bots(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> list[BotListEntry]:
        response = await self._bot_service.get_bot_list(
            BotListRequest(instance_id=self.id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.bots)

    def watch_bot_statuses(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[WatchBotStatusesResponse]:
        return self._bot_service.watch_bot_statuses(
            WatchBotStatusesRequest(instance_id=self.id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def events(
        self,
        filter: InstanceEventFilter | None = None,
        *,
        bot_ids: Iterable[str] = (),
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[InstanceEvent]:
        """Watch one multiplexed event stream for bots in this instance."""
        if self._instance_live is None:
            raise RuntimeError("The instance live service is unavailable")
        event_filter = filter or _default_instance_event_filter()
        if filter is None:
            event_filter.bot_ids.extend(dict.fromkeys(bot_ids))
        elif tuple(bot_ids):
            raise ValueError("Pass bot_ids in filter or as bot_ids, not both")
        return self._instance_live.watch_instance_events(
            WatchInstanceEventsRequest(
                instance_id=self.id,
                filter=event_filter,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def start(
        self,
        *,
        bot_ids: Iterable[str] | None = None,
        count: int | None = None,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> list[BotStatus]:
        selected = await self._select_bot_ids(
            bot_ids,
            count,
            lambda bot: bot.status.desired_state != BOT_DESIRED_STATE_RUNNING,
            headers,
            timeout_ms,
        )
        if not selected:
            return []
        response = await self._bot_service.set_bots_desired_state(
            SetBotsDesiredStateRequest(
                instance_id=self.id,
                bot_ids=selected,
                desired_state=BOT_DESIRED_STATE_RUNNING,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.bots)

    async def stop(
        self,
        *,
        bot_ids: Iterable[str] | None = None,
        count: int | None = None,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> list[BotStatus]:
        selected = await self._select_bot_ids(
            bot_ids,
            count,
            lambda bot: bot.status.desired_state == BOT_DESIRED_STATE_RUNNING,
            headers,
            timeout_ms,
        )
        if not selected:
            return []
        response = await self._bot_service.set_bots_desired_state(
            SetBotsDesiredStateRequest(
                instance_id=self.id,
                bot_ids=selected,
                desired_state=BOT_DESIRED_STATE_STOPPED,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.bots)

    async def restart(
        self,
        *,
        bot_ids: Iterable[str] | None = None,
        count: int | None = None,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> list[BotStatus]:
        selected = await self._select_bot_ids(
            bot_ids,
            count,
            lambda bot: bot.status.desired_state == BOT_DESIRED_STATE_RUNNING,
            headers,
            timeout_ms,
        )
        if not selected:
            return []
        response = await self._bot_service.restart_bots(
            RestartBotsRequest(instance_id=self.id, bot_ids=selected),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.bots)

    async def _select_bot_ids(
        self,
        bot_ids: Iterable[str] | None,
        count: int | None,
        count_filter: Callable[[BotListEntry], bool],
        headers: dict[str, str] | None,
        timeout_ms: int | None,
    ) -> list[str]:
        explicit = _explicit_bot_ids(bot_ids, count)
        if explicit is not None:
            return explicit

        bots = await self.bots(headers=headers, timeout_ms=timeout_ms)
        candidates = [bot for bot in bots if count_filter(bot)]
        if count is None:
            return [bot.profile_id for bot in candidates]
        normalized_count = _normalize_count(count)
        if normalized_count == 0:
            return []
        if await self._shuffle_accounts_enabled(headers, timeout_ms):
            random.shuffle(candidates)
        return [bot.profile_id for bot in candidates[:normalized_count]]

    async def _shuffle_accounts_enabled(
        self,
        headers: dict[str, str] | None,
        timeout_ms: int | None,
    ) -> bool:
        response = await self._instance_service.get_instance_info(
            InstanceInfoRequest(id=self.id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        if response.WhichOneof("result") != "info":
            return False
        return _has_shuffle_accounts(response.info.config.settings)


class SoulFire:
    def __init__(
        self,
        base_url: str,
        *,
        token: TokenProvider | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[SyncClientInterceptor] = (),
        required_capabilities: Iterable[str] = (),
        required_plugins: Iterable[RequiredPlugin] = (),
    ) -> None:
        self._token = token
        self._address = normalize_base_url(base_url)
        self._timeout_ms = timeout_ms
        self._interceptors = (
            BearerAuthInterceptorSync(lambda: self._token),
            RpcErrorInterceptorSync(),
            *interceptors,
        )
        self._clients: list[Any] = []
        self._local_server_handle: LocalServerHandle | None = None
        self._required_capabilities = tuple(required_capabilities)
        self._required_plugins = tuple(required_plugins)
        self._connection: ConnectionMetadata | None = None
        self._plugins: PluginCatalog | None = None
        self.bot_service = self.service(BotServiceClientSync)
        self.bot_live = self.service(BotLiveServiceClientSync)
        self.bot_tasks = self.service(BotTaskServiceClientSync)
        self.pathfinder_service = self.service(PathfinderServiceClientSync)
        self.chat_service = self.service(ChatServiceClientSync)
        self.inventory_service = self.service(InventoryServiceClientSync)
        self.recipe_service = self.service(RecipeServiceClientSync)
        self.registry_service = self.service(RegistryServiceClientSync)
        self.world_service = self.service(WorldServiceClientSync)
        self.protocol_service = self.service(BotProtocolServiceClientSync)
        self.client_service = self.service(ClientServiceClientSync)
        self.command_service = self.service(CommandServiceClientSync)
        self.download_service = self.service(DownloadServiceClientSync)
        self.logs_service = self.service(LogsServiceClientSync)
        self.metrics_service = self.service(MetricsServiceClientSync)
        self.plugin_stats_service = self.service(PluginStatsServiceClientSync)
        self.script_service = self.service(ScriptServiceClientSync)
        self.server_service = self.service(ServerServiceClientSync)
        self.user_service = self.service(UserServiceClientSync)
        self.instance_service = self.service(InstanceServiceClientSync)
        self.instance_live = self.service(InstanceLiveServiceClientSync)
        self.login_service = self.service(LoginServiceClientSync)
        self.mc_auth_service = self.service(MCAuthServiceClientSync)
        self._sdk_service = self.service(SdkServiceClientSync)
        self._plugin_api_service = self.service(PluginApiServiceClientSync)
        self._reflective_plugin_client = ConnectClientSync(
            self._address,
            protocol=ProtocolType.GRPC_WEB,
            timeout_ms=self._timeout_ms,
            interceptors=cast(Iterable[InterceptorSync], self._interceptors),
        )
        self._clients.append(self._reflective_plugin_client)

    @classmethod
    def connect(
        cls,
        base_url: str,
        *,
        token: TokenProvider | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[SyncClientInterceptor] = (),
        required_capabilities: Iterable[str] = (),
        required_plugins: Iterable[RequiredPlugin] = (),
    ) -> SoulFire:
        client = cls(
            base_url,
            token=token,
            timeout_ms=timeout_ms,
            interceptors=interceptors,
            required_capabilities=required_capabilities,
            required_plugins=required_plugins,
        )
        try:
            client.negotiate()
        except BaseException:
            client.close()
            raise
        return client

    @classmethod
    def unauthenticated(
        cls,
        base_url: str,
        *,
        token: TokenProvider | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[SyncClientInterceptor] = (),
    ) -> SoulFire:
        return cls(
            base_url,
            token=token,
            timeout_ms=timeout_ms,
            interceptors=interceptors,
        )

    @classmethod
    def install(
        cls,
        *,
        directory: str | os.PathLike[str] | None = None,
        version: str | None = None,
        java_args: Iterable[str] = (),
        port: int | None = None,
        startup_timeout: float = 120.0,
        on_log: Callable[[str], None] | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[SyncClientInterceptor] = (),
    ) -> SoulFire:
        from ._install import install_local_server

        local_server = install_local_server(
            directory=directory,
            version=version,
            java_args=java_args,
            port=port,
            startup_timeout=startup_timeout,
            on_log=on_log,
        )
        try:
            client = cls.connect(
                local_server.info.base_url,
                token=local_server.token,
                timeout_ms=timeout_ms,
                interceptors=interceptors,
            )
        except BaseException:
            local_server.close()
            raise
        client._local_server_handle = local_server
        return client

    def set_token(self, token: TokenProvider | None) -> None:
        self._token = token

    @property
    def local_server(self) -> LocalSoulFireServer | None:
        handle = self._local_server_handle
        return None if handle is None else handle.info

    @property
    def server(self) -> ServerMetadata:
        return self._require_connection().server

    @property
    def identity(self) -> SdkIdentity:
        return self._require_connection().identity

    @property
    def capabilities(self) -> CapabilitySet:
        return self._require_connection().capabilities

    @property
    def limits(self) -> MappingProxyType[str, int]:
        return self._require_connection().limits

    @property
    def plugins(self) -> PluginCatalog:
        if self._plugins is None:
            raise RuntimeError("SoulFire connection has not completed its SDK handshake")
        return self._plugins

    @property
    def admin(self) -> SoulFireAdmin:
        return SoulFireAdmin(
            client=self.client_service,
            server=self.server_service,
            users=self.user_service,
            logs=self.logs_service,
            metrics=self.metrics_service,
            commands=self.command_service,
            downloads=self.download_service,
            plugin_stats=self.plugin_stats_service,
            scripts=self.script_service,
            instances=self.instance_service,
        )

    @property
    def local_server_logs(self) -> tuple[str, ...]:
        handle = self._local_server_handle
        return () if handle is None else handle.logs

    @property
    def is_local_server_running(self) -> bool:
        handle = self._local_server_handle
        return handle is not None and handle.is_running

    def restart_local_server(self) -> None:
        self._require_local_server().restart()

    def stop_local_server(self) -> None:
        self._require_local_server().stop()

    def service[ClientT](self, client_type: Callable[..., ClientT]) -> ClientT:
        client = client_type(
            self._address,
            protocol=ProtocolType.GRPC_WEB,
            timeout_ms=self._timeout_ms,
            interceptors=self._interceptors,
        )
        self._clients.append(client)
        return client

    def instance(self, instance_id: str) -> SoulFireInstance:
        return SoulFireInstance(
            instance_id,
            self.bot_service,
            self.bot_live,
            self.instance_service,
            self.mc_auth_service,
            self.bot_tasks,
            self.pathfinder_service,
            self.chat_service,
            self.inventory_service,
            self.recipe_service,
            self.registry_service,
            self.world_service,
            self.protocol_service,
            None if self._connection is None else self._connection.capabilities,
            self.instance_live,
        )

    def instances(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> list[InstanceListResponse.Instance]:
        response = self.instance_service.list_instances(
            InstanceListRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.instances)

    def create_instance(
        self,
        friendly_name: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> SoulFireInstance:
        response = self.instance_service.create_instance(
            InstanceCreateRequest(friendlyName=friendly_name),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return self.instance(response.id)

    def begin_login(
        self,
        email: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> NextAuthFlowResponse:
        return self.login_service.login(
            LoginRequest(email=email),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def complete_login(
        self,
        auth_flow_token: str,
        code: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> NextAuthFlowResponse:
        response = self.login_service.email_code(
            EmailCodeRequest(auth_flow_token=auth_flow_token, code=code),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        if response.WhichOneof("next") == "success":
            self.set_token(response.success.token)
            self.negotiate()
        return response

    def close(self) -> None:
        try:
            for client in reversed(self._clients):
                client.close()
            self._clients.clear()
        finally:
            local_server = self._local_server_handle
            self._local_server_handle = None
            if local_server is not None:
                local_server.close()

    def __enter__(self) -> SoulFire:
        return self

    def __exit__(
        self,
        _exc_type: type[BaseException] | None,
        _exc_value: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        self.close()

    def _require_local_server(self) -> LocalServerHandle:
        if self._local_server_handle is None:
            raise RuntimeError("This client does not manage a local SoulFire server")
        return self._local_server_handle

    def _require_connection(self) -> ConnectionMetadata:
        if self._connection is None:
            raise RuntimeError("SoulFire connection has not completed its SDK handshake")
        return self._connection

    def negotiate(self) -> None:
        try:
            response = self._sdk_service.handshake(self._handshake_request())
        except ConnectError as error:
            if error.code == Code.FAILED_PRECONDITION:
                raise SoulFireCompatibilityError(str(error)) from error
            raise
        self._connection = ConnectionMetadata.from_response(response)
        self._plugins = PluginCatalog(
            self._plugin_api_service,
            self.service,
            self._connection.plugins,
            self._reflective_plugin_client,
        )

    def _handshake_request(self) -> SdkHandshakeRequest:
        return SdkHandshakeRequest(
            sdk_name="soulfire",
            sdk_version=SDK_VERSION,
            minimum_api_version=SDK_API_VERSION,
            maximum_api_version=SDK_API_VERSION,
            required_capabilities=self._required_capabilities,
            required_plugins=[
                RequiredPluginMessage(
                    plugin_id=plugin.plugin_id,
                    **(
                        {}
                        if plugin.version_range is None
                        else {"version_range": plugin.version_range}
                    ),
                )
                for plugin in self._required_plugins
            ],
        )


class SoulFireInstance:
    def __init__(
        self,
        instance_id: str,
        bot_service: BotServiceClientSync,
        bot_live: BotLiveServiceClientSync,
        instance_service: InstanceServiceClientSync,
        mc_auth_service: MCAuthServiceClientSync | None = None,
        bot_tasks: BotTaskServiceClientSync | None = None,
        pathfinder_service: PathfinderServiceClientSync | None = None,
        chat_service: ChatServiceClientSync | None = None,
        inventory_service: InventoryServiceClientSync | None = None,
        recipe_service: RecipeServiceClientSync | None = None,
        registry_service: RegistryServiceClientSync | None = None,
        world_service: WorldServiceClientSync | None = None,
        protocol_service: BotProtocolServiceClientSync | None = None,
        capabilities: CapabilitySet | None = None,
        instance_live: InstanceLiveServiceClientSync | None = None,
    ) -> None:
        self.id = instance_id
        self._bot_service = bot_service
        self._bot_live = bot_live
        self._instance_service = instance_service
        self._mc_auth_service = mc_auth_service
        self._bot_tasks = bot_tasks
        self._pathfinder_service = pathfinder_service
        self._chat_service = chat_service
        self._inventory_service = inventory_service
        self._recipe_service = recipe_service
        self._registry_service = registry_service
        self._world_service = world_service
        self._protocol_service = protocol_service
        self._capabilities = capabilities
        self._instance_live = instance_live

    @property
    def fleet(self) -> SoulFireFleet:
        return SoulFireFleet(self, self._capabilities)

    def bot(self, bot_id: str) -> SoulFireBot:
        return SoulFireBot(
            self.id,
            bot_id,
            self._bot_service,
            self._bot_live,
            self._bot_tasks,
            self._pathfinder_service,
            self._chat_service,
            self._inventory_service,
            self._recipe_service,
            self._registry_service,
            self._world_service,
            self._protocol_service,
        )

    def info(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> InstanceInfo:
        response = self._instance_service.get_instance_info(
            InstanceInfoRequest(id=self.id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        if response.WhichOneof("result") != "info":
            raise RuntimeError(f"SoulFire did not return instance {self.id}")
        return response.info

    def delete(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._instance_service.delete_instance(
            InstanceDeleteRequest(id=self.id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def update_name(
        self,
        friendly_name: str,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._instance_service.update_instance_meta(
            InstanceUpdateMetaRequest(id=self.id, friendly_name=friendly_name),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def set_config_entry(
        self,
        namespace: str,
        key: str,
        value: Any,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._instance_service.update_instance_config_entry(
            InstanceUpdateConfigEntryRequest(
                id=self.id,
                namespace=namespace,
                key=key,
                value=_to_proto_value(value),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def add_accounts(
        self,
        accounts: Iterable[MinecraftAccountProto],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._instance_service.add_instance_accounts_batch(
            InstanceAddAccountsBatchRequest(id=self.id, accounts=accounts),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def remove_accounts(
        self,
        profile_ids: Iterable[str],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._instance_service.remove_instance_accounts_batch(
            InstanceRemoveAccountsBatchRequest(
                id=self.id,
                profile_ids=dict.fromkeys(profile_ids),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def add_proxies(
        self,
        proxies: Iterable[ProxyProto],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._instance_service.add_instance_proxies_batch(
            InstanceAddProxiesBatchRequest(id=self.id, proxies=proxies),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def remove_proxies(
        self,
        addresses: Iterable[str],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._instance_service.remove_instance_proxies_batch(
            InstanceRemoveProxiesBatchRequest(
                id=self.id,
                addresses=dict.fromkeys(addresses),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def login_credentials(
        self,
        service: AccountTypeCredentials,
        payload: Iterable[str],
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> Iterator[CredentialsAuthResponse]:
        return self._require_mc_auth().login_credentials(
            CredentialsAuthRequest(
                instance_id=self.id,
                service=service,
                payload=payload,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def login_device_code(
        self,
        service: AccountTypeDeviceCode,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> Iterator[DeviceCodeAuthResponse]:
        return self._require_mc_auth().login_device_code(
            DeviceCodeAuthRequest(instance_id=self.id, service=service),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def refresh_account(
        self,
        account: MinecraftAccountProto,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> RefreshResponse:
        return self._require_mc_auth().refresh(
            RefreshRequest(instance_id=self.id, account=account),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def _require_mc_auth(self) -> MCAuthServiceClientSync:
        if self._mc_auth_service is None:
            raise RuntimeError("Minecraft authentication is unavailable")
        return self._mc_auth_service

    def bots(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> list[BotListEntry]:
        response = self._bot_service.get_bot_list(
            BotListRequest(instance_id=self.id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.bots)

    def watch_bot_statuses(
        self,
        *,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> Iterator[WatchBotStatusesResponse]:
        return self._bot_service.watch_bot_statuses(
            WatchBotStatusesRequest(instance_id=self.id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def events(
        self,
        filter: InstanceEventFilter | None = None,
        *,
        bot_ids: Iterable[str] = (),
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> Iterator[InstanceEvent]:
        """Watch one multiplexed event stream for bots in this instance."""
        if self._instance_live is None:
            raise RuntimeError("The instance live service is unavailable")
        event_filter = filter or _default_instance_event_filter()
        if filter is None:
            event_filter.bot_ids.extend(dict.fromkeys(bot_ids))
        elif tuple(bot_ids):
            raise ValueError("Pass bot_ids in filter or as bot_ids, not both")
        return self._instance_live.watch_instance_events(
            WatchInstanceEventsRequest(
                instance_id=self.id,
                filter=event_filter,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def start(
        self,
        *,
        bot_ids: Iterable[str] | None = None,
        count: int | None = None,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> list[BotStatus]:
        selected = self._select_bot_ids(
            bot_ids,
            count,
            lambda bot: bot.status.desired_state != BOT_DESIRED_STATE_RUNNING,
            headers,
            timeout_ms,
        )
        if not selected:
            return []
        response = self._bot_service.set_bots_desired_state(
            SetBotsDesiredStateRequest(
                instance_id=self.id,
                bot_ids=selected,
                desired_state=BOT_DESIRED_STATE_RUNNING,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.bots)

    def stop(
        self,
        *,
        bot_ids: Iterable[str] | None = None,
        count: int | None = None,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> list[BotStatus]:
        selected = self._select_bot_ids(
            bot_ids,
            count,
            lambda bot: bot.status.desired_state == BOT_DESIRED_STATE_RUNNING,
            headers,
            timeout_ms,
        )
        if not selected:
            return []
        response = self._bot_service.set_bots_desired_state(
            SetBotsDesiredStateRequest(
                instance_id=self.id,
                bot_ids=selected,
                desired_state=BOT_DESIRED_STATE_STOPPED,
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.bots)

    def restart(
        self,
        *,
        bot_ids: Iterable[str] | None = None,
        count: int | None = None,
        headers: dict[str, str] | None = None,
        timeout_ms: int | None = None,
    ) -> list[BotStatus]:
        selected = self._select_bot_ids(
            bot_ids,
            count,
            lambda bot: bot.status.desired_state == BOT_DESIRED_STATE_RUNNING,
            headers,
            timeout_ms,
        )
        if not selected:
            return []
        response = self._bot_service.restart_bots(
            RestartBotsRequest(instance_id=self.id, bot_ids=selected),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.bots)

    def _select_bot_ids(
        self,
        bot_ids: Iterable[str] | None,
        count: int | None,
        count_filter: Callable[[BotListEntry], bool],
        headers: dict[str, str] | None,
        timeout_ms: int | None,
    ) -> list[str]:
        explicit = _explicit_bot_ids(bot_ids, count)
        if explicit is not None:
            return explicit

        bots = self.bots(headers=headers, timeout_ms=timeout_ms)
        candidates = [bot for bot in bots if count_filter(bot)]
        if count is None:
            return [bot.profile_id for bot in candidates]
        normalized_count = _normalize_count(count)
        if normalized_count == 0:
            return []
        if self._shuffle_accounts_enabled(headers, timeout_ms):
            random.shuffle(candidates)
        return [bot.profile_id for bot in candidates[:normalized_count]]

    def _shuffle_accounts_enabled(
        self,
        headers: dict[str, str] | None,
        timeout_ms: int | None,
    ) -> bool:
        response = self._instance_service.get_instance_info(
            InstanceInfoRequest(id=self.id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        if response.WhichOneof("result") != "info":
            return False
        return _has_shuffle_accounts(response.info.config.settings)


def _explicit_bot_ids(bot_ids: Iterable[str] | None, count: int | None) -> list[str] | None:
    if bot_ids is not None and count is not None:
        raise ValueError("Use either bot_ids or count, not both")
    if bot_ids is None:
        return None
    return list(dict.fromkeys(bot_ids))


def _default_instance_event_filter() -> InstanceEventFilter:
    return InstanceEventFilter(
        bot_events=BotEventFilter(
            include_block_updates=True,
            include_boss_bars=True,
            include_chat=True,
            include_damage=True,
            include_entity_events=True,
            include_environment=True,
            include_inventory=True,
            include_lifecycle=True,
            include_player_list=True,
            include_resource_packs=True,
            include_scoreboard=True,
            include_state_deltas=True,
            include_titles=True,
        )
    )


def _normalize_count(count: int) -> int:
    if isinstance(count, bool):
        raise TypeError("Bot count must be an integer")
    return max(0, int(count))


def _has_shuffle_accounts(settings: Iterable[Any]) -> bool:
    for namespace in settings:
        if namespace.namespace != "account":
            continue
        for entry in namespace.entries:
            if entry.key == "shuffle-accounts" and entry.value.WhichOneof("kind") == "bool_value":
                return entry.value.bool_value
    return False


def _to_proto_value(value: Any) -> Value:
    if isinstance(value, Value):
        return value
    return json_format.ParseDict(value, Value())
