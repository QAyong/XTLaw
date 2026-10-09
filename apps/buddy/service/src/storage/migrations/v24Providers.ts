// XTLaw v23 is already the checkpoint migration. Never renumber a released migration.
export const BUDDY_V24_PROVIDERS_SCHEMA_SQL = `
UPDATE builtin_provider_configs
SET builtin_provider_id = 'azure'
WHERE builtin_provider_id = 'azure-openai-responses';

CREATE INDEX IF NOT EXISTS idx_messages_run ON messages(run_id);
`
