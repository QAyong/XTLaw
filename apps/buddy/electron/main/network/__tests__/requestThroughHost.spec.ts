import type { Session } from 'electron'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HostWebNetwork } from '../HostWebNetwork'
import { requestThroughHost } from '../requestThroughHost'

const net = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('electron', () => ({ net }))

function transport(statusCode = 200) {
  let resumed = 0
  let aborted = false
  const incoming = Object.assign(new EventEmitter(), {
    statusCode,
    headers: { 'content-type': 'application/pdf' },
    pause() {},
    resume() {
      resumed++
      queueMicrotask(() => {
        incoming.emit('data', new TextEncoder().encode('file bytes'))
        incoming.emit('end')
      })
    },
  })
  const request = Object.assign(new EventEmitter(), {
    setHeader() {},
    write() {},
    end() { queueMicrotask(() => request.emit('response', incoming)) },
    abort() {
      aborted = true
    },
  })
  net.request.mockReturnValue(request)
  return {
    get resumed() { return resumed },
    get aborted() { return aborted },
  }
}

beforeEach(() => net.request.mockReset())

describe('host response body boundary', () => {
  it('does not start reading the native response before a consumer receives permission', async () => {
    const wire = transport()
    const response = await requestThroughHost({} as Session, { url: 'https://files.example/report', method: 'GET', headers: {} }, new AbortController().signal)
    await Promise.resolve()
    expect(wire.resumed).toBe(0)
    expect(await response.text()).toBe('file bytes')
    expect(wire.resumed).toBe(1)
  })

  it.each([204, 205, 304])('releases a bodyless %i response without requiring a consumer', async (status) => {
    const wire = transport(status)
    const response = await requestThroughHost({} as Session, { url: 'https://files.example/empty', method: 'GET', headers: {} }, new AbortController().signal)
    expect(response.status).toBe(status)
    expect(response.body).toBeNull()
    expect(await response.text()).toBe('')
    expect(wire.resumed).toBe(0)
    expect(wire.aborted).toBe(true)
  })

  it('releases a HEAD response without consuming its body', async () => {
    const wire = transport()
    const response = await requestThroughHost({} as Session, { url: 'https://files.example/report', method: 'HEAD', headers: {} }, new AbortController().signal)
    expect(response.body).toBeNull()
    expect(wire.resumed).toBe(0)
    expect(wire.aborted).toBe(true)
  })

  it('aborts a native download denied after headers without resuming its body', async () => {
    const wire = transport()
    const network = new HostWebNetwork({} as Session)
    await expect(network.fetch({ url: 'https://files.example/report', method: 'GET', headers: {}, scope: 'public' }, new AbortController().signal, {
      authorize: async (_url, operation) => {
        if (operation === 'download')
          throw new Error('download denied')
      },
    })).rejects.toThrow('download denied')
    expect(wire.resumed).toBe(0)
    expect(wire.aborted).toBe(true)
  })
})

describe('host request cookies', () => {
  async function credentialsFor(url: string) {
    const requests: Array<Record<string, unknown>> = []
    net.request.mockImplementation((options: Record<string, unknown>) => {
      requests.push(options)
      const request = Object.assign(new EventEmitter(), {
        setHeader: () => {},
        write: () => {},
        abort: () => {},
        end() {
          queueMicrotask(() => {
            const response = Object.assign(new EventEmitter(), { pause: () => {}, resume: () => {}, statusCode: 200, headers: { 'content-type': 'text/html', 'set-cookie': ['SUID=fixture'] } })
            request.emit('response', response)
            response.emit('end')
          })
        },
      })
      return request
    })
    const response = await requestThroughHost({} as Session, { url, method: 'GET', headers: {} }, new AbortController().signal)
    return { credentials: requests[0]!.credentials, response }
  }

  it('lets only sogou.com hosts use the isolated session cookie jar', async () => {
    for (const url of ['https://weixin.sogou.com/weixin?query=a', 'https://www.sogou.com/', 'https://sogou.com/'])
      expect((await credentialsFor(url)).credentials).toBe('include')
  })

  it('keeps every other public request stateless', async () => {
    for (const url of ['https://example.com/', 'https://www.bing.com/search?q=a', 'https://notsogou.com/', 'https://sogou.com.example.com/'])
      expect((await credentialsFor(url)).credentials).toBe('omit')
  })

  it('never exposes set-cookie to the service layer', async () => {
    const { response } = await credentialsFor('https://weixin.sogou.com/weixin?query=a')
    expect(response.headers.has('set-cookie')).toBe(false)
  })
})
