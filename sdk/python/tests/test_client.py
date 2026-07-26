from typing import Any

import pytest
from connectrpc.protocol import ProtocolType

from soulfire import SoulFire


class FakeGeneratedClient:
    def __init__(self, address: str, **options: Any) -> None:
        self.address = address
        self.options = options
        self.closed = False

    async def close(self) -> None:
        self.closed = True


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
