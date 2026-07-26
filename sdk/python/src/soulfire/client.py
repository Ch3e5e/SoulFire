from __future__ import annotations

import asyncio
import os
import random
from collections.abc import AsyncIterator, Callable, Iterable, Iterator
from types import TracebackType
from typing import Any, TypeVar

from connectrpc.interceptor import Interceptor, InterceptorSync
from connectrpc.protocol import ProtocolType
from google.protobuf import json_format
from google.protobuf.struct_pb2 import Value

from ._auth import BearerAuthInterceptor, BearerAuthInterceptorSync, TokenProvider
from ._install import LocalServerHandle, LocalSoulFireServer
from .bot import SoulFireBot, SoulFireBotSync
from .bot_connect import BotServiceClient, BotServiceClientSync
from .bot_live_connect import BotLiveServiceClient, BotLiveServiceClientSync
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
from .common_pb2 import MinecraftAccountProto, ProxyProto
from .instance_connect import InstanceServiceClient, InstanceServiceClientSync
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
from .login_connect import LoginServiceClient, LoginServiceClientSync
from .login_pb2 import EmailCodeRequest, LoginRequest, NextAuthFlowResponse
from .mc_auth_connect import MCAuthServiceClient, MCAuthServiceClientSync
from .mc_auth_pb2 import (
    CredentialsAuthRequest,
    CredentialsAuthResponse,
    DeviceCodeAuthRequest,
    DeviceCodeAuthResponse,
    RefreshRequest,
    RefreshResponse,
)

ClientT = TypeVar("ClientT")


def normalize_base_url(base_url: str) -> str:
    normalized = base_url.strip().rstrip("/")
    if not normalized:
        raise ValueError("SoulFire base_url must not be empty")
    return normalized


class SoulFire:
    def __init__(
        self,
        base_url: str,
        *,
        token: TokenProvider | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[Interceptor] = (),
    ) -> None:
        self._token = token
        self._address = normalize_base_url(base_url)
        self._timeout_ms = timeout_ms
        self._interceptors = (
            BearerAuthInterceptor(lambda: self._token),
            *interceptors,
        )
        self._clients: list[Any] = []
        self._local_server_handle: LocalServerHandle | None = None
        self.bot_service = self.service(BotServiceClient)
        self.bot_live = self.service(BotLiveServiceClient)
        self.instance_service = self.service(InstanceServiceClient)
        self.login_service = self.service(LoginServiceClient)
        self.mc_auth_service = self.service(MCAuthServiceClient)

    @classmethod
    def connect(
        cls,
        base_url: str,
        *,
        token: TokenProvider | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[Interceptor] = (),
    ) -> SoulFire:
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
        interceptors: Iterable[Interceptor] = (),
    ) -> SoulFire:
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
            client = cls.connect(
                local_server.info.base_url,
                token=local_server.token,
                timeout_ms=timeout_ms,
                interceptors=interceptors,
            )
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

    def service(self, client_type: Callable[..., ClientT]) -> ClientT:
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
    ) -> SoulFireInstance:
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

    async def __aenter__(self) -> SoulFire:
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


class SoulFireInstance:
    def __init__(
        self,
        instance_id: str,
        bot_service: BotServiceClient,
        bot_live: BotLiveServiceClient,
        instance_service: InstanceServiceClient,
        mc_auth_service: MCAuthServiceClient | None = None,
    ) -> None:
        self.id = instance_id
        self._bot_service = bot_service
        self._bot_live = bot_live
        self._instance_service = instance_service
        self._mc_auth_service = mc_auth_service

    def bot(self, bot_id: str) -> SoulFireBot:
        return SoulFireBot(self.id, bot_id, self._bot_service, self._bot_live)

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
        service: int,
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
        service: int,
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


class SoulFireSync:
    def __init__(
        self,
        base_url: str,
        *,
        token: TokenProvider | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[InterceptorSync] = (),
    ) -> None:
        self._token = token
        self._address = normalize_base_url(base_url)
        self._timeout_ms = timeout_ms
        self._interceptors = (
            BearerAuthInterceptorSync(lambda: self._token),
            *interceptors,
        )
        self._clients: list[Any] = []
        self._local_server_handle: LocalServerHandle | None = None
        self.bot_service = self.service(BotServiceClientSync)
        self.bot_live = self.service(BotLiveServiceClientSync)
        self.instance_service = self.service(InstanceServiceClientSync)
        self.login_service = self.service(LoginServiceClientSync)
        self.mc_auth_service = self.service(MCAuthServiceClientSync)

    @classmethod
    def connect(
        cls,
        base_url: str,
        *,
        token: TokenProvider | None = None,
        timeout_ms: int | None = None,
        interceptors: Iterable[InterceptorSync] = (),
    ) -> SoulFireSync:
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
        interceptors: Iterable[InterceptorSync] = (),
    ) -> SoulFireSync:
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

    def service(self, client_type: Callable[..., ClientT]) -> ClientT:
        client = client_type(
            self._address,
            protocol=ProtocolType.GRPC_WEB,
            timeout_ms=self._timeout_ms,
            interceptors=self._interceptors,
        )
        self._clients.append(client)
        return client

    def instance(self, instance_id: str) -> SoulFireInstanceSync:
        return SoulFireInstanceSync(
            instance_id,
            self.bot_service,
            self.bot_live,
            self.instance_service,
            self.mc_auth_service,
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
    ) -> SoulFireInstanceSync:
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

    def __enter__(self) -> SoulFireSync:
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


class SoulFireInstanceSync:
    def __init__(
        self,
        instance_id: str,
        bot_service: BotServiceClientSync,
        bot_live: BotLiveServiceClientSync,
        instance_service: InstanceServiceClientSync,
        mc_auth_service: MCAuthServiceClientSync | None = None,
    ) -> None:
        self.id = instance_id
        self._bot_service = bot_service
        self._bot_live = bot_live
        self._instance_service = instance_service
        self._mc_auth_service = mc_auth_service

    def bot(self, bot_id: str) -> SoulFireBotSync:
        return SoulFireBotSync(self.id, bot_id, self._bot_service, self._bot_live)

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
        service: int,
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
        service: int,
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
