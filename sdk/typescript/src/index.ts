export {
  SoulFire,
  SoulFireActionError,
  SoulFireBot,
  SoulFireBotControlLease,
  SoulFireInstance,
  type BotMovement,
  type BotSelection,
  type SoulFireOptions,
  type TokenProvider,
} from "./client.js";
export type {
  LocalSoulFireServer,
  SoulFireInstallOptions,
} from "./install-types.js";
export {
  attackNearest,
  autoEat,
  build,
  collectBlocks,
  defineBehavior,
  followEntity,
  runBehaviors,
  type AttackNearestOptions,
  type AutoEatOptions,
  type BehaviorContext,
  type BotBehavior,
  type BuildPlacement,
  type CollectBlocksOptions,
} from "./behaviors.js";

export {
  BlockFace,
  BotActionStatus,
  BotEventFilterSchema,
  BotLifecycleKind,
  ChatSource,
  EntityEventKind,
  Hand,
  PathfindStatus,
  type BlockPosition,
  type BotActionResult,
  type BotControlLease,
  type BotEvent,
  type BotEventFilter,
  type NearbyEntity,
  type PathfindGoal,
  type PathfindOptions,
  type PathfindProgress,
  type WorldPosition,
} from "./generated/soulfire/bot_live_pb.js";
export {
  BotDesiredState,
  BotRuntimeState,
  ClickType,
  type BotGetDialogResponse,
  type BotInfoResponse,
  type BotInventoryStateResponse,
  type BotFleetSummary,
  type BotListEntry,
  type BotLiveState,
  type BotStatus,
  type WatchBotStatusesResponse,
} from "./generated/soulfire/bot_pb.js";
export {
  AccountTypeCredentials,
  AccountTypeDeviceCode,
  type MinecraftAccountProto,
  type ProxyProto,
} from "./generated/soulfire/common_pb.js";
export type {
  CredentialsAuthResponse,
  DeviceCodeAuthResponse,
  RefreshResponse,
} from "./generated/soulfire/mc-auth_pb.js";
export type {
  InstanceInfo,
  InstanceListResponse_Instance,
} from "./generated/soulfire/instance_pb.js";
export {
  NextAuthFlowResponse_Failure_Reason,
  type NextAuthFlowResponse,
} from "./generated/soulfire/login_pb.js";
