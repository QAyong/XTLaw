import type { LocalConnector } from '@buddy-shared/connectors/connectorApi'
import type { McpSettingsCapability } from '../useMcpSettingsCapability'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { useLegalSettings } from '../useLegalSettings'

const connector: LocalConnector = {
  id: 'pkulaw',
  name: '北大法宝',
  toolNamespace: 'pkulaw',
  toolExposure: 'deferred',
  enabled: false,
  credentialConfigured: false,
  executionConfirmed: false,
  transport: 'streamable-http',
  url: 'https://example.test/mcp',
  runtime: { status: 'disabled', authorization: null, errorCode: null, toolCount: 0, updatedAt: null },
}

function createCapability(initial: readonly LocalConnector[]) {
  const connectors = shallowRef(initial)
  const calls: string[] = []
  const ok = { ok: true as const }
  const capability = {
    busyId: shallowRef<string | null>(null),
    connectors,
    setCredential: vi.fn(async (id: string) => {
      calls.push(`credential:${id}`)
      return ok
    }),
    clearCredential: vi.fn(async (id: string) => {
      calls.push(`clear:${id}`)
      return ok
    }),
    setEnabled: vi.fn(async (id: string, enabled: boolean) => {
      calls.push(`enabled:${id}:${enabled}`)
      return ok
    }),
  } as unknown as Pick<McpSettingsCapability, 'busyId' | 'clearCredential' | 'connectors' | 'setCredential' | 'setEnabled'>
  return { calls, capability }
}

describe('useLegalSettings', () => {
  it('finds the built-in connector and reports it as missing when absent', () => {
    const present = useLegalSettings(createCapability([{ ...connector, id: 'other' }, connector]).capability)
    expect(present.connector.value?.id).toBe('pkulaw')
    const missing = useLegalSettings(createCapability([{ ...connector, id: 'other' }]).capability)
    expect(missing.connector.value).toBeNull()
  })

  it('saves a token as an http bearer credential and turns the connector on', async () => {
    const { calls, capability } = createCapability([connector])
    const legal = useLegalSettings(capability)
    expect(await legal.saveToken('fixture-token')).toBe(true)
    expect(capability.setCredential).toHaveBeenCalledWith('pkulaw', { type: 'http', bearerToken: 'fixture-token' })
    expect(calls).toEqual(['credential:pkulaw', 'enabled:pkulaw:true'])
  })

  it('drops a pasted Bearer scheme before saving and rejects a scheme-only value', async () => {
    const { calls, capability } = createCapability([connector])
    const legal = useLegalSettings(capability)
    expect(await legal.saveToken('Bearer fixture-token')).toBe(true)
    expect(capability.setCredential).toHaveBeenCalledWith('pkulaw', { type: 'http', bearerToken: 'fixture-token' })
    expect(await legal.saveToken('Bearer ')).toBe(false)
    expect(calls).toEqual(['credential:pkulaw', 'enabled:pkulaw:true'])
  })

  it('does not turn the connector on when saving the credential fails', async () => {
    const { calls, capability } = createCapability([connector])
    vi.mocked(capability.setCredential).mockResolvedValueOnce(null)
    const legal = useLegalSettings(capability)
    expect(await legal.saveToken('fixture-token')).toBe(false)
    expect(calls).toEqual([])
  })

  it('turns the connector off before clearing the token', async () => {
    const { calls, capability } = createCapability([{ ...connector, credentialConfigured: true, enabled: true }])
    const legal = useLegalSettings(capability)
    expect(await legal.saveToken(null)).toBe(true)
    expect(calls).toEqual(['enabled:pkulaw:false', 'clear:pkulaw'])
  })

  it('keeps the token when turning the connector off fails', async () => {
    const { calls, capability } = createCapability([{ ...connector, credentialConfigured: true, enabled: true }])
    vi.mocked(capability.setEnabled).mockResolvedValueOnce(null)
    const legal = useLegalSettings(capability)
    expect(await legal.saveToken(null)).toBe(false)
    expect(calls).toEqual([])
  })
})
