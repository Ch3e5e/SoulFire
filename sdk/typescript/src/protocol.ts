import type {
  DescMessage,
  MessageInitShape,
} from "@bufbuild/protobuf";
import type { CallOptions, Client } from "@connectrpc/connect";

import {
  BotProtocolService,
  type BotProtocolInfo,
  type PacketDirection,
  type PacketSchema,
  type RawPacketEvent,
  type WatchPacketsRequestSchema,
} from "./generated/soulfire/protocol_pb.js";

type BotScoped<T extends DescMessage> = Omit<
  MessageInitShape<T>,
  "$typeName" | "botId" | "instanceId"
>;

export type WatchPacketsOptions =
  & BotScoped<typeof WatchPacketsRequestSchema>
  & {
    call?: CallOptions;
  };

export interface SendRawPacketOptions {
  call?: CallOptions;
  expectedName?: string;
}

/**
 * Advanced access to SoulFire's native Minecraft packet codec.
 *
 * Encoded bytes use the native protocol reported by {@link info}, not the
 * remote server protocol. SoulFire applies ViaVersion translation afterward.
 */
export class SoulFireProtocol {
  public constructor(
    private readonly instanceId: string,
    private readonly botId: string,
    private readonly client: Client<typeof BotProtocolService>,
  ) {}

  public info(options?: CallOptions): Promise<BotProtocolInfo> {
    return this.client.getProtocolInfo(this.scope(), options);
  }

  public async schemas(
    direction: PacketDirection,
    options?: CallOptions,
  ): Promise<readonly PacketSchema[]> {
    const response = await this.client.listPacketSchemas(
      { ...this.scope(), direction },
      options,
    );
    return response.packets;
  }

  public packets(
    options: WatchPacketsOptions = {},
  ): AsyncIterable<RawPacketEvent> {
    const { call, ...request } = options;
    return this.client.watchPackets(
      { ...request, ...this.scope() },
      call,
    );
  }

  public async send(
    encodedPacket: Uint8Array,
    options: SendRawPacketOptions = {},
  ): Promise<{ name: string; encodedBytes: number }> {
    const response = await this.client.sendRawPacket(
      {
        ...this.scope(),
        encodedPacket,
        ...(options.expectedName === undefined
          ? {}
          : { expectedName: options.expectedName }),
      },
      options.call,
    );
    return {
      name: response.name,
      encodedBytes: response.encodedBytes,
    };
  }

  private scope(): { instanceId: string; botId: string } {
    return { instanceId: this.instanceId, botId: this.botId };
  }
}
