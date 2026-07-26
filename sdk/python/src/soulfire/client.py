from __future__ import annotations

import asyncio
import os
from collections.abc import Callable, Iterable
from types import TracebackType
from typing import Any, TypeVar

from connectrpc.interceptor import Interceptor, InterceptorSync
from connectrpc.protocol import ProtocolType

from ._auth import BearerAuthInterceptor, BearerAuthInterceptorSync, TokenProvider
from ._install import LocalServerHandle, LocalSoulFireServer
from .bot import SoulFireBot, SoulFireBotSync
from .bot_live_connect import BotLiveServiceClient, BotLiveServiceClientSync
from .login_connect import LoginServiceClient, LoginServiceClientSync
from .login_pb2 import EmailCodeRequest, LoginRequest, NextAuthFlowResponse

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
        self.local_server: LocalSoulFireServer | None = None
        self.bot_live = self.service(BotLiveServiceClient)
        self.login_service = self.service(LoginServiceClient)

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
        client.local_server = local_server.info
        return client

    def set_token(self, token: TokenProvider | None) -> None:
        self._token = token

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
        return SoulFireInstance(instance_id, self.bot_live)

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


class SoulFireInstance:
    def __init__(
        self,
        instance_id: str,
        bot_live: BotLiveServiceClient,
    ) -> None:
        self.id = instance_id
        self._bot_live = bot_live

    def bot(self, bot_id: str) -> SoulFireBot:
        return SoulFireBot(self.id, bot_id, self._bot_live)


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
        self.local_server: LocalSoulFireServer | None = None
        self.bot_live = self.service(BotLiveServiceClientSync)
        self.login_service = self.service(LoginServiceClientSync)

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
        client.local_server = local_server.info
        return client

    def set_token(self, token: TokenProvider | None) -> None:
        self._token = token

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
        return SoulFireInstanceSync(instance_id, self.bot_live)

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


class SoulFireInstanceSync:
    def __init__(
        self,
        instance_id: str,
        bot_live: BotLiveServiceClientSync,
    ) -> None:
        self.id = instance_id
        self._bot_live = bot_live

    def bot(self, bot_id: str) -> SoulFireBotSync:
        return SoulFireBotSync(self.id, bot_id, self._bot_live)
