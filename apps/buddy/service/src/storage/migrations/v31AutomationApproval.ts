export const BUDDY_V31_AUTOMATION_APPROVAL_SCHEMA_SQL = `
ALTER TABLE automations ADD COLUMN approval_policy TEXT NOT NULL DEFAULT 'policy'
  CHECK (approval_policy IN ('manual', 'policy'));
ALTER TABLE automations ADD COLUMN approval_allowlist_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(approval_allowlist_json) AND json_type(approval_allowlist_json) = 'array');
`
