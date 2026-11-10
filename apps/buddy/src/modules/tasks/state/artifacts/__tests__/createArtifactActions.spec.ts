import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { JSONContent } from '@tiptap/core'
import type { TaskCapability } from '../../../contracts'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { createArtifactActions } from '../createArtifactActions'

const artifact = { artifactId: 'artifact', conversationId: 'conversation', runId: 'run', kind: 'file', path: '/workspace/report.md' } as LocalArtifact

function fixture() {
  const content = shallowRef<JSONContent>({ type: 'doc', attrs: { panelResourceIds: ['existing'], quotes: [{ id: 'quote' }] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'keep draft' }] }] })
  const draftId = shallowRef('draft')
  const editorKey = shallowRef('editor')
  const branchId = shallowRef('branch')
  const selected: unknown[] = []
  let resolve = async () => 'resource'
  const task = {
    workspace: {
      composer: {
        draftId,
        editorKey,
        composerContent: content,
        draft: shallowRef('keep draft'),
        selectSource: async (source: unknown, id: string) => {
          selected.push({ source, draftId: id })
          return resolve()
        },
        updateComposerContent: (_text: string, document: JSONContent) => content.value = document,
      },
      session: {
        activeConversationId: shallowRef('conversation'),
        activeBranchId: branchId,
        activeSpace: shallowRef<LocalSpace | null>(null),
      },
      restoration: { state: shallowRef('ready') },
      status: { isClosing: shallowRef(false) },
      execution: { isSending: shallowRef(false), isMutatingBranch: shallowRef(false) },
    },
  }
  const locateArtifact = vi.fn(async (_artifact: LocalArtifact) => {})
  const actions = createArtifactActions({
    task: () => task as unknown as TaskCapability,
    resources: { locateArtifact },
    revealFile: async () => {},
    writeClipboardText: async () => {},
  })
  return { actions, content, draftId, editorKey, branchId, locateArtifact, selected, pending: (promise: Promise<string>) => resolve = () => promise }
}

describe('artifact card actions', () => {
  it('references the exact artifact and branch while preserving the latest draft and quotes', async () => {
    const f = fixture()
    const pending = Promise.withResolvers<string>()
    f.pending(pending.promise)
    const request = f.actions.referenceArtifact(artifact)
    f.content.value = { ...f.content.value, attrs: { ...f.content.value.attrs, panelResourceIds: ['existing', 'newer'] } }
    pending.resolve('resource')
    expect(await request).toBe(true)
    expect(f.selected).toEqual([{ source: { artifactId: 'artifact', conversationId: 'conversation', branchId: 'branch' }, draftId: 'draft' }])
    expect(f.content.value).toEqual({
      type: 'doc',
      attrs: { panelResourceIds: ['existing', 'newer', 'resource'], quotes: [{ id: 'quote' }] },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'keep draft' }] }],
    })
  })

  it.each(['draft', 'editor', 'branch'] as const)('does not attach a late reference to a changed %s', async (identity) => {
    const f = fixture()
    const pending = Promise.withResolvers<string>()
    f.pending(pending.promise)
    const request = f.actions.referenceArtifact(artifact)
    ;({ draft: f.draftId, editor: f.editorKey, branch: f.branchId })[identity].value = 'changed'
    pending.resolve('late')
    expect(await request).toBe(false)
    expect(f.content.value.attrs?.panelResourceIds).toEqual(['existing'])
  })

  it.each([{ attachmentId: 'attachment' }, { resourceId: 'message-resource' }])('references a message image without replacing the draft: %o', async (resource) => {
    const f = fixture()
    const source = { conversationId: 'conversation', branchId: 'branch', messageId: 'message', ...resource }
    const before = f.content.value
    expect(await f.actions.referenceSource('conversation', source)).toBe(true)
    expect(f.selected).toEqual([{ source, draftId: 'draft' }])
    expect(f.content.value).toEqual({ ...before, attrs: { ...before.attrs, panelResourceIds: ['existing', 'resource'] } })
    await expect(f.actions.referenceSource('other', { ...source, conversationId: 'other' })).rejects.toThrow('ARTIFACT_REFERENCE_UNAVAILABLE')
    expect(f.content.value.attrs?.panelResourceIds).toEqual(['existing', 'resource'])
  })

  it('allows locating an output without a space through the shared artifact resolver', async () => {
    const f = fixture()
    const desktop = { ...artifact, path: '/desktop/report.md' }
    expect(f.actions.canLocate(desktop)).toBe(true)
    await f.actions.execute('locate', desktop)
    expect(f.locateArtifact).toHaveBeenCalledExactlyOnceWith(desktop)
  })

  it('propagates a failed artifact location instead of guessing a directory', async () => {
    const f = fixture()
    f.locateArtifact.mockRejectedValueOnce(new Error('DIRECTORY_NOT_AUTHORIZED'))
    await expect(f.actions.execute('locate', artifact)).rejects.toThrow('DIRECTORY_NOT_AUTHORIZED')
  })

  it('does not reference or locate an artifact in a different conversation', async () => {
    const f = fixture()
    const other = { ...artifact, conversationId: 'other' }
    expect(f.actions.canReference(other)).toBe(false)
    expect(f.actions.canLocate(other)).toBe(false)
    await expect(f.actions.execute('locate', other)).rejects.toThrow('ARTIFACT_FILE_TARGET_UNAVAILABLE')
    expect(f.locateArtifact).not.toHaveBeenCalled()
    await expect(f.actions.execute('reference', other)).rejects.toThrow('ARTIFACT_REFERENCE_UNAVAILABLE')
    expect(f.content.value.attrs?.panelResourceIds).toEqual(['existing'])
  })
})
