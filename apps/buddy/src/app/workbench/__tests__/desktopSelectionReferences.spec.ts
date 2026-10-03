import type { TaskWorkspacePool } from '../TaskWorkspacePool'
import type { TaskCapability } from '@/modules/tasks'
import type { TaskResourcePanel } from '@/modules/tasks/contracts'
import { browserQuote } from '@buddy-shared/browser/__tests__/browserSelectionFixture'
import { createBuddyUserContent } from '@buddy-shared/conversation/buddyUserContent'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { chatComposerDocumentToUserContent, userContentToChatComposerDocument } from '@/modules/prompt-input'
import { useChatDrafts } from '@/modules/tasks/state/drafts/useChatDrafts'
import { ContributionRegistry } from '@/workbench/services/ContributionRegistry'
import { WorkbenchController } from '@/workbench/services/WorkbenchController'
import { createDesktopSelectionReferences } from '../createDesktopSelectionReferences'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))
async function fixture() {
  const registry = new ContributionRegistry()
  registry.register('test', (scope) => {
    scope.view({ id: 'task', renderer: 'task', label: 'Task', locations: ['main'], multiple: true, supports: resource => resource.scheme === 'task' })
    scope.view({ id: 'file', renderer: 'file', label: 'File', locations: ['context'], multiple: true, supports: resource => resource.scheme === 'file' })
  })
  const controller = new WorkbenchController(registry)
  const a = (await controller.open({ scheme: 'task', id: 'a', data: {} }, 'Same title'))!
  const pane = controller.layout.activePane
  const b = (await controller.open({ scheme: 'task', id: 'b', data: {} }, 'Same title', { paneId: pane, direction: 'right' }))!
  const file = { spaceId: 'space', directoryId: 'directory', revision: 1, path: 'auth.ts' }
  const fileId = (await controller.open({ scheme: 'file', id: 'auth', data: file }, 'auth.ts', { state: { contextTabId: 'files-a' }, focus: false }))!
  const scope = effectScope()
  const keyA = shallowRef('conversation:a:branch-a')
  const keyB = shallowRef('conversation:b:branch-b')
  const draftsA = scope.run(() => useChatDrafts({ targetKey: keyA as never, onChange: () => {} }))!
  const draftsB = scope.run(() => useChatDrafts({ targetKey: keyB as never, onChange: () => {} }))!
  function task(id: string, drafts: typeof draftsA) {
    return { session: { navigationVersion: () => 0 }, workspace: {
      restoration: { state: shallowRef('ready') },
      status: { isClosing: shallowRef(false) },
      execution: { isSending: shallowRef(false), isMutatingBranch: shallowRef(false) },
      session: { currentTitle: shallowRef('Same title'), activeConversationId: shallowRef(id) },
      composer: { draftId: drafts.draftId, editorKey: drafts.editorKey, composerContent: drafts.composerContent, updateComposerContent: drafts.updateComposerContent, target: shallowRef({ kind: 'conversation', conversationId: id, branchId: 'branch' }) },
    } } as unknown as TaskCapability
  }
  const tasks = new Map([['a', task('a', draftsA)], ['b', task('b', draftsB)]])
  const pool = { peek: (resource: { id: string }) => tasks.get(resource.id) } as unknown as TaskWorkspacePool
  let independent = false
  const locateFile = vi.fn(async () => {})
  const openFile = vi.fn(async () => fileId)
  const browserStates = shallowRef({ 'browser-a': { sessionId: 'session', pageId: 'page', documentVersion: 1, url: 'https://example.com/', status: 'ready' } })
  const resources = {
    allTabs: shallowRef([{ id: 'files-a', scope: 'task:a' }, { id: 'browser-a', kind: 'browser', scope: 'task:a' }]),
    activeTab: shallowRef({ id: 'browser-a' }),
    browserStates,
  } as unknown as TaskResourcePanel
  const host = createDesktopSelectionReferences({ controller, pool, language: shallowRef('zh-CN'), resources: () => resources, independent: () => independent, ready: () => true, locateFile, openFile })
  cleanups.push(() => {
    scope.stop()
    void controller.dispose()
  })
  const quote = { id: 'q', text: 'Frozen file text', source: { kind: 'file' as const, title: 'auth.ts', file, format: 'source' as const } }
  return { a, b, fileId, controller, host, quote, resources, browserStates, draftsA, draftsB, tasks, keyA, locateFile, openFile, independent: () => independent = true }
}

describe('desktop file quote adapter', () => {
  it('associates browser tabs with their owning draft, not the focused pane', async () => {
    const f = await fixture()
    f.controller.focus(f.b)
    const request = f.host.capture('browser:browser-a', browserQuote)!
    expect(request.defaultId).toBe(f.a)
    expect(f.host.add(request, f.a)).toBe('added')
    expect(chatComposerDocumentToUserContent(f.draftsB.composerContent.value).resourceQuotes).toBeUndefined()
  })

  it('invalidates browser operations on same-URL document changes and requires independent multi-target choice', async () => {
    const f = await fixture()
    const request = f.host.capture('browser:browser-a', browserQuote)!
    f.browserStates.value['browser-a'] = { ...f.browserStates.value['browser-a'], documentVersion: 2 }
    expect(f.host.add(request, f.a)).toBe('unavailable')
    f.independent()
    expect(f.host.capture('browser:browser-a', browserQuote)?.defaultId).toBeNull()
  })

  it('routes through the owning tab rather than active pane and preserves the selected draft body', async () => {
    const f = await fixture()
    f.draftsA.updateComposerContent('Keep latest A input', userContentToChatComposerDocument(createBuddyUserContent('Keep latest A input')))
    f.controller.focus(f.b)
    const request = f.host.capture(f.fileId, f.quote)!
    expect(request.defaultId).toBe(f.a)
    expect(request.targets.map(target => target.label)).toEqual(['分屏 1 · Same title', '分屏 2 · Same title'])
    expect(f.host.add(request, f.a)).toBe('added')
    expect(f.draftsA.draft.value).toBe('Keep latest A input')
    expect(chatComposerDocumentToUserContent(f.draftsA.composerContent.value).resourceQuotes).toEqual([f.quote])
    expect(chatComposerDocumentToUserContent(f.draftsB.composerContent.value).resourceQuotes).toBeUndefined()
  })

  it('uses the actual layout for split status, not the writable target count', async () => {
    const f = await fixture()
    f.tasks.get('b')!.workspace.execution.isSending = shallowRef(true)
    const request = f.host.capture(f.fileId, f.quote)!
    expect(request.targets).toHaveLength(1)
    expect(request.isSplit).toBe(true)
    await f.controller.close(f.b)
    expect(f.host.capture(f.fileId, f.quote)?.isSplit).toBe(false)
  })

  it('requires an explicit choice in independent mode with multiple inputs', async () => {
    const f = await fixture()
    f.independent()
    expect(f.host.capture(f.fileId, f.quote)?.defaultId).toBeNull()
  })

  it('invalidates a target after branch rebinding', async () => {
    const f = await fixture()
    const request = f.host.capture(f.fileId, f.quote)!
    f.keyA.value = 'conversation:a:other-branch'
    f.tasks.get('a')!.workspace.composer.target = shallowRef({ kind: 'conversation', conversationId: 'a', branchId: 'other-branch' }) as never
    expect(f.host.add(request, f.a)).toBe('unavailable')
  })

  it('rejects navigation away and back even when the same draft is restored', async () => {
    const f = await fixture()
    const request = f.host.capture(f.fileId, f.quote)!
    f.tasks.get('a')!.session.navigationVersion = () => 2
    expect(f.host.add(request, f.a)).toBe('unavailable')
  })

  it('checks existing file authorization before opening a quote source', async () => {
    const f = await fixture()
    f.locateFile.mockRejectedValueOnce(new Error('revoked directory'))
    expect(await f.host.locate(f.quote)).toBe(false)
    expect(f.openFile).not.toHaveBeenCalled()
    expect(await f.host.locate(f.quote)).toBe(true)
    expect(f.locateFile).toHaveBeenCalledWith(f.quote.source.file)
  })
})
