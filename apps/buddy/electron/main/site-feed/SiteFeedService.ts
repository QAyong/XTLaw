import type { DesktopSiteNotification, SiteFeedItem, SiteFeedState } from '../../shared/siteFeed'
import type { SiteFeedRecord, SiteFeedStore } from './SiteFeedStore'
import { Emitter } from '../../../shared/events/Emitter'
import { copyEventSnapshot } from '../../../shared/events/eventSnapshot'
import { isSiteFeedItemActive } from '../../shared/siteFeed'
import { emptySiteFeedRecord } from './SiteFeedStore'

export const SITE_FEED_STARTUP_DELAY = 60_000
export const SITE_FEED_CHECK_INTERVAL = 24 * 60 * 60 * 1000
export const SITE_FEED_RETRY_INTERVAL = 60 * 60 * 1000

export interface SiteFeedServiceOptions {
  automatic: boolean
  store: Pick<SiteFeedStore, 'read' | 'write'>
  fetch: (signal: AbortSignal) => Promise<SiteFeedItem[]>
  openLink: (url: string) => Promise<void>
  reportFailure: (error: unknown) => void
  now?: () => number
}

export class SiteFeedService {
  readonly #options: SiteFeedServiceOptions
  readonly #changes: Emitter<SiteFeedState>
  readonly onDidChange: Emitter<SiteFeedState>['event']
  #record: SiteFeedRecord = emptySiteFeedRecord()
  #revision = 0
  #ready = false
  #stopped = false
  #initialization: Promise<void> | undefined
  #request: { controller: AbortController, promise: Promise<void> } | null = null
  #tail: Promise<unknown> = Promise.resolve()
  #timer: ReturnType<typeof setTimeout> | undefined
  #failed = false

  constructor(options: SiteFeedServiceOptions) {
    this.#options = options
    this.#changes = new Emitter(options.reportFailure)
    this.onDidChange = this.#changes.event
  }

  get state(): SiteFeedState {
    const now = this.#now()
    const notifications = this.#record.items
      .filter(item => isSiteFeedItemActive(item, now))
      .map((item): DesktopSiteNotification => ({
        id: `site.${item.id}`,
        revision: item.revision,
        kind: 'site.notice',
        origin: 'site',
        attention: this.#record.seen[item.id] === item.revision ? 'seen' : 'unseen',
        occurredAt: new Date(item.publishedAt).toISOString(),
        action: { type: 'open-site-link' },
        payload: { itemId: item.id, category: item.kind, title: item.title, summary: item.summary, body: item.body },
      }))
    return copyEventSnapshot({ revision: this.#revision, notifications })
  }

  start(): Promise<void> {
    this.#initialization ??= this.#options.store.read().then((record) => {
      if (this.#stopped)
        return
      this.#record = record
      this.#publish()
      this.#schedule()
    })
    return this.#initialization
  }

  setReady(ready: boolean): void {
    if (this.#ready === ready || this.#stopped)
      return
    this.#ready = ready
    this.#schedule()
  }

  async getState(): Promise<SiteFeedState> {
    await this.start()
    return this.state
  }

  check(): Promise<void> {
    if (this.#stopped)
      return Promise.reject(new Error('SITE_FEED_STOPPED'))
    if (this.#request)
      return this.#request.promise
    const controller = new AbortController()
    const request = {
      controller,
      promise: this.#check(controller.signal).finally(() => {
        if (this.#request === request) {
          this.#request = null
          this.#schedule()
        }
      }),
    }
    this.#request = request
    return request.promise
  }

  markSeen(itemId: string, revision: string): Promise<SiteFeedState> {
    return this.#enqueue(async () => {
      const item = this.#record.items.find(candidate => candidate.id === itemId)
      if (item?.revision === revision && this.#record.seen[itemId] !== revision)
        await this.#commit({ ...this.#record, seen: { ...this.#record.seen, [itemId]: revision } })
      return this.state
    })
  }

  markAllSeen(): Promise<SiteFeedState> {
    return this.#enqueue(async () => {
      const now = this.#now()
      const seen = { ...this.#record.seen }
      let changed = false
      for (const item of this.#record.items) {
        if (isSiteFeedItemActive(item, now) && seen[item.id] !== item.revision) {
          seen[item.id] = item.revision
          changed = true
        }
      }
      if (changed)
        await this.#commit({ ...this.#record, seen })
      return this.state
    })
  }

  /** Opens the item's link in the system browser; the link is read from the validated copy, never from the caller. */
  async open(itemId: string): Promise<void> {
    await this.start()
    const item = this.#record.items.find(candidate => candidate.id === itemId && isSiteFeedItemActive(candidate, this.#now()))
    if (!item)
      throw new Error('SITE_FEED_ITEM_UNAVAILABLE')
    await this.#options.openLink(item.url)
    await this.markSeen(item.id, item.revision)
  }

  async dispose(): Promise<void> {
    this.#stopped = true
    clearTimeout(this.#timer)
    this.#request?.controller.abort()
    await this.#request?.promise.catch(() => {})
    await this.#initialization?.catch(() => {})
    await this.#tail.catch(() => {})
    this.#changes.dispose()
  }

  async #check(signal: AbortSignal): Promise<void> {
    await this.start()
    signal.throwIfAborted()
    const attemptedAt = this.#now()
    let items: SiteFeedItem[]
    try {
      items = await this.#options.fetch(signal)
    }
    catch (error) {
      this.#failed = true
      if (!signal.aborted)
        await this.#enqueue(() => this.#commit({ ...this.#record, lastCheckedAt: attemptedAt }))
      throw error
    }
    this.#failed = false
    await this.#enqueue(async () => {
      const ids = new Set(items.map(item => item.id))
      const seen = Object.fromEntries(Object.entries(this.#record.seen).filter(([id]) => ids.has(id)))
      await this.#commit({ ...this.#record, items, seen, lastCheckedAt: attemptedAt, lastSuccessfulCheckAt: attemptedAt })
    })
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.#tail.then(async () => {
      await this.start()
      if (this.#stopped)
        throw new Error('SITE_FEED_STOPPED')
      return operation()
    })
    this.#tail = pending.catch(() => {})
    return pending
  }

  async #commit(record: SiteFeedRecord): Promise<void> {
    await this.#options.store.write(record)
    this.#record = record
    this.#publish()
  }

  #publish(): void {
    this.#revision++
    if (!this.#stopped)
      this.#changes.fire(this.state)
  }

  #schedule(): void {
    clearTimeout(this.#timer)
    if (this.#stopped || !this.#ready || !this.#options.automatic || this.#request || !this.#initialization)
      return
    const { lastCheckedAt, lastSuccessfulCheckAt } = this.#record
    const interval = this.#failed ? SITE_FEED_RETRY_INTERVAL : SITE_FEED_CHECK_INTERVAL
    const base = this.#failed ? lastCheckedAt : lastSuccessfulCheckAt
    const now = this.#now()
    const due = base === null ? 0 : Math.min(base, now) + interval
    const delay = Math.max(SITE_FEED_STARTUP_DELAY, due - now)
    this.#timer = setTimeout(() => {
      void this.check().catch(this.#options.reportFailure)
    }, delay)
    this.#timer.unref?.()
  }

  #now(): number {
    return this.#options.now?.() ?? Date.now()
  }
}
