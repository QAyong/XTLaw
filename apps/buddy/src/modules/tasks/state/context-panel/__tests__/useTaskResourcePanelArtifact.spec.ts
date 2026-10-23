import type { DesktopBrowserApi } from '@buddy-electron/shared/desktopApi'
import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
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

function fixture(activeSpace: LocalSpace | null = space()) {
  const browser: Pick<DesktopBrowserApi, 'onStateChanged' | 'ensureSession' | 'close' | 'openArtifact' | 'navigate'> = {
    navigate: async () => { throw new Error('unexpected navigation') },
    onStateChanged: () => () => {},
    ensureSession: async () => { throw new Error('unexpected session') },
    close: async () => {},
    openArtifact: async () => { throw new Error('unexpected browser artifact') },
  }
  const { scope, options } = contextPanelFixture({ activeConversationId: shallowRef<string | null>('conversation'), activeSpace: shallowRef(activeSpace) })
  const panel = scope.run(() => useTaskResourcePanel({ ...options, autoCollapse: shallowRef(false), linkOpening: shallowRef('in-app'), browser }))!
  return { panel }
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

  it.each(['report.docx', 'report.xlsx', 'report.pptx'])('shows the tree for an Office path preview before its output card is registered: %s', async (name) => {
    const { panel } = fixture()
    await panel.previewFile(`/workspace/${name}`)
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: name }, tree: { visible: true } })
  })

  it('shows the tree again when an Office card is opened after a plain file card folded it', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact())
    expect(panel.activeTab.value).toMatchObject({ tree: { visible: false } })
    await panel.openArtifact(artifact({ artifactId: 'office', name: 'brief.docx', path: '/workspace/brief.docx' }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', tree: { visible: true } })
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
