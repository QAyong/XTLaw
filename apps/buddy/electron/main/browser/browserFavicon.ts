import { isIP } from 'node:net'

export const BROWSER_FAVICON_MAX_BYTES = 32 * 1024
const BROWSER_FAVICON_TIMEOUT_MS = 5_000
const BROWSER_FAVICON_MAX_REDIRECTS = 3
const FAVICON_MIME_TYPES = new Set(['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/jpeg', 'image/gif', 'image/webp'])

export type BrowserFaviconFetch = (url: string, init: { credentials: 'omit', redirect: 'manual', signal: AbortSignal }) => Promise<Response>

/**
 * The renderer CSP only allows data: images, so the main process downloads the favicon and inlines it.
 * Only public https hosts are fetched: the page chooses the URL, and it must not reach local or private services.
 */
export async function fetchBrowserFavicon(rawUrl: string, fetchImpl: BrowserFaviconFetch, signal?: AbortSignal): Promise<string | null> {
  const timeout = AbortSignal.timeout(BROWSER_FAVICON_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  try {
    let url = rawUrl
    for (let redirects = 0; redirects <= BROWSER_FAVICON_MAX_REDIRECTS; redirects += 1) {
      if (!isPublicHttpsUrl(url))
        return null
      const response = await fetchImpl(url, { credentials: 'omit', redirect: 'manual', signal: combined })
      const location = response.headers.get('location')
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url).toString()
        continue
      }
      return response.ok ? await readFaviconDataUrl(response) : null
    }
    return null
  }
  catch {
    return null
  }
}

async function readFaviconDataUrl(response: Response): Promise<string | null> {
  const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (!FAVICON_MIME_TYPES.has(mimeType) || declaredLength > BROWSER_FAVICON_MAX_BYTES || !response.body)
    return null
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done)
      break
    size += value.byteLength
    if (size > BROWSER_FAVICON_MAX_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return size > 0 ? `data:${mimeType};base64,${Buffer.concat(chunks).toString('base64')}` : null
}

function isPublicHttpsUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && isIP(host.replace(/^\[|\]$/g, '')) === 0
      && host.includes('.')
      && !['.local', '.localhost', '.internal', '.lan', '.home.arpa'].some(suffix => host.endsWith(suffix))
  }
  catch { return false }
}
