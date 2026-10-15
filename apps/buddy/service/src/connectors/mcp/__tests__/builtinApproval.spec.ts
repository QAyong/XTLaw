import { describe, expect, it } from 'vitest'
import { BUILTIN_CONNECTOR_PRESETS, isBuiltinPreset } from '../builtinPresets'
import { createMcpTools } from '../createMcpTools'

const preset = BUILTIN_CONNECTOR_PRESETS[0]!
const tool = { name: 'get_article', description: 'read', inputSchema: { type: 'object' as const, properties: {} } }

function classify(trusted: boolean) {
  const result = createMcpTools({
    serverId: preset.id,
    serverName: 'Law',
    generation: 1,
    tools: [tool],
    callTool: async () => ({ content: [] }),
    trusted,
  })
  return [...result.classifications.values()][0]!
}

describe('builtin connector approval', () => {
  it('does not force approval for a trusted preset but keeps the network classification', () => {
    const classification = classify(true)
    expect(classification.access).toBe('network')
    expect(classification.requireApproval).toBeUndefined()
    expect(classification.approval?.summary).toContain('get_article')
  })

  it('still forces approval for every other connector', () => {
    expect(classify(false).requireApproval).toBe(true)
  })

  it('trusts only a record whose id, transport and address all match', () => {
    const base = { id: preset.id, transport: 'streamable-http', url: preset.transport === 'streamable-http' ? preset.url : '' }
    expect(isBuiltinPreset(base)).toBe(true)
    expect(isBuiltinPreset({ ...base, url: 'https://evil.example/mcp' })).toBe(false)
    expect(isBuiltinPreset({ ...base, id: 'pkulaw-copy' })).toBe(false)
    expect(isBuiltinPreset({ ...base, transport: 'stdio' })).toBe(false)
  })
})
