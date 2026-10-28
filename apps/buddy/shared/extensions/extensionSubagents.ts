import { z } from 'zod'

const localId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
const skillReferences = z.array(z.string().min(1).max(180)).max(32).refine(ids => new Set(ids).size === ids.length, 'Skill references must be unique')

export const BUILTIN_SUBAGENT_IDS = ['npc-explorer', 'npc-researcher', 'npc-executor', 'npc-reviewer'] as const
export const EXTENSION_SUBAGENT_BUILTIN_TOOLS = ['read', 'find', 'grep', 'ls'] as const

export const extensionSubagentToolReferenceSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('mcp'),
    connector: localId,
    name: z.string().min(1).max(256),
  }).strict(),
  z.object({
    source: z.literal('builtin'),
    name: z.enum(EXTENSION_SUBAGENT_BUILTIN_TOOLS),
  }).strict(),
])
export type ExtensionSubagentToolReference = z.infer<typeof extensionSubagentToolReferenceSchema>

export const extensionSubagentContributionSchema = z.object({
  id: localId.refine(id => !(BUILTIN_SUBAGENT_IDS as readonly string[]).includes(id), 'NPC IDs must not reuse built-in ones'),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  instructions: z.string().min(1).max(16000),
  skills: skillReferences.default([]),
  requiredSkills: skillReferences.default([]),
  tools: z.array(extensionSubagentToolReferenceSchema).max(256).refine(tools => new Set(tools.map(tool => JSON.stringify(tool.source === 'mcp'
    ? [tool.source, tool.connector, tool.name]
    : [tool.source, tool.name]))).size === tools.length, 'Tool references must be unique').default([]),
  fileAccess: z.enum(['inherit', 'read_only']),
}).strict().superRefine((subagent, context) => {
  if (subagent.requiredSkills.some(id => !subagent.skills.includes(id)))
    context.addIssue({ code: 'custom', path: ['requiredSkills'], message: 'Required skills must be a subset of skills' })
  if (subagent.fileAccess === 'read_only' && subagent.tools.some(tool => tool.source === 'mcp'))
    context.addIssue({ code: 'custom', path: ['tools'], message: 'Read-only NPCs cannot use MCP tools' })
})

export type ExtensionSubagentContribution = z.infer<typeof extensionSubagentContributionSchema>

export function subagentConnectorReferences(subagent: Pick<ExtensionSubagentContribution, 'tools'>): string[] {
  return [...new Set(subagent.tools.flatMap(tool => tool.source === 'mcp' ? [tool.connector] : []))]
}
