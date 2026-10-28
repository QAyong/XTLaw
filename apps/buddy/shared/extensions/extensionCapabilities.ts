import { z } from 'zod'
import { extensionMcpConnectorContributionSchema } from './extensionMcpConnectors.ts'
import { extensionSubagentContributionSchema } from './extensionSubagents.ts'

export const extensionCapabilityDescriptorSchema = z.object({
  extensionId: z.string().min(1),
  extensionName: z.string().min(1),
  revision: z.string().min(1),
  enabled: z.boolean(),
  mcpConnectors: z.array(extensionMcpConnectorContributionSchema),
  subagents: z.array(extensionSubagentContributionSchema),
  skills: z.array(z.string().min(1)).default([]),
}).strict()

export type ExtensionCapabilityDescriptor = z.infer<typeof extensionCapabilityDescriptorSchema>

export const extensionCapabilityImpactSchema = z.object({
  retained: z.array(z.object({ kind: z.enum(['mcp', 'subagent']), name: z.string() }).strict()),
  dependents: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
}).strict()
export type ExtensionCapabilityImpact = z.infer<typeof extensionCapabilityImpactSchema>

export const extensionCapabilityImpactRpc = {
  method: 'extensions.capabilities.impact',
  input: z.object({ extensionId: z.string().min(1).max(120) }).strict(),
  response: extensionCapabilityImpactSchema,
} as const

export const extensionCapabilityApplyRpc = {
  method: 'extensions.capabilities.apply',
  input: z.object({
    descriptors: z.array(extensionCapabilityDescriptorSchema).max(512),
    clearExtensionId: z.string().min(1).max(120).optional(),
  }).strict(),
  response: z.null(),
} as const

export const extensionCapabilitiesRpc = {
  apply: extensionCapabilityApplyRpc.method,
  list: 'extensions.capabilities.list',
  changed: 'extensions.capabilities.changed',
  impact: extensionCapabilityImpactRpc.method,
} as const
