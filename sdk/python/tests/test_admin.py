from typing import Any, cast

import pytest

from soulfire.admin import AsyncSoulFireAdmin, SoulFireAdmin
from soulfire.client_connect import ClientServiceClient, ClientServiceClientSync
from soulfire.client_pb2 import ClientDataResponse, GenerateAPITokenResponse
from soulfire.logs_connect import LogsServiceClient, LogsServiceClientSync
from soulfire.logs_pb2 import LogResponse, LogScope, LogString, PersonalLogScope
from soulfire.metrics_connect import MetricsServiceClient, MetricsServiceClientSync
from soulfire.metrics_pb2 import GetInstanceMetricsResponse
from soulfire.plugin_api_pb2 import PLUGIN_PERMISSION_SCOPE_INSTANCE
from soulfire.script_connect import ScriptServiceClient, ScriptServiceClientSync
from soulfire.script_pb2 import (
    DryRunScriptRequest,
    ListScriptsResponse,
    ScriptEvent,
    ScriptInfo,
)
from soulfire.user_connect import UserServiceClient, UserServiceClientSync
from soulfire.user_pb2 import (
    ListUserPluginPermissionGrantsResponse,
    UserListResponse,
    UserPluginPermissionGrant,
)


class FakeAsyncClient:
    async def get_client_data(self, _request: Any, **_options: Any) -> ClientDataResponse:
        return ClientDataResponse(
            id="user-id",
            username="operator",
            email="operator@example.com",
        )

    async def generate_api_token(
        self,
        _request: Any,
        **_options: Any,
    ) -> GenerateAPITokenResponse:
        return GenerateAPITokenResponse(token="secret-token")


class FakeAsyncUsers:
    async def list_users(self, _request: Any, **_options: Any) -> UserListResponse:
        return UserListResponse(
            users=[
                UserListResponse.User(
                    id="other-user",
                    username="builder",
                    email="builder@example.com",
                )
            ]
        )

    async def list_user_plugin_permission_grants(
        self,
        request: Any,
        **_options: Any,
    ) -> ListUserPluginPermissionGrantsResponse:
        return ListUserPluginPermissionGrantsResponse(
            grants=[
                UserPluginPermissionGrant(
                    user_id=request.user_id,
                    permission_id="plugin.example.read",
                    scope=PLUGIN_PERMISSION_SCOPE_INSTANCE,
                    resource_id="instance-id",
                    granted=True,
                    active=True,
                )
            ]
        )

    async def set_user_plugin_permission_grant(
        self,
        request: Any,
        **_options: Any,
    ) -> UserPluginPermissionGrant:
        return UserPluginPermissionGrant(
            user_id=request.user_id,
            permission_id=request.permission_id,
            scope=request.scope,
            resource_id=request.resource_id,
            granted=request.granted,
            active=True,
        )


class FakeAsyncLogs:
    def subscribe(self, _request: Any, **_options: Any):
        async def entries():
            yield LogResponse(message=LogString(message="ready"))

        return entries()


class FakeAsyncMetrics:
    async def get_instance_metrics(
        self,
        request: Any,
        **_options: Any,
    ) -> GetInstanceMetricsResponse:
        return GetInstanceMetricsResponse(
            distributions={
                "dimension_counts": {
                    "minecraft:overworld": 4 if request.instance_id == "instance-id" else 0
                }
            }
        )


class FakeAsyncScripts:
    async def list_scripts(self, request: Any, **_options: Any) -> ListScriptsResponse:
        return ListScriptsResponse(
            scripts=[
                ScriptInfo(
                    id="script-id",
                    instance_id=request.instance_id,
                    name="Patrol",
                )
            ]
        )

    def dry_run_script(self, request: Any, **_options: Any):
        async def events():
            yield ScriptEvent(script_started={"script_id": request.script_id})

        return events()


class FakeSyncClient:
    def get_client_data(self, _request: Any, **_options: Any) -> ClientDataResponse:
        return ClientDataResponse(username="operator")

    def generate_api_token(
        self,
        _request: Any,
        **_options: Any,
    ) -> GenerateAPITokenResponse:
        return GenerateAPITokenResponse(token="sync-token")


def _async_admin() -> AsyncSoulFireAdmin:
    unused = cast(Any, object())
    return AsyncSoulFireAdmin(
        client=cast(ClientServiceClient, FakeAsyncClient()),
        server=unused,
        users=cast(UserServiceClient, FakeAsyncUsers()),
        logs=cast(LogsServiceClient, FakeAsyncLogs()),
        metrics=cast(MetricsServiceClient, FakeAsyncMetrics()),
        commands=unused,
        downloads=unused,
        plugin_stats=unused,
        scripts=cast(ScriptServiceClient, FakeAsyncScripts()),
        instances=unused,
    )


@pytest.mark.asyncio
async def test_async_admin_wraps_services_and_streams() -> None:
    admin = _async_admin()

    client = await admin.client_data()
    token = await admin.generate_api_token()
    users = await admin.list_users()
    grants = await admin.user_plugin_permission_grants("other-user")
    denied = await admin.set_user_plugin_permission_grant(
        "other-user",
        "plugin.example.read",
        PLUGIN_PERMISSION_SCOPE_INSTANCE,
        resource_id="instance-id",
        granted=False,
    )
    metrics = await admin.instance_metrics("instance-id")
    logs = [
        entry
        async for entry in admin.logs(
            LogScope(personal=PersonalLogScope()),
        )
    ]
    scripts = await admin.list_scripts("instance-id")
    dry_run = [
        event async for event in admin.dry_run_script(DryRunScriptRequest(script_id="script-id"))
    ]

    assert client.username == "operator"
    assert token == "secret-token"
    assert users[0].id == "other-user"
    assert grants[0].resource_id == "instance-id"
    assert grants[0].granted
    assert not denied.granted
    assert denied.active
    assert metrics.distributions.dimension_counts["minecraft:overworld"] == 4
    assert logs[0].message.message == "ready"
    assert scripts[0].instance_id == "instance-id"
    assert dry_run[0].script_started.script_id == "script-id"


def test_sync_admin_exposes_self_service_operations() -> None:
    unused = cast(Any, object())
    admin = SoulFireAdmin(
        client=cast(ClientServiceClientSync, FakeSyncClient()),
        server=unused,
        users=cast(UserServiceClientSync, unused),
        logs=cast(LogsServiceClientSync, unused),
        metrics=cast(MetricsServiceClientSync, unused),
        commands=unused,
        downloads=unused,
        plugin_stats=unused,
        scripts=cast(ScriptServiceClientSync, unused),
        instances=unused,
    )

    assert admin.client_data().username == "operator"
    assert admin.generate_api_token() == "sync-token"
