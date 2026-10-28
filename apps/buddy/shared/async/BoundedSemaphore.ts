export class QueueFullError extends Error {
  constructor() { super('QUEUE_FULL') }
}

interface Waiter {
  signal: AbortSignal
  abort: () => void
  resolve: (release: () => void) => void
}

export class BoundedSemaphore {
  readonly #limit: number
  readonly #queueLimit: number
  readonly #queue: Waiter[] = []
  #active = 0

  constructor(limit: number, queueLimit: number) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(queueLimit) || queueLimit < 0)
      throw new RangeError('Invalid semaphore capacity')
    this.#limit = limit
    this.#queueLimit = queueLimit
  }

  get snapshot() { return { active: this.#active, queued: this.#queue.length } }

  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted)
      return Promise.reject(signal.reason)
    if (this.#active < this.#limit) {
      this.#active++
      return Promise.resolve(this.#release())
    }
    if (this.#queue.length >= this.#queueLimit)
      return Promise.reject(new QueueFullError())
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        signal,
        resolve,
        abort: () => {
          const index = this.#queue.indexOf(waiter)
          if (index !== -1)
            this.#queue.splice(index, 1)
          reject(signal.reason)
        },
      }
      this.#queue.push(waiter)
      signal.addEventListener('abort', waiter.abort, { once: true })
    })
  }

  #release(): () => void {
    let released = false
    return () => {
      if (released)
        return
      released = true
      const next = this.#queue.shift()
      if (next) {
        next.signal.removeEventListener('abort', next.abort)
        next.resolve(this.#release())
      }
      else { this.#active-- }
    }
  }
}
