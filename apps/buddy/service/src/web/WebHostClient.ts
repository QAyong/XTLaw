import type { WebNetworkRequest, WebRenderResult } from '../../../shared/network/webProtocol'
import type { ProviderWebFetch, PublicWebGet } from '../../../shared/network/webTransport'
import type { RuntimeRpcPeerContract } from '../../../shared/runtime/rpcPeer'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { readResponseBytes } from '../../../platform/network/publicWebTransport'
import { Emitter } from '../../../shared/events/Emitter'
import { copyEventSnapshot } from '../../../shared/events/eventSnapshot'
import { WebError, webError, webNetworkChunkSchema, webNetworkHeadSchema, webRenderCancelSchema, webRenderResultSchema, webResourceFactSchema } from '../../../shared/network/webProtocol'

import { beginNetworkRequest } from '../network/networkAuthorizationContext'
import { WebRequestContext, webRequestContext } from './webRequestContext'

type WebHostRequestKind = 'authorization' | 'network' | 'render'
export interface WebHostChange {
  readonly revision: number
  readonly requestId: string
  readonly kind: WebHostRequestKind
  readonly operationId?: string
  readonly durationMs?: number
  readonly phase: 'queued' | 'running' | 'cleaning' | 'released' | 'rejected' | 'cleanup-failed' | 'requested' | 'head-received' | 'cancel-requested' | 'cancel-unconfirmed' | 'settled'
  readonly outcome?: 'received' | 'rejected' | 'unknown'
  readonly cancelled?: boolean
  readonly count?: number
}

export class WebHostClient {
  readonly peer: Pick<RuntimeRpcPeerContract, 'request' | 'notify' | 'onNotification'> & Partial<Pick<RuntimeRpcPeerContract, 'onRequest'>>
  readonly #changes = new Emitter<WebHostChange>(() => console.error('WEB_HOST_OBSERVER_FAILED'))
  readonly onDidChange = this.#changes.event
  readonly #shutdown = new AbortController()
  readonly #active = new Map<string, WebHostRequestKind>()
  readonly #authorizations = new Map<string, ReturnType<typeof beginNetworkRequest>>()
  readonly #pending = new Set<Promise<unknown>>()
  readonly #dispatched = new Set<string>()
  readonly #contexts = new Map<string, WebRequestContext>()
  readonly #subscriptions: Array<() => void> = []
  #revision = 0
  #disposing: Promise<void> | undefined

  constructor(peer: WebHostClient['peer']) {
    this.peer = peer
    if (peer.onRequest) {
      this.#subscriptions.push(peer.onRequest('runtime.web.preflight', (params) => {
        const { requestId } = webRenderCancelSchema.parse(params)
        try {
          const context = this.#contexts.get(requestId)
          if (!context)
            throw new WebError('WEB_CANCELLED')
          this.#authorizations.get(requestId)?.check()
          const executionMs = context.preflight()
          this.#dispatched.add(requestId)
          return { ok: true, executionMs }
        }
        catch (error) { return { ok: false, code: webError(error).code } }
      }))
    }
    this.#subscriptions.push(peer.onNotification((method, params) => {
      if (method !== 'host.web.resource')
        return
      const result = webResourceFactSchema.safeParse(params)
      if (result.success) {
        const { requestId, operationId, kind, phase, durationMs, active, queued } = result.data
        this.#publish(requestId, kind, { operationId, phase, durationMs, count: phase === 'queued' ? queued : active })
      }
    }))
  }

  get snapshot() {
    return copyEventSnapshot({ revision: this.#revision, stopping: this.#shutdown.signal.aborted, active: [...this.#active].map(([requestId, kind]) => ({ requestId, kind })) })
  }

  async authorize(url: string, parent?: AbortSignal): Promise<void> {
    const { requestId, signal } = this.#begin('authorization', parent)
    let outcome: WebHostChange['outcome'] = 'unknown'
    try {
      const result = z.discriminatedUnion('ok', [
        z.object({ ok: z.literal(true) }),
        webRenderResultSchema.options[1],
      ]).parse(await this.#track(this.peer.request('host.web.authorize', { url }, null, signal, requestId)))
      outcome = result.ok ? 'received' : 'rejected'
      this.#authorizations.get(requestId)?.check()
      if (!result.ok)
        throw new WebError(result.code)
    }
    finally { this.#finish(requestId, outcome, signal.aborted) }
  }

  get: PublicWebGet = async (url, signal, limit = 12 * 1024 * 1024) => {
    const result = await this.#request({ url, scope: 'public', method: 'GET', headers: {}, limit }, signal)
    return { bytes: await readResponseBytes(result.response, limit), headers: result.response.headers, status: result.response.status, url: result.url }
  }

  providerFetch: ProviderWebFetch = async (url, init) => {
    const result = await this.#request({ url, scope: 'provider', method: init.method, headers: Object.fromEntries(new Headers(init.headers)), body: init.body, limit: 12 * 1024 * 1024 }, init.signal)
    return result.response
  }

  async render(url: string, parent: AbortSignal): Promise<WebRenderResult> {
    const { requestId, signal } = this.#begin('render', parent)
    const cancel = () => this.#cancel(requestId)
    signal.addEventListener('abort', cancel, { once: true })
    let outcome: WebHostChange['outcome'] = 'unknown'
    try {
      const result = webRenderResultSchema.parse(await this.#track(this.peer.request('host.web.render', { url, requestId, budget: this.#contexts.get(requestId)!.budget }, null, signal, requestId)))
      outcome = result.ok ? 'received' : 'rejected'
      this.#authorizations.get(requestId)?.check()
      signal.throwIfAborted()
      return result
    }
    catch (error) { throw this.#deadlineError(error, requestId, signal) }
    finally {
      signal.removeEventListener('abort', cancel)
      if (outcome === 'unknown' && !signal.aborted)
        cancel()
      this.#finish(requestId, outcome, signal.aborted)
    }
  }

  dispose(): Promise<void> {
    if (this.#disposing)
      return this.#disposing
    this.#disposing = Promise.resolve().then(async () => {
      await Promise.allSettled([...this.#pending])
      this.#subscriptions.forEach(dispose => dispose())
      this.#contexts.clear()
      this.#changes.dispose()
    })
    this.#shutdown.abort()
    return this.#disposing
  }

  async #request(input: Omit<WebNetworkRequest, 'requestId' | 'budget'>, parent: AbortSignal): Promise<{ response: Response, url: string }> {
    const { requestId, signal } = this.#begin('network', parent)
    let controller: ReadableStreamDefaultController<Uint8Array>
    let finished = false
    let headSettled = false
    let bodyOutcome: NonNullable<WebHostChange['outcome']> = 'unknown'
    let received = 0
    let unsubscribe = () => {}
    const cleanup = (outcome: NonNullable<WebHostChange['outcome']>) => {
      if (finished)
        return
      finished = true
      unsubscribe()
      signal.removeEventListener('abort', cancel)
      bodyOutcome = outcome
      if (headSettled)
        this.#finish(requestId, outcome, signal.aborted, received)
    }
    const cancelRequest = () => this.#cancel(requestId)
    function cancel() {
      if (finished)
        return
      cancelRequest()
      controller.error(webError(signal.reason, signal))
      cleanup('unknown')
    }
    const stream = new ReadableStream<Uint8Array>({
      start(value) { controller = value },
      cancel: () => {
        if (!finished)
          this.#cancel(requestId)
        cleanup('unknown')
      },
    })
    unsubscribe = this.peer.onNotification((method, params) => {
      if (method !== 'host.web.chunk' || finished)
        return
      const parsed = webNetworkChunkSchema.safeParse(params)
      if (!parsed.success || parsed.data.requestId !== requestId)
        return
      const message = parsed.data
      if (message.code) {
        controller.error(new WebError(message.code))
        cleanup('rejected')
      }
      else if (message.done) {
        controller.close()
        cleanup('received')
      }
      else if (message.chunk) {
        const bytes = Buffer.from(message.chunk, 'base64')
        received += bytes.byteLength
        if (received > input.limit) {
          this.#cancel(requestId)
          controller.error(new WebError('WEB_RESPONSE_TOO_LARGE'))
          cleanup('rejected')
        }
        else { controller.enqueue(bytes) }
      }
    })
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const result = webNetworkHeadSchema.parse(await this.#track(this.peer.request('host.web.request', { ...input, requestId, budget: this.#contexts.get(requestId)!.budget }, null, signal, requestId)))
      this.#authorizations.get(requestId)?.check()
      signal.throwIfAborted()
      headSettled = true
      if (!result.ok) {
        cleanup('rejected')
        this.#finish(requestId, 'rejected', signal.aborted, received)
        throw new WebError(result.code)
      }
      this.#publish(requestId, 'network', { phase: 'head-received' })
      if (finished)
        this.#finish(requestId, bodyOutcome, signal.aborted, received)
      const empty = [204, 205, 304].includes(result.status)
      const response = new Response(empty ? null : stream, { status: result.status, headers: result.headers })
      if (empty && !finished) {
        this.#cancel(requestId)
        cleanup('received')
      }
      return { response, url: result.url }
    }
    catch (error) {
      const failure = this.#deadlineError(error, requestId, signal)
      if (!finished)
        this.#cancel(requestId)
      headSettled = true
      cleanup('unknown')
      this.#finish(requestId, 'unknown', signal.aborted, received)
      await stream.cancel().catch(() => {})
      throw failure
    }
  }

  #deadlineError(error: unknown, requestId: string, signal: AbortSignal): unknown {
    return signal.aborted && signal.reason?.name === 'TimeoutError' && !this.#dispatched.has(requestId)
      ? new WebError('WEB_QUEUE_TIMEOUT')
      : error
  }

  #begin(kind: WebHostRequestKind, parent?: AbortSignal) {
    const signal = AbortSignal.any([this.#shutdown.signal, ...(parent ? [parent] : [])])
    signal.throwIfAborted()
    const request = beginNetworkRequest(this.peer, signal)
    const { requestId } = request
    this.#authorizations.set(requestId, request)
    this.#active.set(requestId, kind)
    this.#contexts.set(requestId, webRequestContext.getStore() ?? new WebRequestContext({ operationId: randomUUID(), deadline: Date.now() + 120_000, executionMs: kind === 'render' ? 20_000 : 45_000 }))
    this.#publish(requestId, kind, { phase: 'requested' })
    return { requestId, signal: request.signal }
  }

  #track<T>(promise: Promise<T>): Promise<T> {
    this.#pending.add(promise)
    void promise.finally(() => this.#pending.delete(promise)).catch(() => {})
    return promise
  }

  #finish(requestId: string, outcome: WebHostChange['outcome'], cancelled: boolean, count?: number): void {
    const kind = this.#active.get(requestId)
    if (!kind)
      return
    this.#active.delete(requestId)
    this.#contexts.delete(requestId)
    this.#dispatched.delete(requestId)
    this.#authorizations.get(requestId)?.dispose()
    this.#authorizations.delete(requestId)
    this.#publish(requestId, kind, { phase: 'settled', outcome, cancelled, ...(count === undefined ? {} : { count }) })
  }

  #cancel(requestId: string): void {
    const kind = this.#active.get(requestId)
    if (!kind)
      return
    this.#publish(requestId, kind, { phase: 'cancel-requested' })
    try {
      this.peer.notify('host.web.cancel', { requestId })
    }
    catch { this.#publish(requestId, kind, { phase: 'cancel-unconfirmed' }) }
  }

  #publish(requestId: string, kind: WebHostRequestKind, fact: Omit<WebHostChange, 'revision' | 'requestId' | 'kind'>): void {
    this.#changes.fire(copyEventSnapshot({ ...fact, kind, requestId, revision: ++this.#revision }))
  }
}
