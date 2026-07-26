from types import SimpleNamespace
from typing import cast

import pytest
from connectrpc.request import RequestContext

from soulfire._auth import BearerAuthInterceptor, BearerAuthInterceptorSync


@pytest.mark.asyncio
async def test_async_bearer_auth_uses_latest_token() -> None:
    token = "first"
    interceptor = BearerAuthInterceptor(lambda: token)
    context = cast(RequestContext, SimpleNamespace(request_headers={}))

    await interceptor.on_start(context)
    token = "second"
    await interceptor.on_start(context)

    assert context.request_headers["Authorization"] == "Bearer second"


def test_sync_bearer_auth_uses_latest_token() -> None:
    token = "first"
    interceptor = BearerAuthInterceptorSync(lambda: token)
    context = cast(RequestContext, SimpleNamespace(request_headers={}))

    interceptor.on_start_sync(context)
    token = "second"
    interceptor.on_start_sync(context)

    assert context.request_headers["Authorization"] == "Bearer second"
