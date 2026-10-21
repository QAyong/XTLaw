import type { LocalChatIpcContext } from '../registrar'
import { beforeEach, expect, it, vi } from 'vitest'
import { spaceFilesRpc } from '../../../../shared/spaces/spaceFileApi'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../../shared/localChatApi'
import { registerSpacesIpc } from '../spaces'

const open = vi.hoisted(() => vi.fn())
vi.mock('../artifactExternalOpen', () => ({ openArtifactEntry: open }))
vi.mock('electron', () => ({ shell: { openPath: vi.fn(), showItemInFolder: vi.fn() } }))
vi.mock('../nativeSelection', () => ({ selectPaths: vi.fn() }))

beforeEach(() => open.mockReset().mockResolvedValue({ status: 'opened' }))

function fixture() {
  const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>()
  const entry = { path: 'C:/reports/report.docx', kind: 'file' }
  const request = vi.fn().mockResolvedValue(entry)
  registerSpacesIpc({ handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler), request, options: { getWindow: () => null } } as unknown as LocalChatIpcContext)
  return { handler: handlers.get(LOCAL_CHAT_IPC_CHANNELS.spaceFilesOpenExternal)!, request, entry }
}
const target = { spaceId: 'space-1', directoryId: 'directory-1', revision: 1, path: 'report.docx' }

it('resolves a Space file on the service before each external action', async () => {
  const f = fixture()
  for (const action of ['open', 'reveal', 'choose-app']) {
    await expect(f.handler({}, { ...target, action })).resolves.toEqual({ status: 'opened' })
    expect(f.request).toHaveBeenLastCalledWith(spaceFilesRpc.locate, target)
    expect(open).toHaveBeenLastCalledWith(f.entry, action, null)
  }
})

it('rejects extra host paths, invalid revisions and unknown actions before resolution', async () => {
  const f = fixture()
  for (const input of [
    { ...target, action: 'open', absolutePath: 'C:/arbitrary.exe' },
    { ...target, action: 'open', revision: 0 },
    { ...target, action: 'run-command' },
  ]) {
    await expect(f.handler({}, input)).rejects.toThrow()
  }
  expect(f.request).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
})

it('does not open a missing, revoked or stale target when service resolution fails', async () => {
  const f = fixture()
  f.request.mockRejectedValueOnce(new Error('DIRECTORY_UNAVAILABLE'))
  await expect(f.handler({}, { ...target, action: 'open' })).rejects.toThrow('DIRECTORY_UNAVAILABLE')
  expect(open).not.toHaveBeenCalled()
})

it('returns the native application fallback status to the menu', async () => {
  const f = fixture()
  open.mockResolvedValueOnce({ status: 'choose-app' })
  await expect(f.handler({}, { ...target, action: 'open' })).resolves.toEqual({ status: 'choose-app' })
})
