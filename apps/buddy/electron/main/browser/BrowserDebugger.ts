export interface BrowserDebuggerPort {
  attach: (protocolVersion?: string) => void
  detach: () => void
  isAttached: () => boolean
  sendCommand: (method: string, params?: Record<string, unknown>) => Promise<unknown>
  on?: (event: 'message', listener: (event: unknown, method: string, params: unknown) => void) => unknown
  off?: (event: 'message', listener: (event: unknown, method: string, params: unknown) => void) => unknown
}

export class BrowserDebugger {
  readonly #port: BrowserDebuggerPort
  readonly #subscriptions = new Map<string, Set<(params: unknown) => void>>()
  readonly #messageListener = (_event: unknown, method: string, params: unknown): void => {
    for (const listener of [...this.#subscriptions.get(method) ?? []])
      listener(params)
  }

  #bound = false
  #ownsAttachment = false

  constructor(port: BrowserDebuggerPort) {
    this.#port = port
  }

  ensureAttached(): void {
    if (!this.#port.isAttached()) {
      this.#port.attach('1.3')
      this.#ownsAttachment = true
    }
    this.#bindMessages()
  }

  sendCommand(...args: Parameters<BrowserDebuggerPort['sendCommand']>): Promise<unknown> {
    return this.#port.sendCommand(...args)
  }

  /**
   * Subscribes to a protocol event. Requires an attached debugger, so callers must attach the
   * connection first; listeners are dropped together with the connection.
   */
  onEvent(method: string, listener: (params: unknown) => void): () => void {
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

  dispose(): void {
    if (this.#bound) {
      this.#port.off?.('message', this.#messageListener)
      this.#bound = false
    }
    this.#subscriptions.clear()
    if (this.#ownsAttachment && this.#port.isAttached())
      this.#port.detach()
    this.#ownsAttachment = false
  }

  #bindMessages(): void {
    if (this.#bound || !this.#port.on)
      return
    this.#port.on('message', this.#messageListener)
    this.#bound = true
  }
}
