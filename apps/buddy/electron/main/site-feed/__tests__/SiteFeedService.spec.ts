import type { SiteFeedItem } from '../../../shared/siteFeed'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SITE_FEED_CHECK_INTERVAL, SITE_FEED_RETRY_INTERVAL, SITE_FEED_STARTUP_DELAY, SiteFeedService } from '../SiteFeedService'
import { emptySiteFeedRecord, SiteFeedStore } from '../SiteFeedStore'

const now = Date.parse('2026-10-17T12:00:00+08:00')
const services: SiteFeedService[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(services.splice(0).map(service => service.dispose()))
})

function item(id: string, fields: Partial<SiteFeedItem> = {}): SiteFeedItem {
  return { id, kind: 'announcement', title: id, summary: '', body: '', url: `https://xtlaw.qayong.site/${id}`, publishedAt: '2026-10-16T09:00:00+08:00', expiresAt: null, revision: '1', ...fields }
}

// Fake timers cannot wait for real disk I/O, so scheduling tests keep the record in memory.
function memoryStore(): Pick<SiteFeedStore, 'read' | 'write'> {
  let record = emptySiteFeedRecord()
  return {
    read: async () => record,
    write: async (next) => {
      record = next
    },
  }
}

async function fixture(items: SiteFeedItem[] = [item('news')], options: { automatic?: boolean, memory?: boolean } = {}) {
  const store = options.memory ? memoryStore() as SiteFeedStore : new SiteFeedStore(await createTemporaryDirectory('site-feed-'))
  const fetch = vi.fn(async (_signal: AbortSignal) => items)
  const openLink = vi.fn(async (_url: string) => {})
  const reportFailure = vi.fn()
  const service = new SiteFeedService({ automatic: options.automatic ?? false, store, fetch, openLink, reportFailure })
  services.push(service)
  return { fetch, openLink, reportFailure, service, store }
}

describe('siteFeedService', () => {
  it('starts empty and exposes fetched items as unseen site notifications without their links', async () => {
    const f = await fixture([item('news', { kind: 'tutorial', title: '第一个任务', summary: '从一个小目标开始', body: '## 步骤\n\n1. 新建任务', revision: '2' })])
    expect((await f.service.getState()).notifications).toEqual([])
    await f.service.check()
    expect(f.service.state.notifications).toEqual([{
      id: 'site.news',
      revision: '2',
      kind: 'site.notice',
      origin: 'site',
      attention: 'unseen',
      occurredAt: '2026-10-16T01:00:00.000Z',
      action: { type: 'open-site-link' },
      payload: { itemId: 'news', category: 'tutorial', title: '第一个任务', summary: '从一个小目标开始', body: '## 步骤\n\n1. 新建任务' },
    }])
    expect(JSON.stringify(f.service.state)).not.toContain('xtlaw.qayong.site')
  })

  it('persists items and seen state across restarts, and shows a changed revision as unseen again', async () => {
    const f = await fixture([item('news')])
    await f.service.check()
    await f.service.markSeen('news', '1')
    expect(f.service.state.notifications[0]?.attention).toBe('seen')

    const restarted = new SiteFeedService({ automatic: false, store: f.store, fetch: async () => [item('news', { revision: '2' })], openLink: f.openLink, reportFailure: f.reportFailure })
    services.push(restarted)
    expect((await restarted.getState()).notifications[0]).toMatchObject({ revision: '1', attention: 'seen' })
    await restarted.check()
    expect(restarted.state.notifications[0]).toMatchObject({ revision: '2', attention: 'unseen' })
  })

  it('ignores stale revisions and unknown ids when marking seen, and forgets items that left the feed', async () => {
    const f = await fixture([item('a'), item('b')])
    await f.service.check()
    await f.service.markSeen('a', 'old')
    await f.service.markSeen('missing', '1')
    expect(f.service.state.notifications.map(n => n.attention)).toEqual(['unseen', 'unseen'])
    await f.service.markAllSeen()
    expect(f.service.state.notifications.map(n => n.attention)).toEqual(['seen', 'seen'])
    f.fetch.mockResolvedValueOnce([item('a')])
    await f.service.check()
    expect((await f.store.read()).seen).toEqual({ a: '1' })
  })

  it('opens the stored link in the browser and marks it seen, but never an unknown or expired item', async () => {
    const f = await fixture([item('news'), item('old', { expiresAt: '2020-01-01T00:00:00+08:00' })])
    await f.service.check()
    await f.service.open('news')
    expect(f.openLink).toHaveBeenCalledWith('https://xtlaw.qayong.site/news')
    expect(f.service.state.notifications[0]?.attention).toBe('seen')
    await expect(f.service.open('missing')).rejects.toThrow('SITE_FEED_ITEM_UNAVAILABLE')
    await expect(f.service.open('old')).rejects.toThrow('SITE_FEED_ITEM_UNAVAILABLE')
    expect(f.openLink).toHaveBeenCalledTimes(1)
  })

  it('keeps showing the last good copy when a check fails', async () => {
    const f = await fixture([item('news')])
    await f.service.check()
    f.fetch.mockRejectedValueOnce(new Error('offline'))
    await expect(f.service.check()).rejects.toThrow('offline')
    expect(f.service.state.notifications).toHaveLength(1)
  })

  it('publishes a new state whenever the content changes', async () => {
    const f = await fixture([item('news')])
    const counts: number[] = []
    f.service.onDidChange(state => counts.push(state.notifications.length))
    await f.service.check()
    await f.service.markAllSeen()
    expect(counts.at(-1)).toBe(1)
    expect(counts.length).toBeGreaterThanOrEqual(2)
  })

  it('treats a corrupt state file as an empty feed', async () => {
    const directory = await createTemporaryDirectory('site-feed-')
    await writeFile(join(directory, 'site-feed.json'), '{broken')
    const service = new SiteFeedService({ automatic: false, store: new SiteFeedStore(directory), fetch: async () => [], openLink: async () => {}, reportFailure: () => {} })
    services.push(service)
    expect((await service.getState()).notifications).toEqual([])
  })

  describe('scheduling', () => {
    it('checks once after the startup delay when the app is ready, then daily', async () => {
      vi.useFakeTimers({ now, toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      const f = await fixture([item('news')], { automatic: true, memory: true })
      await f.service.start()
      f.service.setReady(true)
      await vi.advanceTimersByTimeAsync(SITE_FEED_STARTUP_DELAY - 1)
      expect(f.fetch).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(f.fetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(SITE_FEED_CHECK_INTERVAL - 1)
      expect(f.fetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(f.fetch).toHaveBeenCalledTimes(2)
    })

    it('retries sooner after a failure and reports it', async () => {
      vi.useFakeTimers({ now, toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      const f = await fixture([item('news')], { automatic: true, memory: true })
      f.fetch.mockRejectedValueOnce(new Error('offline'))
      await f.service.start()
      f.service.setReady(true)
      await vi.advanceTimersByTimeAsync(SITE_FEED_STARTUP_DELAY)
      expect(f.reportFailure).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(SITE_FEED_RETRY_INTERVAL)
      expect(f.fetch).toHaveBeenCalledTimes(2)
    })

    it('never checks on its own when automatic checks are off', async () => {
      vi.useFakeTimers({ now, toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      const f = await fixture([item('news')], { automatic: false, memory: true })
      await f.service.start()
      f.service.setReady(true)
      await vi.advanceTimersByTimeAsync(SITE_FEED_CHECK_INTERVAL * 2)
      expect(f.fetch).not.toHaveBeenCalled()
    })
  })
})
