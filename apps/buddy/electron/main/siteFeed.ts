import type { SiteFeedItem } from '../shared/siteFeed'
import { readResponseBytes } from '../../platform/network/publicWebTransport'
import { SITE_FEED_URL } from '../shared/productLinks'
import { parseSiteFeed, SITE_FEED_MAX_BYTES } from '../shared/siteFeed'

export interface FetchSiteFeedOptions {
  signal?: AbortSignal
  fetchFeed?: (url: string, init?: RequestInit) => Promise<Response>
  now?: number
}

export class SiteFeedFetchError extends Error {
  readonly code = 'SITE_FEED_FETCH_FAILED'

  constructor(options?: ErrorOptions) {
    super('XTLaw site feed fetch failed', options)
    this.name = 'SiteFeedFetchError'
  }
}

/** Fetches and validates the official site feed. Sends no identifiers beyond the user agent. */
export async function fetchSiteFeed(options: FetchSiteFeedOptions = {}): Promise<SiteFeedItem[]> {
  try {
    const timeout = AbortSignal.timeout(15_000)
    const response = await (options.fetchFeed ?? fetch)(SITE_FEED_URL, {
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      headers: { 'accept': 'application/json', 'user-agent': 'XTLaw' },
    })
    if (!response.ok)
      throw new Error(`Site feed request failed with ${response.status}`)
    if (response.url && new URL(response.url).origin !== new URL(SITE_FEED_URL).origin)
      throw new Error('Site feed redirected away from the official site')
    const body = await readResponseBytes(response, SITE_FEED_MAX_BYTES)
    return parseSiteFeed(JSON.parse(new TextDecoder().decode(body)), options.now)
  }
  catch (error) {
    throw new SiteFeedFetchError({ cause: error })
  }
}
