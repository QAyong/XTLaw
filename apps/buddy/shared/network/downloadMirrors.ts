import type { DownloadMirrorMode } from './proxySettings'
import { DOWNLOAD_MIRROR_HOSTS } from './proxySettings'

// Public GitHub acceleration prefixes. A mirror only moves bytes: callers must check size and sha256 taken from a direct GitHub response.
export const DOWNLOAD_MIRRORS = DOWNLOAD_MIRROR_HOSTS.map(host => `https://${host}/`)

const MIRRORED_HOSTS = new Set(['github.com', 'raw.githubusercontent.com'])

/** The URLs to try for a GitHub download, in order: the chosen mirror (all of them for 'auto') first, GitHub itself last. Anything else, or mode 'off', is fetched directly only. */
export function downloadRoutes(url: string, mode: DownloadMirrorMode): string[] {
  try {
    const parsed = new URL(url)
    if (mode !== 'off' && parsed.protocol === 'https:' && MIRRORED_HOSTS.has(parsed.hostname)) {
      const prefixes = mode === 'auto' ? DOWNLOAD_MIRRORS : [`https://${mode}/`]
      return [...prefixes.map(prefix => `${prefix}${url}`), url]
    }
  }
  catch {}
  return [url]
}
