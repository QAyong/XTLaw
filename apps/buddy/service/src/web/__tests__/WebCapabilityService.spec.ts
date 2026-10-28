import type { WebCapabilityOptions } from '../WebCapabilityService'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applicationDiagnosticSchema } from '../../../../shared/diagnostics/applicationDiagnostic'
import { DEFAULT_WEB_SETTINGS, WebError } from '../../../../shared/network/webProtocol'
import { BuddyDataPaths } from '../../storage/BuddyDataPaths'
import { observeWebDiagnostics } from '../observeWebDiagnostics'
import { WebCapabilityService } from '../WebCapabilityService'
import { WebContentCache } from '../WebContentCache'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'buddy-web-contract-'))
  directories.push(root)
  const settings = structuredClone(DEFAULT_WEB_SETTINGS)
  const order = ['native', 'bing', 'brave', 'tavily', 'duckduckgo', 'google', 'sogou-weixin']
  settings.search.sort((left, right) => order.indexOf(left.provider) - order.indexOf(right.provider))
  const requests: string[] = []
  const html = '<html><body><ol id="b_results"><li class="b_algo"><h2><a href="https://example.com/doc">Source</a></h2></li></ol></body></html>'
  const options: WebCapabilityOptions = {
    paths: new BuddyDataPaths(root),
    models: { getAuth: async () => undefined },
    settings: { get: () => settings, getTavilyKey: async () => null },
    host: {
      authorize: async () => {},
      get: async (url) => {
        requests.push(url)
        return { bytes: new TextEncoder().encode(html), url, status: 200, headers: new Headers({ 'content-type': 'text/html' }) }
      },
      providerFetch: async () => { throw new Error('Unexpected paid request') },
      render: async () => ({ ok: false, code: 'WEB_RENDER_REQUIRED' }),
    },
  }
  return { options, settings, requests, service: new WebCapabilityService(options) }
}

describe('web capability routing', () => {
  it('preserves network permission denial without falling back to another search provider or remote extraction', async () => {
    const { options, settings } = await fixture()
    settings.fetch.remote = true
    options.settings.getTavilyKey = async () => 'fixture-key'
    const denial = Object.assign(new Error('denied'), { toolCallBlockReason: 'NETWORK_PERMISSION_DENIED' })
    const targets: string[] = []
    options.host.get = async (url) => {
      targets.push(url)
      throw denial
    }
    const service = new WebCapabilityService(options)
    await expect(service.search({ query: 'query' })).rejects.toBe(denial)
    expect(targets).toHaveLength(1)
    await expect(service.fetch({ url: 'https://example.com/', conversationId: 'conversation' })).rejects.toBe(denial)
    expect(targets).toHaveLength(2)
    await service.dispose()
  })

  it('uses the next enabled source and does not dispatch a source disabled during fallback', async () => {
    const { options, settings, requests } = await fixture()
    settings.search = [
      { provider: 'bing', enabled: true },
      { provider: 'brave', enabled: true },
      { provider: 'native', enabled: false },
      { provider: 'tavily', enabled: false },
      { provider: 'duckduckgo', enabled: false },
      { provider: 'google', enabled: false },
    ]
    options.host.get = async (url) => {
      requests.push(url)
      settings.search.find(source => source.provider === 'brave')!.enabled = false
      throw new WebError('WEB_NETWORK_ERROR')
    }
    const result = await new WebCapabilityService(options).search({ query: 'query' })
    expect(result.ok).toBe(false)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('bing.com')
  })
  it('does not authorize remote extraction by enabling Tavily search', async () => {
    const { options, settings } = await fixture()
    settings.search = [
      { provider: 'native', enabled: false },
      { provider: 'bing', enabled: false },
      { provider: 'brave', enabled: false },
      { provider: 'tavily', enabled: true },
      { provider: 'duckduckgo', enabled: false },
      { provider: 'google', enabled: false },
    ]
    settings.fetch = { render: true, remote: false }
    options.settings.getTavilyKey = async () => 'fixture-key'
    const result = await new WebCapabilityService(options).fetch({ url: 'https://example.com/text', conversationId: 'conversation', provider: 'tavily' })
    expect(result).toMatchObject({ ok: false, code: 'WEB_PROVIDER_UNAVAILABLE', attempts: [] })
  })
  it('refuses an explicitly named disabled public provider and lists enabled alternatives', async () => {
    const { service, settings, requests } = await fixture()
    settings.search.find(source => source.provider === 'brave')!.enabled = false
    expect(await service.search({ query: 'query', provider: 'brave' })).toMatchObject({ ok: false, code: 'WEB_PROVIDER_UNAVAILABLE', attempts: [], availableProviders: ['bing', 'duckduckgo', 'google', 'sogou-weixin'] })
    expect(requests).toEqual([])
  })
  describe('sogou-weixin', () => {
    const search = '<html><body><div class="news-box"></div><div class="b404-box" id="noresult_part1_container"></div></body></html>'
    const withSogouOnly = async () => {
      const context = await fixture()
      context.settings.search = [
        { provider: 'sogou-weixin', enabled: true },
        { provider: 'native', enabled: false },
        { provider: 'bing', enabled: false },
        { provider: 'brave', enabled: false },
        { provider: 'tavily', enabled: false },
        { provider: 'duckduckgo', enabled: false },
        { provider: 'google', enabled: false },
      ]
      return context
    }

    it('is never tried by auto, even when it is the only enabled source and sorted first', async () => {
      const { service, settings, requests } = await fixture()
      settings.search = [{ provider: 'sogou-weixin', enabled: true }, ...settings.search.filter(source => source.provider !== 'sogou-weixin')]
      const result = await service.search({ query: 'query' })
      expect(result).toMatchObject({ ok: true, provider: 'bing' })
      expect(requests.every(url => !url.includes('sogou.com'))).toBe(true)
      expect(result.availableProviders).toContain('sogou-weixin')

      const only = await withSogouOnly()
      expect(await only.service.search({ query: 'query' })).toMatchObject({ ok: false, code: 'WEB_PROVIDER_UNAVAILABLE', attempts: [], availableProviders: ['sogou-weixin'] })
      expect(await only.service.search({ query: 'query', provider: 'auto' })).toMatchObject({ ok: false, code: 'WEB_PROVIDER_UNAVAILABLE' })
      expect(only.requests).toEqual([])
    })

    it('is used when requested explicitly and reports an empty result as a success', async () => {
      const { options, requests } = await withSogouOnly()
      options.host.get = async (url) => {
        requests.push(url)
        return { bytes: new TextEncoder().encode(search), url, status: 200, headers: new Headers({ 'content-type': 'text/html' }) }
      }
      const result = await new WebCapabilityService(options).search({ query: '尸检', provider: 'sogou-weixin' })
      expect(result).toMatchObject({ ok: true, provider: 'sogou-weixin', sources: [], attempts: [{ provider: 'sogou-weixin', code: null }] })
      expect(requests).toEqual(['https://weixin.sogou.com/weixin?type=2&ie=utf8&query=%E5%B0%B8%E6%A3%80'])
    })

    it('refuses an explicit request while disabled and does not fall back', async () => {
      const { service, settings, requests } = await fixture()
      settings.search.find(source => source.provider === 'sogou-weixin')!.enabled = false
      const result = await service.search({ query: 'query', provider: 'sogou-weixin' })
      expect(result).toMatchObject({ ok: false, code: 'WEB_PROVIDER_UNAVAILABLE', attempts: [] })
      expect(result.availableProviders).not.toContain('sogou-weixin')
      expect(requests).toEqual([])
    })

    it('does not fall back to another source after a challenge', async () => {
      const { options, requests } = await withSogouOnly()
      options.host.get = async (url) => {
        requests.push(url)
        return { bytes: new TextEncoder().encode('<span id="seccoderight"></span>'), url, status: 200, headers: new Headers({ 'content-type': 'text/html' }) }
      }
      const result = await new WebCapabilityService(options).search({ query: 'query', provider: 'sogou-weixin' })
      expect(result).toMatchObject({ ok: false, code: 'WEB_CHALLENGE', provider: 'sogou-weixin', attempts: [{ provider: 'sogou-weixin', code: 'WEB_CHALLENGE' }] })
      expect(requests).toHaveLength(1)
    })
  })

  it('reports unavailable native authentication without inventing a site attempt', async () => {
    const { service } = await fixture()
    const result = await service.search({ query: 'query', provider: 'native', model: { api: 'openai-responses', provider: 'fixture', id: 'fixture', baseUrl: 'https://example.com' } as never })
    expect(result).toMatchObject({ ok: false, code: 'WEB_PROVIDER_UNAVAILABLE', attempts: [] })
    await service.dispose()
  })

  it('does not send a native request if disabled while authentication is resolving', async () => {
    const { options, settings } = await fixture()
    const sent: string[] = []
    options.models.getAuth = async () => {
      settings.search.find(source => source.provider === 'native')!.enabled = false
      return { auth: { apiKey: 'fixture-only-key' } }
    }
    options.host.providerFetch = async (url) => {
      sent.push(url)
      return Response.json({})
    }
    const result = await new WebCapabilityService(options).search({ query: 'query', model: { api: 'openai-responses', provider: 'fixture', id: 'fixture', baseUrl: 'https://example.com' } as never })
    expect(result).toMatchObject({ ok: true, provider: 'bing' })
    expect(sent).toEqual([])
    expect(result.availableProviders).not.toContain('fixture-native')
  })
  it('uses remote fallback independently of Tavily search, but always tries local first', async () => {
    const { options, settings } = await fixture()
    settings.fetch.remote = true
    options.settings.getTavilyKey = async () => 'fixture-only-key'
    options.host.get = async () => {
      throw new WebError('WEB_NETWORK_ERROR')
    }
    options.host.providerFetch = async () => Response.json({ results: [{ url: 'https://example.com/text', raw_content: 'Remote source text' }] })
    const result = await new WebCapabilityService(options).fetch({ url: 'https://example.com/text', conversationId: 'conversation' })
    expect(result).toMatchObject({ ok: true, provider: 'tavily', attempts: [{ provider: 'local', code: 'WEB_NETWORK_ERROR' }, { provider: 'tavily', code: null }] })
    expect(settings.search.find(source => source.provider === 'tavily')!.enabled).toBe(false)
  })
  it('does not send a denied page to remote extraction', async () => {
    const { options, settings } = await fixture()
    settings.fetch.remote = true
    options.settings.getTavilyKey = async () => 'fixture-key'
    options.host.get = async () => {
      throw new WebError('WEB_ACCESS_DENIED')
    }
    const result = await new WebCapabilityService(options).fetch({ url: 'https://example.com', conversationId: 'conversation' })
    expect(result).toMatchObject({ ok: false, code: 'WEB_ACCESS_DENIED', attempts: [{ provider: 'local' }] })
    expect(result.attempts).toHaveLength(1)
  })
  it('bounds concurrent cache retention without crossing conversation boundaries', async () => {
    const { options } = await fixture()
    const cache = new WebContentCache(options.paths)
    const { path: other } = await cache.write('other-conversation', 'Other content')
    if (process.platform !== 'win32')
      expect((await stat(other)).mode & 0o777).toBe(0o600)
    await Promise.all(Array.from({ length: 35 }, (_, index) => cache.write('conversation', `Content ${index}`)))
    expect(await readdir(join(options.paths.conversationDirectory('conversation'), 'web-cache'))).toHaveLength(32)
    expect(await readFile(other, 'utf8')).toBe('Other content')
  })
  it('keeps publication independent of failed observers and projects only bounded diagnostic fields', async () => {
    const { options } = await fixture()
    const content = 'private fetched content '.repeat(2000)
    options.host.get = async url => ({ bytes: new TextEncoder().encode(content), headers: new Headers({ 'content-type': 'text/plain' }), status: 200, url })
    const service = new WebCapabilityService(options)
    const diagnostics: unknown[] = []
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    service.onDidChange(() => {
      throw new Error('observer failed')
    })
    observeWebDiagnostics(service, diagnostic => diagnostics.push(applicationDiagnosticSchema.parse(diagnostic)))
    try {
      const result = await service.fetch({ url: 'https://example.com/private-resource', conversationId: 'conversation' })
      expect(result.ok).toBe(true)
      if (!result.ok)
        throw new Error('expected cache publication')
      expect(await readFile(result.contentPath!, 'utf8')).toContain(content)
      expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'web.fetch.cache_published' }), expect.objectContaining({ event: 'web.fetch.settled_completed' })]))
      expect(JSON.stringify(diagnostics)).not.toMatch(/private|https|contentPath/)
      expect(service.snapshot.active).toEqual([])
      await service.dispose()
    }
    finally { error.mockRestore() }
  })

  it('does not retry remote extraction when local cache persistence fails', async () => {
    const { options, settings } = await fixture()
    settings.fetch.remote = true
    options.settings.getTavilyKey = async () => 'fixture-key'
    const directory = options.paths.conversationDirectory('conversation')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'web-cache'), 'Occupied by a file')
    options.host.get = async url => ({ bytes: new TextEncoder().encode('Content '.repeat(8000)), headers: new Headers({ 'content-type': 'text/plain' }), status: 200, url })
    const result = await new WebCapabilityService(options).fetch({ url: 'https://example.com/text', conversationId: 'conversation' })
    expect(result).toMatchObject({ ok: false, code: 'WEB_CACHE_FAILED', attempts: [{ provider: 'local' }] })
    expect(result.attempts).toHaveLength(1)
  })
  it('cancellation does not fall back to another backend', async () => {
    const { service, requests } = await fixture()
    const controller = new AbortController()
    controller.abort()
    expect(await service.search({ query: 'query', signal: controller.signal })).toMatchObject({ ok: false, code: 'WEB_CANCELLED', attempts: [] })
    expect(requests).toEqual([])
  })

  it('falls back after a DuckDuckGo challenge only in auto mode', async () => {
    const { options, settings } = await fixture()
    settings.search = [{ provider: 'duckduckgo', enabled: true }, ...settings.search.filter(source => source.provider !== 'duckduckgo')]
    const get = options.host.get
    options.host.get = async url => new URL(url).hostname === 'html.duckduckgo.com'
      ? { url, status: 202, headers: new Headers({ 'content-type': 'text/html' }), bytes: new TextEncoder().encode('<html><body><form id="challenge-form"></form></body></html>') }
      : get(url, new AbortController().signal)
    const service = new WebCapabilityService(options)
    const automatic = await service.search({ query: 'query' })
    expect(automatic).toMatchObject({ ok: true, provider: 'bing', attempts: [{ provider: 'duckduckgo', code: 'WEB_CHALLENGE' }, { provider: 'bing', code: null }] })
    expect(automatic.attempts).toHaveLength(2)
    const explicit = await service.search({ query: 'query', provider: 'duckduckgo' })
    expect(explicit).toMatchObject({ ok: false, code: 'WEB_CHALLENGE', provider: 'duckduckgo', attempts: [{ provider: 'duckduckgo', code: 'WEB_CHALLENGE' }] })
    expect(explicit.attempts).toHaveLength(1)
  })
})

describe('web operation admission', () => {
  it('bounds accepted operations and removes them after completion', async () => {
    const { options } = await fixture()
    const finish = Promise.withResolvers<void>()
    options.host.render = async () => {
      await finish.promise
      return { ok: false, code: 'WEB_CANCELLED' }
    }
    options.host.get = async url => ({ url, status: 200, headers: new Headers({ 'content-type': 'text/html' }), bytes: new TextEncoder().encode('<html><body><div id="root"></div><script src="app.js"></script></body></html>') })
    const service = new WebCapabilityService(options)
    const pending = Array.from({ length: 64 }, () => service.fetch({ url: 'https://example.com', conversationId: 'conversation' }))
    expect(await service.search({ query: 'overflow' })).toMatchObject({ ok: false, code: 'WEB_BUSY', attempts: [] })
    finish.resolve()
    await Promise.all(pending)
    expect(service.snapshot.active).toEqual([])
    await service.dispose()
  })

  it('lets a public search complete while four fetch operations wait for rendering', async () => {
    const { options } = await fixture()
    const originalGet = options.host.get
    const finish = Promise.withResolvers<void>()
    let renders = 0
    options.host.get = (url, signal, limit) => url.includes('bing.com')
      ? originalGet(url, signal, limit)
      : Promise.reject(new WebError('WEB_RENDER_REQUIRED'))
    options.host.render = async () => {
      renders++
      await finish.promise
      return { ok: false, code: 'WEB_CANCELLED' }
    }
    const service = new WebCapabilityService(options)
    const pending = Array.from({ length: 4 }, () => service.fetch({ url: 'https://example.com', conversationId: 'conversation' }))
    try {
      await vi.waitFor(() => expect(renders).toBe(4))
      expect(await service.search({ query: 'independent search', provider: 'bing' })).toMatchObject({ ok: true, provider: 'bing' })
    }
    finally {
      finish.resolve()
      await Promise.all(pending)
      await service.dispose()
    }
  })

  it.each(['WEB_BUSY', 'WEB_QUEUE_TIMEOUT'] as const)('does not turn %s into a site failure or a paid fallback', async (code) => {
    const { options, settings } = await fixture()
    settings.fetch.remote = true
    options.settings.getTavilyKey = async () => 'fixture-only-key'
    options.host.get = async () => {
      throw new WebError(code)
    }
    options.host.providerFetch = async () => {
      throw new Error('Paid fallback must not start')
    }
    const service = new WebCapabilityService(options)
    expect(await service.fetch({ url: 'https://example.com', conversationId: 'conversation' })).toMatchObject({ ok: false, code, attempts: [] })
    expect(await service.search({ query: 'example' })).toMatchObject({ ok: false, code, attempts: [] })
    await service.dispose()
  })
})
