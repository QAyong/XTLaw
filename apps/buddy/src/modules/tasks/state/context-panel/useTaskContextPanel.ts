import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { ContextPanelSource } from '@buddy-shared/context-panel/contextPanel'
import type { LocalSpaceAdditionalDirectory } from '@buddy-shared/spaces/spaceApi'
import type { FileTarget, GrantFileTarget, SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskContextTab, TaskFilesContextTab } from '../../model/context-panel/taskContextPanel'
import type { UseTaskContextPanelOptions } from './typing'
import { getActiveSpaceDirectories } from '@buddy-shared/spaces/spaceApi'
import { isGrantFileTarget, sameFileDirectory, sameFileRoot, spaceFileTargetOnly } from '@buddy-shared/spaces/spaceFileApi'
import { computed, readonly, watch } from 'vue'
import { useContextPanelControl } from '@/platform/desktop/useContextPanelControl'
import { readContextSelection, readContextTab } from '../../model/context-panel/readContextTab'
import { browserTabId, contextTabSource, spaceTaskBrowserTab, taskContextPanelScope } from '../../model/context-panel/taskContextPanel'
import { resolveChatToolDirectoryTarget, resolveChatToolFileTarget } from '../../model/transcript/chatToolFileTarget'
import { useContextPanelTabs } from './useContextPanelTabs'

export function useTaskContextPanel(options: UseTaskContextPanelOptions) {
  const store = useContextPanelTabs({ mode: options.mode, scopeSpaceIds: options.scopeSpaceIds, conversationId: options.activeConversationId, draftId: options.activeDraftId })
  const linked = computed(() => options.mode.value !== 'independent')
  const getSource = () => contextTabSource(store.activeTab.value)
    ?? (linked.value && options.taskVisible.value ? currentSource() ?? null : null)
  const control = useContextPanelControl({
    api: options.control,
    getSource,
    onError: options.onError,
    onTarget: (target) => {
      const tab = spaceTaskBrowserTab(target.source.conversationId)
      if (tab)
        store.put({ ...tab, source: target.source }, options.taskVisible.value && target.source.conversationId === options.activeConversationId.value)
    },
  })
  let expectedOpenState: boolean | null = null
  let openStateOperation = 0
  function restoreOpenState(open: boolean) {
    const operation = ++openStateOperation
    expectedOpenState = open
    void control.setOpen(open).finally(() => {
      if (operation === openStateOperation)
        expectedOpenState = null
    })
  }
  function clearExpectedOpenState() {
    openStateOperation += 1
    expectedOpenState = null
  }
  function openPanel() {
    clearExpectedOpenState()
    void control.open()
  }
  watch([control.initialized, store.selectionScope, options.mode], ([initialized, scope, mode], [wasInitialized, previousScope, previousMode]) => {
    if (!initialized)
      return
    if (wasInitialized && previousMode !== 'independent' && (previousScope !== scope || previousMode !== mode)) {
      store.setOpen(previousScope, expectedOpenState ?? control.isOpen.value)
    }
    if (wasInitialized && previousMode === 'independent' && previousMode !== mode) {
      store.setOpen('independent', expectedOpenState ?? control.isOpen.value)
    }

    let nextOpenState: boolean | undefined
    if (wasInitialized && mode !== 'independent' && (previousScope !== scope || previousMode !== mode)) {
      nextOpenState = store.getOpen(scope) ?? false
    }
    else if (wasInitialized && mode === 'independent' && previousMode !== 'independent') {
      nextOpenState = store.getOpen('independent') ?? control.isOpen.value
      store.setOpen('independent', nextOpenState)
    }
    // A pending close may not have reached the renderer yet: still supersede it on the next scope.
    if (nextOpenState !== undefined && (expectedOpenState !== null || control.isOpen.value !== nextOpenState))
      restoreOpenState(nextOpenState)
  }, { flush: 'sync' })
  watch(control.isOpen, (open) => {
    // Intermediate IPC states belong to an earlier scope, not the current user's saved preference.
    if (expectedOpenState !== null)
      return
    store.setOpen(store.selectionScope.value, open)
  }, { flush: 'sync' })
  const fileSpaces = computed(() => options.spaces.value.filter(space => getActiveSpaceDirectories(space).length > 0))
  const currentFileSpace = computed(() => fileSpaces.value.find(space => space.id === options.activeSpace?.value?.id) ?? null)
  const fileEntry = computed(() => {
    if (!linked.value)
      return { kind: 'space-picker' as const }
    return options.taskVisible.value && currentFileSpace.value
      ? { kind: 'directory' as const, spaceId: currentFileSpace.value.id }
      : null
  })
  const canAddChanges = computed(() => linked.value && options.taskVisible.value
    && Boolean(options.activeConversationId.value)
    && !store.tabs.value.some(tab => tab.kind === 'changes' && tab.conversationId === options.activeConversationId.value))
  const changeRevision = computed(() => options.changeSets.value.filter(set => set.conversationId === options.activeConversationId.value)
    .map(set => `${set.changeSetId}:${set.updatedAt}`)
    .join('|'))

  watch(options.spaces, () => store.retain(isAvailable))
  watch([changeRevision, options.activeBranchId, options.activeConversationId, options.mode], ([revision, branchId]) => {
    store.update((tab) => {
      if (tab.kind !== 'changes' || tab.id !== `changes:${tab.conversationId}` || tab.conversationId !== options.activeConversationId.value)
        return tab
      if (tab.branchId !== branchId)
        return linked.value ? { ...tab, branchId, revision, changeSet: null, source: currentSource() } : tab
      return tab.revision !== revision ? { ...tab, revision } : tab
    })
  })

  function openTab(tab: TaskContextTab) {
    store.put(tab)
    openPanel()
  }

  function currentSource(): ContextPanelSource | undefined {
    const conversationId = options.activeConversationId.value
    const runId = options.activeRunId.value
    return conversationId && runId ? { conversationId, runId } : undefined
  }

  function openBrowser(source = currentSource()) {
    const tab = spaceTaskBrowserTab(source?.conversationId ?? options.activeConversationId.value)
    if (tab)
      openTab({ ...tab, source })
  }

  function openChanges(target?: string | LocalChangeSetSummary, source?: ContextPanelSource, branchId = options.activeBranchId.value) {
    const conversationId = source?.conversationId ?? options.activeConversationId.value
    if (!conversationId)
      return
    const changeSet = typeof target === 'string'
      ? options.changeSets.value.find(set => set.changeSetId === target)
      : target
    if (target && (!changeSet || changeSet.conversationId !== conversationId))
      return
    openTab({
      id: source && changeSet ? `change-set:${changeSet.changeSetId}` : `changes:${conversationId}`,
      scope: taskContextPanelScope(conversationId),
      kind: 'changes',
      conversationId,
      branchId,
      revision: source && changeSet ? changeSet.updatedAt : changeRevision.value,
      changeSet: changeSet ?? null,
      source: source ?? currentSource(),
    })
  }

  function addBrowser() {
    const browserKey = crypto.randomUUID()
    openTab({ id: browserTabId(null, browserKey), scope: store.scope.value, kind: 'browser', conversationId: null, browserKey })
  }

  const rootNameOf = (root: string) => root.split(/[\\/]/).filter(Boolean).at(-1) ?? root

  function openFiles(spaceId: string, directoryId?: string) {
    const space = fileSpaces.value.find(space => space.id === spaceId)
    const directories = getActiveSpaceDirectories(space)
    const directory = directoryId ? directories.find(directory => directory.id === directoryId) : directories[0]
    if (!space || !directory)
      return
    openTab({
      id: `files:${crypto.randomUUID()}`,
      scope: store.scope.value,
      kind: 'files',
      rootName: rootNameOf(directory.root),
      target: { spaceId: space.id, directoryId: directory.id, revision: directory.revision, path: '' },
      source: linked.value ? currentSource() : undefined,
    })
  }

  // Shows where a file or folder sits in the tree. A folder clears the file open in the tab; a file replaces it.
  function locateFile(target: SpaceFileTarget, kind: 'file' | 'directory', source?: ContextPanelSource) {
    const space = fileSpaces.value.find(space => space.id === target.spaceId)
    const directory = getActiveSpaceDirectories(space).find(directory => directory.id === target.directoryId && directory.revision === target.revision)
    if (!directory)
      throw new Error('FILE_DIRECTORY_UNAVAILABLE')
    const candidates = store.tabs.value.filter(tab => tab.kind === 'files' && sameFileRoot(tab.target, target))
    const previous = candidates.find(tab => tab.id === store.activeTab.value?.id) ?? candidates[0]
    openTab({
      id: previous?.id ?? `files:${crypto.randomUUID()}`,
      scope: source ? taskContextPanelScope(source.conversationId) : previous?.scope ?? store.scope.value,
      kind: 'files',
      rootName: rootNameOf(directory.root),
      target: { ...target, path: kind === 'file' ? target.path : '' },
      treeTarget: { path: target.path, kind },
      source: source ?? previous?.source ?? currentSource(),
    })
  }

  function selectFile(tabId: string, path: string) {
    store.update(tab => tab.id === tabId && tab.kind === 'files' ? { ...tab, target: { ...tab.target, path }, treeTarget: undefined } : tab)
  }

  function canPreviewFile(path: string) {
    return Boolean(resolveChatToolFileTarget(options.activeSpace?.value ?? null, path))
  }

  // treeVisible: false folds the tree away because the file is the point (the user can still open it); true shows it, even if the user folded it before.
  function previewFile(path: string, source?: ContextPanelSource, treeVisible?: boolean) {
    const space = options.activeSpace?.value ?? null
    const target = resolveChatToolFileTarget(space, path)
    const directory = getActiveSpaceDirectories(space).find(directory => directory.id === target?.directoryId)
    if (!target || !directory)
      return
    previewTarget(target, directory, source, treeVisible)
  }

  // The target at the task space's current directory revision, or null when the file is not in the task's space.
  function resolveSpaceFile(target: FileTarget): { target: SpaceFileTarget, directory: LocalSpaceAdditionalDirectory } | null {
    // A granted directory has no entry in the task's space; its files open through their own tab.
    if (isGrantFileTarget(target))
      return null
    const space = options.activeSpace?.value ?? null
    const directory = space?.id === target.spaceId ? getActiveSpaceDirectories(space).find(directory => directory.id === target.directoryId) : undefined
    // The saved revision can be older than the directory's; the file itself is checked by the caller's read.
    return directory && target.path ? { target: { ...target, revision: directory.revision }, directory } : null
  }

  // Opens a file the caller already has a target for (a quote's source) the way a card does, in the file manager tab.
  function openSpaceFile(target: FileTarget, treeVisible: boolean): { target: SpaceFileTarget, tabId: string } | null {
    const resolved = resolveSpaceFile(target)
    if (!resolved)
      return null
    previewTarget(resolved.target, resolved.directory, undefined, treeVisible)
    // The tab's own target is what the file surface opens, so the caller must open that one to share its view.
    const tab = store.activeTab.value
    const opened = tab?.kind === 'files' ? spaceFileTargetOnly(tab.target) : undefined
    if (!tab || !opened || opened.path !== resolved.target.path)
      return null
    return { target: { ...opened }, tabId: tab.id }
  }

  function previewTarget(target: SpaceFileTarget, directory: LocalSpaceAdditionalDirectory, source: ContextPanelSource | undefined, treeVisible: boolean | undefined) {
    showFile(target, rootNameOf(directory.root), source, treeVisible)
  }

  // Shows a file in the file manager tab of its root: the tab already showing exactly this file, else the root's tab, else a new one.
  function showFile(target: FileTarget, rootName: string, source: ContextPanelSource | undefined, treeVisible: boolean | undefined) {
    const exactTab = store.tabs.value.find(tab =>
      tab.kind === 'files'
      && sameFileDirectory(tab.target, target)
      && tab.target.path === target.path
      && (!source || tab.source?.runId === source.runId),
    )
    const tree = treeVisible === undefined ? undefined : { visible: treeVisible, token: crypto.randomUUID() }
    if (exactTab) {
      if (tree)
        updateFilesTab(exactTab.id, { tree })
      store.select(exactTab.id)
      openPanel()
      return
    }

    const spaceTab = findSpaceFilesTab(target, source)
    if (spaceTab) {
      selectFile(spaceTab.id, target.path)
      if (tree)
        updateFilesTab(spaceTab.id, { tree })
      store.select(spaceTab.id)
      openPanel()
      return
    }

    openTab({ ...newFilesTab(rootName, target, source), tree })
  }

  function updateFilesTab(tabId: string, change: Partial<Pick<TaskFilesContextTab, 'expand' | 'tree' | 'treeTarget'>>) {
    store.update(tab => tab.id === tabId && tab.kind === 'files' ? { ...tab, ...change } : tab)
  }

  function findSpaceFilesTab(target: FileTarget, source?: ContextPanelSource) {
    const active = store.activeTab.value
    return (active?.kind === 'files' && sameFileDirectory(active.target, target) && (!source || active.source?.runId === source.runId))
      ? active
      : store.tabs.value.find(tab =>
          tab.kind === 'files'
          && sameFileDirectory(tab.target, target)
          && (!source || tab.source?.runId === source.runId),
        )
  }

  function newFilesTab(rootName: string, target: FileTarget, source?: ContextPanelSource): TaskFilesContextTab {
    const root = isGrantFileTarget(target) ? `grant:${target.conversationId}:${target.root}` : `${target.spaceId}:${target.directoryId}`
    return {
      id: `files:${source ? taskContextPanelScope(source.conversationId) : store.scope.value}:${root}:${source?.runId ?? 'preview'}`,
      scope: source ? taskContextPanelScope(source.conversationId) : store.scope.value,
      kind: 'files',
      rootName,
      target,
      source: source ?? currentSource(),
    }
  }

  function canOpenDirectory(path: string) {
    return Boolean(resolveChatToolDirectoryTarget(options.activeSpace?.value ?? null, path))
  }

  // Shows a folder in the file manager's tree without changing the file already open in the tab.
  function openDirectory(path: string, source?: ContextPanelSource) {
    const space = options.activeSpace?.value ?? null
    const target = resolveChatToolDirectoryTarget(space, path)
    const directory = getActiveSpaceDirectories(space).find(directory => directory.id === target?.directoryId)
    if (!target || !directory)
      return
    const expand = target.path ? { path: target.path, token: crypto.randomUUID() } : undefined
    const tree = { visible: true, token: crypto.randomUUID() }
    const spaceTab = findSpaceFilesTab(target, source)
    if (spaceTab) {
      // A folder shown by "locate" gives way to this one, so only one row stays highlighted.
      updateFilesTab(spaceTab.id, { expand, tree, treeTarget: undefined })
      store.select(spaceTab.id)
      openPanel()
      return
    }
    openTab({ ...newFilesTab(rootNameOf(directory.root), { ...target, path: '' }, source), expand, tree })
  }

  // A granted directory is not in the task's space; its files open in a tab rooted at that directory (Spec-044).
  function openGrantedFile(target: GrantFileTarget, source: ContextPanelSource | undefined, treeVisible: boolean | undefined) {
    showFile(target, rootNameOf(target.root), source, treeVisible)
  }

  // Shows a folder of a granted directory in the tree, like openDirectory does for a space folder; an empty path is the root itself.
  function openGrantedDirectory(target: GrantFileTarget, source?: ContextPanelSource) {
    const root = { ...target, path: '' }
    const expand = target.path ? { path: target.path, token: crypto.randomUUID() } : undefined
    const tree = { visible: true, token: crypto.randomUUID() }
    const existing = findSpaceFilesTab(root, source)
    if (existing) {
      updateFilesTab(existing.id, { expand, tree, treeTarget: undefined })
      store.select(existing.id)
      openPanel()
      return
    }
    openTab({ ...newFilesTab(rootNameOf(target.root), root, source), expand, tree })
  }

  // Opens a quote's source file in the tab of its granted directory and returns the target that tab shows, so a caller can share its view.
  function openGrantedSourceFile(target: GrantFileTarget, treeVisible: boolean): { target: GrantFileTarget, tabId: string } | null {
    if (!target.path)
      return null
    showFile(target, rootNameOf(target.root), undefined, treeVisible)
    const tab = store.activeTab.value
    if (tab?.kind !== 'files' || !isGrantFileTarget(tab.target) || tab.target.path !== target.path)
      return null
    return { target: { ...tab.target }, tabId: tab.id }
  }

  function isAvailable(tab: TaskContextTab): boolean {
    if (tab.kind !== 'files')
      return true
    // A granted directory is checked by the service on every read, so a saved tab for one stays; space directories are checked here.
    const target = tab.target
    if (isGrantFileTarget(target))
      return true
    const space = fileSpaces.value.find(space => space.id === target.spaceId)
    const directory = getActiveSpaceDirectories(space).find(directory => directory.id === target.directoryId)
    return Boolean(directory && target.directoryId === directory.id && target.revision === directory.revision)
  }

  function hasTab(id: string) {
    return store.resources.value.some(tab => tab.id === id)
  }

  function restoreTab(value: unknown) {
    const tab = readContextTab(value)
    if (tab && isAvailable(tab) && !hasTab(tab.id))
      store.put(tab, false)
  }

  return {
    restoreSnapshot(value: unknown) {
      if (!value || typeof value !== 'object') {
        if (options.mode.value === 'task')
          restoreOpenState(false)
        return
      }
      const snapshot = value as { tabs?: unknown, selections?: unknown, openStates?: unknown }
      if (Array.isArray(snapshot.tabs))
        snapshot.tabs.slice(0, 512).forEach(restoreTab)
      if (Array.isArray(snapshot.openStates)) {
        store.restoreOpenStates(snapshot.openStates.filter((entry): entry is [typeof store.selectionScope.value, boolean] =>
          Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'boolean'))
      }
      if (options.mode.value !== 'independent') {
        restoreOpenState(store.getOpen(store.selectionScope.value) ?? false)
      }
      if (Array.isArray(snapshot.selections)) {
        for (const selection of snapshot.selections) {
          const parsed = readContextSelection(selection)
          if (parsed)
            store.restoreSelections([parsed])
        }
      }
    },
    snapshot: store.snapshot,
    restoreSelections: store.restoreSelections,
    openView: (viewId: string, label: string, source?: ContextPanelSource, dirty = false) => openTab({ kind: 'view', id: viewId, viewId, label, dirty, scope: source ? taskContextPanelScope(source.conversationId) : store.scope.value, ...(source ? { source } : {}) }),
    updateView: (viewId: string, label: string, dirty = false) => store.update(tab => tab.kind === 'view' && tab.viewId === viewId && (tab.label !== label || !!tab.dirty !== dirty) ? { ...tab, label, dirty } : tab),
    removeView: store.close,
    allTabs: store.resources,
    activeTab: store.activeTab,
    tabs: store.tabs,
    selectionScope: store.selectionScope,
    isOpen: control.isOpen,
    mode: options.mode,
    fileEntry: readonly(fileEntry),
    fileSpaces: readonly(fileSpaces),
    canAddChanges: readonly(canAddChanges),
    adoptDraft: store.adoptDraft,
    discardDraft: store.discardDraft,
    addBrowser,
    canOpenDirectory,
    canPreviewFile,
    closeTab: store.close,
    setTabPinned: store.setPinned,
    discardConversation: (id: string) => store.discard(taskContextPanelScope(id)),
    hasTab,
    openBrowser,
    openChanges,
    openDirectory,
    openFiles,
    locateFile,
    previewFile,
    openSpaceFile,
    openGrantedFile,
    openGrantedDirectory,
    openGrantedSourceFile,
    resolveSpaceFile: (target: FileTarget) => resolveSpaceFile(target)?.target ?? null,
    selectFile,
    restoreTab,
    selectTab: store.select,
    getSource,
    closePanel: (source = getSource()) => {
      store.setOpen(store.selectionScope.value, false)
      const operation = ++openStateOperation
      expectedOpenState = false
      return control.close(source).finally(() => {
        if (operation === openStateOperation)
          expectedOpenState = null
      })
    },
    toggle: () => {
      clearExpectedOpenState()
      return control.toggle()
    },
  }
}
