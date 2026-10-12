import type { DatabaseSync } from 'node:sqlite'
import type { PrepareTurnRequestInput } from '../turnRequestRepository'
import { afterEach, describe, expect, it } from 'vitest'
import { createBuddyUserContent } from '../../../../shared/conversation/buddyUserContent'
import { createComposerDraftRepository } from '../composerDraftRepository'
import { openBuddyDatabase } from '../database'
import { createRunInputRepository } from '../runInputRepository'
import { createTurnRequestRepository } from '../turnRequestRepository'

const databases: DatabaseSync[] = []
afterEach(() => databases.splice(0).forEach(database => database.close()))

function prepareRun() {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  const drafts = createComposerDraftRepository(database)
  drafts.open({ draftId: 'draft', scope: { kind: 'global' }, initialContent: createBuddyUserContent('initial'), initialModelSelection: null, initialExecutionConfig: { approvalPolicy: 'policy', executionProfile: 'workspace_write' }, now: '2026-09-10T00:00:00.000Z' })
  const input: PrepareTurnRequestInput = {
    approvalPolicy: 'policy',
    executionProfile: 'workspace_write',
    attachmentBindings: [],
    branchId: 'branch',
    conversationId: 'conversation',
    createdAt: '2026-09-10T00:00:01.000Z',
    draft: { draftId: 'draft', expectedRevision: drafts.findById('draft')!.revision },
    model: 'model',
    provider: 'provider',
    requestId: 'request',
    requestFingerprint: 'fingerprint',
    runInput: { attachmentIds: [], contextItems: [{ kind: 'file', value: '/tmp/a.txt' }], prompt: 'prompt', reasoning: null, serviceTier: null },
    runId: 'run',
    spaceId: null,
    title: 'run input',
    userMessageContent: { userContent: createBuddyUserContent('prompt'), resourceSnapshots: [] },
    userMessageId: 'message',
  }
  createTurnRequestRepository(database).prepare(input)
  return database
}

describe('run input repository', () => {
  it('keeps rows readable that still carry retired session reference context items', () => {
    const database = prepareRun()
    const legacy = [
      { kind: 'file', value: '/tmp/a.txt' },
      { kind: 'sessionReference', value: 'source-session', title: 'Earlier task' },
    ]
    database.prepare('UPDATE run_inputs SET context_items_json = ? WHERE run_id = ?').run(JSON.stringify(legacy), 'run')

    expect(createRunInputRepository(database).findByRunId('run')?.contextItems).toEqual([{ kind: 'file', value: '/tmp/a.txt' }])
  })

  it('still rejects unknown context item kinds', () => {
    const database = prepareRun()
    database.prepare('UPDATE run_inputs SET context_items_json = ? WHERE run_id = ?').run(JSON.stringify([{ kind: 'unknown', value: 'x' }]), 'run')

    expect(() => createRunInputRepository(database).findByRunId('run')).toThrow()
  })
})
