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

function artifact(overrides: Partial<LocalArtifact> = {}): LocalArtifact {
  return { artifactId: 'artifact', conversationId: 'conversation', createdAt: now, kind: 'file', mimeType: 'text/markdown', name: 'report.md', path: '/workspace/docs/report.md', previewUrl: null, runId: 'run', sizeBytes: 100, sourceArtifactId: null, sourceToolCallId: 'tool', updatedAt: now, ...overrides }
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
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { spaceId: 'space', directoryId: 'directory', path: 'docs/report.md' }, source: { conversationId: 'conversation', runId: 'run' } })
  })

  it('opens binary outputs as space files so document plugins can take them', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'brief.docx', path: '/workspace/brief.docx', sizeBytes: 40 * 1024 * 1024 }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { path: 'brief.docx' } })
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

  it('keeps the output tab for directories and for outputs the file preview cannot hold', async () => {
    const { panel } = fixture()
    await panel.openArtifact(artifact({ kind: 'directory', mimeType: 'inode/directory', name: 'docs', path: '/workspace/docs', sizeBytes: 0 }))
    expect(panel.activeTab.value).toMatchObject({ kind: 'artifact', artifact: { name: 'docs' } })
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
})
