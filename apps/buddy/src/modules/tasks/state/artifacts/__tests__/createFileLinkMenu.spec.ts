import type { TaskFile } from '@buddy-shared/files/taskFileApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { TaskCapability, TaskResourcePanel } from '../../../contracts'
import { resolveBuiltinFileOpening } from '@buddy-shared/files/fileOpening'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { createFileLinkMenu } from '../createFileLinkMenu'

function fixture(file: TaskFile, root = '/workspace') {
  const space = {
    id: 'space',
    primaryDirectory: { id: 'directory', spaceId: 'space', root, canonicalRoot: root, revision: 1, revokedAt: null },
    additionalDirectories: [],
    workspaceDirectory: null,
    revokedAt: null,
  } as unknown as LocalSpace
  const activeTaskId = shallowRef<string | null>('conversation')
  const branchId = shallowRef<string | null>('branch')
  const draftId = shallowRef<string | null>('draft')
  const task = {
    session: { activeTaskId, activeSpace: shallowRef<LocalSpace | null>(space) },
    workspace: { session: { activeBranchId: branchId }, composer: { draftId } },
  } as unknown as TaskCapability
  const locateFile = vi.fn()
  const resources = {
    fileArtifact: vi.fn(() => null),
    locateFile,
    previewFile: vi.fn(),
    onFileError: vi.fn(),
  } as unknown as TaskResourcePanel
  const menu = createFileLinkMenu({
    resources,
    task: () => task,
    artifacts: { canReferenceFile: () => true } as never,
    files: { resolve: async () => file } as never,
    opening: { ensureReady: async () => {}, resolve: resolveBuiltinFileOpening },
    language: () => 'en-US',
    writeClipboardText: async () => {},
  })
  return { menu, locateFile }
}

describe('file-link locate menu', () => {
  it('locates a space file with its space target', async () => {
    const file: TaskFile = {
      target: { conversationId: 'conversation', path: '/workspace/report.md' },
      root: '/workspace',
      relativePath: 'report.md',
      name: 'report.md',
      kind: 'file',
      mimeType: 'text/markdown',
      sizeBytes: 10,
      updatedAt: '2026-09-10T00:00:00.000Z',
    }
    const { menu, locateFile } = fixture(file)
    const actions = await menu('/workspace/report.md', { conversationId: 'conversation', runId: 'run' })
    const locate = actions.find(action => action.key === 'locate')!
    expect(locate.disabled).toBe(false)
    await locate.run?.()
    expect(locateFile).toHaveBeenCalledWith({ spaceId: 'space', directoryId: 'directory', revision: 1, path: 'report.md' }, 'file', { conversationId: 'conversation', runId: 'run' })
  })

  it('locates a non-space file through its authorized directory root', async () => {
    const file: TaskFile = {
      target: { conversationId: 'conversation', path: '/work/out/reports/a.md' },
      root: '/work/out',
      relativePath: 'reports/a.md',
      name: 'a.md',
      kind: 'file',
      mimeType: 'text/markdown',
      sizeBytes: 10,
      updatedAt: '2026-09-10T00:00:00.000Z',
    }
    const { menu, locateFile } = fixture(file)
    const actions = await menu('/work/out/reports/a.md', { conversationId: 'conversation', runId: 'run' })
    const locate = actions.find(action => action.key === 'locate')!
    expect(locate.disabled).toBe(false)
    await locate.run?.()
    expect(locateFile).toHaveBeenCalledWith({ conversationId: 'conversation', root: '/work/out', path: 'reports/a.md' }, 'file', { conversationId: 'conversation', runId: 'run' })
  })

  it('locates a space root directory with its space target', async () => {
    const file: TaskFile = {
      target: { conversationId: 'conversation', path: '/workspace' },
      root: '/workspace',
      relativePath: '',
      name: 'workspace',
      kind: 'directory',
      mimeType: 'inode/directory',
      sizeBytes: 0,
      updatedAt: '2026-09-10T00:00:00.000Z',
    }
    const { menu, locateFile } = fixture(file)
    const actions = await menu('/workspace', { conversationId: 'conversation', runId: 'run' })
    const locate = actions.find(action => action.key === 'locate')!
    expect(locate.disabled).toBe(false)
    await locate.run?.()
    expect(locateFile).toHaveBeenCalledWith({ spaceId: 'space', directoryId: 'directory', revision: 1, path: '' }, 'directory', { conversationId: 'conversation', runId: 'run' })
  })
})
