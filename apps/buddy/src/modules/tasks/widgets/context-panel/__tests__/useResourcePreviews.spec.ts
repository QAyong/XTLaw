// @vitest-environment jsdom
import type { LocalChangeSetDetail, LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { Ref } from 'vue'
import type { WorkspaceFilesApi } from '../useWorkspaceFilePreview'
import type { TaskChangesContextTab, TaskFilesContextTab } from '@/modules/tasks/model/context-panel/taskContextPanel'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, shallowRef, watch } from 'vue'
import { deferred } from '../../../../../../__tests__/deferred'
import { useContextChanges } from '../useContextChanges'
import { useWorkspaceFilePreview } from '../useWorkspaceFilePreview'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
function own<T>(setup: () => T) {
  const scope = effectScope()
  scopes.push(scope)
  return { state: scope.run(setup)!, stop: () => scope.stop() }
}

describe('resource previews', () => {
  it('releases closed preview views while retaining another task tab', async () => {
    const first: TaskChangesContextTab = { id: 'changes:first', scope: 'task:first', conversationId: 'first', kind: 'changes', changeSet: createChanges('first'), branchId: 'branch', revision: '1' }
    const second: TaskChangesContextTab = { ...first, id: 'changes:second', scope: 'task:second', conversationId: 'second', changeSet: createChanges('second') }
    const tab = shallowRef<TaskChangesContextTab | null>(first)
    const retained = shallowRef(new Set([first.id, second.id]))
    const { state } = own(() => useContextChanges({ hasTab: id => retained.value.has(id), tab, getChangeSet: async id => createChanges(id), getOverview: async () => createChanges('all') }))
    await nextTick()
    const previous = state.current.value!
    previous.treeWidth = 350
    tab.value = second
    await nextTick()
    retained.value = new Set([second.id])
    await nextTick()
    expect(state.current.value?.source.id).toBe(second.id)
    retained.value = new Set([first.id, second.id])
    tab.value = first
    await nextTick()
    expect(state.current.value?.treeWidth).not.toBe(previous.treeWidth)
  })

  it('stops directory pagination after its tab closes and discards late results', async () => {
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>(value)
    const retained = shallowRef(true)
    const page = deferred<{ entries: [], nextCursor: string | null }>()
    const listDirectory = vi.fn().mockReturnValueOnce(page.promise).mockResolvedValue({ entries: [], nextCursor: null })
    const { state } = openFiles(tab, listDirectory, () => retained.value)
    tab.value = null
    retained.value = false
    await nextTick()
    page.resolve({ entries: [], nextCursor: 'another-page' })
    await nextTick()
    expect(listDirectory).toHaveBeenCalledTimes(1)
    retained.value = true
    tab.value = value
    await nextTick()
    expect(state.current.value?.nodes).toEqual([])
  })

  it('refreshes root and expanded directories on focus while preserving valid expanded keys', async () => {
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>(value)
    const listDirectory = vi.fn().mockImplementation(async ({ path }: { path: string }) => {
      if (path === '') {
        return {
          entries: [
            { name: 'src', path: 'src', kind: 'directory', unavailable: false },
            { name: 'README.md', path: 'README.md', kind: 'file', unavailable: false },
          ],
          nextCursor: null,
        }
      }
      if (path === 'src') {
        return {
          entries: [
            { name: 'index.ts', path: 'src/index.ts', kind: 'file', unavailable: false },
          ],
          nextCursor: null,
        }
      }
      throw new Error('Not found')
    })
    const { state } = openFiles(tab, listDirectory)
    await Promise.resolve()
    await nextTick()
    expect(state.current.value?.nodes).toHaveLength(2)

    state.current.value!.expandedKeys = ['src', 'deleted-folder']
    window.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => expect(state.current.value?.expandedKeys).toEqual(['src']))
    const srcNode = state.current.value?.nodes.find(node => node.key === 'src')
    expect(srcNode?.children).toHaveLength(1)
    expect(srcNode?.children?.[0].key).toBe('src/index.ts')
    expect(state.current.value?.treeFailed).toBe(false)
  })

  it('marks treeFailed when root refresh fails and recovers on next successful refresh', async () => {
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>(value)
    let shouldFail = false
    const listDirectory = vi.fn().mockImplementation(async () => {
      if (shouldFail)
        throw new Error('Disk unreadable')
      return { entries: [{ name: 'file.txt', path: 'file.txt', kind: 'file', unavailable: false }], nextCursor: null }
    })
    const { state } = openFiles(tab, listDirectory)
    await nextTick()
    expect(state.current.value?.treeFailed).toBe(false)

    shouldFail = true
    await state.refresh()
    expect(state.current.value?.treeFailed).toBe(true)

    shouldFail = false
    await state.refresh()
    expect(state.current.value?.treeFailed).toBe(false)
    expect(state.current.value?.nodes).toHaveLength(1)
  })

  it('automatically reveals and loads ancestor directories when a nested file path is selected', async () => {
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>(value)
    const listDirectory = vi.fn().mockImplementation(async ({ path }: { path: string }) => {
      if (path === '')
        return { entries: [{ name: 'src', path: 'src', kind: 'directory', unavailable: false }], nextCursor: null }
      if (path === 'src')
        return { entries: [{ name: 'utils', path: 'src/utils', kind: 'directory', unavailable: false }], nextCursor: null }
      if (path === 'src/utils')
        return { entries: [{ name: 'math.ts', path: 'src/utils/math.ts', kind: 'file', unavailable: false }], nextCursor: null }
      return { entries: [], nextCursor: null }
    })
    const { state } = openFiles(tab, listDirectory)
    await Promise.resolve()
    await nextTick()

    tab.value = { ...value, target: { ...value.target, path: 'src/utils/math.ts' } }
    await vi.waitFor(() => expect(state.current.value?.expandedKeys).toEqual(['src', 'src/utils']))
    await vi.waitFor(() => expect(state.current.value?.nodes[0]?.children?.[0]?.children?.[0]?.key).toBe('src/utils/math.ts'))
  })

  it('folds or shows the tree when a card asks, and again on a new request after the user toggled it', async () => {
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>({ ...value, tree: { visible: false, token: 'one' } })
    const { state } = openFiles(tab, vi.fn().mockResolvedValue({ entries: [], nextCursor: null }))
    expect(state.current.value?.treeVisible).toBe(false)
    state.current.value!.treeVisible = true
    tab.value = { ...value, tree: { visible: false, token: 'one' }, target: { ...value.target, path: 'a.md' } }
    await nextTick()
    expect(state.current.value?.treeVisible).toBe(true)
    tab.value = { ...value, tree: { visible: false, token: 'two' } }
    await nextTick()
    expect(state.current.value?.treeVisible).toBe(false)
  })

  it.each(['report.docx', 'report.xlsx', 'report.pptx'])('initializes the file tree folded for an Office card before publishing its view: %s', (path) => {
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>(null)
    const { state } = openFiles(tab, vi.fn().mockResolvedValue({ entries: [], nextCursor: null }))
    const visibility: boolean[] = []
    const stop = watch(state.current, (view) => {
      if (view)
        visibility.push(view.treeVisible)
    }, { flush: 'sync' })
    tab.value = { ...value, target: { ...value.target, path }, tree: { visible: false, token: 'office-card' } }
    stop()
    expect(visibility).toEqual([false])
    expect(state.current.value?.treeVisible).toBe(false)
  })

  it('keeps a card tree folded when its file view is recreated without a new tree request', async () => {
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>({ ...value, target: { ...value.target, path: 'report.docx' }, tree: { visible: false, token: 'office-card' } })
    const { state } = openFiles(tab, vi.fn().mockResolvedValue({ entries: [], nextCursor: null }))
    expect(state.current.value?.treeVisible).toBe(false)
    const previous = state.current.value
    tab.value = { ...tab.value!, target: { ...value.target, path: 'report.docx', revision: 2 } }
    await nextTick()
    expect(state.current.value).not.toBe(previous)
    expect(state.current.value?.treeVisible).toBe(false)
    state.current.value!.treeVisible = true
    await state.refresh()
    expect(state.current.value?.treeVisible).toBe(true)
  })

  it('shows the tree and opens every folder down to a located file or folder, even after a card folded it', async () => {
    const tree: Record<string, { name: string, path: string, kind: 'file' | 'directory', unavailable: boolean }[]> = {
      '': [{ name: 'src', path: 'src', kind: 'directory', unavailable: false }, { name: 'README.md', path: 'README.md', kind: 'file', unavailable: false }],
      'src': [{ name: 'nested', path: 'src/nested', kind: 'directory', unavailable: false }],
      'src/nested': [{ name: 'deep.ts', path: 'src/nested/deep.ts', kind: 'file', unavailable: false }],
    }
    const listDirectory = vi.fn().mockImplementation(async ({ path }: { path: string }) => ({ entries: tree[path] ?? [], nextCursor: null }))
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>({ ...value, tree: { visible: false, token: 'card' } })
    const { state } = openFiles(tab, listDirectory)
    expect(state.current.value?.treeVisible).toBe(false)

    tab.value = { ...value, target: { ...value.target, path: 'src/nested/deep.ts' }, treeTarget: { path: 'src/nested/deep.ts', kind: 'file' } }
    await expect.poll(() => state.current.value?.expandedKeys).toEqual(['src', 'src/nested'])
    expect(state.current.value?.treeVisible).toBe(true)
    expect(state.current.value?.treeFailed).toBe(false)

    state.current.value!.expandedKeys = []
    tab.value = { ...value, treeTarget: { path: 'src/nested', kind: 'directory' } }
    await expect.poll(() => state.current.value?.expandedKeys).toEqual(['src', 'src/nested'])

    tab.value = { ...value, treeTarget: { path: 'src/gone', kind: 'directory' } }
    await expect.poll(() => state.current.value?.treeFailed).toBe(true)
  })

  it('does not walk the folders of the open file again when only the located path is cleared', async () => {
    const listDirectory = vi.fn().mockImplementation(async ({ path }: { path: string }) => ({
      entries: path === '' ? [{ name: 'src', path: 'src', kind: 'directory', unavailable: false }] : [{ name: 'index.ts', path: 'src/index.ts', kind: 'file', unavailable: false }],
      nextCursor: null,
    }))
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>({ ...value, target: { ...value.target, path: 'src/index.ts' }, treeTarget: { path: 'src', kind: 'directory' } })
    const { state } = openFiles(tab, listDirectory)
    await expect.poll(() => state.current.value?.expandedKeys).toEqual(['src'])

    state.current.value!.expandedKeys = []
    tab.value = { ...value, target: { ...value.target, path: 'src/index.ts' } }
    await nextTick()
    await Promise.resolve()
    expect(state.current.value?.expandedKeys).toEqual([])
    tab.value = { ...value, target: { ...value.target, path: 'src/other.ts' } }
    await expect.poll(() => state.current.value?.expandedKeys).toEqual(['src'])
  })

  it('still shows the tree by default when opening the file manager without a card request', () => {
    const tab = shallowRef<TaskFilesContextTab | null>(filesTab())
    const { state } = openFiles(tab, vi.fn().mockResolvedValue({ entries: [], nextCursor: null }))
    expect(state.current.value?.treeVisible).toBe(true)
  })

  it('publishes directory pages before completion and preserves folders expanded during pagination', async () => {
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>(value)
    const nextPage = deferred<{ entries: { name: string, path: string, kind: 'file', unavailable: boolean }[], nextCursor: null }>()
    const listDirectory = vi.fn().mockImplementation(async ({ path, cursor }: { path: string, cursor?: string }) => {
      if (cursor)
        return nextPage.promise
      if (path === 'src')
        return { entries: [{ name: 'nested.ts', path: 'src/nested.ts', kind: 'file', unavailable: false }], nextCursor: null }
      return { entries: [{ name: 'src', path: 'src', kind: 'directory', unavailable: false }], nextCursor: 'src' }
    })
    const { state } = openFiles(tab, listDirectory)
    await vi.waitFor(() => expect(state.current.value?.nodes[0]?.key).toBe('src'))
    expect(state.current.value?.loadingKeys.has('')).toBe(true)
    state.current.value!.expandedKeys = ['src']
    await state.load(state.current.value!.nodes[0]!)
    expect(state.current.value?.nodes[0]?.children?.[0]?.key).toBe('src/nested.ts')
    nextPage.resolve({ entries: [{ name: 'last.txt', path: 'last.txt', kind: 'file', unavailable: false }], nextCursor: null })
    await vi.waitFor(() => expect(state.current.value?.loadingKeys.size).toBe(0))
    expect(state.current.value?.nodes.map(node => node.key)).toEqual(['src', 'last.txt'])
    expect(state.current.value?.nodes[0]?.children?.[0]?.key).toBe('src/nested.ts')
  })

  it('keeps refreshed root entries visible while a child loads and ignores superseded pages', async () => {
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>(value)
    const child = deferred<{ entries: [], nextCursor: string | null }>()
    let version = 'before.txt'
    const listDirectory = vi.fn().mockImplementation(async ({ path }: { path: string }) => path === 'src'
      ? child.promise
      : {
          entries: [{ name: 'src', path: 'src', kind: 'directory', unavailable: false }, { name: version, path: version, kind: 'file', unavailable: false }],
          nextCursor: null,
        })
    const { state } = openFiles(tab, listDirectory)
    await vi.waitFor(() => expect(state.current.value?.loadingKeys.size).toBe(0))
    state.current.value!.expandedKeys = ['src']
    const oldLoad = state.load(state.current.value!.nodes[0]!)
    version = 'after.txt'
    const refresh = state.refresh()
    await vi.waitFor(() => expect(state.current.value?.nodes[1]?.key).toBe('after.txt'))
    expect(state.current.value?.loadingKeys.has('src')).toBe(true)
    tab.value = { ...value, target: { ...value.target, revision: 2 } }
    await vi.waitFor(() => expect(state.current.value?.loadingKeys.size).toBe(0))
    child.resolve({ entries: [], nextCursor: 'old-page' })
    await Promise.all([oldLoad, refresh])
    expect(state.current.value?.nodes[0]?.children).toBeUndefined()
    expect(listDirectory.mock.calls.some(([input]) => input.cursor === 'old-page')).toBe(false)
  })

  it('refreshes only visible directories and restores nested expansion when a parent reopens', async () => {
    const value = filesTab()
    const tab = shallowRef<TaskFilesContextTab | null>(value)
    const listDirectory = vi.fn().mockImplementation(async ({ path }: { path: string }) => ({ entries: [
      path === ''
        ? { name: 'src', path: 'src', kind: 'directory', unavailable: false }
        : path === 'src'
          ? { name: 'deep', path: 'src/deep', kind: 'directory', unavailable: false }
          : { name: 'note.txt', path: 'src/deep/note.txt', kind: 'file', unavailable: false },
    ], nextCursor: null }))
    const { state } = openFiles(tab, listDirectory)
    await vi.waitFor(() => expect(state.current.value?.loadingKeys.size).toBe(0))
    state.current.value!.expandedKeys = ['src', 'src/deep']
    await state.load(state.current.value!.nodes[0]!)
    state.current.value!.expandedKeys = ['src/deep']
    listDirectory.mockClear()
    await state.refresh()
    expect(listDirectory.mock.calls.map(([input]) => input.path)).toEqual([''])
    expect(state.current.value?.expandedKeys).toEqual(['src/deep'])
    state.current.value!.expandedKeys = ['src', 'src/deep']
    await state.load(state.current.value!.nodes[0]!)
    expect(state.current.value?.nodes[0]?.children?.[0]?.children?.[0]?.key).toBe('src/deep/note.txt')
  })

  it('preserves selection and updates file counts when the same change set refreshes', async () => {
    const changeSet = shallowRef<LocalChangeSetSummary>(createChanges('set-a'))
    const refresh = deferred<LocalChangeSetDetail>()
    const getDetail = vi.fn().mockResolvedValueOnce(createChanges('set-a')).mockReturnValueOnce(refresh.promise)
    const { state } = own(() => useContextChanges({ hasTab: () => true, tab: computed<TaskChangesContextTab>(() => ({ id: 'changes:conversation', scope: 'task:conversation', conversationId: 'conversation', kind: 'changes', changeSet: changeSet.value, branchId: 'branch', revision: changeSet.value.updatedAt })), getChangeSet: getDetail, getOverview: async () => createChanges('all') }))
    await nextTick()
    state.current.value!.selectedFileId = 'second'
    changeSet.value = { ...changeSet.value, updatedAt: '2026-09-09T00:00:00.000Z' }
    expect(state.current.value?.selectedFileId).toBe('second')
    expect(state.current.value?.loading).toBe(false)
    const refreshed = createChanges('set-a')
    refresh.resolve({ ...refreshed, files: refreshed.files.map((file, index) => index === 0 ? { ...file, afterText: 'updated\nextra\n' } : file) })
    await nextTick()
    expect(state.current.value?.selectedFileId).toBe('second')
    expect(state.nodes.value.map(node => node.lineCounts)).toEqual([{ added: 2, deleted: 1 }, { added: 1, deleted: 1 }])
    expect(state.counts.value).toEqual({ added: 3, deleted: 2 })
    getDetail.mockResolvedValueOnce({ ...createChanges('set-a'), files: createChanges('set-a').files.slice(0, 1) })
    changeSet.value = { ...changeSet.value, updatedAt: '2026-09-10T00:00:00.000Z' }
    await nextTick()
    expect(state.current.value?.selectedFileId).toBe('first')
  })

  it('invalidates change loads across A to B to A and disposal', async () => {
    const pending = deferred<LocalChangeSetDetail>()
    const changeSet = shallowRef<LocalChangeSetSummary>(createChanges('a'))
    const getDetail = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(createChanges('current'))
    const { state, stop } = own(() => useContextChanges({ hasTab: () => true, tab: computed<TaskChangesContextTab>(() => ({ id: 'changes:conversation', scope: 'task:conversation', conversationId: 'conversation', kind: 'changes', changeSet: changeSet.value, branchId: 'branch', revision: changeSet.value.updatedAt })), getChangeSet: getDetail, getOverview: async () => createChanges('all') }))
    changeSet.value = createChanges('b')
    changeSet.value = createChanges('a')
    await nextTick()
    pending.reject(new Error('old a'))
    await nextTick()
    expect(state.current.value?.detail?.files[0]?.path).toBe('current-first.ts')
    expect(state.current.value?.failed).toBe(false)
    const last = deferred<LocalChangeSetDetail>()
    getDetail.mockReturnValueOnce(last.promise)
    changeSet.value = createChanges('last')
    stop()
    last.resolve(createChanges('last'))
    await nextTick()
    expect(state.current.value).toBeNull()
  })
})

function filesTab(): TaskFilesContextTab {
  return { id: 'files:first', scope: 'task:first', kind: 'files', rootName: 'fixture', target: { spaceId: 'space', directoryId: 'directory', revision: 1, path: '' } }
}

function openFiles(tab: Ref<TaskFilesContextTab | null>, listDirectory: WorkspaceFilesApi['listDirectory'], hasTab = () => true) {
  return own(() => useWorkspaceFilePreview(tab, { listDirectory, readFile: vi.fn(), revealFile: vi.fn(), onFilesChanged: () => () => {}, fileHistory: async () => [], acknowledgeFileOperation: vi.fn(), cancelFileOperation: async () => null }, hasTab))
}

function createChanges(setId: string): LocalChangeSetDetail {
  return { changeSetId: setId, conversationId: 'conversation', coverage: 'complete', fileCount: 2, runId: 'run', status: 'completed', updatedAt: '2026-09-08T00:00:00.000Z', files: ['first', 'second'].map(id => ({ afterSizeBytes: 1, afterText: 'b', beforeSizeBytes: 1, beforeText: 'a', changeType: 'modified', id, language: 'typescript', path: `${setId}-${id}.ts`, preview: 'text', redacted: false })) }
}
