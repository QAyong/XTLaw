import type { DesktopBrowserApi } from '@buddy-electron/shared/desktopApi'
import type { ArtifactFileRoot, LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { FileOpeningProvider } from '@buddy-shared/files/fileOpening'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { FileTarget, SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'
// @vitest-environment jsdom
import { builtinFileOpeningProviders, resolveFileOpening } from '@buddy-shared/files/fileOpening'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { useTaskResourcePanel } from '@/modules/tasks/state/context-panel/useTaskResourcePanel'
import { contextPanelFixture } from './contextPanelFixture'

const now = '2026-09-10T00:00:00.000Z'

function space(): LocalSpace {
  return {
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
}

// A space created without a local folder: it works in its own default folder, which the service derives.
function folderlessSpace(): LocalSpace {
  const { primaryDirectory: _primaryDirectory, ...rest } = space()
  return { ...rest, primaryDirectory: null, workspaceDirectory: { id: 'workspace:space', spaceId: 'space', root: '/data/spaces/space/workspace', canonicalRoot: '/data/spaces/space/workspace', revision: 1, accessGrantedAt: now, revokedAt: null, createdAt: now, updatedAt: now } }
}

// Where the service would say an output sits: the folder it was written to, which is all these tests need.
const written = new Map<string, LocalArtifact>()
async function outputFileRoot(artifactId: string): Promise<ArtifactFileRoot> {
  const item = written.get(artifactId)!
  const directory = item.kind === 'directory'
  const root = directory ? item.path : item.path.slice(0, item.path.lastIndexOf('/')) || '/'
  return { conversationId: item.conversationId, root, path: directory ? '' : item.path.slice(root.length + 1), kind: item.kind }
}

function artifact(overrides: Partial<LocalArtifact> = {}): LocalArtifact {
  const value: LocalArtifact = { artifactId: 'artifact', conversationId: 'conversation', createdAt: now, kind: 'file', mimeType: 'text/markdown', name: 'report.md', path: '/workspace/docs/report.md', previewUrl: null, runId: 'run', sizeBytes: 100, sourceArtifactId: null, sourceToolCallId: 'tool', updatedAt: now, ...overrides }
  written.set(value.artifactId, value)
  return value
}

function folder(overrides: Partial<LocalArtifact> = {}): LocalArtifact {
  return artifact({ artifactId: 'folder', kind: 'directory', mimeType: 'inode/directory', name: 'reports', path: '/workspace/docs/reports', sizeBytes: 0, ...overrides })
}

function fixture(activeSpace: LocalSpace | null = space(), extra: { providers?: FileOpeningProvider[], defaults?: Record<string, { standalone?: string }>, outputs?: LocalArtifact[], revealOpenOfficeDocument?: (target: FileTarget) => boolean, artifactFileRoot?: (artifactId: string) => Promise<ArtifactFileRoot> } = {}) {
  const browser: Pick<DesktopBrowserApi, 'onStateChanged' | 'ensureSession' | 'close' | 'openArtifact' | 'openFile' | 'navigate'> = {
    navigate: async () => { throw new Error('unexpected navigation') },
    onStateChanged: () => () => {},
    ensureSession: async () => { throw new Error('unexpected session') },
    close: async () => {},
    openArtifact: async () => { throw new Error('unexpected browser artifact') },
    openFile: async () => { throw new Error('unexpected browser file link') },
  }
  const { scope, options } = contextPanelFixture({ activeConversationId: shallowRef<string | null>('conversation'), activeSpace: shallowRef(activeSpace), spaces: shallowRef(activeSpace ? [activeSpace] : []), runOutputs: shallowRef(extra.outputs ? [{ runId: 'run', createdAt: now, sourceToolCallId: 'tool', artifacts: extra.outputs }] : []) })
  const open = vi.fn(async () => {})
  const openFile = vi.fn(async (_file: { name: string, kind: string }) => {})
  const files = { resolve: async ({ conversationId, href }: { conversationId: string, href: string }) => ({ target: { conversationId, path: href }, name: href.split('/').at(-1)!, kind: 'file' as const, mimeType: 'application/octet-stream', sizeBytes: 10, updatedAt: now }) }
  const fileOpening = extra.providers
    ? { ensureReady: async () => {}, resolve: (name: string, location: 'standalone') => resolveFileOpening({ providers: [...builtinFileOpeningProviders, ...extra.providers!], defaults: extra.defaults ?? {} }, name, location), open }
    : undefined
  const panel = scope.run(() => useTaskResourcePanel({ ...options, artifactFileRoot: extra.artifactFileRoot ?? outputFileRoot, ...(fileOpening ? { fileOpening } : {}), ...(extra.revealOpenOfficeDocument ? { revealOpenOfficeDocument: extra.revealOpenOfficeDocument } : {}), autoCollapse: shallowRef(false), linkOpening: shallowRef('in-app'), files, openFile, browser }))!
  return { panel, open, openFile, onError: options.onError as unknown as ReturnType<typeof vi.fn> }
}

describe('opening task outputs', () => {
  it('opens an output inside the task space as a space file', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact())
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { spaceId: 'space', directoryId: 'directory', path: 'docs/report.md' }, source: { conversationId: 'conversation', runId: 'run' }, tree: { visible: false } })
    expect((panel.activeTab.value as { expand?: unknown }).expand).toBeUndefined()
  })

  it('opens binary outputs as space files so document plugins can take them', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'brief.docx', path: '/workspace/brief.docx', sizeBytes: 40 * 1024 * 1024 }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: 'brief.docx' }, tree: { visible: true } })
  })

  // Only a link that points to a registered output goes through openArtifact and the file manager; any other path link uses the shared task file opener.
  it.each(['report.docx', 'report.xlsx', 'report.pptx'])('opens an Office path link with no output card through the task file opener, not the file manager: %s', async (name) => {
    const { panel, openFile } = fixture()
    await panel.previewFile(`/workspace/${name}`)
    expect(openFile).toHaveBeenCalledOnce()
    expect(openFile.mock.calls[0]![0]).toMatchObject({ name, kind: 'file' })
    expect(panel.allTabs.value).toHaveLength(0)
  })

  it('shows the tree again when an Office card is opened after a plain file card folded it', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact())
    expect(panel.activeTab.value).toMatchObject({ tree: { visible: false } })
    await panel.openArtifact(artifact({ artifactId: 'office', name: 'brief.docx', path: '/workspace/brief.docx' }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', tree: { visible: true } })
  })

  it('opens a chat link that points to a registered output in the file manager', async () => {
    const { panel, openFile } = fixture(space(), { outputs: [artifact()] })
    await panel.previewFile('/workspace/docs/report.md')
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: 'docs/report.md' }, tree: { visible: false } })
    expect(openFile).not.toHaveBeenCalled()
  })

  it('opens with a built-in provider the user picked in the file manager, like it does without one', async () => {
    const { panel } = fixture(space(), { outputs: [artifact()] })
    await panel.previewFile('/workspace/docs/report.md', undefined, 'lexora.text')
    // A built-in text opener is the file manager too; only a browser or plugin opener goes elsewhere.
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: 'docs/report.md' } })
    await panel.previewFile('/workspace/docs/report.md')
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: 'docs/report.md' } })
  })

  it('folds the tree again for the next file card after a file was located', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact())
    panel.locateFile({ spaceId: 'space', directoryId: 'directory', revision: 1, path: 'docs/report.md' }, 'file')
    expect(panel.activeTab.value).toMatchObject({ treeTarget: { path: 'docs/report.md', kind: 'file' } })
    await panel.openArtifact(artifact({ artifactId: 'next', name: 'next.md', path: '/workspace/docs/next.md' }))
    expect(panel.allTabs.value).toHaveLength(1)
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: 'docs/next.md' }, tree: { visible: false } })
    expect(panel.activeTab.value).toHaveProperty('treeTarget', undefined)
  })

  it('opens an output of a task without a space in the folder it was written to', async () => {
    const { panel } = fixture(null)
    await panel.openArtifact(artifact())
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { conversationId: 'conversation', root: '/workspace/docs', path: 'report.md' } })
  })

  it('opens files outside the space directory in the folder they were written to', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact({ path: '/elsewhere/report.md' }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { conversationId: 'conversation', root: '/elsewhere', path: 'report.md' } })
  })

  it('opens a folder output in the file manager with that folder expanded', async () => {
    const { panel } = fixture()
    await panel.openArtifact(folder())
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: '' }, expand: { path: 'docs/reports' }, tree: { visible: true }, source: { runId: 'run' } })
  })

  it('keeps the file open in the tab when a folder output is opened again', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact())
    const tabId = panel.activeTab.value!.id
    await panel.openArtifact(folder())
    expect(panel.allTabs.value).toHaveLength(1)
    expect(panel.activeTab.value).toMatchObject({ id: tabId, target: { path: 'docs/report.md' }, expand: { path: 'docs/reports' }, tree: { visible: true } })
    const first = (panel.activeTab.value as { expand: { token: string } }).expand.token
    await panel.openArtifact(folder())
    expect((panel.activeTab.value as { expand: { token: string } }).expand.token).not.toBe(first)
  })

  it('opens the space root folder without asking to expand anything', async () => {
    const { panel } = fixture()
    await panel.openArtifact(folder({ path: '/workspace' }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: '' } })
    expect((panel.activeTab.value as { expand?: unknown }).expand).toBeUndefined()
  })

  it('opens a folder outside the space as the root of its own tab', async () => {
    const { panel } = fixture()
    await panel.openArtifact(folder({ path: '/elsewhere/reports' }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', rootName: 'reports', target: { conversationId: 'conversation', root: '/elsewhere/reports', path: '' }, tree: { visible: true } })
  })

  it('opens large outputs of the task space in the file manager, which shows its own too-large state', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact({ artifactId: 'large-text', sizeBytes: 1024 * 1024 + 1 }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { spaceId: 'space', path: 'docs/report.md' } })
    await panel.openArtifact(artifact({ artifactId: 'large-image', mimeType: 'image/png', name: 'chart.png', path: '/workspace/chart.png', sizeBytes: 8 * 1024 * 1024 + 1 }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { spaceId: 'space', path: 'chart.png' } })
  })

  it('opens another task\'s output in a tab of that task', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact({ conversationId: 'other' }))
    expect(panel.allTabs.value).toMatchObject([{ kind: 'files', target: { conversationId: 'other', root: '/workspace/docs', path: 'report.md' } }])
  })

  describe('with an output outside the task space', () => {
    const located = (root: string, path: string, kind: 'file' | 'directory' = 'file', conversationId = 'conversation'): ArtifactFileRoot => ({ conversationId, root, path, kind })

    it('opens a file in a tab rooted at the directory it was written to, with the tree folded like a space file', async () => {
      const artifactFileRoot = vi.fn(async () => located('/work/out', 'docs/report.md'))
      const { panel } = fixture(space(), { artifactFileRoot })
      await panel.openArtifact(artifact({ path: '/work/out/docs/report.md' }))
      expect(artifactFileRoot).toHaveBeenCalledExactlyOnceWith('artifact')
      expect(panel.activeTab.value).toMatchObject({ kind: 'files', rootName: 'out', target: { conversationId: 'conversation', root: '/work/out', path: 'docs/report.md' }, source: { conversationId: 'conversation', runId: 'run' }, tree: { visible: false } })
    })

    it('opens a task without a space in its workspace, and shows the tree for an Office file', async () => {
      const artifactFileRoot = vi.fn(async () => located('/data/conversations/conversation/workspace', 'brief.docx'))
      const { panel } = fixture(null, { artifactFileRoot })
      await panel.openArtifact(artifact({ name: 'brief.docx', path: '/data/conversations/conversation/workspace/brief.docx' }))
      expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { conversationId: 'conversation', root: '/data/conversations/conversation/workspace', path: 'brief.docx' }, tree: { visible: true } })
    })

    it('focuses an Office editor that is already open instead of opening another tab', async () => {
      const artifactFileRoot = async () => located('/work/out', 'brief.docx')
      const reveal = vi.fn((_target: FileTarget) => true)
      const { panel } = fixture(space(), { artifactFileRoot, revealOpenOfficeDocument: reveal })
      await panel.openArtifact(artifact({ name: 'brief.docx', path: '/work/out/brief.docx' }))
      expect(reveal).toHaveBeenCalledExactlyOnceWith({ conversationId: 'conversation', root: '/work/out', path: 'brief.docx' })
      expect(panel.allTabs.value).toEqual([])
    })

    it('reuses the tab of the same directory for the next output, and keeps different directories apart', async () => {
      const roots: Record<string, ArtifactFileRoot> = { a: located('/work/out', 'a.md'), b: located('/work/out', 'sub/b.md'), c: located('/work/other', 'c.md') }
      const { panel } = fixture(space(), { artifactFileRoot: async id => roots[id]! })
      await panel.openArtifact(artifact({ artifactId: 'a', path: '/work/out/a.md' }))
      await panel.openArtifact(artifact({ artifactId: 'b', path: '/work/out/sub/b.md' }))
      expect(panel.allTabs.value).toHaveLength(1)
      expect(panel.activeTab.value).toMatchObject({ target: { root: '/work/out', path: 'sub/b.md' } })
      await panel.openArtifact(artifact({ artifactId: 'c', path: '/work/other/c.md' }))
      expect(panel.allTabs.value).toHaveLength(2)
      expect(panel.activeTab.value).toMatchObject({ target: { root: '/work/other', path: 'c.md' } })
    })

    it('opens a folder with the tree expanded to it, and the directory root itself without expanding anything', async () => {
      const roots: Record<string, ArtifactFileRoot> = { reports: located('/work/out', 'reports', 'directory'), root: located('/work/out', '', 'directory') }
      const { panel } = fixture(space(), { artifactFileRoot: async id => roots[id]! })
      await panel.openArtifact(folder({ artifactId: 'reports', path: '/work/out/reports' }))
      expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { root: '/work/out', path: '' }, expand: { path: 'reports' }, tree: { visible: true } })
      await panel.openArtifact(folder({ artifactId: 'root', path: '/work/out' }))
      expect(panel.allTabs.value).toHaveLength(1)
      expect(panel.activeTab.value).toHaveProperty('expand', undefined)
    })

    it('uses the output\'s own task for another task\'s output', async () => {
      const { panel } = fixture(space(), { artifactFileRoot: async () => located('/work/out', 'a.md', 'file', 'other') })
      await panel.openArtifact(artifact({ conversationId: 'other', runId: 'run-2', path: '/work/out/a.md' }))
      expect(panel.allTabs.value).toMatchObject([{ kind: 'files', target: { conversationId: 'other', root: '/work/out', path: 'a.md' }, source: { conversationId: 'other', runId: 'run-2' } }])
    })

    it('reports an output that cannot be reached instead of falling back to the output tab', async () => {
      const { panel, onError } = fixture(space(), { artifactFileRoot: () => Promise.reject(new Error('DIRECTORY_NOT_AUTHORIZED')) })
      await panel.openArtifact(artifact({ path: '/work/out/report.md' }))
      expect(onError).toHaveBeenCalledOnce()
      expect(panel.allTabs.value).toEqual([])
    })

    it('opens a quote\'s source in the tab of its granted directory and returns the target that tab shows', () => {
      const { panel } = fixture()
      const target = { conversationId: 'conversation', root: '/work/out', path: 'docs/a.md' }
      const opened = panel.openQuoteSourceFile(target)
      expect(panel.activeTab.value).toMatchObject({ kind: 'files', target, tree: { visible: false } })
      expect(opened).toMatchObject({ target, tabId: panel.activeTab.value!.id })
      const office = panel.openQuoteSourceFile({ ...target, path: 'brief.docx' })
      expect(panel.allTabs.value).toHaveLength(1)
      expect(panel.activeTab.value).toMatchObject({ target: { path: 'brief.docx' }, tree: { visible: true } })
      expect(office?.target).toMatchObject({ path: 'brief.docx' })
      expect(panel.openQuoteSourceFile({ ...target, path: '' })).toBeNull()
    })
  })

  describe('with a plugin that opens the type through the file opening choice', () => {
    const base = { title: 'Reader', extensions: ['.docx'], locations: ['standalone'], builtin: false, available: true, renderer: 'extension', extensionId: 'tests.plugin' } as const
    const office: FileOpeningProvider = { ...base, id: 'tests.plugin.office.files', implicit: true }
    const reader: FileOpeningProvider = { ...base, id: 'tests.plugin.reader' }

    it('still opens Office documents of the task space in the file manager when the plugin takes them over on its own', async () => {
      const { panel, open } = fixture(space(), { providers: [office] })
      await panel.openArtifact(artifact({ name: 'brief.docx', path: '/workspace/brief.docx' }))
      expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: 'brief.docx' }, tree: { visible: true } })
      expect(open).not.toHaveBeenCalled()
    })

    it('hands the output to the plugin the user picked to open that type separately', async () => {
      const { panel, open } = fixture(space(), { providers: [office, reader], defaults: { '.docx': { standalone: reader.id } } })
      await panel.openArtifact(artifact({ name: 'brief.docx', path: '/workspace/brief.docx' }))
      expect(panel.allTabs.value).toHaveLength(0)
      expect(open).toHaveBeenCalledWith(expect.objectContaining({ name: 'brief.docx' }), reader, expect.any(Function), expect.any(AbortSignal))
    })
  })

  describe('in a space without a local folder', () => {
    const output = (path: string) => artifact({ path: `/data/spaces/space/workspace/${path}` })

    it('opens a file in its default folder as a space file with the tree folded', async () => {
      const { panel } = fixture(folderlessSpace())
      await panel.openArtifact(output('docs/report.md'))
      expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { spaceId: 'space', directoryId: 'workspace:space', revision: 1, path: 'docs/report.md' }, tree: { visible: false } })
    })

    it('opens a folder in its default folder expanded and focused', async () => {
      const { panel } = fixture(folderlessSpace())
      await panel.openArtifact(folder({ path: '/data/spaces/space/workspace/docs/reports' }))
      expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { directoryId: 'workspace:space', path: '' }, expand: { path: 'docs/reports' }, tree: { visible: true } })
    })

    it('opens another space default folder as a tab of its own', async () => {
      const { panel } = fixture(folderlessSpace())
      await panel.openArtifact(artifact({ path: '/data/spaces/other/workspace/report.md' }))
      expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { conversationId: 'conversation', root: '/data/spaces/other/workspace', path: 'report.md' } })
    })

    it('opens it in the folder it was written to once the space has a local folder', async () => {
      const { panel } = fixture(space())
      await panel.openArtifact(output('docs/report.md'))
      expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { conversationId: 'conversation', root: '/data/spaces/space/workspace/docs', path: 'report.md' } })
    })
  })
})

describe('opening the source file of a quote (Spec-043)', () => {
  const quoted = (path: string, revision = 1): SpaceFileTarget => ({ spaceId: 'space', directoryId: 'directory', revision, path })

  it('opens a plain file in the file manager tab with the tree folded, like an output card', () => {
    const { panel } = fixture()
    const opened = panel.openQuoteSourceFile(quoted('docs/report.md'))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: 'docs/report.md' }, tree: { visible: false } })
    expect(opened).toMatchObject({ target: { path: 'docs/report.md' }, tabId: panel.activeTab.value?.id })
    expect(opened?.viewId).toBeUndefined()
  })

  it('shows the tree for an Office file, and uses the directory revision rather than the saved one', () => {
    const { panel } = fixture()
    const opened = panel.openQuoteSourceFile(quoted('brief.docx', 0))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: 'brief.docx', revision: 1 }, tree: { visible: true } })
    expect(opened?.target).toMatchObject({ revision: 1 })
  })

  it('reuses the tab for the next quote of a file in the same directory', () => {
    const { panel } = fixture()
    panel.openQuoteSourceFile(quoted('a.md'))
    const second = panel.openQuoteSourceFile(quoted('b.md'))
    expect(panel.allTabs.value).toHaveLength(1)
    expect(second?.tabId).toBe(panel.activeTab.value?.id)
    expect(panel.activeTab.value).toMatchObject({ target: { path: 'b.md' } })
  })

  it('focuses an Office editor that is already open and hands back its view', () => {
    const target = quoted('brief.docx')
    const reveal = vi.fn((_target: FileTarget) => true)
    const { panel } = fixture(space(), { revealOpenOfficeDocument: (file) => {
      reveal(file)
      panel.openView('view-1', 'brief.docx')
      return true
    } })
    const opened = panel.openQuoteSourceFile(target)
    expect(reveal).toHaveBeenCalledWith(target)
    expect(opened).toEqual({ target, tabId: 'view-1', viewId: 'view-1' })
    expect(panel.allTabs.value.some(tab => tab.kind === 'files')).toBe(false)
  })

  it('only looks for an open editor for Office files', () => {
    const reveal = vi.fn(() => true)
    const { panel } = fixture(space(), { revealOpenOfficeDocument: reveal })
    panel.openQuoteSourceFile(quoted('docs/report.md'))
    expect(reveal).not.toHaveBeenCalled()
  })

  it.each([
    ['another space', { ...quoted('a.md'), spaceId: 'other' }],
    ['another directory', { ...quoted('a.md'), directoryId: 'other' }],
    ['no path', quoted('')],
  ])('returns null for %s so the caller opens it on its own', (_name, target) => {
    const { panel } = fixture()
    expect(panel.openQuoteSourceFile(target)).toBeNull()
    expect(panel.allTabs.value).toHaveLength(0)
  })

  it('returns null when the task has no space', () => {
    const { panel } = fixture(null)
    expect(panel.openQuoteSourceFile(quoted('a.md'))).toBeNull()
  })
})
