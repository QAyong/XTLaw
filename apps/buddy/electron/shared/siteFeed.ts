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

export function isSiteFeedItemActive(item: Pick<SiteFeedItem, 'expiresAt' | 'publishedAt'>, now: number): boolean {
  return Date.parse(item.publishedAt) <= now && (item.expiresAt === null || Date.parse(item.expiresAt) > now)
}

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
    if (!isSiteFeedItemActive(parsed.data, now))
      continue
    seen.add(parsed.data.id)
    items.push(parsed.data)
  }
  return items
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt) || left.id.localeCompare(right.id))
    .slice(0, SITE_FEED_MAX_ITEMS)
}

// What the renderer sees. The link itself never crosses the bridge: the main process
// resolves it from its own validated copy when the user opens the notification.
export interface DesktopSiteNotification {
  readonly id: string
  readonly revision: string
  readonly kind: 'site.notice'
  readonly origin: 'site'
  readonly attention: 'seen' | 'unseen'
  readonly occurredAt: string
  readonly action: { readonly type: 'open-site-link' }
  readonly payload: {
    readonly itemId: string
    readonly category: SiteFeedItem['kind']
    readonly title: string
    readonly summary: string
  }
}

export interface SiteFeedState {
  readonly revision: number
  readonly notifications: ReadonlyArray<DesktopSiteNotification>
}

export const siteFeedItemIdSchema = siteFeedItemSchema.shape.id
export const siteFeedSeenInputSchema = z.object({ itemId: siteFeedItemIdSchema, revision: siteFeedItemSchema.shape.revision }).strict()
export const siteFeedTargetSchema = z.object({ itemId: siteFeedItemIdSchema }).strict()

export interface SiteFeedApi {
  getState: () => Promise<SiteFeedState>
  onChanged: (listener: (state: SiteFeedState) => void) => () => void
  markSeen: (itemId: string, revision: string) => Promise<SiteFeedState>
  markAllSeen: () => Promise<SiteFeedState>
  open: (itemId: string) => Promise<void>
}
