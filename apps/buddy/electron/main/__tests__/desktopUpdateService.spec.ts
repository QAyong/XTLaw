import { describe, expect, it } from 'vitest'
import { checkForDesktopUpdate } from '../desktopUpdateService'

function release(version: string, fields = {}) {
  return { draft: false, prerelease: false, tag_name: `xtlaw-v${version}`, html_url: `https://github.com/QAyong/XTLaw/releases/tag/xtlaw-v${version}`, ...fields }
}

describe('checkForDesktopUpdate', () => {
  it('reports a newer stable XTLaw release without installing it', async () => {
    await expect(checkForDesktopUpdate({
      currentVersion: '0.1.0',
      fetchRelease: async () => new Response(JSON.stringify([
        release('9.0.0', { tag_name: 'web-v9.0.0' }),
        release('0.2.0'),
      ])),
    })).resolves.toEqual({
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      releaseUrl: 'https://github.com/QAyong/XTLaw/releases/tag/xtlaw-v0.2.0',
      releaseNotes: '',
      status: 'update_available',
    })
  })

  it('reports the current version only after a valid release response', async () => {
    await expect(checkForDesktopUpdate({
      currentVersion: '0.1.0',
      fetchRelease: async () => new Response(JSON.stringify([release('0.1.0')])),
    })).resolves.toMatchObject({ latestVersion: '0.1.0', status: 'up_to_date' })
  })

  it('ignores inherited upstream versions even if they are numerically higher', async () => {
    await expect(checkForDesktopUpdate({
      currentVersion: '0.1.0',
      fetchRelease: async () => new Response(JSON.stringify([
        release('0.9.4', { tag_name: 'v0.9.4', html_url: 'https://github.com/QAyong/XTLaw/releases/tag/v0.9.4' }),
        release('0.1.1'),
      ])),
    })).resolves.toMatchObject({ latestVersion: '0.1.1', status: 'update_available' })
  })

  it('rejects a feed containing only inherited legacy releases', async () => {
    await expect(checkForDesktopUpdate({
      currentVersion: '0.1.0',
      fetchRelease: async () => new Response(JSON.stringify([release('0.9.4', { tag_name: 'v0.9.4' })])),
    })).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
  })

  it('selects the highest trusted stable version and preserves the complete release notes', async () => {
    const result = await checkForDesktopUpdate({
      currentVersion: '1.2.0',
      fetchRelease: async () => new Response(JSON.stringify([
        release('1.9.0'),
        release('1.10.0', { body: 'x'.repeat(20_000) }),
        release('9.0.0', { html_url: 'https://example.invalid/download' }),
        release('8.0.0', { draft: true }),
        release('7.0.0', { prerelease: true }),
        release('6.0.0-beta'),
      ])),
    })
    expect(result).toMatchObject({ latestVersion: '1.10.0', status: 'update_available' })
    expect(result.releaseNotes).toBe('x'.repeat(20_000))
  })

  it('returns a stable failure for an oversized response or an aborted request', async () => {
    await expect(checkForDesktopUpdate({
      currentVersion: '1.0.0',
      fetchRelease: async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)),
    })).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
    await expect(checkForDesktopUpdate({
      currentVersion: '1.0.0',
      signal: AbortSignal.abort(),
      fetchRelease: async (_url, init) => {
        init?.signal?.throwIfAborted()
        return new Response('[]')
      },
    })).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
  })

  it('revalidates instead of trusting a cached response', async () => {
    const requests: { url: string, headers: unknown }[] = []
    await checkForDesktopUpdate({
      currentVersion: '0.1.0',
      fetchRelease: async (url, init) => {
        requests.push({ url, headers: init?.headers })
        return new Response(JSON.stringify([release('0.1.0')]))
      },
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers).toMatchObject({ 'cache-control': 'no-cache' })
  })

  it('follows a permanent redirect on the GitHub API origin', async () => {
    const urls: string[] = []
    const result = await checkForDesktopUpdate({
      currentVersion: '0.1.0',
      fetchRelease: async (url) => {
        urls.push(url)
        return urls.length === 1
          ? new Response(null, { status: 301, headers: { location: 'https://api.github.com/repositories/1389466826/releases?per_page=100' } })
          : new Response(JSON.stringify([release('0.2.0')]))
      },
    })
    expect(urls).toEqual([expect.stringContaining('/repos/QAyong/XTLaw/releases'), 'https://api.github.com/repositories/1389466826/releases?per_page=100'])
    expect(result).toMatchObject({ latestVersion: '0.2.0', status: 'update_available' })
  })

  it('refuses redirects that leave the API origin or never end', async () => {
    let calls = 0
    await expect(checkForDesktopUpdate({
      currentVersion: '0.1.0',
      fetchRelease: async () => {
        calls++
        return new Response(null, { status: 301, headers: { location: 'https://example.invalid/releases' } })
      },
    })).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
    expect(calls).toBe(1)

    calls = 0
    await expect(checkForDesktopUpdate({
      currentVersion: '0.1.0',
      fetchRelease: async () => {
        calls++
        return new Response(null, { status: 308, headers: { location: 'https://api.github.com/repositories/1/releases' } })
      },
    })).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
    expect(calls).toBe(3)
  })

  it('returns a stable failure for unavailable or invalid release data', async () => {
    await expect(checkForDesktopUpdate({
      currentVersion: '0.1.0',
      fetchRelease: async () => new Response('', { status: 503 }),
    })).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
    await expect(checkForDesktopUpdate({
      currentVersion: '0.1.0',
      fetchRelease: async () => new Response(JSON.stringify([release('0.1.0', { html_url: 'https://example.com/release', tag_name: 'next' })])),
    })).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
  })
})
