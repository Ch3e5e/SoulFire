import type {
  DescMessage,
  MessageInitShape,
} from "@bufbuild/protobuf";
import type { CallOptions, Client } from "@connectrpc/connect";

import {
  RecipeService,
  type CanCraftRequestSchema,
  type CanCraftResponse,
  type ListRecipesRequestSchema,
  type ListRecipesResponse,
  type ListVillagerTradesResponse,
} from "./generated/soulfire/recipe_pb.js";
import type {
  BrewTaskOptions,
  CraftTaskOptions,
  SmeltTaskOptions,
  SoulFireTask,
  SoulFireTasks,
  VillagerTradeTaskOptions,
} from "./tasks.js";
import type {
  BrewTaskResultSchema,
  CraftTaskResultSchema,
  SmeltTaskResultSchema,
  VillagerTradeTaskResultSchema,
} from "./generated/soulfire/recipe_pb.js";
import type { BotTaskEvent } from "./generated/soulfire/task_pb.js";
import type {
  ItemSelectorSchema,
} from "./generated/soulfire/inventory_pb.js";

type RecipeRequest<T extends DescMessage> = Omit<
  MessageInitShape<T>,
  "$typeName" | "scope"
>;

export class SoulFireRecipes {
  public constructor(
    private readonly instanceId: string,
    private readonly botId: string,
    private readonly client: Client<typeof RecipeService>,
    private readonly tasks: SoulFireTasks,
  ) {}

  public list(
    request: RecipeRequest<typeof ListRecipesRequestSchema> = {},
    options?: CallOptions,
  ): Promise<ListRecipesResponse> {
    return this.client.listRecipes(
      { ...request, scope: this.scope() },
      options,
    );
  }

  public canCraft(
    request: RecipeRequest<typeof CanCraftRequestSchema>,
    options?: CallOptions,
  ): Promise<CanCraftResponse> {
    return this.client.canCraft(
      { ...request, scope: this.scope() },
      options,
    );
  }

  public listVillagerTrades(
    options?: CallOptions,
  ): Promise<ListVillagerTradesResponse> {
    return this.client.listVillagerTrades(
      { scope: this.scope() },
      options,
    );
  }

  public craft(
    recipeId: string,
    count = 1,
    options: CraftTaskOptions = {},
  ): Promise<SoulFireTask<typeof CraftTaskResultSchema>> {
    return this.tasks.craft(recipeId, count, options);
  }

  public runCraft(
    recipeId: string,
    count = 1,
    options: CraftTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    return this.tasks.runCraft(recipeId, count, options);
  }

  public smelt(
    input: MessageInitShape<typeof ItemSelectorSchema>,
    count = 1,
    options: SmeltTaskOptions = {},
  ): Promise<SoulFireTask<typeof SmeltTaskResultSchema>> {
    return this.tasks.smelt(input, count, options);
  }

  public runSmelt(
    input: MessageInitShape<typeof ItemSelectorSchema>,
    count = 1,
    options: SmeltTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    return this.tasks.runSmelt(input, count, options);
  }

  public brew(
    input: MessageInitShape<typeof ItemSelectorSchema>,
    ingredient: MessageInitShape<typeof ItemSelectorSchema>,
    count = 1,
    options: BrewTaskOptions = {},
  ): Promise<SoulFireTask<typeof BrewTaskResultSchema>> {
    return this.tasks.brew(input, ingredient, count, options);
  }

  public runBrew(
    input: MessageInitShape<typeof ItemSelectorSchema>,
    ingredient: MessageInitShape<typeof ItemSelectorSchema>,
    count = 1,
    options: BrewTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    return this.tasks.runBrew(input, ingredient, count, options);
  }

  public villagerTrade(
    offerIndex: number,
    count = 1,
    options: VillagerTradeTaskOptions = {},
  ): Promise<SoulFireTask<typeof VillagerTradeTaskResultSchema>> {
    return this.tasks.villagerTrade(offerIndex, count, options);
  }

  public runVillagerTrade(
    offerIndex: number,
    count = 1,
    options: VillagerTradeTaskOptions = {},
  ): AsyncIterable<BotTaskEvent> {
    return this.tasks.runVillagerTrade(offerIndex, count, options);
  }

  private scope(): { instanceId: string; botId: string } {
    return { instanceId: this.instanceId, botId: this.botId };
  }
}
