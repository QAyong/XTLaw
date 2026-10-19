export const BUDDY_V31_AUTOMATION_APPROVAL_POLICY_SCHEMA_SQL = `
ALTER TABLE automations ADD COLUMN approval_policy TEXT NOT NULL DEFAULT 'policy'
  CHECK (approval_policy IN ('manual', 'policy'));
`
