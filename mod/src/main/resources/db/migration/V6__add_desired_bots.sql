CREATE TABLE instance_desired_bots (
  instance_id VARCHAR(36) NOT NULL,
  profile_id VARCHAR(36) NOT NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (instance_id, profile_id),
  FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
);

DELETE FROM instance_audit_logs
WHERE type IN (
  'START_SESSION',
  'PAUSE_SESSION',
  'RESUME_SESSION',
  'STOP_SESSION',
  'START_ATTACK',
  'PAUSE_ATTACK',
  'RESUME_ATTACK',
  'STOP_ATTACK'
);

ALTER TABLE instances DROP COLUMN session_lifecycle;
