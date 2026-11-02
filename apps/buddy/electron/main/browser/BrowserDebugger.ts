import { BrowserHostError } from './BrowserHostError'

export const BROWSER_OPERATION_TIMEOUT_MS = 30_000

export interface BrowserDebuggerPort {
  attach: (protocolVersion?: string) => void
  detach: () => void
  isAttached: () => boolean
  sendCommand: (method: string, params?: Record<string, unknown>) => Promise<unknown>
  on?: (event: 'message', listener: (event: unknown, method: string, params: unknown) => void) => unknown
  off?: (event: 'message', listener: (event: unknown, method: string, params: unknown) => void) => unknown
}

interface BrowserDebuggerOptions {
  operationTimeoutMs?: number
  onAbort?: (reason: Error) => Promise<void>
}

interface PendingOperation {
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

export class BrowserDebugger {
  readonly #port: BrowserDebuggerPort
  readonly #subscriptions = new Map<string, Set<(params: unknown) => void>>()
  readonly #messageListener = (_event: unknown, method: string, params: unknown): void => {
    for (const listener of [...this.#subscriptions.get(method) ?? []])
      listener(params)
  }

  #bound = false
  readonly #options: BrowserDebuggerOptions
  readonly #pending = new Set<PendingOperation>()
  #ownsAttachment = false
  #abortReason: Error | null = null
  #cleanup: Promise<void> | null = null

  constructor(port: BrowserDebuggerPort, options: BrowserDebuggerOptions = {}) {
    this.#port = port
    this.#options = options
  }

  get disposed(): boolean {
    return this.#abortReason !== null
  }

  get hasPendingOperations(): boolean {
    return this.#pending.size > 0
  }

  ensureAttached(): void {
    if (this.#abortReason)
      throw this.#abortReason
    if (!this.#port.isAttached()) {
      this.#port.attach('1.3')
      this.#ownsAttachment = true
    }
    this.#bindMessages()
  }

  sendCommand(...args: Parameters<BrowserDebuggerPort['sendCommand']>): Promise<unknown> {
    return this.run(() => this.#port.sendCommand(...args))
  }

  /**
   * Subscribes to a protocol event. Requires an attached debugger, so callers must attach the
   * connection first; listeners are dropped together with the connection.
   */
  onEvent(method: string, listener: (params: unknown) => void): () => void {
    if (this.#abortReason)
      return () => {}
    let listeners = this.#subscriptions.get(method)
    if (!listeners) {
      listeners = new Set()
      this.#subscriptions.set(method, listeners)
    }
    listeners.add(listener)
    return () => {
      listeners?.delete(listener)
    }
  }

  run<T>(operation: () => Promise<T>, options: { timeoutMs?: number | null } = {}): Promise<T> {
    if (this.#abortReason)
      return Promise.reject(this.#abortReason)
    const timeout = options.timeoutMs === undefined
      ? this.#options.operationTimeoutMs ?? BROWSER_OPERATION_TIMEOUT_MS
      : options.timeoutMs
    return new Promise<T>((resolve, reject) => {
      const pending: PendingOperation = {
        reject,
        timer: timeout === null
          ? null
          : setTimeout(() => {
              void this.abort(new BrowserHostError(
                'BROWSER_PAGE_UNRESPONSIVE',
                'Browser page operation exceeded its deadline',
              )).catch(() => {})
            }, timeout),
      }
      this.#pending.add(pending)
      const finish = (settle: () => void) => {
        if (this.#abortReason)
          return
        if (pending.timer)
          clearTimeout(pending.timer)
        this.#pending.delete(pending)
        settle()
      }
      try {
        void operation().then(
          result => finish(() => resolve(result)),
          error => finish(() => reject(error)),
        )
      }
      catch (error) {
        finish(() => reject(error))
      }
    })
  }

  abort(reason: Error): Promise<void> {
    if (this.#cleanup)
      return this.#cleanup
    this.#abortReason = reason
    this.#unbindMessages()
    for (const pending of this.#pending) {
      if (pending.timer)
        clearTimeout(pending.timer)
    }
    let resolve!: () => void
    let reject!: (error: unknown) => void
    this.#cleanup = new Promise<void>((resolveCleanup, rejectCleanup) => {
      resolve = resolveCleanup
      reject = rejectCleanup
    })
    let detachError: unknown
    try {
      if ((this.#ownsAttachment || this.hasPendingOperations) && this.#port.isAttached()) {
        this.#port.detach()
        if (this.#port.isAttached())
          throw new BrowserHostError('BROWSER_PAGE_UNRESPONSIVE', 'Browser debugger detachment could not be confirmed')
      }
      this.#ownsAttachment = false
    }
    catch (error) {
      detachError = error
    }
    try {
      const cleanup = this.#options.onAbort
        ? this.#options.onAbort(reason)
        : detachError
          ? Promise.reject(detachError)
          : Promise.resolve()
      void cleanup.then(() => {
        for (const pending of this.#pending)
          pending.reject(reason)
        this.#pending.clear()
        resolve()
      }, reject)
    }
    catch (error) {
      reject(error)
    }
    return this.#cleanup
  }

  dispose(reason: Error = new BrowserHostError('BROWSER_PAGE_FAILED', 'Browser debugger was released')): void {
    void this.abort(reason).catch(() => {})
  }

  #bindMessages(): void {
    if (this.#bound || !this.#port.on)
      return
    this.#port.on('message', this.#messageListener)
    this.#bound = true
  }

  #unbindMessages(): void {
    if (this.#bound) {
      this.#port.off?.('message', this.#messageListener)
      this.#bound = false
    }
    this.#subscriptions.clear()
  }
}
