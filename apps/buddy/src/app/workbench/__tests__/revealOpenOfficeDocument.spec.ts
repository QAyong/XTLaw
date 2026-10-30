// @vitest-environment jsdom
import type { DesktopBrowserApi } from '@buddy-electron/shared/desktopApi'
import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { FileTarget, SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskResourcePanel } from '@/modules/tasks/contracts'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { contextPanelFixture } from '@/modules/tasks/state/context-panel/__tests__/contextPanelFixture'
import { useTaskResourcePanel } from '@/modules/tasks/state/context-panel/useTaskResourcePanel'
import { ContributionRegistry } from '@/workbench/services/ContributionRegistry'
import { WorkbenchController } from '@/workbench/services/WorkbenchController'
import { ContextTabProjection } from '../ContextTabProjection'
import { revealOpenOfficeDocument } from '../revealOpenOfficeDocument'

const now = '2026-09-10T00:00:00.000Z'
const target: SpaceFileTarget = { spaceId: 'space', directoryId: 'directory', revision: 1, path: 'report.docx' }

function artifact(path = target.path, overrides: Partial<LocalArtifact> = {}): LocalArtifact {
  return { artifactId: 'artifact', conversationId: 'conversation', createdAt: now, kind: 'file', mimeType: 'application/octet-stream', name: path.split('/').at(-1)!, path: `/workspace/${path}`, previewUrl: null, runId: 'run', sizeBytes: 100, sourceArtifactId: null, sourceToolCallId: 'tool', updatedAt: now, ...overrides }
}

function fixture() {
  const space: LocalSpace = {
    id: 'space',
    name: 'Files',
    icon: 'folder',
    iconColor: 'default',
    memoryScope: 'space_only',
    activeRunCount: 0,
    additionalDirectories: [],
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    primaryDirectory: { id: 'directory', spaceId: 'space', root: '/workspace', canonicalRoot: '/workspace', revision: 1, accessGrantedAt: now, resourcesTrustedAt: now, revokedAt: null, createdAt: now, updatedAt: now },
  }
  const registry = new ContributionRegistry()
  const registration = registry.register('office-test', (scope) => {
    scope.view({ id: 'office-test.editor', renderer: 'office-test.editor', label: 'Office', locations: ['context'], multiple: true, supports: resource => resource.scheme === 'extension' })
    scope.view({ id: 'office-test.fallback', renderer: 'office-test.fallback', label: 'Preview', locations: ['context'], multiple: true, supports: resource => resource.scheme === 'file-preview' })
  })
  const controller = new WorkbenchController(registry)
  const browser: Pick<DesktopBrowserApi, 'onStateChanged' | 'ensureSession' | 'close' | 'openArtifact' | 'openFile' | 'navigate'> = {
    onStateChanged: () => () => {},
    ensureSession: async () => { throw new Error('unexpected browser session') },
    close: async () => {},
    openArtifact: async () => { throw new Error('unexpected browser preview') },
    openFile: async () => { throw new Error('unexpected browser file link') },
    navigate: async () => { throw new Error('unexpected browser navigation') },
  }
  const { scope, options } = contextPanelFixture({ activeConversationId: shallowRef<string | null>('conversation'), activeSpace: shallowRef(space), spaces: shallowRef([space]) })
  const files = {
    resolve: async () => {
      throw new Error('unexpected file resolution')
    },
  }
  const openFile = async () => {
    throw new Error('unexpected file opening')
  }
  let panel: TaskResourcePanel
  const reveal = vi.fn((file: FileTarget) => revealOpenOfficeDocument(controller, panel, file))
  panel = scope.run(() => useTaskResourcePanel({ ...options, artifactFileRoot: async () => ({ conversationId: 'conversation', root: '/elsewhere', path: 'report.docx', kind: 'file' }), autoCollapse: shallowRef(false), linkOpening: shallowRef('in-app'), files, openFile, browser, revealOpenOfficeDocument: reveal }))!
  const projection = new ContextTabProjection(controller, () => panel, () => true)
  onTestFinished(async () => {
    projection.dispose()
    await controller.dispose()
  })
  async function openEditor(file: SpaceFileTarget = target, scheme = 'extension') {
    return (await controller.open({ scheme, id: JSON.stringify(file), data: { fileTarget: { ...file } } }, file.path))!
  }
  return { panel, controller, reveal, openEditor, registration }
}

describe('revealing an open Office document that lives in a granted directory', () => {
  it('matches the open editor by conversation, root and path, and not by another root', async () => {
    const f = fixture()
    const granted = { conversationId: 'conversation-1', root: '/work/out', path: 'brief.docx' }
    const id = (await f.controller.open({ scheme: 'extension', id: JSON.stringify(granted), data: { fileTarget: { ...granted } } }, 'brief.docx'))!
    expect(revealOpenOfficeDocument(f.controller, f.panel, granted)).toBe(true)
    expect(f.panel.activeTab.value).toMatchObject({ kind: 'view', viewId: id })
    expect(revealOpenOfficeDocument(f.controller, f.panel, { ...granted, root: '/work/other' })).toBe(false)
    expect(revealOpenOfficeDocument(f.controller, f.panel, { ...granted, conversationId: 'conversation-2' })).toBe(false)
    expect(revealOpenOfficeDocument(f.controller, f.panel, { ...granted, path: 'notes.txt' })).toBe(false)
    expect(revealOpenOfficeDocument(f.controller, f.panel, target)).toBe(false)
  })
})

describe('revealing an open Office document from an artifact card', () => {
  it.each(['report.docx', 'report.xlsx', 'report.pptx', 'REPORT.DOCX'])('returns repeated %s card clicks to the existing editor without touching the file manager', async (path) => {
    const f = fixture()
    const card = artifact(path)
    await f.panel.openArtifact(card)
    const files = f.panel.activeTab.value!
    expect(files.kind).toBe('files')
    // The first open still goes through the existing file-manager/plugin path.
    expect(f.controller.layout.views).toEqual({})
    const id = await f.openEditor({ ...target, path })
    f.controller.updateView(id, { state: { unsaved: 'keep these edits' } })
    const openTabs = f.panel.allTabs.value.map(tab => tab.id)
    for (let i = 0; i < 3; i++) {
      await f.panel.openArtifact(card)
      expect(f.panel.activeTab.value).toMatchObject({ kind: 'view', viewId: id })
      expect(f.controller.context.view?.id).toBe(id)
    }
    expect(f.panel.allTabs.value.map(tab => tab.id)).toEqual(openTabs)
    expect(f.panel.allTabs.value.find(tab => tab.id === files.id)).toBe(files)
    expect(Object.keys(f.controller.layout.views)).toEqual([id])
    expect(f.controller.layout.views[id].state).toEqual({ unsaved: 'keep these edits' })
  })

  it('reveals the editor after manually returning to an expanded file tree without changing that tree', async () => {
    const f = fixture()
    await f.panel.openArtifact(artifact())
    f.panel.openDirectory('/workspace/docs', { conversationId: 'conversation', runId: 'run' })
    const files = f.panel.activeTab.value!
    expect(files).toMatchObject({ kind: 'files', tree: { visible: true } })
    const id = await f.openEditor()
    f.panel.selectTab(files.id)
    expect(f.panel.activeTab.value?.kind).toBe('files')
    await f.panel.openArtifact(artifact())
    expect(f.panel.activeTab.value).toMatchObject({ kind: 'view', viewId: id })
    expect(f.panel.allTabs.value.find(tab => tab.id === files.id)).toBe(files)
  })

  it('reopens a collapsed resource panel on the existing editor', async () => {
    const f = fixture()
    await f.panel.openArtifact(artifact())
    const id = await f.openEditor()
    await f.panel.toggle()
    expect(f.panel.isOpen.value).toBe(false)
    await f.panel.openArtifact(artifact())
    await nextTick()
    expect(f.panel.isOpen.value).toBe(true)
    expect(f.panel.activeTab.value).toMatchObject({ kind: 'view', viewId: id })
  })

  it('keeps the original file-manager path when the plugin editor has been closed', async () => {
    const f = fixture()
    await f.panel.openArtifact(artifact())
    const filesId = f.panel.activeTab.value!.id
    const id = await f.openEditor()
    await f.controller.close(id)
    await f.panel.openArtifact(artifact())
    expect(f.panel.activeTab.value).toMatchObject({ kind: 'files', id: filesId })
    expect(f.panel.allTabs.value).toHaveLength(1)
  })

  it.each([
    { path: 'other/report.docx' },
    { spaceId: 'other-space' },
    { directoryId: 'other-directory' },
    { revision: 2 },
  ])('does not focus an editor for a different file target: %j', async (overrides) => {
    const f = fixture()
    const id = await f.openEditor({ ...target, ...overrides })
    await f.panel.openArtifact(artifact())
    expect(f.panel.activeTab.value?.kind).toBe('files')
    expect(f.panel.activeTab.value?.id).not.toBe(id)
  })

  it('does not reuse plugin tabs outside the current resource scope', async () => {
    const f = fixture()
    const id = await f.openEditor()
    f.panel.openView(id, 'Other task', { conversationId: 'other', runId: 'other-run' })
    await f.panel.openArtifact(artifact())
    expect(f.panel.activeTab.value?.kind).toBe('files')
  })

  it('does not focus an unregistered plugin editor', async () => {
    const f = fixture()
    await f.openEditor()
    f.registration()
    await f.panel.openArtifact(artifact())
    expect(f.panel.activeTab.value?.kind).toBe('files')
  })

  it.each(['report.md', 'report.png', 'report.pdf', 'report.csv'])('leaves non-Office %s cards on their original path', async (path) => {
    const f = fixture()
    await f.openEditor({ ...target, path })
    await f.panel.openArtifact(artifact(path))
    expect(f.panel.activeTab.value?.kind).toBe('files')
  })

  it('does not treat the built-in fallback as an Office plugin editor', async () => {
    const f = fixture()
    await f.openEditor(target, 'file-preview')
    await f.panel.openArtifact(artifact())
    expect(f.panel.activeTab.value?.kind).toBe('files')
  })

  it('leaves folder cards on the file-manager path', async () => {
    const f = fixture()
    await f.openEditor()
    await f.panel.openArtifact(artifact(target.path, { kind: 'directory', mimeType: 'inode/directory' }))
    expect(f.panel.activeTab.value).toMatchObject({ kind: 'files', tree: { visible: true } })
    expect(f.reveal).not.toHaveBeenCalled()
  })

  it('does not take another root\'s file for the editor that is open, and opens its own tab', async () => {
    const f = fixture()
    await f.openEditor()
    await f.panel.openArtifact(artifact(target.path, { path: '/elsewhere/report.docx' }))
    expect(f.panel.activeTab.value).toMatchObject({ kind: 'files', target: { conversationId: 'conversation', root: '/elsewhere', path: 'report.docx' } })
    expect(f.reveal).toHaveBeenCalledExactlyOnceWith({ conversationId: 'conversation', root: '/elsewhere', path: 'report.docx' })
  })
})
