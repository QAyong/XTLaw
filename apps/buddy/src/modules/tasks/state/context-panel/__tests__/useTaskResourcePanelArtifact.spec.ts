import type { DesktopArtifactOpening, DesktopBrowserApi } from '@buddy-electron/shared/desktopApi'
import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { FileOpeningProvider } from '@buddy-shared/files/fileOpening'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
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

function artifact(overrides: Partial<LocalArtifact> = {}): LocalArtifact {
  return { artifactId: 'artifact', conversationId: 'conversation', createdAt: now, kind: 'file', mimeType: 'text/markdown', name: 'report.md', path: '/workspace/docs/report.md', previewUrl: null, runId: 'run', sizeBytes: 100, sourceArtifactId: null, sourceToolCallId: 'tool', updatedAt: now, ...overrides }
}

function folder(overrides: Partial<LocalArtifact> = {}): LocalArtifact {
  return artifact({ artifactId: 'folder', kind: 'directory', mimeType: 'inode/directory', name: 'reports', path: '/workspace/docs/reports', sizeBytes: 0, ...overrides })
}

function fixture(activeSpace: LocalSpace | null = space(), extra: { artifactOpening?: DesktopArtifactOpening, providers?: FileOpeningProvider[], defaults?: Record<string, { standalone?: string }>, outputs?: LocalArtifact[] } = {}) {
  const browser: Pick<DesktopBrowserApi, 'onStateChanged' | 'ensureSession' | 'close' | 'openArtifact' | 'openFile' | 'navigate'> = {
    navigate: async () => { throw new Error('unexpected navigation') },
    onStateChanged: () => () => {},
    ensureSession: async () => { throw new Error('unexpected session') },
    close: async () => {},
    openArtifact: async () => { throw new Error('unexpected browser artifact') },
    openFile: async () => { throw new Error('unexpected browser file link') },
  }
  const { scope, options } = contextPanelFixture({ activeConversationId: shallowRef<string | null>('conversation'), activeSpace: shallowRef(activeSpace), spaces: shallowRef(activeSpace ? [activeSpace] : []), runOutputs: shallowRef(extra.outputs ? [{ runId: 'run', createdAt: now, sourceToolCallId: 'tool', artifacts: extra.outputs }] : []) })
  const artifactOpening = shallowRef<DesktopArtifactOpening>(extra.artifactOpening ?? 'file-manager')
  const open = vi.fn(async () => {})
  const openFile = vi.fn(async () => {})
  const files = { resolve: async ({ conversationId, href }: { conversationId: string, href: string }) => ({ target: { conversationId, path: href }, name: href.split('/').at(-1)!, kind: 'file' as const, mimeType: 'application/octet-stream', sizeBytes: 10, updatedAt: now }) }
  const fileOpening = extra.providers
    ? { ensureReady: async () => {}, resolve: (name: string, location: 'standalone') => resolveFileOpening({ providers: [...builtinFileOpeningProviders, ...extra.providers!], defaults: extra.defaults ?? {} }, name, location), open }
    : undefined
  const panel = scope.run(() => useTaskResourcePanel({ ...options, artifactOpening, ...(fileOpening ? { fileOpening } : {}), autoCollapse: shallowRef(false), linkOpening: shallowRef('in-app'), files, openFile, browser }))!
  return { panel, artifactOpening, open, openFile }
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

  it('opens with the provider the user picked instead of routing to the file manager, and routes again without one', async () => {
    const { panel } = fixture(space(), { outputs: [artifact()] })
    await panel.previewFile('/workspace/docs/report.md', undefined, 'lexora.text')
    expect(panel.activeTab.value).toMatchObject({ kind: 'artifact', providerId: 'lexora.text' })
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

  it('keeps the output tab when the task has no space', async () => {
    const { panel } = fixture(null)
    await panel.openArtifact(artifact())
    expect(panel.activeTab.value).toMatchObject({ kind: 'artifact', artifact: { artifactId: 'artifact' } })
  })

  it('keeps the output tab for files outside the space directory', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact({ path: '/elsewhere/report.md' }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'artifact' })
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

  it('keeps the output tab for a folder outside the space', async () => {
    const { panel } = fixture()
    await panel.openArtifact(folder({ path: '/elsewhere/reports' }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'artifact', artifact: { name: 'reports' } })
  })

  it('keeps the output tab for outputs the file preview cannot hold', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact({ artifactId: 'large-text', sizeBytes: 1024 * 1024 + 1 }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'artifact', artifact: { artifactId: 'large-text' } })
    await panel.openArtifact(artifact({ artifactId: 'large-image', mimeType: 'image/png', name: 'chart.png', path: '/workspace/chart.png', sizeBytes: 8 * 1024 * 1024 + 1 }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'artifact', artifact: { artifactId: 'large-image' } })
  })

  it('keeps the output tab for another task\'s output', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact({ conversationId: 'other' }))
    expect(panel.allTabs.value).toMatchObject([{ kind: 'artifact', artifact: { conversationId: 'other' } }])
  })

  describe('with the output panel chosen as the output card location', () => {
    it('keeps files and folders of the task space in the output panel and follows the setting live', async () => {
      const { panel, artifactOpening } = fixture(space(), { artifactOpening: 'panel' })
      await panel.openArtifact(artifact())
      expect(panel.activeTab.value).toMatchObject({ kind: 'artifact', artifact: { artifactId: 'artifact' } })
      await panel.openArtifact(folder())
      expect(panel.activeTab.value).toMatchObject({ kind: 'artifact', artifact: { artifactId: 'folder' } })
      artifactOpening.value = 'file-manager'
      await panel.openArtifact(artifact({ artifactId: 'again' }))
      expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: 'docs/report.md' } })
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

    it('keeps the output tab for another space default folder', async () => {
      const { panel } = fixture(folderlessSpace())
      await panel.openArtifact(artifact({ path: '/data/spaces/other/workspace/report.md' }))
      expect(panel.activeTab.value).toMatchObject({ kind: 'artifact' })
    })

    it('goes back to the output tab once the space has a local folder', async () => {
      const { panel } = fixture(space())
      await panel.openArtifact(output('docs/report.md'))
      expect(panel.activeTab.value).toMatchObject({ kind: 'artifact' })
    })
  })
})
