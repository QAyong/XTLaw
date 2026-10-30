import type { DesktopBrowserApi } from '@buddy-shared/browser/browserDesktopApi'
import type { BuddyViewQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { TaskWorkspacePool } from '../TaskWorkspacePool'
import type { TaskCapability } from '@/modules/tasks'
import type { TaskResourcePanel } from '@/modules/tasks/contracts'
import { artifactQuote, selectionArtifact } from '@buddy-shared/artifacts/__tests__/artifactSelectionFixture'
import { browserQuote } from '@buddy-shared/browser/__tests__/browserSelectionFixture'
import { createBuddyUserContent } from '@buddy-shared/conversation/buddyUserContent'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
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
  const browserStates = shallowRef({ 'browser-a': { sessionId: browserQuote.source.sessionId, pageId: browserQuote.source.pageId, documentVersion: browserQuote.source.documentVersion, url: browserQuote.source.url, status: 'ready' } })
  // Any other tab of the same task: where the panel is when a locate runs, and what a locate leaves selected on failure.
  const otherTab = { id: 'files-b', kind: 'files' as const, scope: 'task:a' }
  const browserTab = { id: 'browser-a', kind: 'browser' as const, scope: 'task:a' }
  const allTabs = shallowRef([{ id: 'files-a', scope: 'task:a' }, browserTab, otherTab])
  const visibleTabs = shallowRef<(typeof otherTab | typeof browserTab)[]>([otherTab])
  const activeTab = shallowRef({ id: 'browser-a' })
  const selectTab = vi.fn((id: string) => activeTab.value = { id })
  let version = 0
  const reveal = vi.fn(async () => true)
  const pluginReveal = vi.fn(async () => true)
  const selectionScope = shallowRef('task:a')
  const resources = { allTabs, tabs: visibleTabs, activeTab, browserStates, selectTab, selectionScope, isOpen: shallowRef(true), findArtifact: () => selectionArtifact, openArtifact: async () => activeTab.value = otherTab } as unknown as TaskResourcePanel
  let ready = true
  const locateElement = vi.fn(async () => true)
  const browser = { locateElement } as unknown as DesktopBrowserApi
  const host = scope.run(() => createDesktopSelectionReferences({ controller, pool, documents: { isQuotable: () => true }, language: shallowRef('zh-CN'), resources: () => resources, independent: () => independent, ready: () => ready, locateFile, openFile, browser, navigationVersion: () => version }))!
  host.registerReveal(fileId, reveal)
  cleanups.push(() => {
    scope.stop()
    void controller.dispose()
  })
  const quote = { id: 'q', text: 'Frozen file text', source: { kind: 'file' as const, title: 'auth.ts', file, format: 'source' as const } }
  return { a, b, fileId, controller, host, quote, resources, selectionScope, browserStates, draftsA, draftsB, tasks, keyA, locateFile, openFile, locateElement, otherTab, browserTab, allTabs, visibleTabs, activeTab, selectTab, reveal, pluginReveal, navigate: () => version++, independent: () => independent = true, unavailable: () => ready = false, stop: () => scope.stop() }
}

describe('desktop resource quote adapter', () => {
  it('requires an explicit file target in independent mode', async () => {
    const f = await fixture()
    f.independent()
    expect(f.host.capture(f.fileId, f.quote)?.defaultId).toBeNull()
  })

  it('no longer captures quotes from a tab, since the output preview that offered them is gone', async () => {
    const f = await fixture()
    f.activeTab.value = { id: f.otherTab.id }
    expect(f.host.capture(f.otherTab.id, artifactQuote)).toBeNull()
  })

  it('opens the output of an old output quote in the file manager and says the place was not revealed', async () => {
    const f = await fixture()
    f.visibleTabs.value = []
    expect(await f.host.locate(artifactQuote)).toBe('opened')
    expect(f.activeTab.value.id).toBe(f.otherTab.id)
    expect(f.reveal).not.toHaveBeenCalled()
  })

  it('lets the opener switch to the file manager tab without cancelling the locate', async () => {
    const f = await fixture()
    f.openFile.mockImplementation((async (_target: unknown, _current: () => boolean, acceptTab: (id: string) => boolean) => {
      f.activeTab.value = { id: 'files-a' }
      return acceptTab('files-a') ? f.fileId : null
    }) as never)
    expect(await f.host.locate(f.quote)).toBe(true)
    expect(f.activeTab.value.id).toBe('files-a')
    expect(f.reveal).toHaveBeenCalledOnce()
  })

  it('does not reveal anything when the active tab changes behind the opener', async () => {
    const f = await fixture()
    f.openFile.mockImplementation((async () => {
      f.activeTab.value = { id: 'somewhere-else' }
      return f.fileId
    }) as never)
    expect(await f.host.locate(f.quote)).toBe(false)
    expect(f.reveal).not.toHaveBeenCalled()
  })

  it('rejects a late file lookup after navigation without opening the old source', async () => {
    const f = await fixture()
    const lookup = Promise.withResolvers<void>()
    f.locateFile.mockReturnValueOnce(lookup.promise)
    const pending = f.host.locate(f.quote)
    f.navigate()
    lookup.resolve()
    expect(await pending).toBe(false)
    expect(f.openFile).not.toHaveBeenCalled()
  })

  it('invalidates a pending reveal when another locate request supersedes it', async () => {
    const f = await fixture()
    const reveal = Promise.withResolvers<boolean>()
    let current!: () => boolean
    f.host.registerReveal(f.fileId, async (_quote, isCurrent) => {
      current = isCurrent
      await reveal.promise
      return current()
    })
    const pending = f.host.locate(f.quote)
    await vi.waitFor(() => expect(current).toBeDefined())
    const next = f.host.locate(artifactQuote)
    await nextTick()
    expect(current()).toBe(false)
    reveal.resolve(true)
    expect(await pending).toBe(false)
    expect(await next).toBe('opened')
  })

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

  it.each(['scope', 'tab', 'independent', 'ready', 'dispose'] as const)('rejects an in-flight file open after a %s boundary changes', async (change) => {
    const f = await fixture()
    const lookup = Promise.withResolvers<void>()
    f.locateFile.mockReturnValueOnce(lookup.promise)
    const pending = f.host.locate(f.quote)
    if (change === 'scope')
      f.selectionScope.value = 'task:b'
    if (change === 'tab')
      f.activeTab.value = { id: 'other-tab' }
    if (change === 'independent')
      f.independent()
    if (change === 'ready')
      f.unavailable()
    if (change === 'dispose')
      f.stop()
    lookup.resolve()
    expect(await pending).toBe(false)
    expect(f.openFile).not.toHaveBeenCalled()
    expect(f.reveal).not.toHaveBeenCalled()
  })

  it.each(['version', 'mode', 'path'] as const)('fences file reveal after its source %s changes', async (change) => {
    const f = await fixture()
    const deferred = Promise.withResolvers<boolean>()
    let current!: () => boolean
    f.host.registerReveal(f.fileId, async (_quote, active) => {
      current = active
      return deferred.promise
    })
    const pending = f.host.locate(f.quote)
    await vi.waitFor(() => expect(current).toBeDefined())
    const view = f.controller.layout.views[f.fileId]!
    if (change === 'mode')
      f.controller.updateView(f.fileId, { state: { ...view.state, mode: 'preview' } })
    else
      f.controller.updateView(f.fileId, { resource: { ...view.resource, data: { ...view.resource.data, [change === 'version' ? 'revision' : 'path']: change === 'version' ? 2 : 'other.ts' } } })
    expect(current()).toBe(false)
    deferred.resolve(true)
    expect(await pending).toBe(false)
  })

  it('accepts a registered view provider without routing its locator through built-in file or browser handlers', async () => {
    const f = await fixture()
    const quote: BuddyViewQuote = { id: 'view-quote', text: 'Frozen custom selection', source: { kind: 'view', title: 'Custom document', provider: 'example.document', target: { id: 'doc-1' } }, locator: { version: 1, data: { block: 'first' } } }
    expect(await f.host.locate(quote)).toBe(false)
    let located: unknown
    const unregister = f.host.registerProvider('example.document', {
      captureSource: viewId => viewId === 'custom-view' ? { identity: 'doc-1:revision-1', owner: 'task:a' } : null,
      resolveLocate: reference => reference.source.kind === 'view' && reference.source.provider === 'example.document'
        ? async ({ current }) => {
          located = 'locator' in reference ? reference.locator : undefined
          return current()
        }
        : null,
    })
    const request = f.host.capture('custom-view', quote)!
    expect(request.defaultId).toBe(f.a)
    expect(f.host.add(request, f.a)).toBe('added')
    expect(chatComposerDocumentToUserContent(f.draftsA.composerContent.value).resourceQuotes).toContainEqual(quote)
    expect(await f.host.locate(quote)).toBe(true)
    expect(located).toEqual(quote.locator)
    expect(f.locateFile).not.toHaveBeenCalled()
    expect(f.locateElement).not.toHaveBeenCalled()
    unregister()
    expect(f.host.add(request, f.b)).toBe('unavailable')
    expect(await f.host.locate(quote)).toBe(false)
  })

  it('selects the owning browser only after a successful element locate', async () => {
    const f = await fixture()
    f.visibleTabs.value = [f.browserTab, f.otherTab]
    f.activeTab.value = { id: f.otherTab.id }
    expect(await f.host.locate(browserQuote)).toBe(true)
    expect(f.activeTab.value.id).toBe(f.browserTab.id)
    f.activeTab.value = { id: f.otherTab.id }
    f.locateElement.mockResolvedValueOnce(false)
    expect(await f.host.locate(browserQuote)).toBe(false)
    expect(f.activeTab.value.id).toBe(f.otherTab.id)
  })

  it.each(['document', 'closed', 'tab'] as const)('does not select a browser tab after its pending locator becomes stale: %s', async (change) => {
    const f = await fixture()
    f.visibleTabs.value = [f.browserTab, f.otherTab]
    const deferred = Promise.withResolvers<boolean>()
    f.locateElement.mockReturnValueOnce(deferred.promise)
    const pending = f.host.locate(browserQuote)
    if (change === 'document')
      f.browserStates.value['browser-a'] = { ...f.browserStates.value['browser-a'], documentVersion: 2 }
    if (change === 'closed')
      f.allTabs.value = f.allTabs.value.filter(tab => tab.id !== 'browser-a')
    if (change === 'tab')
      f.activeTab.value = { id: f.otherTab.id }
    deferred.resolve(true)
    expect(await pending).toBe(false)
    expect(f.selectTab).not.toHaveBeenCalled()
  })

  it('checks existing file authorization before opening a quote source', async () => {
    const f = await fixture()
    f.locateFile.mockRejectedValueOnce(new Error('revoked directory'))
    expect(await f.host.locate(f.quote)).toBe(false)
    expect(f.openFile).not.toHaveBeenCalled()
    expect(await f.host.locate(f.quote)).toBe(true)
    expect(f.locateFile).toHaveBeenCalledWith(f.quote.source.file)
  })

  describe('documents opened by plugins', () => {
    const hash = 'a'.repeat(64)
    const file = { spaceId: 'space', directoryId: 'directory', revision: 1, path: 'data/table.csv' }
    const extensionQuote = (extensionId: string, format: 'extension' | 'docx' = 'extension') => ({
      id: 'plugin-quote',
      text: '3,4',
      source: format === 'extension'
        ? { kind: 'file' as const, title: 'table.csv', file, format, extension: { extensionId, kind: 'range', hash, location: { row: 3 } } }
        : { kind: 'file' as const, title: 'a.docx', file, format, docx: { hash, indexes: [0], from: 1, to: 2 } },
    })
    async function pluginFixture(scheme: 'extension' | 'file-preview') {
      const f = await fixture()
      f.controller.registry.register('plugin-view', (scope) => {
        scope.view({ id: 'plugin', renderer: 'plugin', label: 'Plugin', locations: ['context'], multiple: true, supports: resource => resource.scheme === 'extension' || resource.scheme === 'file-preview' })
      })
      const id = (await f.controller.open({ scheme, id: 'doc', data: { extensionId: 'pabc.csv-sheet', fileTarget: file } }, 'table.csv', { state: { contextTabId: 'files-a' }, focus: false }))!
      f.openFile.mockResolvedValue(id)
      f.host.registerReveal(id, f.pluginReveal)
      return f
    }

    it('reopens a generic quote only in the plugin that made it', async () => {
      const f = await pluginFixture('extension')
      expect(await f.host.locate(extensionQuote('pabc.csv-sheet'))).toBe(true)
      expect(await f.host.locate(extensionQuote('pother.plugin'))).toBe(false)
    })

    it('asks the plugin to place the quote and says the file is only opened when it cannot', async () => {
      const f = await pluginFixture('extension')
      const quote = extensionQuote('pabc.csv-sheet')
      expect(await f.host.locate(quote)).toBe(true)
      expect(f.pluginReveal).toHaveBeenCalledWith(expect.objectContaining({ id: 'plugin-quote', text: '3,4' }), expect.any(Function))
      f.pluginReveal.mockResolvedValueOnce(false)
      expect(await f.host.locate(quote)).toBe('opened')
    })

    it('says the file is only opened when no plugin view can place the quote', async () => {
      const f = await pluginFixture('extension')
      f.openFile.mockResolvedValue((await f.controller.open({ scheme: 'extension', id: 'other', data: { extensionId: 'pabc.csv-sheet', fileTarget: file } }, 'table.csv', { state: { contextTabId: 'files-a' }, focus: false }))!)
      expect(await f.host.locate(extensionQuote('pabc.csv-sheet'))).toBe('opened')
    })

    it('reopens earlier DOCX quotes in any plugin view and fails when the file fell back to the built-in preview', async () => {
      expect(await (await pluginFixture('extension')).host.locate(extensionQuote('pabc.csv-sheet', 'docx'))).toBe(true)
      const preview = await pluginFixture('file-preview')
      expect(await preview.host.locate(extensionQuote('pabc.csv-sheet'))).toBe(false)
      expect(await preview.host.locate(extensionQuote('pabc.csv-sheet', 'docx'))).toBe(false)
    })
  })
})
