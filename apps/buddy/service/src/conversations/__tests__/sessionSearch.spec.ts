import type { Api, AssistantMessage, Model, ToolCall } from '@earendil-works/pi-ai'
import type { DatabaseSync } from 'node:sqlite'
import type { BuddyInputReferenceStore } from '../../agent/context/BuddyInputReference'
import type { PrepareTurnRequestInput } from '../../storage/turnRequestRepository'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAssistantMessageEventStream, getCurrentTools, InMemoryCredentialStore } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { Check } from 'typebox/value'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBuddyUserContent } from '../../../../shared/conversation/buddyUserContent'
import { createBuddyInputReference, createBuddyInputReferenceMessage } from '../../agent/context/BuddyInputReference'
import { SessionToolCapabilities } from '../../agent/extensions/discovery/SessionToolCapabilities'
import { createToolDiscoveryCapability } from '../../agent/extensions/discovery/toolDiscoveryExtension'
import { createInputReferenceExtension } from '../../agent/extensions/inputReferenceExtension'
import { createIsolatedBuddySession } from '../../agent/sessions/__tests__/isolatedBuddySession'
import { ArtifactService } from '../../artifacts/ArtifactService'
import { createArtifactRepository } from '../../storage/artifactRepository'
import { createAttachmentRepository } from '../../storage/attachmentRepository'
import { createChatQueueRepository } from '../../storage/chatQueueRepository'
import { createComposerDraftRepository } from '../../storage/composerDraftRepository'
import { createConversationRepository } from '../../storage/conversationRepository'
import { createConversationTreeRepository } from '../../storage/conversationTreeRepository'
import { openBuddyDatabase } from '../../storage/database'
import { createRunInputRepository } from '../../storage/runInputRepository'
import { createSpaceRepository } from '../../storage/spaceRepository'
import { createTurnRequestRepository } from '../../storage/turnRequestRepository'
import { searchConversationHistory } from '../searchConversationHistory'
import { createSessionReferenceCapability } from '../sessionReferenceExtension'
import { SESSION_READ_TOOL, SESSION_SEARCH_TOOL, sessionSearchParameters } from '../sessionReferenceToolContract'

const databases: DatabaseSync[] = []
const roots: string[] = []
afterEach(async () => {
  databases.splice(0).forEach(database => database.close())
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function fixture() {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  const conversations = createConversationRepository(database)
  function session(id: string, spaceId: string | null = null) {
    return conversations.create({ id, branchId: `${id}-branch`, title: id, spaceId, approvalPolicy: 'policy', executionProfile: 'read_only', createdAt: '2026-01-01T00:00:00.000Z' })
  }
  let sequence = 0
  function message(id: string, text: string, branchId = `${id}-branch`) {
    sequence += 1
    return conversations.createMessage({ id: `message-${sequence}`, conversationId: id, branchId, role: 'assistant', runId: null, content: { text }, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)).toISOString() })
  }
  return { database, conversations, session, message }
}

function response(model: Model<Api>, call?: { name: string, arguments: ToolCall['arguments'] }) {
  const message: AssistantMessage = {
    api: model.api,
    model: model.id,
    provider: model.provider,
    role: 'assistant',
    timestamp: Date.now(),
    stopReason: call ? 'toolUse' : 'stop',
    content: call ? [{ ...call, type: 'toolCall', id: `call-${crypto.randomUUID()}` }] : [{ type: 'text', text: 'Done' }],
    usage: { input: 10, output: 10, totalTokens: 20, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  }
  const stream = createAssistantMessageEventStream()
  queueMicrotask(() => stream.push({ type: 'done', reason: call ? 'toolUse' : 'stop', message }))
  return stream
}

describe('message-bound session retrieval', () => {
  it.each(['followUp', 'steer'] as const)('discovers references delivered with %s into the same run and keeps them for later messages in real Pi', async (delivery) => {
    const f = fixture()
    for (const id of ['source-a', 'source-b', 'unreferenced'])
      f.session(id)
    for (let index = 0; index < 15; index++)
      f.message('source-a', 'needle first session')
    const longMessage = f.message('source-b', `${'Long introduction. '.repeat(1400)}needle final decision: green`)
    f.message('unreferenced', 'SECRET_SHOULD_NOT_BE_READ')
    const drafts = createComposerDraftRepository(f.database)
    drafts.open({ draftId: 'draft', scope: { kind: 'global' }, initialContent: createBuddyUserContent(), initialModelSelection: null, initialExecutionConfig: { approvalPolicy: 'policy', executionProfile: 'read_only' }, now: '2026-01-02T00:00:00.000Z' })
    const input = (id: string, references: string[]): PrepareTurnRequestInput => ({
      approvalPolicy: 'policy',
      executionProfile: 'read_only',
      attachmentBindings: [],
      branchId: 'current-branch',
      conversationId: 'current',
      createdAt: '2026-01-02T00:00:01.000Z',
      draft: { draftId: 'draft', expectedRevision: drafts.findById('draft')!.revision },
      model: 'test',
      provider: 'test',
      requestId: `request-${id}`,
      requestFingerprint: id,
      runInput: { attachmentIds: [], contextItems: [], prompt: id, reasoning: null, serviceTier: null },
      runId: `run-${id}`,
      spaceId: null,
      title: 'current',
      userMessageId: id,
      userMessageContent: { resourceSnapshots: [], userContent: { ...createBuddyUserContent(id), sessionReferences: references.map(id => ({ id, title: id })) } },
    })
    createTurnRequestRepository(f.database).prepare(input('initial', []))
    f.database.exec('UPDATE runs SET status = \'running\'')
    const capability = createSessionReferenceCapability({ conversationId: 'current', conversations: f.conversations, attachments: createAttachmentRepository(f.database), artifacts: new ArtifactService({ repository: createArtifactRepository(f.database) }), publications: createConversationTreeRepository(f.database) })
    const root = await realpath(await mkdtemp(join(tmpdir(), 'buddy-session-search-')))
    roots.push(root)
    const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false })
    const model = runtime.getModels()[0]!
    await runtime.setRuntimeApiKey(model.provider, 'offline-test-only')
    const store: BuddyInputReferenceStore = { pending: null }
    let phase = 'initial'
    let request = 0
    const seen: { phase: string, names: string[], catalog: string }[] = []
    const created = await createIsolatedBuddySession({
      agentDir: join(root, 'agent'),
      canonicalRoot: root,
      cwd: root,
      conversationId: 'current',
      branchId: 'current-branch',
      conversationsDirectory: join(root, 'conversations'),
      approvalPolicy: 'policy',
      executionProfile: 'read_only',
      model,
      modelRuntime: runtime,
      resources: { skillReadRoots: [], skillReferences: [], approvedSkills: [], context: { agentsFiles: [], diagnostics: [] }, directoryContext: '', revision: 'empty' },
      inProcessExtensions: [createInputReferenceExtension(store), capability.extension, createToolDiscoveryCapability(capability.disclosure ?? [], new SessionToolCapabilities([])).extension],
    })
    vi.spyOn(runtime, 'streamSimple').mockImplementation((model, context) => {
      request += 1
      const tools = getCurrentTools(context.messages)
      seen.push({ phase, names: tools.map(tool => tool.name), catalog: tools.find(tool => tool.name === 'lexora_tool_search')?.description ?? '' })
      if (request === 1)
        return response(model, { name: 'lexora_tool_search', arguments: { toolNames: [SESSION_SEARCH_TOOL, SESSION_READ_TOOL] } })
      if (phase === 'referenced' && request === 2)
        return response(model, { name: SESSION_SEARCH_TOOL, arguments: { sessionId: 'source-b', query: 'needle', kind: 'all', messageOffset: 0, resourceOffset: 0 } })
      if (phase === 'referenced' && request === 3)
        return response(model, { name: SESSION_READ_TOOL, arguments: { sessionId: 'source-b', source: { kind: 'message', messageId: longMessage.id }, offset: 16000 } })
      if (phase === 'referenced' && request === 4)
        return response(model, { name: SESSION_READ_TOOL, arguments: { sessionId: 'unreferenced', source: { kind: 'message', messageId: longMessage.id } } })
      if (phase === 'cleared' && request === 2)
        return response(model, { name: SESSION_SEARCH_TOOL, arguments: { sessionId: 'source-b', query: 'needle' } })
      if (phase === 'new-prompt' && request === 2)
        return response(model, { name: SESSION_SEARCH_TOOL, arguments: { sessionId: 'source-a', query: 'needle' } })
      if (phase === 'new-prompt' && request === 3)
        return response(model, { name: SESSION_SEARCH_TOOL, arguments: { sessionId: 'unreferenced', query: 'SECRET' } })
      if (phase === 'referenced' && request === 5) {
        deliver('no-refs', [])
        created.session.agent[delivery](createBuddyInputReferenceMessage(createBuddyInputReference({ messageId: 'no-refs', prompt: 'no-refs', images: [] }), Date.now()))
        phase = 'cleared'
        request = 0
      }
      else if (phase === 'initial' && request === 2) {
        deliver('queued', ['source-a', 'source-b'])
        created.session.agent[delivery](createBuddyInputReferenceMessage(createBuddyInputReference({ messageId: 'queued', prompt: 'queued', images: [] }), Date.now()))
        phase = 'referenced'
        request = 0
      }
      return response(model)
    })
    async function prompt(id: string) {
      request = 0
      store.pending = createBuddyInputReference({ messageId: id, prompt: id, images: [] })
      await created.session.prompt(id)
    }
    const queue = createChatQueueRepository(f.database)
    function deliver(id: string, references: string[]) {
      queue.enqueue(input(id, references))
      queue.commitInRun(queue.pending({ conversationId: 'current', branchId: 'current-branch', id })!, 'run-initial', undefined)
    }
    try {
      await prompt('initial')
      expect(createRunInputRepository(f.database).findByRunId('run-initial')?.prompt).toBe('initial')
      const history = JSON.stringify(created.session.messages)
      expect(history).toContain('needle final decision: green')
      expect(history).toContain('SESSION_REFERENCE_NOT_AUTHORIZED')
      expect(history).toContain('totalCharacters')
      expect(history).toContain('nextOffset')
      expect(history).not.toContain('SECRET_SHOULD_NOT_BE_READ')
      phase = 'new-prompt'
      deliver('next', [])
      await prompt('next')
      expect(seen.filter(entry => entry.phase === 'initial').some(entry => entry.names.includes(SESSION_SEARCH_TOOL))).toBe(false)
      for (const later of ['referenced', 'cleared', 'new-prompt'])
        expect(seen.filter(entry => entry.phase === later).some(entry => entry.names.includes(SESSION_SEARCH_TOOL))).toBe(true)
      const searches = created.session.messages.flatMap(message => message.role === 'toolResult' && message.toolName === 'lexora_tool_search' ? [message] : [])
      expect(searches.map(message => JSON.parse(message.content.find(block => block.type === 'text')!.text).tools.length)).toEqual([0, 2, 2, 2])
      const sessionSearches = created.session.messages.flatMap(message => message.role === 'toolResult' && message.toolName === SESSION_SEARCH_TOOL ? [message] : [])
      expect(sessionSearches.map(message => message.isError)).toEqual([false, false, false, true])
      const text = (message: (typeof sessionSearches)[number]) => message.content.map(block => block.type === 'text' ? block.text : '').join('')
      expect(text(sessionSearches[1]!)).toContain('needle final decision: green')
      expect(text(sessionSearches[2]!)).toContain('needle first session')
      expect(text(sessionSearches[3]!)).toContain('SESSION_REFERENCE_NOT_AUTHORIZED')
    }
    finally { await created.shutdown('quit') }
  })

  it('finds older reference candidates by space and title beyond the recent task index', () => {
    const f = fixture()
    createSpaceRepository(f.database).create({ id: 'space', name: 'Workspace', memoryScope: 'space_only', primaryDirectory: null, additionalDirectories: [], createdAt: '2026-01-01T00:00:00.000Z' })
    f.session('old_100%', 'space')
    f.session('no-space')
    f.session('deleted', 'space')
    f.conversations.markDeleted('deleted', '2026-02-01T00:00:00.000Z')
    for (let index = 0; index < 120; index++)
      f.session(`recent-${index}`)
    f.database.prepare('UPDATE conversations SET updated_at = ? WHERE id LIKE \'recent-%\'').run('2026-02-01T00:00:00.000Z')
    expect(f.conversations.listRecent().some(task => task.id === 'old_100%')).toBe(false)
    expect(f.conversations.listRecent(101, { spaceId: 'space', query: '100%' }).map(task => task.id)).toEqual(['old_100%'])
    expect(f.conversations.listRecent(101, { spaceId: null, query: 'old' })).toEqual([])
    expect(f.conversations.listRecent(101, { spaceId: null, query: 'no-space', excludeConversationId: 'no-space' })).toEqual([])
    expect(f.conversations.listRecent(101, { spaceId: 'space' }).map(task => task.id)).toEqual(['old_100%'])
  })

  it('searches only the active branch and includes the matching region of long messages', async () => {
    const f = fixture()
    f.session('source')
    const shared = f.message('source', 'Shared prefix')
    f.message('source', 'needle abandoned branch')
    f.conversations.createBranch({ id: 'fork', conversationId: 'source', parentBranchId: 'source-branch', forkedFromMessageId: shared.id, createdAt: '2026-02-01T00:00:00.000Z', activate: true })
    f.message('source', `${'intro '.repeat(1000)}needle retained branch`, 'fork')
    const result = await searchConversationHistory(f.conversations, f.conversations.findById('source')!, { query: 'needle' })
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.excerpt).toContain('needle retained branch')
    expect(result.matches[0]?.excerpt.length).toBeLessThanOrEqual(1602)
    expect(result.branchId).toBe('fork')
  })

  it('continues through every matching message without dropping overflow results', async () => {
    const f = fixture()
    const target = f.session('source')
    const ids = Array.from({ length: 21 }, (_, index) => f.message('source', `needle ${index}`).id)
    const found: string[] = []
    let messageOffset: number | undefined
    do {
      const result = await searchConversationHistory(f.conversations, target, { query: 'needle', messageOffset })
      expect(result.matches.length).toBeLessThanOrEqual(8)
      found.push(...result.matches.map(match => match.messageId))
      messageOffset = result.nextMessageOffset ?? undefined
    } while (messageOffset !== undefined)
    expect(found).toEqual(ids.toReversed())
  })

  it('treats the first-page offset as optional and ends cleanly past the history', async () => {
    const f = fixture()
    const target = f.session('source')
    const ids = Array.from({ length: 8 }, (_, index) => f.message('source', `needle ${index}`).id)
    const omitted = await searchConversationHistory(f.conversations, target, { query: 'needle' })
    const zero = await searchConversationHistory(f.conversations, target, { query: 'needle', messageOffset: 0 })
    expect(zero).toEqual(omitted)
    expect(omitted.matches.map(match => match.messageId)).toEqual(ids.toReversed())
    expect(omitted.nextMessageOffset).toBeNull()
    for (const messageOffset of [8, 9, 1000, Number.MAX_SAFE_INTEGER]) {
      const past = await searchConversationHistory(f.conversations, target, { query: 'needle', messageOffset })
      expect(past).toMatchObject({ matches: [], scanned: 0, nextMessageOffset: null })
    }
  })

  it('keeps the continuation offset exact when the page is full mid-history', async () => {
    const f = fixture()
    const target = f.session('source')
    f.message('source', 'needle oldest')
    for (let index = 0; index < 60; index++)
      f.message('source', `other ${index}`)
    const newest = Array.from({ length: 8 }, (_, index) => f.message('source', `needle new ${index}`).id)
    const first = await searchConversationHistory(f.conversations, target, { query: 'needle' })
    expect(first.matches.map(match => match.messageId)).toEqual(newest.toReversed())
    expect(first.nextMessageOffset).toBe(8)
    const second = await searchConversationHistory(f.conversations, target, { query: 'needle', messageOffset: first.nextMessageOffset! })
    expect(second.matches.map(match => match.excerpt)).toEqual(['needle oldest'])
    expect(second.nextMessageOffset).toBeNull()
  })

  it('accepts every optional field filled with its neutral value and no longer takes a message ID cursor', () => {
    const filled = { sessionId: 'source', query: 'needle', kind: 'all', messageOffset: 0, resourceOffset: 0 }
    expect(Check(sessionSearchParameters, filled)).toBe(true)
    expect(Check(sessionSearchParameters, { sessionId: 'source' })).toBe(true)
    expect(Check(sessionSearchParameters, { ...filled, beforeMessageId: '0' })).toBe(false)
    expect(Check(sessionSearchParameters, { ...filled, messageOffset: -1 })).toBe(false)
  })

  it('continues beyond the bounded scan and fails after deletion or cancellation', async () => {
    const f = fixture()
    const target = f.session('source')
    f.message('source', 'needle oldest')
    for (let index = 0; index < 505; index++)
      f.message('source', `other ${index}`)
    const first = await searchConversationHistory(f.conversations, target, { query: 'needle' })
    expect(first).toMatchObject({ scanned: 500, matches: [], nextMessageOffset: 500 })
    const next = await searchConversationHistory(f.conversations, target, { query: 'needle', messageOffset: first.nextMessageOffset! })
    expect(next.matches[0]?.excerpt).toBe('needle oldest')
    expect(next.nextMessageOffset).toBeNull()
    const abort = new AbortController()
    abort.abort()
    await expect(searchConversationHistory(f.conversations, target, {}, abort.signal)).rejects.toThrow()
    f.conversations.markDeleted(target.id, '2026-02-01T00:00:00.000Z')
    await expect(searchConversationHistory(f.conversations, target, {})).rejects.toThrow('SESSION_REFERENCE_UNAVAILABLE')
  })
})
