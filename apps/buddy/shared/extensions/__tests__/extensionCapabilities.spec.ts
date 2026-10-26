import { describe, expect, it } from 'vitest'
import { connectorSetupState, extensionCapabilityDescriptorSchema, installedExtensionKinds, isBuiltinCapability, marketSubagentId, subagentConnectorReferences } from '../extensionCapabilities'
import { extensionCatalogEntrySchema } from '../extensionCatalog'
import { extensionManifestSchema } from '../extensionManifest'

const id = 'tests.legal'
const connector = { id: 'legal-search', name: 'Legal search', transport: 'streamable-http', url: 'https://legal.example.com/mcp' }
const tool = JSON.stringify(['mcp', 'legal-search', 'legal__search'])
const subagent = { id: 'law-finder', kind: 'npc', name: 'Law finder', instructions: 'Search statutes first.', tools: { mode: 'selected', ids: [tool] } }

function manifest(contributes: Record<string, unknown>, patch: Record<string, unknown> = {}) {
  return { schemaVersion: 1, id, name: 'Legal', version: '1.0.0', apiVersion: 4, engines: { lexora: '*' }, contributes, ...patch }
}
function entry(kind: string, contributes: Record<string, unknown>, patch: Record<string, unknown> = {}) {
  return {
    kind,
    manifest: manifest(contributes, patch),
    repository: 'https://example.com/repo',
    artifact: { url: 'https://example.com/legal.lexora-extension', sha256: 'a'.repeat(64), size: 10 },
  }
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

  it('lets a sub-agent select a built-in connector, by tool or as a whole, but not an undeclared one', () => {
    const select = (...ids: string[]) => manifest({ subagents: [{ ...subagent, tools: { mode: 'selected', ids } }] })
    expect(extensionManifestSchema.safeParse(select(JSON.stringify(['mcp', 'pkulaw', 'search_case']))).success).toBe(true)
    expect(extensionManifestSchema.safeParse(select(JSON.stringify(['mcp', 'pkulaw', '*']))).success).toBe(true)
    expect(extensionManifestSchema.safeParse(select(JSON.stringify(['mcp', 'elsewhere', '*']))).success).toBe(false)
    const wildcard = extensionManifestSchema.parse(select(JSON.stringify(['builtin', 'core', 'read']), JSON.stringify(['mcp', 'pkulaw', '*']))).contributes.subagents[0]!
    expect(subagentConnectorReferences(wildcard)).toEqual(['pkulaw'])
  })

  it.each([
    ['an actor sub-agent', { subagents: [{ ...subagent, kind: 'actor', tools: { mode: 'none' } }] }],
    ['a plain HTTP address', { mcpConnectors: [{ ...connector, url: 'http://legal.example.com/mcp' }] }],
    ['an address with credentials', { mcpConnectors: [{ ...connector, url: 'https://user:secret@legal.example.com/mcp' }] }],
    ['a local command transport', { mcpConnectors: [{ id: 'local', name: 'Local', transport: 'stdio', command: 'npx', args: [] }] }],
    ['a duplicate connector id', { mcpConnectors: [connector, connector] }],
    ['the built-in connector id', { mcpConnectors: [{ ...connector, id: 'pkulaw' }] }],
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
    expect(marketSubagentId(id, 'law-finder')).toBe('ext.tests.legal.law-finder')
  })

  it('exchanges descriptors strictly', () => {
    const descriptor = { extensionId: id, extensionName: 'Legal', revision: 'a', enabled: true, mcpConnectors: [{ ...connector, deferred: true, credential: 'none' }], subagents: [] }
    expect(extensionCapabilityDescriptorSchema.parse(descriptor)).toEqual(descriptor)
    expect(extensionCapabilityDescriptorSchema.safeParse({ ...descriptor, extra: true }).success).toBe(false)
  })
})

describe('catalog entries', () => {
  it('requires a single-capability entry to deliver what it is filed under', () => {
    expect(extensionCatalogEntrySchema.safeParse(entry('mcp', { mcpConnectors: [connector] })).success).toBe(true)
    expect(extensionCatalogEntrySchema.safeParse(entry('agent', { mcpConnectors: [connector], subagents: [subagent] })).success).toBe(true)
    expect(extensionCatalogEntrySchema.safeParse(entry('skill', { skills: [{ id: `${id}.law`, path: 'skills/law/SKILL.md' }] })).success).toBe(true)
    expect(extensionCatalogEntrySchema.safeParse(entry('mcp', {})).success).toBe(false)
    expect(extensionCatalogEntrySchema.safeParse(entry('agent', { mcpConnectors: [connector] })).success).toBe(false)
    expect(extensionCatalogEntrySchema.safeParse(entry('skill', { mcpConnectors: [connector] })).success).toBe(false)
    // A built-in entry only labels what the application already ships, so it carries nothing to install.
    expect(extensionCatalogEntrySchema.safeParse(entry('mcp', {}, { id: 'xtlaw.pkulaw' })).success).toBe(true)
  })

  it('keeps plugin entries and entries without a kind working as before', () => {
    expect(extensionCatalogEntrySchema.parse(entry('plugin', {})).kind).toBe('plugin')
    const { kind: _kind, ...legacy } = entry('plugin', {})
    expect(extensionCatalogEntrySchema.parse(legacy)).toMatchObject({ kind: 'plugin', source: 'official' })
  })
})

describe('built-in recognition', () => {
  it.each([
    ['skill', 'xtlaw.legal-research', true],
    ['skill', 'xtlaw.skill-creator', true],
    ['mcp', 'xtlaw.pkulaw', true],
    ['agent', 'xtlaw.npc-reviewer', true],
    ['skill', 'xtlaw.pkulaw', false],
    ['mcp', 'xtlaw.legal-research', false],
    ['plugin', 'xtlaw.legal-research', false],
    ['pack', 'xtlaw.pkulaw', false],
    ['mcp', 'xtlaw.legal-search', false],
  ])('treats a %s entry %s as built in: %s', (kind, entryId, builtin) => {
    expect(isBuiltinCapability({ kind, manifest: { id: entryId } })).toBe(builtin)
  })
})

describe('installed kinds', () => {
  const kinds = (contributes: Record<string, unknown>, patch: Record<string, unknown> = {}) => installedExtensionKinds(extensionManifestSchema.parse(manifest(contributes, patch)))

  it('reads the kinds from what the package contributes', () => {
    expect(kinds({ skills: [{ id: `${id}.law`, path: 'skills/law/SKILL.md' }] })).toEqual(['skill'])
    expect(kinds({ mcpConnectors: [connector] })).toEqual(['mcp'])
    expect(kinds({ mcpConnectors: [connector], subagents: [subagent], skills: [{ id: `${id}.law`, path: 'skills/law/SKILL.md' }] })).toEqual(['skill', 'mcp', 'agent'])
    expect(kinds({})).toEqual(['plugin'])
  })

  it('keeps a package that also runs code or adds UI a plugin', () => {
    expect(kinds({ mcpConnectors: [connector] }, { entry: 'extension.js' })).toEqual(['plugin', 'mcp'])
    expect(kinds({ themes: [], commands: [{ id: `${id}.open`, title: 'Open' }], mcpConnectors: [connector] }, { entry: 'extension.js' })).toEqual(['plugin', 'mcp'])
    expect(installedExtensionKinds({ contributes: { skills: [1], mcpConnectors: [], subagents: [], settings: { items: [1], groups: [], modules: [] } } })).toEqual(['plugin', 'skill'])
    expect(installedExtensionKinds({ contributes: { skills: [1], mcpConnectors: [], subagents: [], settings: { items: [], groups: [], modules: [] }, themes: [] } })).toEqual(['skill'])
  })
})

describe('connector setup state', () => {
  it.each([
    ['bearer', undefined, 'removed'],
    ['bearer', { enabled: false, credentialConfigured: false }, 'needs-setup'],
    ['oauth', { enabled: false, credentialConfigured: false }, 'needs-setup'],
    ['bearer', { enabled: false, credentialConfigured: true }, 'off'],
    ['bearer', { enabled: true, credentialConfigured: true }, 'enabled'],
    ['none', { enabled: false, credentialConfigured: false }, 'off'],
    ['none', { enabled: true, credentialConfigured: false }, 'enabled'],
  ] as const)('%s with %j is %s', (credential, record, state) => {
    expect(connectorSetupState({ credential }, record)).toBe(state)
  })
})
