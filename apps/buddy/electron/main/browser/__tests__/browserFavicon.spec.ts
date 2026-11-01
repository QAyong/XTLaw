import { describe, expect, it, vi } from 'vitest'
import { BROWSER_FAVICON_MAX_BYTES, fetchBrowserFavicon } from '../browserFavicon'

function image(body: ConstructorParameters<typeof Response>[0] = new Uint8Array([1, 2, 3]), headers: Record<string, string> = { 'content-type': 'image/png' }, status = 200) {
  return new Response(body, { status, headers })
}

describe('fetchBrowserFavicon', () => {
  it('returns a data URL for a small public https image', async () => {
    const fetchImpl = vi.fn(async () => image())
    await expect(fetchBrowserFavicon('https://example.com/icon.png', fetchImpl)).resolves.toBe('data:image/png;base64,AQID')
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/icon.png', expect.objectContaining({ credentials: 'omit', redirect: 'manual' }))
  })

  it.each([
    'http://example.com/icon.png',
    'https://localhost/icon.png',
    'https://intranet/icon.png',
    'https://printer.local/icon.png',
    'https://127.0.0.1/icon.png',
    'https://192.168.1.2/icon.png',
    'https://[::1]/icon.png',
    'https://user:pass@example.com/icon.png',
  ])('does not request %s', async (url) => {
    const fetchImpl = vi.fn(async () => image())
    await expect(fetchBrowserFavicon(url, fetchImpl)).resolves.toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('follows redirects only to public https URLs', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/real.png' } }))
      .mockResolvedValueOnce(image())
    await expect(fetchBrowserFavicon('https://example.com/icon.png', fetchImpl)).resolves.toMatch(/^data:image\/png;base64,/)
    expect(fetchImpl).toHaveBeenLastCalledWith('https://example.com/real.png', expect.anything())

    const blocked = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/admin' } }))
    await expect(fetchBrowserFavicon('https://example.com/icon.png', blocked)).resolves.toBeNull()
    expect(blocked).toHaveBeenCalledTimes(1)
  })

  it('rejects redirect loops, non-images, oversized bodies and failures', async () => {
    const loop = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://example.com/again' } }))
    await expect(fetchBrowserFavicon('https://example.com/icon.png', loop)).resolves.toBeNull()
    await expect(fetchBrowserFavicon('https://example.com/a', async () => image('<svg/>', { 'content-type': 'image/svg+xml' }))).resolves.toBeNull()
    await expect(fetchBrowserFavicon('https://example.com/a', async () => image('<html>', { 'content-type': 'text/html' }))).resolves.toBeNull()
    await expect(fetchBrowserFavicon('https://example.com/a', async () => image(new Uint8Array(BROWSER_FAVICON_MAX_BYTES + 1)))).resolves.toBeNull()
    await expect(fetchBrowserFavicon('https://example.com/a', async () => image(undefined, { 'content-type': 'image/png' }, 404))).resolves.toBeNull()
    await expect(fetchBrowserFavicon('https://example.com/a', async () => { throw new Error('offline') })).resolves.toBeNull()
  })
})
