from __future__ import annotations

from dataclasses import dataclass

from connectrpc.code import Code
from connectrpc.errors import ConnectError
from connectrpc.request import RequestContext

_RETRYABLE_CODES = frozenset(
    {
        Code.ABORTED,
        Code.DEADLINE_EXCEEDED,
        Code.RESOURCE_EXHAUSTED,
        Code.UNAVAILABLE,
    }
)


@dataclass(frozen=True, slots=True)
class RpcFailureContext:
    operation: str
    code: Code
    request_id: str | None
    retryable: bool


class SoulFireRpcError(RuntimeError):
    def __init__(
        self,
        context: RpcFailureContext,
        cause: ConnectError,
    ) -> None:
        self.context = context
        self.operation = context.operation
        self.code = context.code
        self.request_id = context.request_id
        self.retryable = context.retryable
        self.cause = cause
        super().__init__(cause.message)


class RpcErrorInterceptor:
    async def on_start[RequestT, ResponseT](
        self,
        _ctx: RequestContext[RequestT, ResponseT],
    ) -> None:
        return None

    async def on_end[RequestT, ResponseT](
        self,
        _token: None,
        ctx: RequestContext[RequestT, ResponseT],
        error: Exception | None,
    ) -> None:
        if isinstance(error, ConnectError):
            raise _rpc_error(ctx, error) from error


class RpcErrorInterceptorSync:
    def on_start_sync[RequestT, ResponseT](
        self,
        _ctx: RequestContext[RequestT, ResponseT],
    ) -> None:
        return None

    def on_end_sync[RequestT, ResponseT](
        self,
        _token: None,
        ctx: RequestContext[RequestT, ResponseT],
        error: Exception | None,
    ) -> None:
        if isinstance(error, ConnectError):
            raise _rpc_error(ctx, error) from error


def _rpc_error[RequestT, ResponseT](
    ctx: RequestContext[RequestT, ResponseT],
    cause: ConnectError,
) -> SoulFireRpcError:
    request_id = (
        ctx.response_trailers.get("x-soulfire-request-id")
        or ctx.response_trailers.get("x-request-id")
        or ctx.response_headers.get("x-soulfire-request-id")
        or ctx.response_headers.get("x-request-id")
    )
    return SoulFireRpcError(
        RpcFailureContext(
            operation=f"{ctx.method.service_name}/{ctx.method.name}",
            code=cause.code,
            request_id=request_id,
            retryable=cause.code in _RETRYABLE_CODES,
        ),
        cause,
    )
