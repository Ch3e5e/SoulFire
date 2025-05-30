/*
 * SoulFire
 * Copyright (C) 2024  AlexProgrammerDE
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
package com.soulfiremc.server.protocol.netty;

import com.soulfiremc.server.InstanceManager;
import com.soulfiremc.server.protocol.SFProtocolConstants;
import com.soulfiremc.server.viaversion.SFVLPipeline;
import com.soulfiremc.server.viaversion.StorableSession;
import com.viaversion.vialoader.netty.VLPipeline;
import com.viaversion.viaversion.connection.UserConnectionImpl;
import com.viaversion.viaversion.protocol.ProtocolPipelineImpl;
import io.netty.channel.Channel;
import io.netty.channel.ChannelHandler;
import io.netty.channel.EventLoopGroup;
import io.netty.handler.traffic.GlobalTrafficShapingHandler;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.geysermc.mcprotocollib.network.NetworkConstants;
import org.geysermc.mcprotocollib.network.helper.TransportHelper;
import org.geysermc.mcprotocollib.network.netty.AutoReadFlowControlHandler;
import org.geysermc.mcprotocollib.network.netty.MinecraftChannelInitializer;
import org.geysermc.mcprotocollib.network.server.NetworkServer;
import org.geysermc.mcprotocollib.network.session.ServerNetworkSession;
import org.geysermc.mcprotocollib.protocol.MinecraftProtocol;

import java.net.SocketAddress;
import java.util.function.Supplier;

public final class ViaServer extends NetworkServer {
  private final InstanceManager instanceManager;

  public ViaServer(SocketAddress bindAddress, Supplier<? extends MinecraftProtocol> protocol, InstanceManager instanceManager) {
    super(bindAddress, protocol, () -> instanceManager.scheduler()::schedule);
    this.instanceManager = instanceManager;
  }

  @Override
  protected ChannelHandler getChannelHandler() {
    return new MinecraftChannelInitializer<>((channel) -> {
      var protocol = this.createPacketProtocol();

      var session = new ServerNetworkSession(channel.remoteAddress(), protocol, ViaServer.this, instanceManager.scheduler()::schedule);
      session.getPacketProtocol().newServerSession(ViaServer.this, session);

      return session;
    }, false) {
      public void addHandlers(ServerNetworkSession session, @NonNull Channel channel) {
        var pipeline = channel.pipeline();

        // This monitors the traffic
        var trafficHandler = new GlobalTrafficShapingHandler(channel.eventLoop(), 0, 0, 1000);
        pipeline.addLast("traffic", trafficHandler);
        session.setFlag(SFProtocolConstants.TRAFFIC_HANDLER, trafficHandler);

        super.addHandlers(session, channel);

        // This does the extra magic
        var userConnection = new UserConnectionImpl(channel, false);
        new ProtocolPipelineImpl(userConnection);

        userConnection.put(new StorableSession(session));

        session.setFlag(SFProtocolConstants.VIA_USER_CONNECTION, userConnection);

        pipeline.addLast(new SFVLPipeline(userConnection));
        pipeline.addBefore(VLPipeline.VIA_CODEC_NAME, "via-" + NetworkConstants.FLOW_CONTROL_NAME, new AutoReadFlowControlHandler());
      }
    };
  }

  @Override
  protected EventLoopGroup createBossEventLoopGroup() {
    return TransportHelper.TRANSPORT_TYPE.eventLoopGroupFactory().apply(
      r -> Thread.ofPlatform().unstarted(instanceManager.runnableWrapper().wrap(r)));
  }

  @Override
  protected EventLoopGroup createWorkerEventLoopGroup() {
    return TransportHelper.TRANSPORT_TYPE.eventLoopGroupFactory().apply(
      r -> Thread.ofPlatform().unstarted(instanceManager.runnableWrapper().wrap(r)));
  }
}
