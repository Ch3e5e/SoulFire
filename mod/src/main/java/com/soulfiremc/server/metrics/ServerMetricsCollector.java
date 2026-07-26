/*
 * SoulFire
 * Copyright (C) 2026  AlexProgrammerDE
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
package com.soulfiremc.server.metrics;

import com.google.protobuf.Timestamp;
import com.soulfiremc.grpc.generated.ServerMetricsSnapshot;
import com.soulfiremc.server.SoulFireServer;
import com.sun.management.OperatingSystemMXBean;
import lombok.extern.slf4j.Slf4j;

import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/// Collects and stores server-level system metrics in a ring buffer.
/// Metrics are sampled every 3 seconds via a scheduled task.
/// Thread-safe: snapshot buffer is synchronized.
@Slf4j
public final class ServerMetricsCollector {
  private static final int MAX_SNAPSHOTS = 600; // 30 min at 3s intervals

  private final SoulFireServer soulFireServer;
  private final ArrayDeque<ServerMetricsSnapshot> snapshots = new ArrayDeque<>();

  public ServerMetricsCollector(SoulFireServer soulFireServer) {
    this.soulFireServer = soulFireServer;
  }

  public void sampleSnapshot() {
    var now = Instant.now();

    // CPU
    var processCpuLoad = -1.0;
    var systemCpuLoad = -1.0;
    var osBean = ManagementFactory.getOperatingSystemMXBean();
    if (osBean instanceof OperatingSystemMXBean sunOsBean) {
      processCpuLoad = sunOsBean.getProcessCpuLoad();
      systemCpuLoad = sunOsBean.getCpuLoad();
    }

    // Memory
    var memoryBean = ManagementFactory.getMemoryMXBean();
    var heapUsage = memoryBean.getHeapMemoryUsage();
    var nonHeapUsage = memoryBean.getNonHeapMemoryUsage();

    // Threads
    var threadBean = ManagementFactory.getThreadMXBean();

    // GC
    var gcCollectionCount = 0L;
    var gcCollectionTimeMs = 0L;
    for (var gcBean : ManagementFactory.getGarbageCollectorMXBeans()) {
      var count = gcBean.getCollectionCount();
      if (count >= 0) {
        gcCollectionCount += count;
      }
      var time = gcBean.getCollectionTime();
      if (time >= 0) {
        gcCollectionTimeMs += time;
      }
    }

    // Uptime & processors
    var runtimeBean = ManagementFactory.getRuntimeMXBean();
    var uptimeMs = runtimeBean.getUptime();
    var availableProcessors = Runtime.getRuntime().availableProcessors();

    // Aggregate bots across all instances
    var totalBotsOnline = 0;
    var totalBotsTotal = 0;
    var totalBotsDesired = 0;
    var instancesWithDesiredBots = 0;
    var totalBotsStarting = 0;
    var totalBotsRetrying = 0;
    var totalBotsFailed = 0;
    for (var instance : soulFireServer.instances().values()) {
      var summary = instance.botStateManager().summary();
      totalBotsOnline += summary.getOnlineBots();
      totalBotsTotal += summary.getTotalBots();
      totalBotsDesired += summary.getDesiredBots();
      totalBotsStarting += summary.getStartingBots();
      totalBotsRetrying += summary.getRetryingBots();
      totalBotsFailed += summary.getFailedBots();
      if (summary.getDesiredBots() > 0) {
        instancesWithDesiredBots++;
      }
    }

    var snapshot = ServerMetricsSnapshot.newBuilder()
      .setTimestamp(Timestamp.newBuilder()
        .setSeconds(now.getEpochSecond())
        .setNanos(now.getNano())
        .build())
      .setProcessCpuLoad(processCpuLoad)
      .setSystemCpuLoad(systemCpuLoad)
      .setHeapUsedBytes(heapUsage.getUsed())
      .setHeapCommittedBytes(heapUsage.getCommitted())
      .setHeapMaxBytes(heapUsage.getMax())
      .setNonHeapUsedBytes(nonHeapUsage.getUsed())
      .setThreadCount(threadBean.getThreadCount())
      .setDaemonThreadCount(threadBean.getDaemonThreadCount())
      .setGcCollectionCount(gcCollectionCount)
      .setGcCollectionTimeMs(gcCollectionTimeMs)
      .setUptimeMs(uptimeMs)
      .setAvailableProcessors(availableProcessors)
      .setTotalBotsOnline(totalBotsOnline)
      .setTotalBotsTotal(totalBotsTotal)
      .setTotalBotsDesired(totalBotsDesired)
      .setInstancesWithDesiredBots(instancesWithDesiredBots)
      .setTotalBotsStarting(totalBotsStarting)
      .setTotalBotsRetrying(totalBotsRetrying)
      .setTotalBotsFailed(totalBotsFailed)
      .build();

    synchronized (snapshots) {
      snapshots.addLast(snapshot);
      while (snapshots.size() > MAX_SNAPSHOTS) {
        snapshots.removeFirst();
      }
    }
  }

  /// Returns all stored snapshots, optionally filtered by a "since" timestamp.
  public List<ServerMetricsSnapshot> getSnapshots(Timestamp since) {
    synchronized (snapshots) {
      if (since == null || (since.getSeconds() == 0 && since.getNanos() == 0)) {
        return List.copyOf(snapshots);
      }

      var result = new ArrayList<ServerMetricsSnapshot>();
      for (var snapshot : snapshots) {
        var ts = snapshot.getTimestamp();
        if (ts.getSeconds() > since.getSeconds()
          || (ts.getSeconds() == since.getSeconds() && ts.getNanos() > since.getNanos())) {
          result.add(snapshot);
        }
      }
      return result;
    }
  }
}
