import type { LocalConversation } from '@buddy-shared/conversation/conversationApi'
import { deferred } from '@buddy-tests/deferred'
import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { useChatConversations } from '../useChatConversations'
import { useChatSession } from '../useChatSession'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
function conversation(id: string): LocalConversation {
  return {
    buddyId: 'default',
    id,
    activeBranchId: `branch-${id}`,
    createdAt: '2026-09-08T00:00:00.000Z',
    deletedAt: null,
    archivedAt: null,
    approvalPolicy: 'policy',
    executionProfile: 'workspace_write',
    modelSelection: null,
    spaceId: null,
    title: id,
    updatedAt: '2026-09-08T00:00:00.000Z',
  }
}
function fixture(initialConversation?: LocalConversation) {
  const scope = effectScope()
  scopes.push(scope)
  const session = useChatSession()
  if (initialConversation)
    session.activateConversation(initialConversation)
  const lookup = deferred<LocalConversation>()
  const errors: unknown[] = []
  const persisted: (string | null)[] = []
  const conversations = shallowRef([{ ...conversation('indexed'), activity: 'idle' as const, automationOccurrence: null }])
  const owner = scope.run(() => useChatConversations({
    initialConversation,
    api: { conversations: { get: () => lookup.promise, listBranches: async () => [], listMessages: async () => ({ items: [], nextCursor: null }) } },
    session,
    taskIndexData: { conversations, applyConversation() {}, refreshIndex: async () => {} },
    clearError() {},
    onError: error => errors.push(error),
    persistWorkspaceState: async () => {
      persisted.push(session.activeConversationId.value)
      return true
    },
    runSync: { clearConversationState() {}, refreshActiveConversation: async () => {} },
    restoreConversationModelSelection() {},
    selectDefaultModel() {},
  }))!
  return { conversations, errors, lookup, owner, persisted, scope, session }
}

describe('task selection ownership', () => {
  it('retains an explicitly opened archived task without adding it to ordinary history', () => {
    const archived = { ...conversation('archived'), archivedAt: '2026-11-01T00:00:00.000Z' }
    const f = fixture(archived)
    expect(f.owner.activeConversation.value).toEqual(archived)
    expect(f.conversations.value.map(item => item.id)).toEqual(['indexed'])
    f.owner.applyConversation({ ...archived, archivedAt: null })
    expect(f.owner.activeConversation.value?.archivedAt).toBeNull()
  })

  it('keeps an archived open task available after normal history drops it from the index', async () => {
    const f = fixture()
    await f.owner.openConversation('indexed')
    const archived = { ...conversation('indexed'), archivedAt: '2026-11-01T00:00:00.000Z' }
    f.owner.applyConversation(archived)
    expect(f.owner.activeConversation.value?.archivedAt).toBe(archived.archivedAt)
    f.conversations.value = []
    expect(f.owner.activeConversation.value?.archivedAt).toBe(archived.archivedAt)
  })

  it('does not activate a looked-up task after a later indexed selection', async () => {
    const f = fixture()
    const old = f.owner.openConversation('old')
    await f.owner.openConversation('indexed')
    f.lookup.resolve(conversation('old'))
    await old
    expect(f.session.activeConversationId.value).toBe('indexed')
    expect(f.persisted).toEqual(['indexed'])
  })

  it.each(['abort', 'draft', 'dispose'])('discards an unlisted task after %s', async (operation) => {
    const f = fixture()
    const controller = new AbortController()
    const opening = f.owner.openConversation('old', controller.signal)
    if (operation === 'abort')
      controller.abort()
    else if (operation === 'draft')
      await f.owner.activateGlobalDraft()
    else
      f.scope.stop()
    f.lookup.resolve(conversation('old'))
    await opening
    expect(f.session.activeConversationId.value).toBeNull()
    expect(f.persisted).not.toContain('old')
    expect(f.errors).toEqual([])
  })

  it('does not surface an old lookup error in the newly selected task', async () => {
    const f = fixture()
    const old = f.owner.openConversation('old')
    await f.owner.openConversation('indexed')
    f.lookup.reject(new Error('old task is unavailable'))
    await old
    expect(f.session.activeConversationId.value).toBe('indexed')
    expect(f.errors).toEqual([])
  })
})
