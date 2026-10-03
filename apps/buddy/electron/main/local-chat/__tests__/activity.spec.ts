import type { LocalChatIpcContext } from '../registrar'
import { expect, it, vi } from 'vitest'
import { artifactsRpc } from '../../../../shared/artifacts/artifactApi'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../../shared/localChatApi'
import { registerActivityIpc } from '../activity'

const open = vi.hoisted(() => vi.fn().mockResolvedValue({ status: 'opened' }))
vi.mock('../artifactExternalOpen', () => ({ openArtifactEntry: open }))

it('resolves artifact IDs on the service before performing each host action and rejects arbitrary paths', async () => {
  const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>()
  const entry = { path: 'C:\\reports\\report.docx', kind: 'file' }
  const request = vi.fn().mockResolvedValue(entry)
  registerActivityIpc({ handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler), request, options: { getWindow: () => null } } as unknown as LocalChatIpcContext)
  const handler = handlers.get(LOCAL_CHAT_IPC_CHANNELS.artifactsOpenExternal)!
  for (const action of ['open', 'reveal', 'choose-app']) {
    await expect(handler({}, { conversationId: 'conversation-1', artifactId: 'artifact-1', action })).resolves.toEqual({ status: 'opened' })
    expect(request).toHaveBeenLastCalledWith(artifactsRpc.resolveExternalEntry, { conversationId: 'conversation-1', artifactId: 'artifact-1' })
    expect(open).toHaveBeenLastCalledWith(entry, action, null)
  }
  const calls = request.mock.calls.length
  await expect(handler({}, { conversationId: 'conversation-1', artifactId: 'artifact-1', action: 'open', path: 'C:\\arbitrary.exe' })).rejects.toThrow()
  await expect(handler({}, { conversationId: 'conversation-1', artifactId: 'artifact-1', action: 'run-command' })).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(calls)
  request.mockRejectedValueOnce(new Error('ARTIFACT_NOT_FOUND'))
  await expect(handler({}, { conversationId: 'other', artifactId: 'artifact-1', action: 'open' })).rejects.toThrow('ARTIFACT_NOT_FOUND')
  expect(open).toHaveBeenCalledTimes(3)
})
