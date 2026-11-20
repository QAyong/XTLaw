import type { DatabaseSync } from 'node:sqlite'
import type { RuntimeRequestHandler } from '../../../../shared/runtime/rpcPeer'
import type { RegisterRunRpcOptions } from '../registerRunRpc'
import { afterEach, describe, expect, it } from 'vitest'
import { runsRpc } from '../../../../shared/runs/runApi'
import { RUN_EVENT_PAGE_LIMITS } from '../../../../shared/runs/runEventPageLimits'
import { RunEventQueries } from '../../events/RunEventQueries'
import { BuddyServiceError } from '../../rpc/runtimeRequest'
import { createConversationArchiveRepository } from '../../storage/conversationArchiveRepository'
import { createConversationRepository } from '../../storage/conversationRepository'
import { openBuddyDatabase } from '../../storage/database'
import { createRunRepository } from '../../storage/runRepository'
import { registerRunRpc } from '../registerRunRpc'

const databases: DatabaseSync[] = []
const now = '2026-11-20T00:00:00.000Z'

afterEach(() => {
  for (const database of databases.splice(0))
    database.close()
})

describe('runs.readEventPage', () => {
  it('pages by event count and payload size without crossing the requested window', async () => {
    const fixture = createFixture()
    fixture.createRun('run-1')
    for (let sequence = 1; sequence <= 101; sequence++)
      fixture.insert('run-1', sequence, 'run.started', {})
    const first = await fixture.read({ afterSequence: 0, throughSequence: 101 })
    expect(first.events).toHaveLength(RUN_EVENT_PAGE_LIMITS.items)
    expect(first.events.map(event => event.sequence)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1))
    expect(first.nextSequence).toBe(100)
    expect(fixture.listOptions[0]).toMatchObject({
      afterSequence: 0,
      throughSequence: 101,
      limit: RUN_EVENT_PAGE_LIMITS.items,
      maxPayloadBytes: RUN_EVENT_PAGE_LIMITS.bytes,
    })
    const last = await fixture.read({ afterSequence: 100, throughSequence: 101 })
    expect(last.events.map(event => event.sequence)).toEqual([101])
    expect(last.nextSequence).toBeNull()

    const bounded = await fixture.read({ afterSequence: 0, throughSequence: 3 })
    expect(bounded.events.map(event => event.sequence)).toEqual([1, 2, 3])
    expect(bounded.nextSequence).toBeNull()
  })

  it('keeps every event across payload-sized pages and always returns one oversized event', async () => {
    const fixture = createFixture()
    fixture.createRun('run-1')
    const text = 'x'.repeat(200_000)
    for (let sequence = 1; sequence <= 4; sequence++)
      fixture.insert('run-1', sequence, 'message.completed', { messageId: 'answer', role: 'assistant', content: { text } })
    const sequences: number[] = []
    let afterSequence = 0
    for (let page = 0; page < 6 && afterSequence < 4; page++) {
      const result = await fixture.read({ afterSequence, throughSequence: 4 })
      expect(result.events.length).toBeGreaterThan(0)
      expect(result.events.length).toBeLessThan(4)
      const bytes = Buffer.byteLength(JSON.stringify(result.events))
      if (result.events.length > 1)
        expect(bytes).toBeLessThanOrEqual(RUN_EVENT_PAGE_LIMITS.bytes)
      sequences.push(...result.events.map(event => event.sequence))
      if (result.nextSequence === null)
        break
      afterSequence = result.nextSequence
    }
    expect(sequences).toEqual([1, 2, 3, 4])
  })

  it('allows an archived conversation and its child run, and rejects deleted or foreign runs before reading events', async () => {
    const fixture = createFixture()
    fixture.createRun('run-1')
    fixture.runs.create({
      id: 'child-run',
      conversationId: 'conversation',
      branchId: 'branch',
      triggeringMessageId: 'input',
      provider: 'fixture',
      model: 'model',
      purpose: 'chat',
      status: 'completed',
      startedAt: now,
      completedAt: now,
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
      piSessionFile: null,
      executionKind: 'actor_child',
      parentRunId: 'run-1',
      rootRunId: 'run-1',
    })
    fixture.createConversation('other')
    fixture.runs.create({
      id: 'foreign-run',
      conversationId: 'other',
      branchId: 'other-branch',
      triggeringMessageId: 'other-input',
      provider: 'fixture',
      model: 'model',
      purpose: 'chat',
      status: 'completed',
      startedAt: now,
      completedAt: now,
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
      piSessionFile: null,
    })
    fixture.insert('child-run', 1, 'run.started', {})
    createConversationArchiveRepository(fixture.database).archive('conversation', now)
    await expect(fixture.read({ runId: 'child-run', afterSequence: 0, throughSequence: 1 })).resolves.toMatchObject({
      events: [{ runId: 'child-run', sequence: 1 }],
      nextSequence: null,
    })
    const readsBeforeRejection = fixture.listOptions.length
    await expect(fixture.read({ runId: 'foreign-run', conversationId: 'conversation', afterSequence: 0, throughSequence: 1 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(fixture.read({ runId: 'missing', afterSequence: 0, throughSequence: 1 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    fixture.conversations.markDeleted('conversation', now)
    await expect(fixture.read({ runId: 'child-run', afterSequence: 0, throughSequence: 1 })).rejects.toBeInstanceOf(BuddyServiceError)
    expect(fixture.listOptions).toHaveLength(readsBeforeRejection)
  })
})

function createFixture() {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  const conversations = createConversationRepository(database)
  const runs = createRunRepository(database)
  const queries = new RunEventQueries(database)
  const listOptions: unknown[] = []
  const handlers = new Map<string, RuntimeRequestHandler>()
  const createConversation = (id: string) => {
    conversations.create({ id, branchId: `${id === 'conversation' ? 'branch' : `${id}-branch`}`, createdAt: now, approvalPolicy: 'policy', executionProfile: 'workspace_write', spaceId: null, title: id })
    conversations.createMessage({ id: id === 'conversation' ? 'input' : `${id}-input`, conversationId: id, branchId: id === 'conversation' ? 'branch' : `${id}-branch`, role: 'user', runId: null, createdAt: now, content: { text: id } })
  }
  createConversation('conversation')
  registerRunRpc({
    statistics: {
      metrics: () => {
        throw new Error('unused')
      },
      status: () => {
        throw new Error('unused')
      },
    } as RegisterRunRpcOptions['statistics'],
    isConversationReadable: id => conversations.findById(id)?.deletedAt === null,
    isBusy: () => false,
    eventLog: {
      list: (runId, options) => {
        listOptions.push(options)
        return Promise.resolve(queries.list(runId, options))
      },
      listForConversation: () => [],
      verifyRun: async () => {},
    },
    inputs: { findByRunId: () => null },
    repository: runs,
    rpc: { onRequest(method, handler) {
      handlers.set(method, handler)
      return () => handlers.delete(method)
    } },
  })
  const insert = database.prepare('INSERT INTO run_events (run_id, sequence, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)')
  return {
    conversations,
    database,
    listOptions,
    runs,
    createConversation,
    createRun(id: string, conversationId = 'conversation') {
      const branchId = conversationId === 'conversation' ? 'branch' : `${conversationId}-branch`
      runs.create({
        id,
        conversationId,
        branchId,
        triggeringMessageId: conversationId === 'conversation' ? 'input' : `${conversationId}-input`,
        provider: 'fixture',
        model: 'model',
        purpose: 'chat',
        status: 'completed',
        startedAt: now,
        completedAt: now,
        approvalPolicy: 'policy',
        executionProfile: 'workspace_write',
        piSessionFile: null,
      })
    },
    insert(runId: string, sequence: number, type: string, payload: unknown) {
      insert.run(runId, sequence, type, JSON.stringify(payload), now)
    },
    read(input: { conversationId?: string, runId?: string, afterSequence: number, throughSequence: number }) {
      const handler = handlers.get(runsRpc.readEventPage.method)
      if (!handler)
        throw new Error('missing readEventPage')
      return handler({
        conversationId: input.conversationId ?? 'conversation',
        runId: input.runId ?? 'run-1',
        afterSequence: input.afterSequence,
        throughSequence: input.throughSequence,
      }) as Promise<{ events: Array<{ runId: string, sequence: number }>, nextSequence: number | null }>
    },
  }
}
