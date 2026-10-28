export const BUDDY_V36_EXTENSION_CAPABILITIES_SCHEMA_SQL = `
CREATE TABLE extension_capabilities (
  id TEXT PRIMARY KEY,
  extension_id TEXT NOT NULL,
  extension_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('mcp', 'subagent')),
  contribution_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('enabled', 'disabled', 'removed', 'unavailable')),
  user_enabled INTEGER NOT NULL CHECK (user_enabled IN (0, 1)),
  unavailable_reason TEXT CHECK (unavailable_reason IN ('authentication_required', 'target_changed', 'dependency_unavailable')),
  credential_target TEXT,
  bindings_revision TEXT,
  UNIQUE(extension_id, kind, contribution_id)
);
`
