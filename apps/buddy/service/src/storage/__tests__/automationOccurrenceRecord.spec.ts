import type { AutomationOccurrenceRow } from '../automationOccurrenceRecord'
import { describe, expect, it } from 'vitest'
import { toAutomationOccurrenceRecord } from '../automationOccurrenceRecord'

const snapshot = {
  executionProfile: 'workspace_write',
  model: { mode: 'default' },
  name: 'Daily summary',
  prompt: 'Summarize the day',
  spaceContext: null,
  spaceId: null,
  timing: { activeFrom: null, activeUntil: null, schedule: { cadence: 'daily', kind: 'calendar', localTime: '09:30' }, timezone: 'UTC' },
}

function row(executionSnapshot: unknown): AutomationOccurrenceRow {
  return {
    actor_snapshot_json: null,
    automation_id: 'automation-1',
    automation_revision: 1,
    bound_at: null,
    coalesced_missed_count: 0,
    conversation_id: null,
    dedupe_key: 'automation-1:2026-10-21T01:30:00.000Z',
    deleted_at: null,
    error_code: null,
    error_summary: null,
    execution_snapshot_json: JSON.stringify(executionSnapshot),
    finished_at: null,
    id: 'occurrence-1',
    lease_expires_at: null,
    lease_owner: null,
    queued_at: '2026-10-21T01:30:00.000Z',
    request_id: null,
    run_id: null,
    scheduled_for: '2026-10-21T01:30:00.000Z',
    status: 'queued',
    trigger_kind: 'scheduled',
  }
}

describe('automation occurrence record', () => {
  it('reads snapshots saved with the removed approval policy and allowlist fields', () => {
    const legacy = {
      ...snapshot,
      approvalAllowlist: [{ kind: 'domain', host: 'example.com' }],
      approvalPolicy: 'policy',
    }

    const record = toAutomationOccurrenceRecord(row(legacy))

    expect(record.executionSnapshot).toEqual(snapshot)
    expect(record.executionSnapshot).not.toHaveProperty('approvalAllowlist')
    expect(record.executionSnapshot).not.toHaveProperty('approvalPolicy')
  })

  it('still rejects unknown snapshot fields', () => {
    expect(() => toAutomationOccurrenceRecord(row({ ...snapshot, unexpected: true }))).toThrow()
  })
})
