import { describe, expect, it } from 'vitest'
import { isOfficialSiteLink } from '../productLinks'
import { parseSiteFeed, SITE_FEED_MAX_ITEMS } from '../siteFeed'

const now = Date.parse('2026-10-17T12:00:00+08:00')

function item(fields: Record<string, unknown> = {}) {
  return {
    id: 'welcome-1',
    kind: 'announcement',
    title: '欢迎使用 XTLaw',
    summary: '了解最新动态',
    url: 'https://xtlaw.qayong.site/changelog.html',
    publishedAt: '2026-10-16T09:00:00+08:00',
    ...fields,
  }
}

describe('parseSiteFeed', () => {
  it('returns an empty list for an empty feed', () => {
    expect(parseSiteFeed({ schemaVersion: 1, items: [] }, now)).toEqual([])
  })

  it('applies defaults and keeps valid items newest first', () => {
    const items = parseSiteFeed({
      schemaVersion: 1,
      items: [
        item({ id: 'older', publishedAt: '2026-10-10T09:00:00+08:00' }),
        item({ id: 'newer', kind: 'tutorial', summary: undefined }),
      ],
    }, now)
    expect(items.map(entry => entry.id)).toEqual(['newer', 'older'])
    expect(items[0]).toMatchObject({ kind: 'tutorial', summary: '', body: '', expiresAt: null, revision: '1' })
  })

  it('ignores feeds with an unknown schema version or shape', () => {
    expect(parseSiteFeed({ schemaVersion: 2, items: [item()] }, now)).toEqual([])
    expect(parseSiteFeed({ items: [item()] }, now)).toEqual([])
    expect(parseSiteFeed(null, now)).toEqual([])
    expect(parseSiteFeed([item()], now)).toEqual([])
  })

  it('skips invalid items without discarding the valid ones', () => {
    const items = parseSiteFeed({
      schemaVersion: 1,
      items: [
        item({ id: 'bad-kind', kind: 'ad' }),
        item({ id: 'empty-title', title: '   ' }),
        item({ id: 'long-title', title: 'x'.repeat(81) }),
        item({ id: 'long-body', body: 'x'.repeat(4001) }),
        item({ id: 'bad time', publishedAt: 'yesterday' }),
        'not an object',
        item({ id: 'ok' }),
      ],
    }, now)
    expect(items.map(entry => entry.id)).toEqual(['ok'])
  })

  it('only accepts links on the official site origin', () => {
    const items = parseSiteFeed({
      schemaVersion: 1,
      items: [
        item({ id: 'ok-path', url: 'https://xtlaw.qayong.site/tutorials/first-task.html' }),
        item({ id: 'other-host', url: 'https://example.com/' }),
        item({ id: 'lookalike', url: 'https://xtlaw.qayong.site.evil.example/' }),
        item({ id: 'userinfo', url: 'https://user:pass@xtlaw.qayong.site/' }),
        item({ id: 'http', url: 'http://xtlaw.qayong.site/' }),
        item({ id: 'script', url: 'javascript:alert(1)' }),
      ],
    }, now)
    expect(items.map(entry => entry.id)).toEqual(['ok-path'])
    expect(isOfficialSiteLink('https://xtlaw.qayong.site/a?b=1#c')).toBe(true)
    expect(isOfficialSiteLink('https://xtlaw.qayong.site:8443/')).toBe(false)
  })

  it('drops expired and not-yet-published items and duplicate ids', () => {
    const items = parseSiteFeed({
      schemaVersion: 1,
      items: [
        item({ id: 'expired', expiresAt: '2026-10-17T11:59:59+08:00' }),
        item({ id: 'future', publishedAt: '2026-10-18T09:00:00+08:00' }),
        item({ id: 'live', expiresAt: '2026-10-20T09:00:00+08:00' }),
        item({ id: 'live', title: 'duplicate' }),
      ],
    }, now)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'live', title: '欢迎使用 XTLaw' })
  })

  it('limits the number of items', () => {
    const items = parseSiteFeed({
      schemaVersion: 1,
      items: Array.from({ length: 60 }, (_, index) => item({ id: `n${index}`, publishedAt: `2026-10-01T09:${String(index).padStart(2, '0')}:00+08:00` })),
    }, now)
    expect(items).toHaveLength(SITE_FEED_MAX_ITEMS)
    expect(items[0]!.id).toBe('n59')
  })
})
