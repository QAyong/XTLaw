import type { DesktopSiteNotification, SiteFeedState } from '@buddy-electron/shared/siteFeed'
import { describe, expect, it, vi } from 'vitest'
import { useSiteFeed } from '../useSiteFeed'

function notice(itemId: string): DesktopSiteNotification {
  return {
    id: `site.${itemId}`,
    revision: '1',
    kind: 'site.notice',
    origin: 'site',
    attention: 'unseen',
    occurredAt: '2026-10-16T01:00:00.000Z',
    action: { type: 'open-site-link' },
    payload: { itemId, category: 'tutorial', title: itemId, summary: '', body: '## 内容' },
  }
}

function fixture(initial: SiteFeedState = { revision: 1, notifications: [] }) {
  let listener: (state: SiteFeedState) => void = () => {}
  const stop = vi.fn()
  const siteFeed = {
    getState: vi.fn(async () => initial),
    onChanged: vi.fn((next: (state: SiteFeedState) => void) => {
      listener = next
      return stop
    }),
    markSeen: vi.fn(async (_itemId: string, _revision: string) => ({ revision: 3, notifications: [] })),
    markAllSeen: vi.fn(async () => ({ revision: 4, notifications: [] })),
    open: vi.fn(async (_itemId: string) => {}),
  }
  return { feed: useSiteFeed({ siteFeed }), siteFeed, stop, push: (state: SiteFeedState) => listener(state) }
}

describe('useSiteFeed', () => {
  it('loads the state and ignores older revisions pushed afterwards', async () => {
    const f = fixture({ revision: 5, notifications: [notice('a')] })
    await f.feed.load()
    f.push({ revision: 4, notifications: [] })
    expect(f.feed.state.value?.notifications).toHaveLength(1)
    f.push({ revision: 6, notifications: [] })
    expect(f.feed.state.value?.notifications).toHaveLength(0)
  })

  it('keeps the selected notice for the dialog until it is closed', () => {
    const f = fixture()
    const selected = notice('first-task')
    f.feed.show(selected)
    expect(f.feed.details.value).toEqual(selected)
    f.feed.close()
    expect(f.feed.details.value).toBeNull()
  })

  it('applies the state returned by seen mutations and delegates opening the link to the main process', async () => {
    const f = fixture()
    await f.feed.markSeen('a', '1')
    expect(f.siteFeed.markSeen).toHaveBeenCalledWith('a', '1')
    expect(f.feed.state.value?.revision).toBe(3)
    await f.feed.markAllSeen()
    expect(f.feed.state.value?.revision).toBe(4)
    await f.feed.open('a')
    expect(f.siteFeed.open).toHaveBeenCalledWith('a')
  })

  it('stops listening and ignores selections after disposal', () => {
    const f = fixture()
    f.feed.dispose()
    expect(f.stop).toHaveBeenCalledTimes(1)
    f.feed.show(notice('late'))
    expect(f.feed.details.value).toBeNull()
  })
})
