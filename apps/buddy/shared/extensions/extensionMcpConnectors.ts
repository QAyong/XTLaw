import { z } from 'zod'

export const extensionMcpConnectorContributionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name: z.string().trim().min(1).max(128),
  transport: z.literal('streamable-http'),
  url: z.url().max(2048).refine((value) => {
    if (!URL.canParse(value))
      return false
    const url = new URL(value)
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password
  }, 'Expected an HTTPS address without credentials'),
  authentication: z.enum(['none', 'bearer', 'oauth']),
}).strict()

export type ExtensionMcpConnectorContribution = z.infer<typeof extensionMcpConnectorContributionSchema>
