import { describe, expect, it } from 'vitest'
import { extensionCapabilityDescriptorSchema } from '../extensionCapabilities'
import { extensionManifestSchema } from '../extensionManifest'
import { extensionMcpConnectorContributionSchema } from '../extensionMcpConnectors'
import { BUILTIN_SUBAGENT_IDS, extensionSubagentContributionSchema, subagentConnectorReferences } from '../extensionSubagents'

const id = 'tests.legal'
const connector = { id: 'legal-search', name: 'Legal search', transport: 'streamable-http', url: 'https://legal.example.com/mcp', authentication: 'bearer' }
const skill = { id: `${id}.research`, path: 'skills/research/SKILL.md' }
const tool = { source: 'mcp', connector: connector.id, name: 'search_statutes' }
const subagent = {
  id: 'law-finder',
  name: 'Law finder',
  instructions: 'Search statutes first.',
  skills: [skill.id],
  requiredSkills: [skill.id],
  tools: [tool],
  fileAccess: 'inherit',
}

function manifest(contributes: Record<string, unknown>, patch: Record<string, unknown> = {}) {
  return { schemaVersion: 1, id, name: 'Legal', version: '1.0.0', apiVersion: 4, engines: { lexora: '*' }, contributes, ...patch }
}

function capabilities(contributes: Record<string, unknown> = {}) {
  return manifest({ mcpConnectors: [connector], skills: [skill], subagents: [subagent], ...contributes })
}

describe('manifest capabilities', () => {
  it('parses a declarative package with raw MCP tool names and package-owned skills', () => {
    const parsed = extensionManifestSchema.parse(capabilities())
    expect(parsed.contributes.mcpConnectors).toEqual([connector])
    expect(parsed.contributes.subagents).toEqual([{ ...subagent, description: '' }])
    expect(parsed.entry).toBeUndefined()
    expect(parsed.permissions.agent).toBe(false)
    expect(parsed.permissions.network).toEqual([])
  })

  it('accepts an independent MCP package without NPCs, Skills or permissions', () => {
    const parsed = extensionManifestSchema.parse(manifest({ mcpConnectors: [connector] }))
    expect(parsed.contributes.mcpConnectors).toEqual([extensionMcpConnectorContributionSchema.parse(connector)])
    expect(parsed.contributes.subagents).toEqual([])
    expect(parsed.contributes.skills).toEqual([])
    expect(parsed.entry).toBeUndefined()
    expect(parsed.permissions.agent).toBe(false)
    expect(parsed.permissions.network).toEqual([])
  })

  it('accepts an independent NPC package with only explicit builtin tools', () => {
    const declaration = { id: 'reader', name: 'Reader', instructions: 'Read the supplied files.', tools: [{ source: 'builtin', name: 'read' }], fileAccess: 'read_only' }
    const parsed = extensionManifestSchema.parse(manifest({ subagents: [declaration] }))
    expect(parsed.contributes.subagents).toEqual([extensionSubagentContributionSchema.parse(declaration)])
    expect(parsed.contributes.mcpConnectors).toEqual([])
    expect(parsed.contributes.skills).toEqual([])
    expect(parsed.entry).toBeUndefined()
    expect(parsed.permissions.agent).toBe(false)
    expect(parsed.permissions.models).toBe(false)
  })

  it('scopes local IDs by contribution kind without inferring dependencies', () => {
    const declaration = { id: connector.id, name: 'Reader', instructions: 'Inspect the task.', fileAccess: 'read_only' }
    const parsed = extensionManifestSchema.parse(manifest({ mcpConnectors: [connector], subagents: [declaration] }))
    expect(parsed.contributes.mcpConnectors[0]?.id).toBe(parsed.contributes.subagents[0]?.id)
    expect(parsed.contributes.subagents[0]?.tools).toEqual([])
    expect(parsed.contributes.subagents[0]?.skills).toEqual([])
  })

  it.each(['9_reader', 'a'.repeat(64)])('accepts the local ID %s independently of plugin-prefixed IDs', (localId) => {
    const parsed = extensionManifestSchema.parse(manifest({
      mcpConnectors: [{ ...connector, id: localId }],
      subagents: [{ id: localId, name: 'Reader', instructions: 'Inspect the task.', fileAccess: 'read_only' }],
    }))
    expect(parsed.contributes.mcpConnectors[0]?.id).toBe(localId)
    expect(parsed.contributes.subagents[0]?.id).toBe(localId)
  })

  it.each([`${id}.reader`, 'Reader', '_reader', 'a'.repeat(65)])('rejects the non-local contribution ID %s', (localId) => {
    expect(extensionMcpConnectorContributionSchema.safeParse({ ...connector, id: localId }).success).toBe(false)
    expect(extensionSubagentContributionSchema.safeParse({ ...subagent, id: localId }).success).toBe(false)
  })

  it.each(BUILTIN_SUBAGENT_IDS)('reserves the builtin NPC identity %s in the contribution schema', (builtinId) => {
    expect(extensionSubagentContributionSchema.safeParse({ ...subagent, id: builtinId }).success).toBe(false)
  })

  it('defaults optional sub-agent fields without granting tools or skills', () => {
    const declaration = { id: 'reader', name: 'Reader', instructions: 'Inspect the task.', fileAccess: 'read_only' }
    const parsed = extensionManifestSchema.parse(manifest({ subagents: [declaration] }))
    expect(parsed.contributes.subagents).toEqual([{ ...declaration, description: '', skills: [], requiredSkills: [], tools: [] }])
    expect(extensionManifestSchema.parse(manifest({})).contributes).toMatchObject({ mcpConnectors: [], subagents: [] })
  })

  it.each(['none', 'bearer', 'oauth'])('accepts the %s authentication requirement without credentials', (authentication) => {
    expect(extensionManifestSchema.parse(manifest({ mcpConnectors: [{ ...connector, authentication }] })).contributes.mcpConnectors[0]?.authentication).toBe(authentication)
  })

  it.each(['inherit', 'read_only'])('accepts the explicit %s file policy with the stable read-only builtin tools', (fileAccess) => {
    const tools = ['read', 'find', 'grep', 'ls'].map(name => ({ source: 'builtin', name }))
    const parsed = extensionManifestSchema.parse(capabilities({ subagents: [{ ...subagent, tools, fileAccess }] }))
    expect(parsed.contributes.subagents[0]?.tools).toEqual(tools)
  })

  it.each([
    { mcpConnectors: [connector] },
    { subagents: [{ ...subagent, skills: [], requiredSkills: [], tools: [] }] },
  ])('requires API 4 for each contribution kind', (contributes) => {
    expect(extensionManifestSchema.safeParse(manifest(contributes, { apiVersion: 3 })).success).toBe(false)
  })

  it.each([
    ['an undeclared connector', { mcpConnectors: [] }],
    ['a user connector', { subagents: [{ ...subagent, tools: [{ ...tool, connector: 'user-connection' }] }] }],
    ['a foreign package connector', { subagents: [{ ...subagent, tools: [{ ...tool, connector: 'other.plugin.search' }] }] }],
    ['an undeclared skill', { skills: [] }],
    ['a foreign package skill', { subagents: [{ ...subagent, skills: ['other.plugin.research'], requiredSkills: [] }] }],
    ['a required skill outside selected skills', { subagents: [{ ...subagent, skills: [] }] }],
    ['a duplicate connector id', { mcpConnectors: [connector, connector] }],
    ['a duplicate sub-agent id', { subagents: [subagent, subagent] }],
    ['a duplicate skill reference', { subagents: [{ ...subagent, skills: [skill.id, skill.id] }] }],
    ['a duplicate required skill', { subagents: [{ ...subagent, requiredSkills: [skill.id, skill.id] }] }],
    ['a duplicate MCP tool', { subagents: [{ ...subagent, tools: [tool, { name: tool.name, connector: tool.connector, source: tool.source }] }] }],
    ['a duplicate builtin tool', { subagents: [{ ...subagent, tools: [{ source: 'builtin', name: 'read' }, { source: 'builtin', name: 'read' }] }] }],
    ['a built-in sub-agent id', { subagents: [{ ...subagent, id: 'npc-explorer' }] }],
    ['empty instructions', { subagents: [{ ...subagent, instructions: '' }] }],
    ['an omitted file policy', { subagents: [{ ...subagent, fileAccess: undefined }] }],
    ['MCP tools under a read-only policy', { subagents: [{ ...subagent, fileAccess: 'read_only' }] }],
    ['an omitted authentication requirement', { mcpConnectors: [{ ...connector, authentication: undefined }] }],
    ['a local command transport', { mcpConnectors: [{ ...connector, transport: 'stdio', command: 'npx', args: [] }] }],
    ['an embedded token', { mcpConnectors: [{ ...connector, token: 'example-token' }] }],
    ['embedded headers', { mcpConnectors: [{ ...connector, headers: { Authorization: 'example-token' } }] }],
    ['a manifest-selected model', { subagents: [{ ...subagent, model: { providerId: 'provider', modelId: 'model' } }] }],
    ['a manifest-enabled NPC', { subagents: [{ ...subagent, enabled: true }] }],
    ['a manifest-enabled connector', { mcpConnectors: [{ ...connector, enabled: true }] }],
    ['an actor kind', { subagents: [{ ...subagent, kind: 'actor' }] }],
    ['the old NPC kind', { subagents: [{ ...subagent, kind: 'npc' }] }],
    ['the old deferred field', { mcpConnectors: [{ ...connector, deferred: true }] }],
    ['the old credential field', { mcpConnectors: [{ ...connector, credential: 'bearer' }] }],
    ['the old all-tools selection', { subagents: [{ ...subagent, tools: { mode: 'all' } }] }],
    ['the old no-tools selection', { subagents: [{ ...subagent, tools: { mode: 'none' } }] }],
    ['the old encoded selection', { subagents: [{ ...subagent, tools: { mode: 'selected', ids: [JSON.stringify(['mcp', connector.id, tool.name])] } }] }],
    ['an encoded tool string', { subagents: [{ ...subagent, tools: [JSON.stringify(['mcp', connector.id, tool.name])] }] }],
    ['an unsupported tool source', { subagents: [{ ...subagent, tools: [{ source: 'plugin', name: 'execute' }] }] }],
    ['a builtin reference with a group', { subagents: [{ ...subagent, tools: [{ source: 'builtin', name: 'read', group: 'core' }] }] }],
    ['an unnamed remote tool', { subagents: [{ ...subagent, tools: [{ ...tool, name: '' }] }] }],
  ])('rejects %s', (_name, contributes) => {
    expect(extensionManifestSchema.safeParse(capabilities(contributes)).success).toBe(false)
  })

  it.each(['bash', 'write', 'edit', 'lexora_agents', 'lexora_authorize_directory', 'all', '*'])('rejects the non-allowlisted builtin tool %s', (name) => {
    const input = capabilities({ subagents: [{ ...subagent, tools: [{ source: 'builtin', name }] }] })
    expect(extensionManifestSchema.safeParse(input).success).toBe(false)
  })

  it.each([
    'http://legal.example.com/mcp',
    'file:///tmp/mcp',
    'https://user:secret@legal.example.com/mcp',
    'https://user@legal.example.com/mcp',
    'https://:secret@legal.example.com/mcp',
    'https://user%40example.com@legal.example.com/mcp',
    'not a URL',
    'https://',
  ])('rejects an invalid connector address: %s', (url) => {
    expect(extensionManifestSchema.safeParse(capabilities({ mcpConnectors: [{ ...connector, url }] })).success).toBe(false)
  })

  it('permits distinct raw tools with the same name on separate declared connectors', () => {
    const second = { ...connector, id: 'other-search' }
    const tools = [tool, { ...tool, connector: second.id }, { source: 'builtin', name: 'read' }]
    const parsed = extensionManifestSchema.parse(capabilities({ mcpConnectors: [connector, second], subagents: [{ ...subagent, tools }] }))
    expect(parsed.contributes.subagents[0]?.tools).toEqual(tools)
  })

  it('reports invalid cross-references on the affected sub-agent field', () => {
    const parsed = extensionManifestSchema.safeParse(capabilities({ skills: [], mcpConnectors: [] }))
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.map(issue => issue.path)).toEqual(expect.arrayContaining([
        ['contributes', 'subagents', 0, 'tools'],
        ['contributes', 'subagents', 0, 'skills'],
        ['contributes', 'subagents', 0, 'requiredSkills'],
      ]))
    }
  })

  it('extracts distinct local connector references from structured tools', () => {
    const base = extensionManifestSchema.parse(capabilities({
      subagents: [{ ...subagent, tools: [tool, { ...tool, name: 'get_statute' }, { source: 'builtin', name: 'read' }] }],
    })).contributes.subagents[0]!
    expect(subagentConnectorReferences(base)).toEqual([connector.id])
    expect(subagentConnectorReferences({ tools: [] })).toEqual([])
    expect(subagentConnectorReferences({ tools: [{ source: 'builtin', name: 'read' }] })).toEqual([])
  })

  it.each([
    { mcpConnectors: [connector], subagents: [] },
    { mcpConnectors: [], subagents: [{ id: 'reader', name: 'Reader', instructions: 'Inspect the task.', fileAccess: 'read_only' }] },
  ])('exchanges independent contributions through strict lifecycle descriptors', (contributions) => {
    const descriptor = { extensionId: id, extensionName: 'Legal', revision: 'a', enabled: true, ...contributions }
    const parsed = extensionCapabilityDescriptorSchema.parse(descriptor)
    expect(parsed).toEqual({
      ...descriptor,
      mcpConnectors: contributions.mcpConnectors.map(value => extensionMcpConnectorContributionSchema.parse(value)),
      subagents: contributions.subagents.map(value => extensionSubagentContributionSchema.parse(value)),
      skills: [],
    })
    expect(extensionCapabilityDescriptorSchema.parse({ ...descriptor, skills: [skill.id] }).skills).toEqual([skill.id])
    expect(extensionCapabilityDescriptorSchema.safeParse({ ...descriptor, extra: true }).success).toBe(false)
    expect(extensionCapabilityDescriptorSchema.safeParse({ ...descriptor, bindings: [{ subagentId: 'reader', buddyId: 'buddy-main' }] }).success).toBe(false)
  })
})
