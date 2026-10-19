export const BUDDY_V32_AUTOMATION_APPROVAL_ALLOWLIST_SCHEMA_SQL = `
ALTER TABLE automations ADD COLUMN approval_allowlist_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(approval_allowlist_json) AND json_type(approval_allowlist_json) = 'array');
`
