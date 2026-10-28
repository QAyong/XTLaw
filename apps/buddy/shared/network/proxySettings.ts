import { z } from 'zod'

export const proxyModeSchema = z.enum(['system', 'direct', 'custom'])

export const proxyServerSchema = z.string().trim().max(2048).refine((value) => {
  if (!value)
    return true
  try {
    const url = new URL(value)
    return ['http:', 'https:', 'socks5:'].includes(url.protocol)
      && Boolean(url.hostname)
      && !url.username && !url.password
      && (url.pathname === '/' || url.pathname === '')
      && !url.search && !url.hash
  }
  catch {
    return false
  }
}, 'Invalid proxy server')

// Public GitHub acceleration mirrors, named by host. 'auto' tries them all in order, a host picks that one, 'off' goes to GitHub only; GitHub is always the last resort.
export const DOWNLOAD_MIRROR_HOSTS = ['ghfast.top', 'gh-proxy.com', 'gh.monlor.com'] as const
export const downloadMirrorModeSchema = z.enum(['auto', 'off', ...DOWNLOAD_MIRROR_HOSTS])

export const proxySettingsSchema = z.object({
  mode: proxyModeSchema,
  server: proxyServerSchema,
  downloadMirror: downloadMirrorModeSchema.default('auto'),
}).strict().refine(value => value.mode !== 'custom' || Boolean(value.server), 'Proxy server is required')

export type ProxySettings = z.infer<typeof proxySettingsSchema>
export type DownloadMirrorMode = z.infer<typeof downloadMirrorModeSchema>

export const DEFAULT_PROXY_SETTINGS: ProxySettings = { mode: 'system', server: '', downloadMirror: 'auto' }
export type ProxyConnectionSettings = Pick<ProxySettings, 'mode' | 'server'>
