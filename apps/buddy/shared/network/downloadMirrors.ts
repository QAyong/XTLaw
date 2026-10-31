import type { DownloadSettings } from './downloadSettings'
import { DEFAULT_DOWNLOAD_SETTINGS } from './downloadSettings'

const mirroredHosts = new Set(['github.com', 'raw.githubusercontent.com'])

export function downloadRoutes(url: string, settings: DownloadSettings = DEFAULT_DOWNLOAD_SETTINGS): string[] {
  const parsed = URL.parse(url)
  if (!settings.enabled || !parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password || !mirroredHosts.has(parsed.hostname))
    return [url]
  return [...new Set(settings.proxies.filter(proxy => proxy.enabled).map(proxy => `${proxy.url}${url}`)), url]
}
