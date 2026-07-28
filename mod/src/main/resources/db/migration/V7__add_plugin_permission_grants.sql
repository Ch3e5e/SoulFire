CREATE TABLE plugin_permission_grants (
  user_id VARCHAR(36) NOT NULL,
  permission_id VARCHAR(255) NOT NULL,
  scope VARCHAR(20) NOT NULL,
  resource_id VARCHAR(36) NOT NULL DEFAULT '',
  granted BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id, scope, resource_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX plugin_permission_grants_permission_idx
  ON plugin_permission_grants(permission_id);
