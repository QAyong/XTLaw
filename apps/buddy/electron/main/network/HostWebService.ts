import type { Session } from 'electron'
import type { WebRequestBudget, WebResourceFact } from '../../../shared/network/webProtocol'
import type { RuntimeRpcPeerContract } from '../../../shared/runtime/rpcPeer'
import type { ProxyAuthenticator } from './requestThroughHost'
import { randomUUID } from 'node:crypto'
import { session } from 'electron'
import { BoundedSemaphore, QueueFullError } from '../../../shared/async/BoundedSemaphore'
import { WebError, webError, webPreflightResultSchema } from '../../../shared/network/webProtocol'
import { HostWebNetwork } from './HostWebNetwork'
import { requestThroughHost } from './requestThroughHost'

type ResourceKind = WebResourceFact['kind']
interface RequestInput { requestId: string, budget: WebRequestBudget }
type ResourceWork<T> = (signal: AbortSignal, track: (closed: Promise<void>) => void, cleaning: () => void) => Promise<T>

export class HostWebService {
  readonly network: HostWebNetwork
  readonly #session: Session
  readonly #pools = { network: new BoundedSemaphore(8, 64), render: new BoundedSemaphore(2, 64) }
  readonly #shutdown = new AbortController()
  readonly #pending = new Set<Promise<unknown>>()
  readonly #report: (fact: WebResourceFact) => void
  readonly #assertAvailable: () => void
  #disposing?: Promise<void>

  constructor(options: { authenticateProxy?: ProxyAuthenticator, assertAvailable?: () => void, report?: (fact: WebResourceFact) => void, network?: HostWebNetwork } = {}) {
    this.#session = options.network?.session ?? session.fromPartition(`buddy-web-network:${randomUUID()}`, { cache: false })
    this.#session.setPermissionCheckHandler(() => false)
    this.#session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    this.network = options.network ?? new HostWebNetwork(this.#session, (session, input, signal, track) => requestThroughHost(session, input, signal, options.authenticateProxy, track))
    this.#report = options.report ?? (() => {})
    this.#assertAvailable = options.assertAvailable ?? (() => {})
  }

  get snapshot() { return { network: this.#pools.network.snapshot, render: this.#pools.render.snapshot } }

  scope(peer: RuntimeRpcPeerContract) {
    const shutdown = new AbortController()
    const active = new Map<string, AbortController>()
    return {
      cancel: (id: string) => active.get(id)?.abort(new WebError('WEB_CANCELLED')),
      dispose: () => shutdown.abort(new WebError('WEB_CANCELLED')),
      run: <T>(kind: ResourceKind, input: RequestInput, parent: AbortSignal | undefined, work: ResourceWork<T>): Promise<T> => {
        if (active.has(input.requestId))
          return Promise.reject(new WebError('WEB_BUSY'))
        const controller = new AbortController()
        active.set(input.requestId, controller)
        const signal = AbortSignal.any([shutdown.signal, controller.signal, this.#shutdown.signal, ...(parent ? [parent] : [])])
        const result = Promise.withResolvers<T>()
        const pending = this.#run(peer, kind, input, signal, work, result).finally(() => {
          active.delete(input.requestId)
          this.#pending.delete(pending)
        })
        this.#pending.add(pending)
        void pending.catch(result.reject)
        return result.promise
      },
    }
  }

  async #run<T>(peer: RuntimeRpcPeerContract, kind: ResourceKind, input: RequestInput, parent: AbortSignal, work: ResourceWork<T>, result: PromiseWithResolvers<T>): Promise<void> {
    const pool = this.#pools[kind]
    const queuedAt = performance.now()
    const publish = (phase: WebResourceFact['phase'], started: number, code?: WebResourceFact['code']) => {
      const fact: WebResourceFact = { requestId: input.requestId, operationId: input.budget.operationId, kind, phase, ...pool.snapshot, durationMs: Math.round(performance.now() - started), ...(code ? { code } : {}) }
      try {
        this.#report(fact)
      }
      catch { console.error('WEB_RESOURCE_OBSERVER_FAILED') }
      try {
        if (!parent.aborted)
          peer.notify('host.web.resource', fact)
      }
      catch {}
    }
    const deadline = new AbortController()
    const remaining = Math.min(120_000, input.budget.deadline - Date.now())
    let running = false
    let executionStarted = queuedAt
    const timer = setTimeout(() => deadline.abort(new WebError(running ? 'WEB_TIMEOUT' : 'WEB_QUEUE_TIMEOUT')), Math.max(0, remaining))
    const signal = AbortSignal.any([parent, deadline.signal])
    const cancelled = () => result.reject(webError(signal.reason, signal))
    signal.addEventListener('abort', cancelled, { once: true })
    let release: (() => void) | undefined
    let executionTimer: ReturnType<typeof setTimeout> | undefined
    const resources: Promise<void>[] = []
    let cleaningAt: number | undefined
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    const cleaning = () => {
      if (cleaningAt !== undefined)
        return
      cleaningAt = performance.now()
      clearTimeout(executionTimer)
      publish('cleaning', executionStarted)
      cleanupTimer = setTimeout(() => {
        publish('cleanup-failed', cleaningAt!, 'WEB_NETWORK_ERROR')
        result.reject(new WebError('WEB_NETWORK_ERROR'))
      }, 10_000)
    }
    try {
      this.#assertAvailable()
      if (remaining <= 0)
        throw new WebError('WEB_QUEUE_TIMEOUT')
      const acquired = pool.acquire(signal)
      publish('queued', queuedAt)
      release = await acquired
      signal.throwIfAborted()
      this.#assertAvailable()
      const preflight = webPreflightResultSchema.parse(await peer.request('runtime.web.preflight', { requestId: input.requestId }, null, signal))
      if (!preflight.ok)
        throw new WebError(preflight.code)
      signal.throwIfAborted()
      running = true
      executionStarted = performance.now()
      publish('running', queuedAt)
      executionTimer = setTimeout(() => deadline.abort(new WebError('WEB_TIMEOUT')), Math.max(1, Math.min(preflight.executionMs, input.budget.executionMs, kind === 'render' ? 20_000 : 50_000, input.budget.deadline - Date.now())))
      result.resolve(await work(signal, (closed) => {
        resources.push(closed)
        void closed.catch(() => {})
      }, cleaning))
    }
    catch (error) {
      const failure = error instanceof QueueFullError ? new WebError('WEB_BUSY') : webError(error, signal)
      publish('rejected', queuedAt, failure.code)
      result.reject(failure)
    }
    finally {
      signal.removeEventListener('abort', cancelled)
      clearTimeout(timer)
      clearTimeout(executionTimer)
      if (release) {
        cleaning()
        try {
          await Promise.all(resources)
          release()
          publish('released', cleaningAt!)
        }
        catch {
          publish('cleanup-failed', cleaningAt!, 'WEB_NETWORK_ERROR')
        }
        finally { clearTimeout(cleanupTimer) }
      }
    }
  }

  dispose(): Promise<void> {
    this.#disposing ??= this.#dispose()
    return this.#disposing
  }

  async #dispose(): Promise<void> {
    this.#shutdown.abort(new WebError('WEB_CANCELLED'))
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.allSettled([...this.#pending]),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('WEB_HOST_DRAIN_TIMEOUT')), 10_000) }),
      ])
      if (this.snapshot.network.active || this.snapshot.render.active)
        throw new Error('WEB_HOST_CLEANUP_FAILED')
      await Promise.all([this.#session.closeAllConnections(), this.#session.clearStorageData(), this.#session.clearCache()])
    }
    finally { clearTimeout(timer) }
  }
}
