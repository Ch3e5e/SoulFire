export {
  SoulFire,
  SoulFireBot,
  SoulFireInstance,
  type SoulFireOptions,
  type TokenProvider,
} from "./client.js";
export type {
  LocalSoulFireServer,
  SoulFireInstallOptions,
} from "./install-types.js";

export {
  BlockFace,
  BotEventFilterSchema,
  BotLifecycleKind,
  ChatSource,
  EntityEventKind,
  Hand,
  PathfindStatus,
  type BlockPosition,
  type BotEvent,
  type BotEventFilter,
  type NearbyEntity,
  type PathfindGoal,
  type PathfindOptions,
  type PathfindProgress,
  type WorldPosition,
} from "./generated/soulfire/bot_live_pb.js";
export type { BotLiveState } from "./generated/soulfire/bot_pb.js";
export {
  NextAuthFlowResponse_Failure_Reason,
  type NextAuthFlowResponse,
} from "./generated/soulfire/login_pb.js";
