from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

from google.protobuf.timestamp_pb2 import Timestamp

from .client_connect import ClientServiceClient, ClientServiceClientSync
from .client_pb2 import (
    ClientDataRequest,
    ClientDataResponse,
    GenerateAPITokenRequest,
    GenerateWebDAVTokenRequest,
    InvalidateSelfSessionsRequest,
    UpdateSelfEmailRequest,
    UpdateSelfUsernameRequest,
)
from .command_connect import CommandServiceClient, CommandServiceClientSync
from .command_pb2 import (
    CommandCompletionRequest,
    CommandCompletionResponse,
    CommandRequest,
    CommandResponse,
)
from .download_connect import DownloadServiceClient, DownloadServiceClientSync
from .download_pb2 import DownloadRequest, DownloadResponse
from .instance_connect import InstanceServiceClient, InstanceServiceClientSync
from .instance_pb2 import InstanceAuditLogRequest, InstanceAuditLogResponse
from .logs_connect import LogsServiceClient, LogsServiceClientSync
from .logs_pb2 import LogRequest, LogResponse, LogScope, LogString, PreviousLogRequest
from .metrics_connect import MetricsServiceClient, MetricsServiceClientSync
from .metrics_pb2 import (
    GetInstanceMetricsRequest,
    GetInstanceMetricsResponse,
    GetServerMetricsRequest,
    GetServerMetricsResponse,
)
from .plugin_api_pb2 import PluginPermissionScope
from .plugin_stats_connect import (
    PluginStatsServiceClient,
    PluginStatsServiceClientSync,
)
from .plugin_stats_pb2 import GetInstancePluginStatsRequest, PluginRuntimeStat
from .script_connect import ScriptServiceClient, ScriptServiceClientSync
from .script_pb2 import (
    ActivateScriptRequest,
    CreateScriptRequest,
    CreateScriptResponse,
    DeactivateScriptRequest,
    DeleteScriptRequest,
    DryRunScriptRequest,
    GetNodeTypesRequest,
    GetNodeTypesResponse,
    GetRegistryDataRequest,
    GetRegistryDataResponse,
    GetScriptRequest,
    GetScriptResponse,
    GetScriptStatusRequest,
    GetScriptStatusResponse,
    ListScriptsRequest,
    ScriptEvent,
    ScriptInfo,
    ScriptLogEntry,
    SubscribeScriptLogsRequest,
    UpdateScriptRequest,
    UpdateScriptResponse,
    ValidateScriptRequest,
    ValidateScriptResponse,
)
from .server_connect import ServerServiceClient, ServerServiceClientSync
from .server_pb2 import (
    ServerConfig,
    ServerInfoRequest,
    ServerInfoResponse,
    ServerUpdateConfigEntryRequest,
    ServerUpdateConfigRequest,
)
from .user_connect import UserServiceClient, UserServiceClientSync
from .user_pb2 import (
    DeleteUserPluginPermissionGrantRequest,
    GenerateUserAPITokenRequest,
    InvalidateSessionsRequest,
    ListUserPluginPermissionGrantsRequest,
    SetUserPluginPermissionGrantRequest,
    UpdateUserRequest,
    UserCreateRequest,
    UserDeleteRequest,
    UserInfoRequest,
    UserInfoResponse,
    UserListRequest,
    UserListResponse,
    UserPluginPermissionGrant,
)

type Headers = dict[str, str] | None


class AsyncSoulFireAdmin:
    """Async high-level access to SoulFire's administrative control plane."""

    def __init__(
        self,
        *,
        client: ClientServiceClient,
        server: ServerServiceClient,
        users: UserServiceClient,
        logs: LogsServiceClient,
        metrics: MetricsServiceClient,
        commands: CommandServiceClient,
        downloads: DownloadServiceClient,
        plugin_stats: PluginStatsServiceClient,
        scripts: ScriptServiceClient,
        instances: InstanceServiceClient,
    ) -> None:
        self._client = client
        self._server = server
        self._users = users
        self._logs = logs
        self._metrics = metrics
        self._commands = commands
        self._downloads = downloads
        self._plugin_stats = plugin_stats
        self._scripts = scripts
        self._instances = instances

    async def client_data(
        self,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> ClientDataResponse:
        return await self._client.get_client_data(
            ClientDataRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def generate_webdav_token(
        self,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> str:
        response = await self._client.generate_web_dav_token(
            GenerateWebDAVTokenRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.token

    async def generate_api_token(
        self,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> str:
        response = await self._client.generate_api_token(
            GenerateAPITokenRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.token

    async def update_username(
        self,
        username: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._client.update_self_username(
            UpdateSelfUsernameRequest(username=username),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def update_email(
        self,
        email: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._client.update_self_email(
            UpdateSelfEmailRequest(email=email),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def invalidate_own_sessions(
        self,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._client.invalidate_self_sessions(
            InvalidateSelfSessionsRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def server_info(
        self,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> ServerInfoResponse:
        return await self._server.get_server_info(
            ServerInfoRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def update_server_config(
        self,
        config: ServerConfig,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._server.update_server_config(
            ServerUpdateConfigRequest(config=config),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def set_server_config_entry(
        self,
        request: ServerUpdateConfigEntryRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._server.update_server_config_entry(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def list_users(
        self,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[UserListResponse.User]:
        response = await self._users.list_users(
            UserListRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.users)

    async def user(
        self,
        user_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> UserInfoResponse:
        return await self._users.get_user_info(
            UserInfoRequest(id=user_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def create_user(
        self,
        request: UserCreateRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> str:
        response = await self._users.create_user(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.id

    async def delete_user(
        self,
        user_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._users.delete_user(
            UserDeleteRequest(id=user_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def update_user(
        self,
        request: UpdateUserRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._users.update_user(request, headers=headers, timeout_ms=timeout_ms)

    async def invalidate_user_sessions(
        self,
        user_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._users.invalidate_sessions(
            InvalidateSessionsRequest(id=user_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def generate_user_api_token(
        self,
        user_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> str:
        response = await self._users.generate_user_api_token(
            GenerateUserAPITokenRequest(id=user_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return response.token

    async def user_plugin_permission_grants(
        self,
        user_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[UserPluginPermissionGrant]:
        response = await self._users.list_user_plugin_permission_grants(
            ListUserPluginPermissionGrantsRequest(user_id=user_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.grants)

    async def set_user_plugin_permission_grant(
        self,
        user_id: str,
        permission_id: str,
        scope: PluginPermissionScope,
        *,
        resource_id: str | None = None,
        granted: bool = True,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> UserPluginPermissionGrant:
        return await self._users.set_user_plugin_permission_grant(
            SetUserPluginPermissionGrantRequest(
                user_id=user_id,
                permission_id=permission_id,
                scope=scope,
                granted=granted,
                **({} if resource_id is None else {"resource_id": resource_id}),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def delete_user_plugin_permission_grant(
        self,
        user_id: str,
        permission_id: str,
        scope: PluginPermissionScope,
        *,
        resource_id: str | None = None,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._users.delete_user_plugin_permission_grant(
            DeleteUserPluginPermissionGrantRequest(
                user_id=user_id,
                permission_id=permission_id,
                scope=scope,
                **({} if resource_id is None else {"resource_id": resource_id}),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def previous_logs(
        self,
        scope: LogScope,
        count: int = 300,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[LogString]:
        response = await self._logs.get_previous(
            PreviousLogRequest(scope=scope, count=count),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.messages)

    def logs(
        self,
        scope: LogScope,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[LogResponse]:
        return self._logs.subscribe(
            LogRequest(scope=scope),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def server_metrics(
        self,
        since: Timestamp | None = None,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetServerMetricsResponse:
        request = GetServerMetricsRequest()
        if since is not None:
            request.since.CopyFrom(since)
        return await self._metrics.get_server_metrics(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def instance_metrics(
        self,
        instance_id: str,
        since: Timestamp | None = None,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetInstanceMetricsResponse:
        request = GetInstanceMetricsRequest(instance_id=instance_id)
        if since is not None:
            request.since.CopyFrom(since)
        return await self._metrics.get_instance_metrics(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def execute_command(
        self,
        request: CommandRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> CommandResponse:
        return await self._commands.execute_command(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def complete_command(
        self,
        request: CommandCompletionRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> CommandCompletionResponse:
        return await self._commands.tab_complete_command(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def download(
        self,
        request: DownloadRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> DownloadResponse:
        return await self._downloads.download(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def plugin_stats(
        self,
        instance_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[PluginRuntimeStat]:
        response = await self._plugin_stats.get_instance_plugin_stats(
            GetInstancePluginStatsRequest(instance_id=instance_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.stats)

    async def audit_log(
        self,
        instance_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[InstanceAuditLogResponse.AuditLogEntry]:
        response = await self._instances.get_audit_log(
            InstanceAuditLogRequest(id=instance_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.entry)

    async def list_scripts(
        self,
        instance_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[ScriptInfo]:
        response = await self._scripts.list_scripts(
            ListScriptsRequest(instance_id=instance_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.scripts)

    async def script(
        self,
        instance_id: str,
        script_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetScriptResponse:
        return await self._scripts.get_script(
            GetScriptRequest(instance_id=instance_id, script_id=script_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def create_script(
        self,
        request: CreateScriptRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> CreateScriptResponse:
        return await self._scripts.create_script(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def update_script(
        self,
        request: UpdateScriptRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> UpdateScriptResponse:
        return await self._scripts.update_script(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def delete_script(
        self,
        instance_id: str,
        script_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._scripts.delete_script(
            DeleteScriptRequest(instance_id=instance_id, script_id=script_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def activate_script(
        self,
        instance_id: str,
        script_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[ScriptEvent]:
        return self._scripts.activate_script(
            ActivateScriptRequest(instance_id=instance_id, script_id=script_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def deactivate_script(
        self,
        instance_id: str,
        script_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        await self._scripts.deactivate_script(
            DeactivateScriptRequest(instance_id=instance_id, script_id=script_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def script_status(
        self,
        instance_id: str,
        script_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetScriptStatusResponse:
        return await self._scripts.get_script_status(
            GetScriptStatusRequest(instance_id=instance_id, script_id=script_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def script_logs(
        self,
        request: SubscribeScriptLogsRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[ScriptLogEntry]:
        return self._scripts.subscribe_script_logs(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def node_types(
        self,
        request: GetNodeTypesRequest | None = None,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetNodeTypesResponse:
        return await self._scripts.get_node_types(
            request or GetNodeTypesRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def script_registry_data(
        self,
        request: GetRegistryDataRequest | None = None,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetRegistryDataResponse:
        return await self._scripts.get_registry_data(
            request or GetRegistryDataRequest(),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def validate_script(
        self,
        request: ValidateScriptRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> ValidateScriptResponse:
        return await self._scripts.validate_script(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def dry_run_script(
        self,
        request: DryRunScriptRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> AsyncIterator[ScriptEvent]:
        return self._scripts.dry_run_script(
            request,
            headers=headers,
            timeout_ms=timeout_ms,
        )


class SoulFireAdmin:
    """Synchronous high-level access to SoulFire's administrative control plane."""

    def __init__(
        self,
        *,
        client: ClientServiceClientSync,
        server: ServerServiceClientSync,
        users: UserServiceClientSync,
        logs: LogsServiceClientSync,
        metrics: MetricsServiceClientSync,
        commands: CommandServiceClientSync,
        downloads: DownloadServiceClientSync,
        plugin_stats: PluginStatsServiceClientSync,
        scripts: ScriptServiceClientSync,
        instances: InstanceServiceClientSync,
    ) -> None:
        self._client = client
        self._server = server
        self._users = users
        self._logs = logs
        self._metrics = metrics
        self._commands = commands
        self._downloads = downloads
        self._plugin_stats = plugin_stats
        self._scripts = scripts
        self._instances = instances

    def client_data(
        self, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> ClientDataResponse:
        return self._client.get_client_data(
            ClientDataRequest(), headers=headers, timeout_ms=timeout_ms
        )

    def generate_webdav_token(
        self, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> str:
        return self._client.generate_web_dav_token(
            GenerateWebDAVTokenRequest(), headers=headers, timeout_ms=timeout_ms
        ).token

    def generate_api_token(self, *, headers: Headers = None, timeout_ms: int | None = None) -> str:
        return self._client.generate_api_token(
            GenerateAPITokenRequest(), headers=headers, timeout_ms=timeout_ms
        ).token

    def update_username(
        self, username: str, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> None:
        self._client.update_self_username(
            UpdateSelfUsernameRequest(username=username), headers=headers, timeout_ms=timeout_ms
        )

    def update_email(
        self, email: str, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> None:
        self._client.update_self_email(
            UpdateSelfEmailRequest(email=email), headers=headers, timeout_ms=timeout_ms
        )

    def invalidate_own_sessions(
        self, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> None:
        self._client.invalidate_self_sessions(
            InvalidateSelfSessionsRequest(), headers=headers, timeout_ms=timeout_ms
        )

    def server_info(
        self, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> ServerInfoResponse:
        return self._server.get_server_info(
            ServerInfoRequest(), headers=headers, timeout_ms=timeout_ms
        )

    def update_server_config(
        self, config: ServerConfig, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> None:
        self._server.update_server_config(
            ServerUpdateConfigRequest(config=config), headers=headers, timeout_ms=timeout_ms
        )

    def set_server_config_entry(
        self,
        request: ServerUpdateConfigEntryRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._server.update_server_config_entry(request, headers=headers, timeout_ms=timeout_ms)

    def list_users(
        self, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> list[UserListResponse.User]:
        return list(
            self._users.list_users(UserListRequest(), headers=headers, timeout_ms=timeout_ms).users
        )

    def user(
        self, user_id: str, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> UserInfoResponse:
        return self._users.get_user_info(
            UserInfoRequest(id=user_id), headers=headers, timeout_ms=timeout_ms
        )

    def create_user(
        self, request: UserCreateRequest, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> str:
        return self._users.create_user(request, headers=headers, timeout_ms=timeout_ms).id

    def delete_user(
        self, user_id: str, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> None:
        self._users.delete_user(
            UserDeleteRequest(id=user_id), headers=headers, timeout_ms=timeout_ms
        )

    def update_user(
        self, request: UpdateUserRequest, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> None:
        self._users.update_user(request, headers=headers, timeout_ms=timeout_ms)

    def invalidate_user_sessions(
        self, user_id: str, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> None:
        self._users.invalidate_sessions(
            InvalidateSessionsRequest(id=user_id), headers=headers, timeout_ms=timeout_ms
        )

    def generate_user_api_token(
        self, user_id: str, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> str:
        return self._users.generate_user_api_token(
            GenerateUserAPITokenRequest(id=user_id), headers=headers, timeout_ms=timeout_ms
        ).token

    def user_plugin_permission_grants(
        self,
        user_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[UserPluginPermissionGrant]:
        response = self._users.list_user_plugin_permission_grants(
            ListUserPluginPermissionGrantsRequest(user_id=user_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )
        return list(response.grants)

    def set_user_plugin_permission_grant(
        self,
        user_id: str,
        permission_id: str,
        scope: PluginPermissionScope,
        *,
        resource_id: str | None = None,
        granted: bool = True,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> UserPluginPermissionGrant:
        return self._users.set_user_plugin_permission_grant(
            SetUserPluginPermissionGrantRequest(
                user_id=user_id,
                permission_id=permission_id,
                scope=scope,
                granted=granted,
                **({} if resource_id is None else {"resource_id": resource_id}),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def delete_user_plugin_permission_grant(
        self,
        user_id: str,
        permission_id: str,
        scope: PluginPermissionScope,
        *,
        resource_id: str | None = None,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._users.delete_user_plugin_permission_grant(
            DeleteUserPluginPermissionGrantRequest(
                user_id=user_id,
                permission_id=permission_id,
                scope=scope,
                **({} if resource_id is None else {"resource_id": resource_id}),
            ),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def previous_logs(
        self,
        scope: LogScope,
        count: int = 300,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> list[LogString]:
        return list(
            self._logs.get_previous(
                PreviousLogRequest(scope=scope, count=count), headers=headers, timeout_ms=timeout_ms
            ).messages
        )

    def logs(
        self, scope: LogScope, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> Iterator[LogResponse]:
        return self._logs.subscribe(LogRequest(scope=scope), headers=headers, timeout_ms=timeout_ms)

    def server_metrics(
        self,
        since: Timestamp | None = None,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetServerMetricsResponse:
        request = GetServerMetricsRequest()
        if since is not None:
            request.since.CopyFrom(since)
        return self._metrics.get_server_metrics(request, headers=headers, timeout_ms=timeout_ms)

    def instance_metrics(
        self,
        instance_id: str,
        since: Timestamp | None = None,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetInstanceMetricsResponse:
        request = GetInstanceMetricsRequest(instance_id=instance_id)
        if since is not None:
            request.since.CopyFrom(since)
        return self._metrics.get_instance_metrics(request, headers=headers, timeout_ms=timeout_ms)

    def execute_command(
        self, request: CommandRequest, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> CommandResponse:
        return self._commands.execute_command(request, headers=headers, timeout_ms=timeout_ms)

    def complete_command(
        self,
        request: CommandCompletionRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> CommandCompletionResponse:
        return self._commands.tab_complete_command(request, headers=headers, timeout_ms=timeout_ms)

    def download(
        self, request: DownloadRequest, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> DownloadResponse:
        return self._downloads.download(request, headers=headers, timeout_ms=timeout_ms)

    def plugin_stats(
        self, instance_id: str, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> list[PluginRuntimeStat]:
        return list(
            self._plugin_stats.get_instance_plugin_stats(
                GetInstancePluginStatsRequest(instance_id=instance_id),
                headers=headers,
                timeout_ms=timeout_ms,
            ).stats
        )

    def audit_log(
        self, instance_id: str, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> list[InstanceAuditLogResponse.AuditLogEntry]:
        return list(
            self._instances.get_audit_log(
                InstanceAuditLogRequest(id=instance_id), headers=headers, timeout_ms=timeout_ms
            ).entry
        )

    def list_scripts(
        self, instance_id: str, *, headers: Headers = None, timeout_ms: int | None = None
    ) -> list[ScriptInfo]:
        return list(
            self._scripts.list_scripts(
                ListScriptsRequest(instance_id=instance_id), headers=headers, timeout_ms=timeout_ms
            ).scripts
        )

    def script(
        self,
        instance_id: str,
        script_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetScriptResponse:
        return self._scripts.get_script(
            GetScriptRequest(instance_id=instance_id, script_id=script_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def create_script(
        self,
        request: CreateScriptRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> CreateScriptResponse:
        return self._scripts.create_script(request, headers=headers, timeout_ms=timeout_ms)

    def update_script(
        self,
        request: UpdateScriptRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> UpdateScriptResponse:
        return self._scripts.update_script(request, headers=headers, timeout_ms=timeout_ms)

    def delete_script(
        self,
        instance_id: str,
        script_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._scripts.delete_script(
            DeleteScriptRequest(instance_id=instance_id, script_id=script_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def activate_script(
        self,
        instance_id: str,
        script_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> Iterator[ScriptEvent]:
        return self._scripts.activate_script(
            ActivateScriptRequest(instance_id=instance_id, script_id=script_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def deactivate_script(
        self,
        instance_id: str,
        script_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> None:
        self._scripts.deactivate_script(
            DeactivateScriptRequest(instance_id=instance_id, script_id=script_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def script_status(
        self,
        instance_id: str,
        script_id: str,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetScriptStatusResponse:
        return self._scripts.get_script_status(
            GetScriptStatusRequest(instance_id=instance_id, script_id=script_id),
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def script_logs(
        self,
        request: SubscribeScriptLogsRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> Iterator[ScriptLogEntry]:
        return self._scripts.subscribe_script_logs(request, headers=headers, timeout_ms=timeout_ms)

    def node_types(
        self,
        request: GetNodeTypesRequest | None = None,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetNodeTypesResponse:
        return self._scripts.get_node_types(
            request or GetNodeTypesRequest(), headers=headers, timeout_ms=timeout_ms
        )

    def script_registry_data(
        self,
        request: GetRegistryDataRequest | None = None,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> GetRegistryDataResponse:
        return self._scripts.get_registry_data(
            request or GetRegistryDataRequest(), headers=headers, timeout_ms=timeout_ms
        )

    def validate_script(
        self,
        request: ValidateScriptRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> ValidateScriptResponse:
        return self._scripts.validate_script(request, headers=headers, timeout_ms=timeout_ms)

    def dry_run_script(
        self,
        request: DryRunScriptRequest,
        *,
        headers: Headers = None,
        timeout_ms: int | None = None,
    ) -> Iterator[ScriptEvent]:
        return self._scripts.dry_run_script(request, headers=headers, timeout_ms=timeout_ms)
