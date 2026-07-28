import {
  create,
  type MessageInitShape,
} from "@bufbuild/protobuf";
import type { CallOptions, Client } from "@connectrpc/connect";

import {
  PathfindGoalSchema,
  PathfindOptionsSchema,
  type PathfindGoal,
} from "./generated/soulfire/bot_live_pb.js";
import {
  BlockPositionSchema,
  WorldPositionSchema,
} from "./generated/soulfire/common_pb.js";
import type { EntityReference } from "./generated/soulfire/domain_pb.js";
import {
  PathfinderService,
  type PathPlan,
} from "./generated/soulfire/pathfinding_pb.js";
import type {
  FollowEntityTaskOptions,
  GoToTaskOptions,
  SoulFireTasks,
} from "./tasks.js";

export type BlockTarget = MessageInitShape<typeof BlockPositionSchema>;
export type WorldTarget = MessageInitShape<typeof WorldPositionSchema>;
export type EntityTarget = Pick<
  EntityReference,
  "connectionEpoch" | "networkId"
> | number;

export interface PlanPathOptions {
  path?: MessageInitShape<typeof PathfindOptionsSchema>;
  includeDescriptions?: boolean;
  call?: CallOptions;
}

export class SoulFirePathfinder {
  public constructor(
    private readonly instanceId: string,
    private readonly botId: string,
    private readonly client: Client<typeof PathfinderService>,
    private readonly tasks: SoulFireTasks,
  ) {}

  public async plan(
    goal: PathfindGoal,
    options: PlanPathOptions = {},
  ): Promise<PathPlan> {
    const response = await this.client.planPath(
      {
        instanceId: this.instanceId,
        botId: this.botId,
        goal,
        ...(options.path === undefined ? {} : { options: options.path }),
        includeDescriptions: options.includeDescriptions ?? false,
      },
      options.call,
    );
    if (response.plan === undefined) {
      throw new Error("SoulFire did not return a path plan");
    }
    return response.plan;
  }

  public goTo(
    goal: PathfindGoal,
    options: GoToTaskOptions = {},
  ): ReturnType<SoulFireTasks["goTo"]> {
    return this.tasks.goTo(goal, options);
  }

  public run(
    goal: PathfindGoal,
    options: GoToTaskOptions = {},
  ): ReturnType<SoulFireTasks["runGoTo"]> {
    return this.tasks.runGoTo(goal, options);
  }

  public follow(
    target: EntityTarget,
    distance = 3,
    options: FollowEntityTaskOptions = {},
  ): ReturnType<SoulFireTasks["followEntity"]> {
    return this.tasks.followEntity(target, distance, options);
  }

  public runFollow(
    target: EntityTarget,
    distance = 3,
    options: FollowEntityTaskOptions = {},
  ): ReturnType<SoulFireTasks["runFollowEntity"]> {
    return this.tasks.runFollowEntity(target, distance, options);
  }
}

function blockTarget(position: BlockTarget) {
  return create(BlockPositionSchema, position);
}

function worldTarget(position: WorldTarget) {
  return create(WorldPositionSchema, position);
}

function entityTarget(target: EntityTarget): {
  entityId: number;
  connectionEpoch?: string;
} {
  return typeof target === "number"
    ? { entityId: target }
    : {
        entityId: target.networkId,
        ...(target.connectionEpoch.length === 0
          ? {}
          : { connectionEpoch: target.connectionEpoch }),
  };
}

export interface PathGoals {
  block(position: BlockTarget, radius?: number): PathfindGoal;
  near(position: WorldTarget, radius: number): PathfindGoal;
  entity(target: EntityTarget, radius: number): PathfindGoal;
  xz(
    x: number,
    z: number,
    options?: { dimension?: string; radius?: number },
  ): PathfindGoal;
  y(y: number, dimension?: string): PathfindGoal;
  breakBlock(position: BlockTarget): PathfindGoal;
  placeBlock(position: BlockTarget): PathfindGoal;
  awayFromPosition(position: WorldTarget, radius: number): PathfindGoal;
  awayFromEntity(target: EntityTarget, radius: number): PathfindGoal;
  any(nested: readonly PathfindGoal[]): PathfindGoal;
}

export const goals: PathGoals = {
  block(position: BlockTarget, radius = 0): PathfindGoal {
    return create(PathfindGoalSchema, {
      goal: {
        case: "block",
        value: { position: blockTarget(position), radius },
      },
    });
  },

  near(position: WorldTarget, radius: number): PathfindGoal {
    return create(PathfindGoalSchema, {
      goal: {
        case: "near",
        value: { position: worldTarget(position), radius },
      },
    });
  },

  entity(target: EntityTarget, radius: number): PathfindGoal {
    return create(PathfindGoalSchema, {
      goal: {
        case: "entity",
        value: { ...entityTarget(target), radius },
      },
    });
  },

  xz(
    x: number,
    z: number,
    options: { dimension?: string; radius?: number } = {},
  ): PathfindGoal {
    return create(PathfindGoalSchema, {
      goal: {
        case: "xz",
        value: {
          x,
          z,
          dimension: options.dimension ?? "",
          radius: options.radius ?? 0,
        },
      },
    });
  },

  y(y: number, dimension = ""): PathfindGoal {
    return create(PathfindGoalSchema, {
      goal: { case: "y", value: { y, dimension } },
    });
  },

  breakBlock(position: BlockTarget): PathfindGoal {
    return create(PathfindGoalSchema, {
      goal: {
        case: "breakBlock",
        value: { position: blockTarget(position) },
      },
    });
  },

  placeBlock(position: BlockTarget): PathfindGoal {
    return create(PathfindGoalSchema, {
      goal: {
        case: "placeBlock",
        value: { position: blockTarget(position) },
      },
    });
  },

  awayFromPosition(
    position: WorldTarget,
    radius: number,
  ): PathfindGoal {
    return create(PathfindGoalSchema, {
      goal: {
        case: "awayFromPosition",
        value: { position: worldTarget(position), radius },
      },
    });
  },

  awayFromEntity(target: EntityTarget, radius: number): PathfindGoal {
    return create(PathfindGoalSchema, {
      goal: {
        case: "awayFromEntity",
        value: { ...entityTarget(target), radius },
      },
    });
  },

  any(nested: readonly PathfindGoal[]): PathfindGoal {
    if (nested.length === 0) {
      throw new RangeError("A composite path goal needs at least one goal");
    }
    return create(PathfindGoalSchema, {
      goal: { case: "any", value: { goals: [...nested] } },
    });
  },
};
