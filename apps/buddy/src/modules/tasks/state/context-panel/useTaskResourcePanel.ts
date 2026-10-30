import type { DesktopBrowserApi, DesktopBrowserState } from '@buddy-electron/shared/desktopApi'
import type { ArtifactFileRoot, LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { BrowserPreferences } from '@buddy-shared/browser/browserPreferences'
import type { ContextPanelSource } from '@buddy-shared/context-panel/contextPanel'
import type { ExtensionFileOpeningSource } from '@buddy-shared/extensions/extensionFileOpening'
import type { FileOpeningProvider } from '@buddy-shared/files/fileOpening'
import type { TaskFile, TaskFileLink } from '@buddy-shared/files/taskFileApi'
import type { FileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { Ref } from 'vue'
import type { UseTaskContextPanelOptions } from './typing'
import { localFileLinkPath } from '@buddy-shared/files/fileLink'
import { resolveBuiltinFileOpening } from '@buddy-shared/files/fileOpening'
import { getActiveSpaceDirectories } from '@buddy-shared/spaces/spaceApi'
import { isGrantFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import { computed, onScopeDispose, readonly, shallowRef, watch, watchEffect } from 'vue'
import { fileOpeningHandler } from '@/modules/files'
import { browserTabId, contextTabSource } from '../../model/context-panel/taskContextPanel'
import { resolveChatArtifactTarget, resolveChatToolFileTarget } from '../../model/transcript/chatToolFileTarget'
import { useTaskContextPanel } from './useTaskContextPanel'

export interface FileOpeningResource {
  name: string
  kind: 'file' | 'directory'
  source: ExtensionFileOpeningSource
  context?: ContextPanelSource
}

interface TaskResourcePanelOptions extends UseTaskContextPanelOptions {
  fileOpening?: {
    ensureReady: () => Promise<void>
    resolve: (name: string, location: 'standalone') => { provider: FileOpeningProvider | null, candidates?: FileOpeningProvider[] }
    open: (resource: FileOpeningResource, provider: FileOpeningProvider, current: () => boolean, signal: AbortSignal) => Promise<void>
  }
  files: { resolve: (input: TaskFileLink) => Promise<TaskFile> }
  openFile: (file: TaskFile, source: ContextPanelSource | undefined, provider: FileOpeningProvider | null, current: () => boolean, signal: AbortSignal) => Promise<void>
  onError: (error?: unknown) => void
  // Where an output sits inside the directory it was written to; the file manager opens that directory as its root (Spec-044).
  artifactFileRoot?: (artifactId: string) => Promise<ArtifactFileRoot>
  autoCollapse: Readonly<Ref<boolean>>
  linkOpening: Readonly<Ref<BrowserPreferences['linkOpening']>>
  closeView?: (id: string) => Promise<boolean>
  closeFiles?: (tabId: string) => Promise<boolean>
  revealOpenOfficeDocument?: (target: FileTarget) => boolean
  browser: Pick<DesktopBrowserApi, 'ensureSession' | 'close' | 'openArtifact' | 'openFile' | 'onStateChanged' | 'navigate'>
}

// Office files open in a document plugin tab beside the file manager, so the file manager keeps its tree for browsing.
const isOfficePath = (path: string) => /\.(?:docx|xlsx|pptx)$/i.test(path)

export function useTaskResourcePanel(options: TaskResourcePanelOptions) {
  const taskContext = useTaskContextPanel(options)
  const fileSpacePickerOpen = shallowRef(false)
  const filePickerSpaces = computed(() => {
    const entry = taskContext.fileEntry.value
    return entry?.kind === 'directory' ? taskContext.fileSpaces.value.filter(space => space.id === entry.spaceId) : taskContext.fileSpaces.value
  })
  function requestFiles() {
    const entry = taskContext.fileEntry.value
    if (entry?.kind === 'space-picker' || (entry?.kind === 'directory' && getActiveSpaceDirectories(filePickerSpaces.value[0]).length > 1))
      fileSpacePickerOpen.value = true
    else if (entry?.kind === 'directory')
      act(() => taskContext.openFiles(entry.spaceId))
  }
  const browserStates = shallowRef<Readonly<Record<string, DesktopBrowserState>>>({})
  const pendingSessions = new Map<string, Promise<DesktopBrowserState>>()
  const closingTabs = new Map<string, Promise<boolean>>()
  const activeBrowserState = computed(() => {
    const tab = taskContext.activeTab.value
    return tab?.kind === 'browser' ? browserStates.value[tab.id] ?? null : null
  })
  function updateBrowserState(state: DesktopBrowserState) {
    const entry = Object.entries(browserStates.value).find(([, previous]) => previous.sessionId === state.sessionId)
    if (entry)
      browserStates.value = { ...browserStates.value, [entry[0]]: state }
  }
  const stopBrowserState = options.browser.onStateChanged((state) => {
    const entry = Object.entries(browserStates.value).find(([, previous]) => previous.sessionId === state.sessionId)
    if (entry) {
      browserStates.value = { ...browserStates.value, [entry[0]]: state }
      return
    }
    if (!state.openedFrom)
      return
    const sourceEntry = Object.entries(browserStates.value).find(([, previous]) => previous.sessionId === state.openedFrom!.sessionId)
    const source = taskContext.allTabs.value.find(tab => tab.id === sourceEntry?.[0])
    if (!source || source.kind !== 'browser' || source.conversationId !== state.conversationId)
      return
    const id = browserTabId(state.conversationId, state.openedFrom.tabId)
    const foreground = taskContext.activeTab.value?.id === source.id
    taskContext.restoreTab({ id, kind: 'browser', scope: source.scope, conversationId: state.conversationId, browserKey: state.openedFrom.tabId, source: source.source })
    browserStates.value = { ...browserStates.value, [id]: state }
    if (foreground)
      taskContext.selectTab(id)
  })
  const operation = shallowRef(0)
  let interaction = 0
  let disposed = false
  watch(() => taskContext.activeTab.value?.id, (_, previous) => {
    operation.value += 1
    if (!previous || !closingTabs.has(previous) || taskContext.hasTab(previous))
      interaction += 1
  }, { flush: 'sync' })
  watch([options.activeConversationId, options.activeBranchId, options.activeDraftId], () => {
    operation.value += 1
    interaction += 1
  }, { flush: 'sync' })
  watch(taskContext.selectionScope, () => {
    operation.value += 1
    interaction += 1
  }, { flush: 'sync' })
  watch(taskContext.isOpen, (open) => {
    interaction += 1
    if (!open)
      operation.value += 1
  }, { flush: 'sync' })
  onScopeDispose(() => {
    stopBrowserState()
    disposed = true
    operation.value += 1
    interaction += 1
    for (const [id, state] of Object.entries(browserStates.value)) {
      if (id !== browserTabId(state.conversationId) && !closingTabs.has(id))
        void options.browser.close(state.sessionId).catch(() => {})
    }
  })

  function retainBrowserSession(state: DesktopBrowserState, key?: string) {
    const id = browserTabId(state.conversationId, key)
    if (disposed || !taskContext.hasTab(id)) {
      if (key && !closingTabs.has(id)) {
        void options.browser.close(state.sessionId).catch(() => {
          if (!disposed)
            options.onError()
        })
      }
      return
    }
    if (!browserStates.value[id] || browserStates.value[id].sessionId !== state.sessionId)
      browserStates.value = { ...browserStates.value, [id]: state }
  }

  function ensureBrowserSession(conversationId: string | null, key?: string): Promise<DesktopBrowserState> {
    const id = browserTabId(conversationId, key)
    if (disposed || !taskContext.hasTab(id))
      return Promise.reject(new Error('BROWSER_TAB_CLOSED'))
    const pending = pendingSessions.get(id)
    if (pending)
      return pending
    const request = options.browser.ensureSession(conversationId, key).finally(() => pendingSessions.delete(id))
    pendingSessions.set(id, request)
    return request
  }

  function act<T>(action: () => T): T {
    operation.value += 1
    interaction += 1
    return action()
  }

  function currentOperation() {
    const version = operation.value
    const activeTabId = taskContext.activeTab.value?.id
    return () => !disposed && version === operation.value
      && taskContext.activeTab.value?.id === activeTabId
  }

  function closeTab(tabId: string): Promise<boolean> {
    const pending = closingTabs.get(tabId)
    if (pending)
      return pending
    const accepted = Promise.withResolvers<boolean>()
    closingTabs.set(tabId, accepted.promise)
    void closeResource(tabId).finally(() => closingTabs.delete(tabId)).then(accepted.resolve, accepted.reject)
    return accepted.promise
  }

  async function closeTabs(tabIds: readonly string[]): Promise<void> {
    const requested = new Set(tabIds)
    const targets = taskContext.tabs.value.filter(tab => requested.has(tab.id) && !tab.pinned)
    let cancelled = false
    const stop = watch(taskContext.selectionScope, () => cancelled = true, { flush: 'sync' })
    try {
      for (const target of targets) {
        if (disposed || cancelled)
          break
        const tab = taskContext.tabs.value.find(tab => tab.id === target.id)
        if (!tab || tab.pinned)
          continue
        if (!await closeTab(tab.id))
          break
      }
    }
    catch (error) {
      options.onError(error)
    }
    finally {
      stop()
    }
  }

  async function closeResource(tabId: string): Promise<boolean> {
    const tab = taskContext.allTabs.value.find(item => item.id === tabId)
    if (!tab)
      return false
    const closingScope = taskContext.selectionScope.value
    const closingSource = contextTabSource(tab) ?? taskContext.getSource()
    const wasVisible = taskContext.tabs.value.some(item => item.id === tabId)
    operation.value += 1
    const version = ++interaction
    if (tab.kind === 'files' && options.closeFiles && !await options.closeFiles(tab.id))
      return false
    if (tab.kind === 'view' && options.closeView && !await options.closeView(tab.viewId))
      return false
    if (tab.kind === 'browser') {
      try {
        const session = pendingSessions.get(tab.id) ?? browserStates.value[tab.id]
          ?? (!tab.browserKey ? ensureBrowserSession(tab.conversationId) : null)
        if (session) {
          const state = await session
          const current = taskContext.allTabs.value.find(item => item.id === tabId)
          if (current !== tab && (current || !tab.browserKey))
            return false
          if (current === tab)
            retainBrowserSession(state, tab.browserKey)
          await options.browser.close(state.sessionId)
          if (browserStates.value[tab.id]?.sessionId === state.sessionId)
            browserStates.value = Object.fromEntries(Object.entries(browserStates.value).filter(([id]) => id !== tab.id))
        }
      }
      catch {
        return false
      }
    }
    const current = taskContext.allTabs.value.find(item => item.id === tabId)
    if (current && current !== tab)
      return true
    operation.value += 1
    taskContext.closeTab(tabId)
    if (options.autoCollapse.value && wasVisible && !disposed && interaction === version
      && taskContext.selectionScope.value === closingScope && !taskContext.tabs.value.length) {
      await taskContext.closePanel(closingSource)
    }
    return true
  }

  function findArtifact(id: string) {
    return options.runOutputs.value.flatMap(output => output.artifacts).find(item => item.artifactId === id)
  }

  // An output inside the task's space is just a space file: open it in the file manager so it gets the file preview, editing and document plugins.
  function openInTaskSpace(artifact: LocalArtifact): boolean {
    const source = { conversationId: artifact.conversationId, runId: artifact.runId }
    if (artifact.conversationId !== options.activeConversationId.value)
      return false
    if (artifact.kind === 'directory' && taskContext.canOpenDirectory(artifact.path)) {
      act(() => taskContext.openDirectory(artifact.path, source))
      return true
    }
    if (artifact.kind === 'file' && taskContext.canPreviewFile(artifact.path)) {
      act(() => {
        const target = resolveChatToolFileTarget(options.activeSpace?.value ?? null, artifact.path)
        if (!target || !options.revealOpenOfficeDocument?.(target))
          taskContext.previewFile(artifact.path, source, !!target && isOfficePath(target.path))
      })
      return true
    }
    return false
  }

  // An output outside the task's space (a granted folder, the task's own workspace, another task's space) opens in a tab rooted at the directory it was written to.
  async function openInGrantedDirectory(artifact: LocalArtifact, current: () => boolean): Promise<boolean> {
    if (!options.artifactFileRoot)
      return false
    let located: ArtifactFileRoot
    try {
      located = await options.artifactFileRoot(artifact.artifactId)
    }
    catch (error) {
      // The output is not reachable any more (authorization revoked, task deleted, file moved): say so instead of falling back to a weaker preview.
      if (current())
        options.onError(error)
      return true
    }
    if (!current())
      return true
    const source = { conversationId: artifact.conversationId, runId: artifact.runId }
    if (located.kind === 'directory') {
      act(() => taskContext.openGrantedDirectory({ conversationId: located.conversationId, root: located.root, path: located.path }, source))
      return true
    }
    const target = { conversationId: located.conversationId, root: located.root, path: located.path }
    act(() => {
      if (!options.revealOpenOfficeDocument?.(target))
        taskContext.openGrantedFile(target, source, isOfficePath(target.path))
    })
    return true
  }

  // Where a quote's "locate source" opens its file: the route an output card takes (Spec-043). Null when no file manager tab can show it.
  function openQuoteSourceFile(target: FileTarget): { target: FileTarget, tabId: string, viewId?: string } | null {
    if (isGrantFileTarget(target)) {
      return act(() => {
        if (isOfficePath(target.path) && options.revealOpenOfficeDocument?.(target)) {
          const tab = taskContext.activeTab.value
          return tab?.kind === 'view' ? { target, tabId: tab.id, viewId: tab.viewId } : null
        }
        return taskContext.openGrantedSourceFile(target, isOfficePath(target.path))
      })
    }
    const current = taskContext.resolveSpaceFile(target)
    if (!current)
      return null
    return act(() => {
      if (isOfficePath(current.path) && options.revealOpenOfficeDocument?.(current)) {
        const tab = taskContext.activeTab.value
        return tab?.kind === 'view' ? { target: current, tabId: tab.id, viewId: tab.viewId } : null
      }
      return taskContext.openSpaceFile(current, isOfficePath(current.path))
    })
  }

  // Every output opens in the file manager (Spec-035, Spec-044): a space file in its space, anything else in a tab rooted at the directory it was written to.
  // Not for a browser output, a type the user assigned to a plugin, or an "open with" that names the browser or a plugin.
  async function openInFileManager(artifact: LocalArtifact, providerId?: string): Promise<boolean> {
    operation.value += 1
    const requestCurrent = currentOperation()
    try {
      await options.fileOpening?.ensureReady()
    }
    catch (error) {
      if (requestCurrent())
        options.onError(error)
      return true
    }
    if (!requestCurrent())
      return true
    const opening = artifact.kind === 'file'
      ? options.fileOpening?.resolve(artifact.name, 'standalone') ?? resolveBuiltinFileOpening(artifact.name, 'standalone')
      : null
    const provider = providerId ? opening?.candidates?.find(candidate => candidate.id === providerId) ?? null : opening?.provider ?? null
    // An unknown provider is reported by openResource.
    if (providerId && !provider)
      return false
    if (provider?.renderer === 'browser' || (provider?.renderer === 'extension' && (providerId || !provider.implicit)))
      return false
    return openInTaskSpace(artifact) || await openInGrantedDirectory(artifact, requestCurrent)
  }

  async function openArtifact(target: string | LocalArtifact, providerId?: string): Promise<void> {
    const artifact = typeof target === 'string'
      ? findArtifact(target)
      : target
    if (!artifact) {
      options.onError()
      return
    }
    if (await openInFileManager(artifact, providerId))
      return
    // What is left is a browser or plugin opening, which openResource runs; a plain document has nowhere else to go.
    await openResource({ name: artifact.name, kind: artifact.kind, source: { kind: 'artifact', artifactId: artifact.artifactId }, context: { conversationId: artifact.conversationId, runId: artifact.runId } }, () => {
      throw new Error('FILE_OPENER_UNAVAILABLE')
    }, providerId)
  }

  async function openResource(resource: FileOpeningResource, document: (provider: FileOpeningProvider | null, current: () => boolean, signal: AbortSignal) => void | Promise<void>, providerId?: string) {
    operation.value += 1
    let isCurrent = currentOperation()
    const cancellation = new AbortController()
    const stop = watchEffect(() => {
      if (!isCurrent())
        cancellation.abort()
    }, { flush: 'sync' })
    try {
      await options.fileOpening?.ensureReady()
      if (!isCurrent())
        return
      const opening = options.fileOpening?.resolve(resource.name, 'standalone') ?? resolveBuiltinFileOpening(resource.name, 'standalone')
      const provider = resource.kind === 'directory'
        ? null
        : providerId
          ? opening.candidates?.find(candidate => candidate.id === providerId) ?? null
          : opening.provider
      if (providerId && !provider)
        throw new Error('FILE_OPENER_UNAVAILABLE')
      const handler = fileOpeningHandler(provider)
      const actions = {
        document: () => document(provider, isCurrent, cancellation.signal),
        browser: async () => {
          const conversationId = resource.source.kind === 'task' ? resource.source.target.conversationId : resource.context?.conversationId
          if (!conversationId)
            throw new Error('FILE_OPENER_UNAVAILABLE')
          act(() => taskContext.openBrowser(resource.context))
          isCurrent = currentOperation()
          const state = await ensureBrowserSession(conversationId)
          retainBrowserSession(state)
          if (!isCurrent())
            return
          const next = resource.source.kind === 'artifact'
            ? await options.browser.openArtifact(state.sessionId, resource.source.artifactId)
            : resource.source.kind === 'task' ? await options.browser.openFile(state.sessionId, resource.source.target) : null
          if (next && isCurrent())
            updateBrowserState(next)
        },
        extension: async () => {
          if (!provider || !options.fileOpening)
            throw new Error('FILE_OPENER_UNAVAILABLE')
          await options.fileOpening.open(resource, provider, isCurrent, cancellation.signal)
        },
      }
      if (handler)
        await handler.open(actions)
      else
        await actions.document()
    }
    catch (error) {
      if (isCurrent())
        options.onError(error)
    }
    finally {
      stop()
    }
  }

  async function openWebLink(url: string, source?: ContextPanelSource): Promise<void> {
    if (!/^https?:\/\//i.test(url))
      return
    if (options.linkOpening.value === 'system') {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    const conversationId = source?.conversationId ?? options.activeConversationId.value
    if (!conversationId)
      return
    act(() => taskContext.openBrowser(source))
    const isCurrent = currentOperation()
    try {
      const state = await ensureBrowserSession(conversationId)
      retainBrowserSession(state)
      if (isCurrent())
        updateBrowserState(await options.browser.navigate(state.sessionId, url))
    }
    catch {
      if (isCurrent())
        options.onError()
    }
  }

  function fileArtifact(path: string, source?: ContextPanelSource) {
    const conversationId = source?.conversationId ?? options.activeConversationId.value
    return resolveChatArtifactTarget(options.runOutputs.value.flatMap(output => output.artifacts)
      .filter(artifact => artifact.conversationId === conversationId), path)
  }

  function canPreviewFile(path: string) {
    return Boolean(options.activeConversationId.value && localFileLinkPath(path))
  }

  async function previewFile(path: string, source?: ContextPanelSource, providerId?: string) {
    const artifact = fileArtifact(path, source)
    if (artifact) {
      await openArtifact(artifact, providerId)
      return
    }
    const conversationId = source?.conversationId ?? options.activeConversationId.value
    if (!conversationId) {
      options.onError()
      return
    }
    const context = source ?? (options.activeRunId.value ? { conversationId, runId: options.activeRunId.value } : undefined)
    operation.value += 1
    const isCurrent = currentOperation()
    try {
      const file = await options.files.resolve({ conversationId, href: path })
      if (isCurrent()) {
        await openResource({ name: file.name, kind: file.kind, source: { kind: 'task', target: file.target }, context }, (provider, current, signal) => options.openFile(file, context, provider, current, signal), providerId)
      }
    }
    catch (error) {
      if (isCurrent())
        options.onError(error)
    }
  }

  return {
    ...taskContext,
    activeBrowserState,
    browserStates: readonly(browserStates),
    fileSpacePickerOpen: readonly(fileSpacePickerOpen),
    setFileSpacePickerOpen: (open: boolean) => fileSpacePickerOpen.value = open,
    filePickerSpaces,
    requestFiles,
    updateBrowserState,
    retainBrowserSession,
    ensureBrowserSession,
    addBrowser: () => act(taskContext.addBrowser),
    openFiles: (spaceId: string, directoryId?: string) => act(() => taskContext.openFiles(spaceId, directoryId)),
    locateFile: (...args: Parameters<typeof taskContext.locateFile>) => act(() => taskContext.locateFile(...args)),
    openWebLink,
    canPreviewFile,
    previewFile,
    openQuoteSourceFile,
    closeTab,
    closeTabs,
    discardDraft: (id: string) => {
      operation.value += 1
      interaction += 1
      const removedIds = new Set(taskContext.discardDraft(id).map(tab => tab.id))
      const sessions = Object.entries(browserStates.value).filter(([tabId]) => removedIds.has(tabId))
      browserStates.value = Object.fromEntries(Object.entries(browserStates.value).filter(([tabId]) => !removedIds.has(tabId)))
      return async () => {
        await Promise.all(sessions.map(([, state]) => options.browser.close(state.sessionId)))
      }
    },
    discardConversation: (id: string) => act(() => {
      const removedIds = new Set(taskContext.discardConversation(id).map(tab => tab.id))
      browserStates.value = Object.fromEntries(Object.entries(browserStates.value).filter(([tabId, state]) => {
        if (!removedIds.has(tabId) && state.conversationId !== id)
          return true
        if (state.conversationId === null)
          void options.browser.close(state.sessionId).catch(options.onError)
        return false
      }))
    }),
    findArtifact,
    fileArtifact,
    onFileError: options.onError,
    openArtifact,
    openBrowser: () => act(taskContext.openBrowser),
    openChanges: (...args: Parameters<typeof taskContext.openChanges>) => act(() => taskContext.openChanges(...args)),
    selectTab: (id: string) => act(() => taskContext.selectTab(id)),
    toggle: () => act(taskContext.toggle),
  }
}

export type TaskResourcePanel = ReturnType<typeof useTaskResourcePanel>
