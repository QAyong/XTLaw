import type { Session } from 'electron'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

const requests: Array<Record<string, unknown>> = []

vi.mock('electron', () => ({
  net: {
    request: (options: Record<string, unknown>) => {
      requests.push(options)
      const request = Object.assign(new EventEmitter(), {
        setHeader: () => {},
        write: () => {},
        abort: () => {},
        end() {
          queueMicrotask(() => {
            const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: { 'content-type': 'text/html', 'set-cookie': ['SUID=fixture'] } })
            request.emit('response', response)
            response.emit('end')
          })
        },
      })
      return request
    },
  },
}))

describe('host request cookies', () => {
  async function credentialsFor(url: string) {
    const { requestThroughHost } = await import('../requestThroughHost')
    requests.length = 0
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
