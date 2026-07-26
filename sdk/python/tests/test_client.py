from typing import Any, cast

import pytest
from connectrpc.protocol import ProtocolType
from google.protobuf.struct_pb2 import Value

from soulfire import SoulFire
from soulfire.bot_connect import BotServiceClient
from soulfire.bot_live_connect import BotLiveServiceClient
from soulfire.bot_pb2 import (
    BOT_DESIRED_STATE_RUNNING,
    BOT_DESIRED_STATE_STOPPED,
    BOT_RUNTIME_STATE_RUNNING,
    BOT_RUNTIME_STATE_STOPPED,
    BotListEntry,
    BotListResponse,
    BotStatus,
    RestartBotsRequest,
    RestartBotsResponse,
    SetBotsDesiredStateRequest,
    SetBotsDesiredStateResponse,
)
from soulfire.client import SoulFireInstance
from soulfire.common_pb2 import SettingsNamespace
from soulfire.instance_connect import InstanceServiceClient
from soulfire.instance_pb2 import InstanceConfig, InstanceInfo, InstanceInfoResponse


class FakeGeneratedClient:
    def __init__(self, address: str, **options: Any) -> None:
        self.address = address
        self.options = options
        self.closed = False

    async def close(self) -> None:
        self.closed = True


class FakeBotService:
    desired_state_request: SetBotsDesiredStateRequest | None = None

    async def get_bot_list(self, *_args: object, **_kwargs: object) -> BotListResponse:
        return BotListResponse(
            bots=[
                BotListEntry(
                    profile_id=profile_id,
                    status=BotStatus(
                        profile_id=profile_id,
                        desired_state=BOT_DESIRED_STATE_STOPPED,
                        runtime_state=BOT_RUNTIME_STATE_STOPPED,
                    ),
                )
                for profile_id in ("first", "second", "third")
            ]
        )

    async def set_bots_desired_state(
        self,
        request: SetBotsDesiredStateRequest,
        **_kwargs: object,
    ) -> SetBotsDesiredStateResponse:
        self.desired_state_request = request
        return SetBotsDesiredStateResponse()


class FakeInstanceService:
    async def get_instance_info(self, *_args: object, **_kwargs: object) -> InstanceInfoResponse:
        return InstanceInfoResponse(
            info=InstanceInfo(
                config=InstanceConfig(
                    settings=[
                        SettingsNamespace(
                            namespace="account",
                            entries=[
                                SettingsNamespace.SettingsEntry(
                                    key="shuffle-accounts",
                                    value=Value(bool_value=True),
                                )
                            ],
                        )
                    ]
                )
            )
        )


class FakeMixedBotService(FakeBotService):
    restart_request: RestartBotsRequest | None = None

    async def get_bot_list(self, *_args: object, **_kwargs: object) -> BotListResponse:
        return BotListResponse(
            bots=[
                BotListEntry(
                    profile_id="desired",
                    status=BotStatus(
                        profile_id="desired",
                        desired_state=BOT_DESIRED_STATE_RUNNING,
                        runtime_state=BOT_RUNTIME_STATE_RUNNING,
                    ),
                ),
                BotListEntry(
                    profile_id="stopped",
                    status=BotStatus(
                        profile_id="stopped",
                        desired_state=BOT_DESIRED_STATE_STOPPED,
                        runtime_state=BOT_RUNTIME_STATE_STOPPED,
                    ),
                ),
            ]
        )

    async def restart_bots(
        self,
        request: RestartBotsRequest,
        **_kwargs: object,
    ) -> RestartBotsResponse:
        self.restart_request = request
        return RestartBotsResponse()


@pytest.mark.asyncio
async def test_connect_creates_the_public_instance_bot_hierarchy() -> None:
    soulfire = SoulFire.connect(
        "https://soulfire.example.com/",
        token="token",
    )

    bot = soulfire.instance("instance-id").bot("bot-id")

    assert bot.instance_id == "instance-id"
    assert bot.id == "bot-id"
    assert soulfire.local_server is None
    await soulfire.close()


@pytest.mark.asyncio
async def test_generated_services_always_use_grpc_web() -> None:
    soulfire = SoulFire.connect("https://soulfire.example.com")

    service = soulfire.service(FakeGeneratedClient)

    assert service.address == "https://soulfire.example.com"
    assert service.options["protocol"] is ProtocolType.GRPC_WEB
    await soulfire.close()
    assert service.closed


@pytest.mark.asyncio
async def test_count_selection_honors_shuffle_accounts(monkeypatch: pytest.MonkeyPatch) -> None:
    bot_service = FakeBotService()
    monkeypatch.setattr("soulfire.client.random.shuffle", lambda values: values.reverse())
    instance = SoulFireInstance(
        "instance-id",
        cast(BotServiceClient, bot_service),
        cast(BotLiveServiceClient, object()),
        cast(InstanceServiceClient, FakeInstanceService()),
    )

    await instance.start(count=1)

    assert bot_service.desired_state_request is not None
    assert list(bot_service.desired_state_request.bot_ids) == ["third"]
    assert bot_service.desired_state_request.desired_state == BOT_DESIRED_STATE_RUNNING


@pytest.mark.asyncio
async def test_restart_without_selection_only_restarts_desired_bots() -> None:
    bot_service = FakeMixedBotService()
    instance = SoulFireInstance(
        "instance-id",
        cast(BotServiceClient, bot_service),
        cast(BotLiveServiceClient, object()),
        cast(InstanceServiceClient, FakeInstanceService()),
    )

    await instance.restart()

    assert bot_service.restart_request is not None
    assert list(bot_service.restart_request.bot_ids) == ["desired"]
