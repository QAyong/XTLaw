import type { DatabaseSync } from 'node:sqlite'
import type { AutomationApprovalAllowlistEntry } from '../../../shared/automation/approvalAllowlist'
import { automationApprovalAllowlistSchema } from '../../../shared/automation/approvalAllowlist'

export function createAutomationRunAllowlistReader(
  database: DatabaseSync,
): (runId: string) => readonly AutomationApprovalAllowlistEntry[] {
  const find = database.prepare(`
    SELECT json_extract(execution_snapshot_json, '$.approvalAllowlist') AS allowlist
    FROM automation_occurrences
    WHERE run_id = ?
  `)
  return (runId) => {
    const row = find.get(runId) as { allowlist: string | null } | undefined
    if (!row?.allowlist)
      return []
    const parsed = automationApprovalAllowlistSchema.safeParse(JSON.parse(row.allowlist))
    return parsed.success ? parsed.data : []
  }
}
