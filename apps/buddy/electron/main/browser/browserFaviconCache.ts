import { isBrowserFaviconDataUrl } from '../../../shared/browser/browserDesktopSchemas'

const MAX_ORIGINS_PER_PARTITION = 64

/** Page origin for an http(s) URL. File and blank pages are not cached: every file: URL shares one origin. */
export function browserFaviconOrigin(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  }
  catch {
    return null
  }
}

/**
 * In-memory favicon cache keyed by browser partition and page origin.
 * Incognito sessions use a separate partition, so their icons never satisfy a normal tab.
 */
export class BrowserFaviconCache {
  readonly #entries = new Map<string, Map<string, string>>()

  recall(partition: string, origin: string): string | null {
    const icons = this.#entries.get(partition)
    const icon = icons?.get(origin)
    if (!icon)
      return null
    icons.delete(origin)
    icons.set(origin, icon)
    return icon
  }

  remember(partition: string, origin: string, dataUrl: string): void {
    if (!origin || !isBrowserFaviconDataUrl(dataUrl))
      return
    let icons = this.#entries.get(partition)
    if (!icons) {
      icons = new Map()
      this.#entries.set(partition, icons)
    }
    icons.delete(origin)
    icons.set(origin, dataUrl)
    while (icons.size > MAX_ORIGINS_PER_PARTITION) {
      const oldest = icons.keys().next().value
      if (oldest === undefined)
        break
      icons.delete(oldest)
    }
  }
}
