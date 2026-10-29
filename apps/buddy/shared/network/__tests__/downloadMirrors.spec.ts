import { expect, it } from 'vitest'
import { downloadRoutes } from '../downloadMirrors'
import { DEFAULT_DOWNLOAD_SETTINGS, downloadSettingsSchema } from '../downloadSettings'

const release = 'https://github.com/useLexora/Lexora/releases/download/v1.0.0/app.exe'

it('respects the ordered custom list and individual switches, then falls back to the original URL', () => {
  const settings = downloadSettingsSchema.parse({ enabled: true, proxies: [
    { id: 'second', name: 'Second', url: 'https://second.example/cache', enabled: true },
    { id: 'disabled', name: 'Disabled', url: 'https://disabled.example', enabled: false },
    { id: 'first', name: 'First', url: 'https://first.example', enabled: true },
  ] })
  expect(downloadRoutes(release, settings)).toEqual([`https://second.example/cache/${release}`, `https://first.example/${release}`, release])
  expect(downloadRoutes(release, { ...settings, enabled: false })).toEqual([release])
  expect(downloadRoutes(release, { ...settings, proxies: [] })).toEqual([release])
})

it('deduplicates equivalent routes and keeps unrelated or credential-bearing URLs off proxies', () => {
  const proxies = DEFAULT_DOWNLOAD_SETTINGS.proxies
  expect(downloadRoutes(release, { enabled: true, proxies: [proxies[0]!, { ...proxies[0]!, id: 'duplicate' }] })).toEqual([`${proxies[0]!.url}${release}`, release])
  for (const url of ['https://example.com/a.zip', 'http://github.com/a', 'https://user:secret@github.com/a', 'not a url'])
    expect(downloadRoutes(url)).toEqual([url])
})

it('rejects invalid proxy endpoints and duplicate identities without silently restoring deleted defaults', () => {
  const proxy = DEFAULT_DOWNLOAD_SETTINGS.proxies[0]!
  for (const url of ['http://mirror.example', 'https://user:secret@mirror.example', 'https://mirror.example/?token=secret', 'https://mirror.example/#fragment', 'invalid'])
    expect(downloadSettingsSchema.safeParse({ proxies: [{ ...proxy, url }] }).success).toBe(false)
  expect(downloadSettingsSchema.safeParse({ proxies: [proxy, proxy] }).success).toBe(false)
  expect(downloadSettingsSchema.parse({ proxies: [] }).proxies).toEqual([])
})
