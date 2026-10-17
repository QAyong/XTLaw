import { describe, expect, it } from 'vitest'
import { fetchSiteFeed, SiteFeedFetchError } from '../siteFeed'

const feed = { schemaVersion: 1, items: [{ id: 'a', kind: 'announcement', title: '公告', url: 'https://xtlaw.qayong.site/', publishedAt: '2026-10-16T09:00:00+08:00' }] }
const now = Date.parse('2026-10-17T12:00:00+08:00')

describe('fetchSiteFeed', () => {
  it('requests the official feed with no identifying headers beyond the user agent', async () => {
    let seen: { url: string, headers: unknown } | undefined
    const items = await fetchSiteFeed({
      now,
      fetchFeed: async (url, init) => {
        seen = { url, headers: init?.headers }
        return new Response(JSON.stringify(feed))
      },
    })
    expect(seen).toEqual({ url: 'https://xtlaw.qayong.site/feed/notices.json', headers: { 'accept': 'application/json', 'user-agent': 'XTLaw' } })
    expect(items).toHaveLength(1)
  })

  it('treats an empty feed as nothing to show', async () => {
    await expect(fetchSiteFeed({ now, fetchFeed: async () => new Response('{"schemaVersion":1,"items":[]}') })).resolves.toEqual([])
  })

  it('fails on http errors, invalid JSON and oversized bodies', async () => {
    await expect(fetchSiteFeed({ fetchFeed: async () => new Response('', { status: 404 }) })).rejects.toBeInstanceOf(SiteFeedFetchError)
    await expect(fetchSiteFeed({ fetchFeed: async () => new Response('<html>') })).rejects.toBeInstanceOf(SiteFeedFetchError)
    await expect(fetchSiteFeed({ fetchFeed: async () => new Response('x'.repeat(300 * 1024)) })).rejects.toBeInstanceOf(SiteFeedFetchError)
  })

  it('rejects a response that ended up on another origin', async () => {
    const response = new Response(JSON.stringify(feed))
    Object.defineProperty(response, 'url', { value: 'https://example.com/feed/notices.json' })
    await expect(fetchSiteFeed({ now, fetchFeed: async () => response })).rejects.toBeInstanceOf(SiteFeedFetchError)
  })
})
