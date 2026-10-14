import type { LocalChatIpcContext } from '../registrar'
import { describe, expect, it, vi } from 'vitest'
import { buddiesRpc, legacyBuddyProfileRpc } from '../../../../shared/buddies/buddyApi'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../../shared/localChatApi'
import { registerBuddiesIpc } from '../buddies'

const decodable = new Set<string>()
vi.mock('electron', () => ({
  nativeImage: {
    createFromDataURL: (value: string) => ({
      isEmpty: () => !decodable.has(value),
      resize: () => ({ toDataURL: () => 'data:image/png;base64,UkVTSVpFRA==' }),
    }),
  },
}))
vi.mock('../../platform/systemProfile', () => ({ getSystemUserProfile: vi.fn() }))

function fixture(avatar: string) {
  const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>()
  const request = vi.fn(async (contract: { method: string }) => contract === buddiesRpc.list ? { buddies: [] } : {})
  const recordDiagnostic = vi.fn()
  const migrateAgentProfile = vi.fn(async (migrate: (profile: { name: string, avatar: string }) => Promise<void>) => {
    await migrate({ name: '小律', avatar })
  })
  registerBuddiesIpc({
    handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler),
    request,
    options: { configStore: { migrateAgentProfile }, recordDiagnostic },
  } as unknown as LocalChatIpcContext)
  return { list: () => handlers.get(LOCAL_CHAT_IPC_CHANNELS.buddiesList)!({}, undefined), request, recordDiagnostic }
}

describe('registerBuddiesIpc legacy identity migration', () => {
  it('keeps the legacy name and falls back to the default avatar when Electron cannot decode the image', async () => {
    const f = fixture('data:image/webp;base64,V0VCUA==')

    await expect(f.list()).resolves.toEqual({ buddies: [] })

    expect(f.request).toHaveBeenNthCalledWith(1, legacyBuddyProfileRpc, { name: '小律', avatar: null })
    expect(f.request).toHaveBeenNthCalledWith(2, buddiesRpc.list, {})
    expect(f.recordDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ event: 'buddy.legacy_avatar.dropped', errorCode: 'LEGACY_AGENT_AVATAR_INVALID' }))
  })

  it('converts a decodable legacy avatar without reporting a fallback', async () => {
    decodable.add('data:image/png;base64,UE5H')
    const f = fixture('data:image/png;base64,UE5H')

    await f.list()

    expect(f.request).toHaveBeenNthCalledWith(1, legacyBuddyProfileRpc, { name: '小律', avatar: 'data:image/png;base64,UkVTSVpFRA==' })
    expect(f.recordDiagnostic).not.toHaveBeenCalled()
  })
})
