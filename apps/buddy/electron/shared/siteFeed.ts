import { z } from 'zod'
import { isOfficialSiteLink } from './productLinks'

// Contract for https://xtlaw.qayong.site/feed/notices.json. The feed is untrusted input:
// every field is length-limited, rendered as plain text, and links stay on the official site.
export const SITE_FEED_SCHEMA_VERSION = 1
export const SITE_FEED_MAX_ITEMS = 20
export const SITE_FEED_MAX_BYTES = 256 * 1024

const timestampSchema = z.iso.datetime({ offset: true })

export const siteFeedItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9][\w.-]{0,63}$/),
  kind: z.enum(['announcement', 'tutorial', 'sponsor']),
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().max(200).default(''),
  url: z.url().max(2048).refine(isOfficialSiteLink),
  publishedAt: timestampSchema,
  expiresAt: timestampSchema.nullable().default(null),
  revision: z.string().min(1).max(64).default('1'),
})

export type SiteFeedItem = z.infer<typeof siteFeedItemSchema>

const siteFeedEnvelopeSchema = z.object({
  schemaVersion: z.literal(SITE_FEED_SCHEMA_VERSION),
  items: z.array(z.unknown()).max(200),
})

/**
 * Returns the usable items of a feed: unknown schema versions yield nothing, invalid or
 * duplicate items are skipped one by one, expired items are dropped, newest first.
 */
export function parseSiteFeed(input: unknown, now = Date.now()): SiteFeedItem[] {
  const envelope = siteFeedEnvelopeSchema.safeParse(input)
  if (!envelope.success)
    return []
  const seen = new Set<string>()
  const items: SiteFeedItem[] = []
  for (const candidate of envelope.data.items) {
    const parsed = siteFeedItemSchema.safeParse(candidate)
    if (!parsed.success || seen.has(parsed.data.id))
      continue
    const { expiresAt, publishedAt } = parsed.data
    if (Date.parse(publishedAt) > now || (expiresAt !== null && Date.parse(expiresAt) <= now))
      continue
    seen.add(parsed.data.id)
    items.push(parsed.data)
  }
  return items
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt) || left.id.localeCompare(right.id))
    .slice(0, SITE_FEED_MAX_ITEMS)
}
