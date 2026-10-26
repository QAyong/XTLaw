import { z } from 'zod'
import { buddyToolSelectionSchema } from '../buddies/buddySettings.ts'

// Capabilities an extension contributes besides skills (which keep using `contributes.skills`): MCP connector
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

/** Row id of a sub-agent an extension contributes. The prefix keeps it apart from sub-agents the user created and from the built-in ones. */
export function extensionSubagentId(extensionId: string, subagentId: string): string {
  return `ext.${extensionId}.${subagentId}`
}

/** Sub-agents that ship inside the application. A package may not declare one with the same ID. */
export const BUILTIN_SUBAGENT_IDS = ['npc-explorer', 'npc-researcher', 'npc-executor', 'npc-reviewer'] as const

export function connectorToolExposure(connector: Pick<ExtensionMcpConnectorContribution, 'deferred'>) {
  return connector.deferred ? 'deferred' as const : 'direct' as const
}
