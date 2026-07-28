from .bot_live_pb2 import (
    BOT_ACTION_STATUS_COMPLETED,
    BotActionResult,
)


class SoulFireActionError(RuntimeError):
    def __init__(self, result: BotActionResult) -> None:
        self.result = result
        super().__init__(result.error or f"Bot action {result.action_id} did not complete")


def require_action(result: BotActionResult) -> BotActionResult:
    if result.status != BOT_ACTION_STATUS_COMPLETED:
        raise SoulFireActionError(result)
    return result


def action_headers(
    headers: dict[str, str] | None,
    token: str | None,
) -> dict[str, str] | None:
    if token is None:
        return headers
    result = dict(headers or {})
    result["X-SoulFire-Control-Token"] = token
    return result
