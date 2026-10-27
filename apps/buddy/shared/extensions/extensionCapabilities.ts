import { z } from 'zod'
import { buddyToolSelectionSchema } from '../buddies/buddySettings'
import { PKULAW_CONNECTOR_ID } from '../connectors/builtinConnectors'

// Capabilities a market entry contributes besides skills (which keep using `contributes.skills`): MCP connector
// records and NPC sub-agents. Neither carries code. The host turns them into rows in its own stores.
const localId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)

export const extensionMcpConnectorContributionSchema = z.object({
  id: localId,
  name: z.string().trim().min(1).max(128),
  transport: z.literal('streamable-http'),
  url: z.url().max(2048).refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password
  }, 'Expected an HTTPS address without credentials'),
  deferred: z.boolean().default(true),
  credential: z.enum(['none', 'bearer', 'oauth']).default('none'),
}).strict()

export const extensionSubagentContributionSchema = z.object({
  id: localId,
  kind: z.literal('npc'),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  instructions: z.string().min(1).max(16000),
  tools: buddyToolSelectionSchema,
  fileAccess: z.enum(['inherit', 'read_only']).default('read_only'),
}).strict()

export type ExtensionMcpConnectorContribution = z.infer<typeof extensionMcpConnectorContributionSchema>
export type ExtensionSubagentContribution = z.infer<typeof extensionSubagentContributionSchema>

/** MCP connectors a sub-agent's selected tools point at, from the `[source, group, name]` tool identities. */
export function subagentConnectorReferences(subagent: Pick<ExtensionSubagentContribution, 'tools'>): string[] {
  if (subagent.tools.mode !== 'selected')
    return []
  const ids = subagent.tools.ids.flatMap((id) => {
    const identity: unknown = JSON.parse(id)
    return Array.isArray(identity) && identity[0] === 'mcp' && typeof identity[1] === 'string' ? [identity[1]] : []
  })
  return [...new Set(ids)]
}

export const extensionCapabilityDescriptorSchema = z.object({
  extensionId: z.string().min(1),
  extensionName: z.string().min(1),
  revision: z.string().min(1),
  enabled: z.boolean(),
  mcpConnectors: z.array(extensionMcpConnectorContributionSchema),
  subagents: z.array(extensionSubagentContributionSchema),
}).strict()

export type ExtensionCapabilityDescriptor = z.infer<typeof extensionCapabilityDescriptorSchema>

export const extensionCapabilityImpactSchema = z.object({
  modified: z.array(z.object({ kind: z.enum(['mcp', 'agent']), name: z.string() }).strict()),
}).strict()
export type ExtensionCapabilityImpact = z.infer<typeof extensionCapabilityImpactSchema>

export const extensionCapabilityImpactRpc = {
  method: 'extensions.capabilities.impact',
  input: z.object({ extensionId: z.string().min(1).max(120) }).strict(),
  response: extensionCapabilityImpactSchema,
} as const

export const extensionCapabilitiesRpc = {
  list: 'extensions.capabilities.list',
  changed: 'extensions.capabilities.changed',
  impact: extensionCapabilityImpactRpc.method,
} as const

/** Row id of a market sub-agent. The prefix keeps it apart from sub-agents the user created and from the built-in ones. */
export function marketSubagentId(extensionId: string, subagentId: string): string {
  return `ext.${extensionId}.${subagentId}`
}

/** Items that ship inside the application. A market entry whose name matches one is shown as built in and is never installed again. */
export const BUILTIN_CAPABILITY_IDS = {
  skill: ['lexora-buddy-animation', 'plugin-creator', 'skill-creator'],
  mcp: [PKULAW_CONNECTOR_ID],
  agent: ['npc-explorer', 'npc-researcher', 'npc-executor', 'npc-reviewer'],
} as const satisfies Record<'skill' | 'mcp' | 'agent', readonly string[]>

/** `xtlaw.pkulaw` of kind `mcp` names the built-in `pkulaw` connector. Other kinds never count as built in. */
export function isBuiltinCapability(entry: { kind: string, manifest: { id: string } }): boolean {
  if (entry.kind !== 'skill' && entry.kind !== 'mcp' && entry.kind !== 'agent')
    return false
  const name = entry.manifest.id.slice(entry.manifest.id.indexOf('.') + 1)
  return (BUILTIN_CAPABILITY_IDS[entry.kind] as readonly string[]).includes(name)
}

export function connectorToolExposure(connector: Pick<ExtensionMcpConnectorContribution, 'deferred'>) {
  return connector.deferred ? 'deferred' as const : 'direct' as const
}

export type InstalledExtensionKind = 'plugin' | 'skill' | 'mcp' | 'agent'

/**
 * Which kinds an installed package belongs to, from what it contributes. A package may be several at once; a package
 * that is none of the three single-item kinds (or that also ships an entry, a view and so on) is a plugin.
 */
export function installedExtensionKinds(manifest: { entry?: string, contributes: { skills: readonly unknown[], mcpConnectors: readonly unknown[], subagents: readonly unknown[] } & Record<string, unknown> }): InstalledExtensionKind[] {
  const { skills, mcpConnectors, subagents, ...rest } = manifest.contributes
  const other = Object.values(rest).some((value) => {
    if (Array.isArray(value))
      return value.length > 0
    if (value && typeof value === 'object')
      return Object.values(value).some(item => Array.isArray(item) ? item.length > 0 : item !== undefined)
    return value !== undefined
  })
  const kinds: InstalledExtensionKind[] = [
    ...(skills.length ? ['skill' as const] : []),
    ...(mcpConnectors.length ? ['mcp' as const] : []),
    ...(subagents.length ? ['agent' as const] : []),
  ]
  return !kinds.length || manifest.entry || other ? ['plugin', ...kinds] : kinds
}

export type ConnectorSetupState = 'removed' | 'needs-setup' | 'enabled' | 'off'

/** Where a market connector stands: a record the user deleted, one still waiting for its token or sign-in, or ready. */
export function connectorSetupState(connector: Pick<ExtensionMcpConnectorContribution, 'credential'>, record: { enabled: boolean, credentialConfigured: boolean } | undefined): ConnectorSetupState {
  if (!record)
    return 'removed'
  if (connector.credential !== 'none' && !record.credentialConfigured)
    return 'needs-setup'
  return record.enabled ? 'enabled' : 'off'
}
