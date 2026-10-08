const projectionTables = ['run_events', 'messages', 'approvals', 'usage_records'] as const

// Database-level invalidation covers existing repository writes as well as the projector.
// An absent checkpoint is untrusted; only a successful full rebuild publishes one.
export const BUDDY_RUN_EVENT_CHECKPOINT_TRIGGER_NAMES = [
  ...projectionTables.flatMap(table => ['insert', 'update', 'delete'].map(operation => `invalidate_run_checkpoint_${table}_${operation}`)),
  'invalidate_run_checkpoint_runs_update',
]

export const BUDDY_V24_RUN_EVENT_CHECKPOINTS_SCHEMA_SQL = `
CREATE INDEX idx_messages_run ON messages(run_id);

CREATE TABLE run_event_checkpoints (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  last_sequence INTEGER NOT NULL CHECK (last_sequence >= 0),
  projection_version INTEGER NOT NULL CHECK (projection_version > 0),
  file_fingerprint TEXT NOT NULL
);

${projectionTables.map(table => `
CREATE TRIGGER invalidate_run_checkpoint_${table}_insert AFTER INSERT ON ${table}
BEGIN
  DELETE FROM run_event_checkpoints WHERE run_id = NEW.run_id;
END;
CREATE TRIGGER invalidate_run_checkpoint_${table}_update AFTER UPDATE ON ${table}
BEGIN
  DELETE FROM run_event_checkpoints WHERE run_id IN (OLD.run_id, NEW.run_id);
END;
CREATE TRIGGER invalidate_run_checkpoint_${table}_delete AFTER DELETE ON ${table}
BEGIN
  DELETE FROM run_event_checkpoints WHERE run_id = OLD.run_id;
END;
`).join('\n')}

CREATE TRIGGER invalidate_run_checkpoint_runs_update
AFTER UPDATE OF status, started_at, completed_at, error_code, conversation_id, branch_id ON runs
BEGIN
  DELETE FROM run_event_checkpoints WHERE run_id IN (OLD.id, NEW.id);
END;
`
