import { z } from 'zod'

export const AUTOMATION_APPROVAL_ALLOWLIST_MAX_ENTRIES = 16

const absolutePathPattern = /^(?:[a-z]:[\\/]|\/)/i

export const automationAllowedDirectorySchema = z.object({
  access: z.enum(['read', 'write']),
  kind: z.literal('directory'),
  path: z.string().trim().max(260).refine(
    value => absolutePathPattern.test(value) && !value.split(/[\\/]/).includes('..'),
    'Allowed directories must be absolute paths without parent segments',
  ),
}).strict()

export const automationAllowedDomainSchema = z.object({
  host: z.string().trim().toLowerCase().max(253).regex(
    /^(?:\*\.)?(?:[a-z0-9-]+\.)*[a-z0-9-]+$/,
    'Allowed domains must be host names, optionally prefixed with "*."',
  ),
  kind: z.literal('domain'),
}).strict()

export const automationApprovalAllowlistEntrySchema = z.discriminatedUnion('kind', [
  automationAllowedDirectorySchema,
  automationAllowedDomainSchema,
])

export const automationApprovalAllowlistSchema = z
  .array(automationApprovalAllowlistEntrySchema)
  .max(AUTOMATION_APPROVAL_ALLOWLIST_MAX_ENTRIES)
  .default([])

export type AutomationApprovalAllowlistEntry = z.infer<typeof automationApprovalAllowlistEntrySchema>
export type AutomationApprovalAllowlist = z.infer<typeof automationApprovalAllowlistSchema>
