import { describe, expect, it } from 'vitest'
import { extensionCapabilityDescriptorSchema, extensionSubagentId, subagentConnectorReferences } from '../extensionCapabilities'
import { extensionManifestSchema } from '../extensionManifest'

const id = 'tests.legal'
const connector = { id: 'legal-search', name: 'Legal search', transport: 'streamable-http', url: 'https://legal.example.com/mcp' }
const tool = JSON.stringify(['mcp', 'legal-search', 'legal__search'])
const subagent = { id: 'law-finder', kind: 'npc', name: 'Law finder', instructions: 'Search statutes first.', tools: { mode: 'selected', ids: [tool] } }

function manifest(contributes: Record<string, unknown>, patch: Record<string, unknown> = {}) {
  return { schemaVersion: 1, id, name: 'Legal', version: '1.0.0', apiVersion: 4, engines: { lexora: '*' }, contributes, ...patch }
}

describe('manifest capabilities', () => {
  it('parses MCP connectors and NPC sub-agents with their defaults', () => {
    const parsed = extensionManifestSchema.parse(manifest({ mcpConnectors: [connector], subagents: [subagent] }))
    expect(parsed.contributes.mcpConnectors).toEqual([{ ...connector, deferred: true, credential: 'none' }])
    expect(parsed.contributes.subagents[0]).toMatchObject({ kind: 'npc', description: '', fileAccess: 'read_only', tools: { mode: 'selected' } })
    expect(parsed.entry).toBeUndefined()
    expect(extensionManifestSchema.parse(manifest({})).contributes).toMatchObject({ mcpConnectors: [], subagents: [] })
  })

  it('needs API 4 and a package that declares every connector its sub-agents select', () => {
    expect(extensionManifestSchema.safeParse(manifest({ mcpConnectors: [connector] }, { apiVersion: 3 })).success).toBe(false)
    expect(extensionManifestSchema.safeParse(manifest({ subagents: [{ ...subagent, tools: { mode: 'all' } }] }, { apiVersion: 3 })).success).toBe(false)
    expect(extensionManifestSchema.safeParse(manifest({ subagents: [subagent] })).success).toBe(false)
    expect(extensionManifestSchema.safeParse(manifest({ mcpConnectors: [{ ...connector, id: 'other' }], subagents: [subagent] })).success).toBe(false)
    expect(extensionManifestSchema.safeParse(manifest({ mcpConnectors: [connector], subagents: [subagent] })).success).toBe(true)
    expect(extensionManifestSchema.safeParse(manifest({ subagents: [{ ...subagent, tools: { mode: 'selected', ids: [JSON.stringify(['builtin', 'core', 'read'])] } }] })).success).toBe(true)
  })

  it.each([
    ['an actor sub-agent', { subagents: [{ ...subagent, kind: 'actor', tools: { mode: 'none' } }] }],
    ['a plain HTTP address', { mcpConnectors: [{ ...connector, url: 'http://legal.example.com/mcp' }] }],
    ['an address with credentials', { mcpConnectors: [{ ...connector, url: 'https://user:secret@legal.example.com/mcp' }] }],
    ['a local command transport', { mcpConnectors: [{ id: 'local', name: 'Local', transport: 'stdio', command: 'npx', args: [] }] }],
    ['a duplicate connector id', { mcpConnectors: [connector, connector] }],
    ['a built-in sub-agent id', { subagents: [{ ...subagent, id: 'npc-explorer', tools: { mode: 'none' } }] }],
    ['empty instructions', { subagents: [{ ...subagent, instructions: '', tools: { mode: 'none' } }] }],
    ['an unknown field', { mcpConnectors: [{ ...connector, headers: { Authorization: 'secret' } }] }],
  ])('rejects %s', (_name, contributes) => {
    expect(extensionManifestSchema.safeParse(manifest(contributes)).success).toBe(false)
  })

  it('names the connectors a sub-agent selects tools from', () => {
    const base = extensionManifestSchema.parse(manifest({ mcpConnectors: [connector], subagents: [subagent] })).contributes.subagents[0]!
    expect(subagentConnectorReferences(base)).toEqual(['legal-search'])
    expect(subagentConnectorReferences({ tools: { mode: 'all' } })).toEqual([])
    expect(extensionSubagentId(id, 'law-finder')).toBe('ext.tests.legal.law-finder')
  })

  it('exchanges descriptors strictly', () => {
    const descriptor = { extensionId: id, extensionName: 'Legal', revision: 'a', enabled: true, mcpConnectors: [{ ...connector, deferred: true, credential: 'none' }], subagents: [] }
    expect(extensionCapabilityDescriptorSchema.parse(descriptor)).toEqual(descriptor)
    expect(extensionCapabilityDescriptorSchema.safeParse({ ...descriptor, extra: true }).success).toBe(false)
  })
})
