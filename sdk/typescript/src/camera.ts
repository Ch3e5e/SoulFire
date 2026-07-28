import type {
  DescMessage,
  MessageInitShape,
} from "@bufbuild/protobuf";
import type { CallOptions, Client } from "@connectrpc/connect";

import {
  BotService,
  type BotPovFrame,
  type BotRenderPovRequestSchema,
  type BotRenderPovResponse,
  type BotWatchPovRequestSchema,
  type BotWorldMapRequestSchema,
  type BotWorldMapResponse,
} from "./generated/soulfire/bot_pb.js";

type BotScoped<T extends DescMessage> = Omit<
  MessageInitShape<T>,
  "$typeName" | "instanceId" | "botId"
>;

export type CameraRenderOptions =
  BotScoped<typeof BotRenderPovRequestSchema>;

export type CameraStreamOptions =
  & BotScoped<typeof BotWatchPovRequestSchema>
  & { call?: CallOptions };

export type WorldMapOptions =
  BotScoped<typeof BotWorldMapRequestSchema>;

/**
 * Captures POV images and map-ready world snapshots for one bot.
 */
export class SoulFireCamera {
  public constructor(
    private readonly instanceId: string,
    private readonly botId: string,
    private readonly client: Client<typeof BotService>,
  ) {}

  public capture(
    options: CameraRenderOptions = {},
    call?: CallOptions,
  ): Promise<BotRenderPovResponse> {
    return this.client.renderBotPov(
      { ...options, ...this.scope() },
      call,
    );
  }

  public async captureBytes(
    options: CameraRenderOptions = {},
    call?: CallOptions,
  ): Promise<Uint8Array> {
    return decodeCameraImage(await this.capture(options, call));
  }

  public frames(
    options: CameraStreamOptions = {},
  ): AsyncIterable<BotPovFrame> {
    const { call, ...request } = options;
    return this.client.watchBotPov(
      { ...request, ...this.scope() },
      call,
    );
  }

  public worldMap(
    options: WorldMapOptions = {},
    call?: CallOptions,
  ): Promise<BotWorldMapResponse> {
    return this.client.getBotWorldMap(
      { ...options, ...this.scope() },
      call,
    );
  }

  private scope(): { instanceId: string; botId: string } {
    return { instanceId: this.instanceId, botId: this.botId };
  }
}

/**
 * Decodes the image payload returned by a camera capture or stream frame.
 */
export function decodeCameraImage(
  image: Pick<BotRenderPovResponse, "imageBase64">,
): Uint8Array {
  const binary = globalThis.atob(image.imageBase64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
