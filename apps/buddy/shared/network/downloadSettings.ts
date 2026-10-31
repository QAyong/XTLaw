import { z } from 'zod'

export const downloadProxyUrlSchema = z.string().trim().max(2048).url().refine((value) => {
  const url = URL.parse(value)
  return !!url && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
}, 'Invalid download proxy URL').transform(value => `${new URL(value).href.replace(/\/+$/, '')}/`)

export const downloadProxySchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(80),
  url: downloadProxyUrlSchema,
  enabled: z.boolean(),
}).strict()

const defaultProxies = ['ghfast.top', 'gh-proxy.com', 'gh.monlor.com'].map(host => ({
  id: host,
  name: host,
  url: `https://${host}/`,
  enabled: true,
}))

export const downloadSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  proxies: z.array(downloadProxySchema).max(20).refine(proxies => new Set(proxies.map(proxy => proxy.id)).size === proxies.length, 'Duplicate download proxy ID').default(defaultProxies),
}).strict()

export type DownloadProxy = z.infer<typeof downloadProxySchema>
export type DownloadSettings = z.infer<typeof downloadSettingsSchema>
export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = downloadSettingsSchema.parse({})
