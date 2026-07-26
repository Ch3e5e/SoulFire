from __future__ import annotations

from collections.abc import Callable
from typing import TypeAlias

from connectrpc.request import RequestContext

TokenProvider: TypeAlias = str | Callable[[], str | None]


def resolve_token(token: TokenProvider | None) -> str | None:
    if callable(token):
        return token()
    return token


class BearerAuthInterceptor:
    def __init__(self, token_provider: Callable[[], TokenProvider | None]) -> None:
        self._token_provider = token_provider

    async def on_start(self, ctx: RequestContext) -> None:
        token = resolve_token(self._token_provider())
        if token:
            ctx.request_headers["Authorization"] = f"Bearer {token}"

    async def on_end(
        self,
        _token: None,
        _ctx: RequestContext,
        _error: Exception | None,
    ) -> None:
        return None


class BearerAuthInterceptorSync:
    def __init__(self, token_provider: Callable[[], TokenProvider | None]) -> None:
        self._token_provider = token_provider

    def on_start_sync(self, ctx: RequestContext) -> None:
        token = resolve_token(self._token_provider())
        if token:
            ctx.request_headers["Authorization"] = f"Bearer {token}"

    def on_end_sync(
        self,
        _token: None,
        _ctx: RequestContext,
        _error: Exception | None,
    ) -> None:
        return None
