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
package com.soulfiremc.server.database;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.sql.DriverManager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class DesiredBotsMigrationTest {
  @Test
  void replacesInstanceLifecycleWithoutPreservingSessionState(@TempDir Path tempDir) throws Exception {
    var jdbcUrl = "jdbc:sqlite:%s".formatted(tempDir.resolve("soulfire.sqlite"));
    migrate(jdbcUrl, "5");

    try (var connection = DriverManager.getConnection(jdbcUrl);
         var statement = connection.createStatement()) {
      statement.execute("""
        INSERT INTO users (id, username, email, role, min_issued_at)
        VALUES ('user-id', 'user', 'user@example.com', 'ADMIN', CURRENT_TIMESTAMP)
        """);
      statement.execute("""
        INSERT INTO instances (id, friendly_name, icon, owner_id, session_lifecycle, settings)
        VALUES ('instance-id', 'Instance', 'pickaxe', 'user-id', 'RUNNING', '{}')
        """);
      statement.execute("""
        INSERT INTO instance_audit_logs (id, type, instance_id, user_id)
        VALUES
          ('session-log', 'START_SESSION', 'instance-id', 'user-id'),
          ('command-log', 'EXECUTE_COMMAND', 'instance-id', 'user-id')
        """);
    }

    migrate(jdbcUrl, null);

    try (var connection = DriverManager.getConnection(jdbcUrl)) {
      try (var columns = connection.getMetaData()
             .getColumns(null, null, "instances", null)) {
        var columnNames = new java.util.HashSet<String>();
        while (columns.next()) {
          columnNames.add(columns.getString("COLUMN_NAME"));
        }
        assertFalse(columnNames.contains("session_lifecycle"));
      }

      try (var tables = connection.getMetaData()
             .getTables(null, null, "instance_desired_bots", null)) {
        assertTrue(tables.next());
      }

      try (var statement = connection.createStatement();
           var desiredBots = statement.executeQuery("SELECT COUNT(*) FROM instance_desired_bots")) {
        assertTrue(desiredBots.next());
        assertEquals(0, desiredBots.getInt(1));
      }

      try (var statement = connection.createStatement();
           var logs = statement.executeQuery("SELECT type FROM instance_audit_logs")) {
        assertTrue(logs.next());
        assertEquals("EXECUTE_COMMAND", logs.getString("type"));
        assertFalse(logs.next());
      }
    }
  }

  private static void migrate(String jdbcUrl, String target) {
    var configuration = Flyway.configure()
      .dataSource(jdbcUrl, null, null)
      .locations("classpath:db/migration");
    if (target != null) {
      configuration.target(target);
    }
    configuration.load().migrate();
  }
}
