import type { Session } from 'electron'
import type { WebResourceFact } from '../../../../shared/network/webProtocol'
import type { HostWebNetwork } from '../HostWebNetwork'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeRpcPeer } from '../../../../platform/ipc/runtimeRpcPeer'
import { WebHostClient } from '../../../../service/src/web/WebHostClient'
import { WebRequestContext, webRequestContext } from '../../../../service/src/web/webRequestContext'
import { WebError } from '../../../../shared/network/webProtocol'
import { HostWebService } from '../HostWebService'
import { registerWebHostRpc } from '../registerWebHostRpc'

const rendering = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ session: {} }))
vi.mock('../WebRenderHost', () => ({ renderWebDocument: rendering }))

function peers() {
  let receiveHost: (message: unknown) => void = () => {}
  let receiveRuntime: (message: unknown) => void = () => {}
  const runtime = new RuntimeRpcPeer({ transport: {
    postMessage: message => queueMicrotask(() => receiveHost(message)),
    subscribe: (listener) => {
      receiveRuntime = listener
      return () => {}
    },
  } })
  const host = new RuntimeRpcPeer({ transport: {
    postMessage: message => queueMicrotask(() => receiveRuntime(message)),
    subscribe: (listener) => {
      receiveHost = listener
      return () => {}
    },
  } })
  return { runtime, host }
}

function fixture() {
  const facts: WebResourceFact[] = []
  const network = {
    session: {
      setPermissionCheckHandler() {},
      setPermissionRequestHandler() {},
      async closeAllConnections() {},
      async clearStorageData() {},
      async clearCache() {},
    } as unknown as Session,
    authorizePublicUrl: async (url: string) => new URL(url),
    fetch: vi.fn<HostWebNetwork['fetch']>(async input => ({ response: new Response('content'), url: input.url })),
  }
  const service = new HostWebService({ network: network as unknown as HostWebNetwork, report: fact => facts.push(fact) })
  const connect = () => {
    const { runtime, host } = peers()
    const client = new WebHostClient(runtime)
    const detach = registerWebHostRpc(host, service)
    return { client, detach, runtime, host }
  }
  return { service, network, facts, connect }
}

const signal = () => new AbortController().signal
const budget = (executionMs = 20_000, remaining = 120_000) => ({ operationId: randomUUID(), deadline: Date.now() + remaining, executionMs })
const renderResult = { html: '<html>finished</html>', url: 'https://example.com' }
afterEach(() => {
  rendering.mockReset()
  vi.useRealTimers()
})

describe('host resource ownership', () => {
  it('keeps HTTP capacity until native close, including after response body completion', async () => {
    const { service, network, connect } = fixture()
    const { client, detach } = connect()
    const closed = Promise.withResolvers<void>()
    network.fetch.mockImplementation(async (input, _signal, options) => {
      options.track?.(closed.promise)
      return { response: new Response('content'), url: input.url }
    })
    const first = Array.from({ length: 8 }, () => client.get('https://example.com', signal()))
    await Promise.all(first)
    expect(service.snapshot.network).toEqual({ active: 8, queued: 0 })
    const ninth = client.get('https://example.com', signal())
    await vi.waitFor(() => expect(service.snapshot.network.queued).toBe(1))
    expect(network.fetch.mock.calls).toHaveLength(8)
    closed.resolve()
    expect((await ninth).status).toBe(200)
    await vi.waitFor(() => expect(service.snapshot.network.active).toBe(0))
    detach()
    await client.dispose()
    await service.dispose()
  })

  it('retains cancelled render capacity across reconnection while HTTP remains usable', async () => {
    const { service, connect } = fixture()
    const old = connect()
    const closed = Promise.withResolvers<void>()
    let started = 0
    rendering.mockImplementation(async (_network, _url, signal, _authorize, track) => {
      started++
      if (started <= 2) {
        track(closed.promise)
        await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      }
      return renderResult
    })
    const cancelled = [old.client.render('https://example.com', signal()).catch(error => error), old.client.render('https://example.com', signal()).catch(error => error)]
    await vi.waitFor(() => expect(started).toBe(2))
    old.detach()
    await old.client.dispose()
    const next = connect()
    const rendered = next.client.render('https://example.com', signal())
    await vi.waitFor(() => expect(service.snapshot.render).toEqual({ active: 2, queued: 1 }))
    expect((await next.client.get('https://example.com', signal())).status).toBe(200)
    expect(started).toBe(2)
    closed.resolve()
    expect(await rendered).toMatchObject({ ok: true, ...renderResult })
    expect(started).toBe(3)
    await Promise.all(cancelled)
    next.detach()
    await next.client.dispose()
    await service.dispose()
  })

  it('revalidates settings after queue admission before creating a render', async () => {
    const { service, connect } = fixture()
    const { client, detach } = connect()
    const finish = Promise.withResolvers<void>()
    rendering.mockImplementation(async () => {
      await finish.promise
      return renderResult
    })
    const first = [client.render('https://example.com', signal()), client.render('https://example.com', signal())]
    await vi.waitFor(() => expect(rendering.mock.calls).toHaveLength(2))
    let enabled = true
    const context = new WebRequestContext(budget(), () => {
      if (!enabled)
        throw new WebError('WEB_PROVIDER_UNAVAILABLE')
    })
    const queued = webRequestContext.run(context, () => client.render('https://example.com', signal()))
    await vi.waitFor(() => expect(service.snapshot.render.queued).toBe(1))
    enabled = false
    finish.resolve()
    expect(await queued).toMatchObject({ ok: false, code: 'WEB_PROVIDER_UNAVAILABLE' })
    expect(rendering.mock.calls).toHaveLength(2)
    await Promise.all(first)
    detach()
    await client.dispose()
    await service.dispose()
  })

  it('separates queued deadline expiry from execution timeout and keeps execution budget after waiting', async () => {
    vi.useFakeTimers()
    const { service, connect } = fixture()
    const { client, detach } = connect()
    const finish = Promise.withResolvers<void>()
    let started = 0
    rendering.mockImplementation(async (_network, _url, signal) => {
      if (++started <= 2) {
        await finish.promise
        return renderResult
      }
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    })
    const first = [client.render('https://example.com', signal()), client.render('https://example.com', signal())]
    await vi.waitFor(() => expect(started).toBe(2))
    const expired = webRequestContext.run(new WebRequestContext(budget(1000, 500)), () => client.render('https://example.com', signal()))
    const queued = webRequestContext.run(new WebRequestContext(budget(1000, 5000)), () => client.render('https://example.com', signal()))
    await vi.advanceTimersByTimeAsync(600)
    expect(await expired).toEqual({ ok: false, code: 'WEB_QUEUE_TIMEOUT' })
    finish.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(started).toBe(3)
    await vi.advanceTimersByTimeAsync(999)
    expect(service.snapshot.render.active).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await queued).toEqual({ ok: false, code: 'WEB_TIMEOUT' })
    await Promise.all(first)
    detach()
    await client.dispose()
    await service.dispose()
  })

  it('returns execution timeout while retaining the lease until delayed cleanup completes', async () => {
    vi.useFakeTimers()
    const { service, connect } = fixture()
    const { client, detach } = connect()
    const closed = Promise.withResolvers<void>()
    rendering.mockImplementation(async (_network, _url, signal, _authorize, track) => {
      track(closed.promise)
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    })
    const result = webRequestContext.run(new WebRequestContext(budget(100)), () => client.render('https://example.com', signal()))
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toEqual({ ok: false, code: 'WEB_TIMEOUT' })
    expect(service.snapshot.render.active).toBe(1)
    closed.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(service.snapshot.render.active).toBe(0)
    detach()
    await client.dispose()
    await service.dispose()
  })

  it('settles queued and running callers on shutdown while draining actual resources', async () => {
    const { service, connect } = fixture()
    const { client, detach } = connect()
    const closed = Promise.withResolvers<void>()
    rendering.mockImplementation(async (_network, _url, signal, _authorize, track) => {
      track(closed.promise)
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    })
    const results = Array.from({ length: 3 }, () => client.render('https://example.com', signal()))
    await vi.waitFor(() => expect(service.snapshot.render).toEqual({ active: 2, queued: 1 }))
    const stopping = service.dispose()
    expect(await Promise.all(results)).toEqual(Array.from({ length: 3 }, () => ({ ok: false, code: 'WEB_CANCELLED' })))
    expect(service.snapshot.render).toEqual({ active: 2, queued: 0 })
    closed.resolve()
    await stopping
    expect(service.snapshot.render.active).toBe(0)
    detach()
    await client.dispose()
  })

  it('reports a stalled cleanup without releasing capacity and recovers only on actual closure', async () => {
    vi.useFakeTimers()
    const { service, connect, facts } = fixture()
    const { client, detach } = connect()
    const closed = Promise.withResolvers<void>()
    rendering.mockImplementation(async (_network, _url, _signal, _authorize, track, cleaning) => {
      track(closed.promise)
      cleaning()
      await closed.promise
      return renderResult
    })
    const result = webRequestContext.run(new WebRequestContext(budget(100)), () => client.render('https://example.com', signal()))
    await vi.advanceTimersByTimeAsync(100)
    expect(facts.at(-1)?.phase).toBe('cleaning')
    await vi.advanceTimersByTimeAsync(9900)
    expect(await result).toEqual({ ok: false, code: 'WEB_NETWORK_ERROR' })
    expect(service.snapshot.render.active).toBe(1)
    expect(facts.at(-1)).toMatchObject({ phase: 'cleanup-failed', durationMs: 10_000 })
    closed.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(service.snapshot.render.active).toBe(0)
    detach()
    await client.dispose()
    await service.dispose()
  })

  it('does not fabricate free capacity after cleanup fails', async () => {
    const { service, connect, facts } = fixture()
    const { client, detach } = connect()
    rendering.mockImplementation(async (_network, _url, _signal, _authorize, track) => {
      track(Promise.reject(new Error('cleanup failed')))
      return renderResult
    })
    await client.render('https://example.com', signal())
    expect(service.snapshot.render.active).toBe(1)
    expect(facts.at(-1)?.phase).toBe('cleanup-failed')
    expect(JSON.stringify(facts)).not.toMatch(/https|html|cleanup failed/)
    detach()
    await client.dispose()
    await expect(service.dispose()).rejects.toThrow('WEB_HOST_CLEANUP_FAILED')
  })
})
