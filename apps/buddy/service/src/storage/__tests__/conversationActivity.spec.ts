import type { DatabaseSync } from 'node:sqlite'
import type { ConversationHistoryQuery } from '../../../../shared/conversation/conversationHistoryApi'
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it } from 'vitest'
import { createConversationRepository } from '../conversationRepository'
import { openBuddyDatabase } from '../database'
import { createRunRepository } from '../runRepository'

const databases: DatabaseSync[] = []
const time = (minute: number) => new Date(Date.UTC(2026, 10, 1, 0, minute)).toISOString()
afterEach(() => databases.splice(0).forEach(database => database.close()))

function fixture() {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  const conversations = createConversationRepository(database)
  const runs = createRunRepository(database)
  for (const id of ['old', 'new']) {
    conversations.create({
      id,
      branchId: `branch-${id}`,
      title: `task ${id}`,
      spaceId: null,
      createdAt: time(id === 'old' ? 0 : 10),
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
    })
  }
  function run(id: string, executionKind: 'root' | 'actor_child' | 'npc_child' | 'maintenance' = 'root') {
    return runs.create({
      id,
      conversationId: 'old',
      branchId: 'branch-old',
      triggeringMessageId: 'input',
      startedAt: time(1),
      status: 'running',
      purpose: executionKind === 'maintenance' ? 'conversation.compaction' : 'chat',
      executionKind,
      rootRunId: executionKind === 'root' ? id : 'root',
      parentRunId: executionKind === 'root' ? null : 'root',
      provider: 'fixture',
      model: 'fixture',
      piSessionFile: null,
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
    })
  }
  run('root')
  function message(id: string, minute: number, content: unknown = { text: id }, role: 'user' | 'assistant' = 'user', runId: string | null = null, conversationId = 'old') {
    conversations.createMessage({ id, conversationId, branchId: `branch-${conversationId}`, runId, role, content, createdAt: time(minute) })
  }
  let sequence = 0
  function mailbox(id: string, minute: number, payload: Record<string, unknown>, source = 'root', target = source) {
    database.prepare(`INSERT INTO execution_mailbox_sources (id, source_run_id, source_sequence, target_run_id, target_generation, payload_json, payload_hash, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?)`).run(id, source, ++sequence, target, JSON.stringify(payload), id, time(minute))
  }
  function activity() {
    const task = conversations.getHistoryEntries(['old'])[0]!.conversation
    const listed = conversations.listHistory({ kind: 'search', query: task.title! }).items.find(item => item.conversation.id === task.id)
    expect(listed?.conversation.lastActivityAt).toBe(task.lastActivityAt)
    return task.lastActivityAt
  }
  return { database, conversations, runs, run, message, mailbox, activity }
}

describe('conversation activity time', () => {
  it.each(['completed', 'cancelled'] as const)('orders %s by the root terminal fact without rewriting metadata', (status) => {
    const f = fixture()
    f.message('input', 1)
    f.database.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(time(50), 'new')
    f.runs.reconcileTerminal('root', status, time(20), status === 'completed' ? null : 'RUN_CANCELLED')
    expect(f.activity()).toBe(time(20))
    expect(f.conversations.listRecent().map(task => task.id)).toEqual(['old', 'new'])
    const first = f.conversations.listHistory({ kind: 'search', query: 'task', limit: 1 })
    expect(first.items[0]?.conversation).toMatchObject({ id: 'old', lastActivityAt: time(20), updatedAt: time(0) })
    const second = f.conversations.listHistory({ kind: 'search', query: 'task', limit: 1, cursor: first.nextCursor! })
    expect(second.items.map(item => item.conversation.id)).toEqual(['new'])
    expect(second.nextCursor).toBeNull()
  })

  it('uses input acceptance, not metadata edits, replies, queued dispatch or compaction', () => {
    const f = fixture()
    f.message('input', 2)
    f.database.prepare(`INSERT INTO chat_queue (id, conversation_id, branch_id, request_id, request_fingerprint, prepared_json, state, created_at)
      VALUES ('queue', 'old', 'branch-old', 'request', 'fingerprint', ?, 'waiting', ?)`).run(JSON.stringify({ userMessageId: 'queued-input' }), time(12))
    expect(f.activity()).toBe(time(12))
    f.message('queued-input', 30)
    f.database.prepare('UPDATE chat_queue SET state = \'sent\', run_id = \'root\' WHERE id = \'queue\'').run()
    f.message('reply', 40, { text: 'reply' }, 'assistant', 'root')
    f.database.prepare('UPDATE conversations SET updated_at = ?, title = \'Renamed\' WHERE id = \'old\'').run(time(50))
    for (const kind of ['actor_child', 'npc_child', 'maintenance'] as const) {
      f.run(kind, kind)
      f.runs.reconcileTerminal(kind, 'completed', time(55), null)
    }
    expect(f.activity()).toBe(time(12))
    f.message('supplement', 45)
    f.runs.reconcileTerminal('root', 'completed', time(35), null)
    expect(f.activity()).toBe(time(45))
  })

  it('keeps durable human supplements and user answers but excludes internal delivery', () => {
    const f = fixture()
    f.run('child', 'npc_child')
    f.mailbox('internal', 20, { kind: 'supplement', text: 'progress' }, 'child', 'root')
    expect(f.activity()).toBe(time(0))
    f.mailbox('human', 12, { kind: 'supplement', origin: 'user' }, 'child')
    expect(f.activity()).toBe(time(12))
    f.database.prepare('UPDATE runs SET generation = generation + 1 WHERE id = \'child\'').run()
    f.message('forwarded', 3)
    f.mailbox('forwarded', 30, { kind: 'supplement', origin: 'user' }, 'child')
    expect(f.activity()).toBe(time(12))
    f.mailbox('question', 40, { kind: 'question', audience: 'user', questionId: 'legacy' }, 'child', 'root')
    f.mailbox('answer', 15, { kind: 'answer', questionId: 'legacy' }, 'child')
    expect(f.activity()).toBe(time(15))
  })

  it('uses the submitted answer time rather than retry delivery or automatic continuation', () => {
    const f = fixture()
    f.database.prepare('INSERT INTO user_questions (id, run_id, tool_call_id, request_json) VALUES (?, ?, ?, ?)')
      .run('question', 'root', 'ask', JSON.stringify({ status: 'answered', resolvedAt: time(15) }))
    f.mailbox('answer-delivery', 20, { kind: 'supplement', origin: 'user', purpose: 'question_answer' })
    f.message('continued', 25, { userContent: { text: 'answer' }, questionReply: { requestId: 'question' } })
    expect(f.activity()).toBe(time(15))
  })

  it('keeps same-timestamp pages and archive filters stable, and rejects version 1 cursors', () => {
    const f = fixture()
    f.database.prepare('UPDATE conversations SET created_at = ?').run(time(0))
    f.message('old-input', 30)
    f.message('new-input', 30, { text: 'new' }, 'user', null, 'new')
    const query = { kind: 'search', query: 'task', limit: 1 } as const satisfies ConversationHistoryQuery
    const first = f.conversations.listHistory(query)
    const second = f.conversations.listHistory({ ...query, cursor: first.nextCursor! })
    expect(first.items.map(item => item.conversation.id)).toEqual(['old'])
    expect(second.items.map(item => item.conversation.id)).toEqual(['new'])
    expect(second.nextCursor).toBeNull()
    expect(first.items[0]?.conversation.lastActivityAt).toBe(time(30))
    expect(second.items[0]?.conversation.lastActivityAt).toBe(time(30))

    const legacy = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString()), version: 1 })).toString('base64url')
    expect(() => f.conversations.listHistory({ ...query, cursor: legacy })).toThrowError(expect.objectContaining({ code: 'VALIDATION_FAILED' }))

    f.database.prepare('UPDATE conversations SET archived_at = ? WHERE id = ?').run(time(40), 'old')
    expect(f.conversations.listRecent().map(task => task.id)).toEqual(['new'])
    expect(f.conversations.listHistory({ kind: 'search', query: 'task' }).items.map(item => item.conversation.id)).toEqual(['new'])
    expect(f.conversations.listHistory({ kind: 'ordinary', spaceId: 'missing' }).items).toEqual([])
  })
})
