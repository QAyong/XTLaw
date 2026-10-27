import { WebError, webError } from '../../../shared/network/webProtocol'

/** Caps concurrent web work; callers over the cap wait in a bounded queue instead of being rejected. */
export class WebConcurrencyGate {
  #active = 0
  readonly #waiters: Array<() => void> = []
  readonly #limit: number
  readonly #maxQueued: number
  readonly #waitMs: number

  constructor(limit: number, maxQueued: number, waitMs: number) {
    this.#limit = limit
    this.#maxQueued = maxQueued
    this.#waitMs = waitMs
  }

  get saturated() { return this.#active >= this.#limit }
  get queued() { return this.#waiters.length }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted)
      throw webError(null, signal)
    if (this.#active < this.#limit) {
      this.#active++
      return this.#releaseOnce()
    }
    if (this.#waiters.length >= this.#maxQueued)
      throw new WebError('WEB_BUSY')
    await new Promise<void>((resolve, reject) => {
      const cleanup = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      let waiter: (() => void) | undefined
      const settle = (error?: WebError) => {
        clearTimeout(timer)
        cleanup.abort()
        if (!error)
          return resolve()
        this.#waiters.splice(this.#waiters.indexOf(waiter!), 1)
        reject(error)
      }
      // A handed-over slot stays counted in #active, so a woken waiter never races a newcomer.
      waiter = () => settle()
      timer = setTimeout(() => settle(new WebError('WEB_QUEUE_TIMEOUT')), this.#waitMs)
      signal?.addEventListener('abort', () => settle(webError(null, signal)), { once: true, signal: cleanup.signal })
      this.#waiters.push(waiter)
    })
    return this.#releaseOnce()
  }

  #releaseOnce(): () => void {
    let released = false
    return () => {
      if (released)
        return
      released = true
      const next = this.#waiters.shift()
      if (next)
        next()
      else
        this.#active--
    }
  }
}
