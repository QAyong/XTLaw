import { expect, it } from 'vitest'
import { DOWNLOAD_MIRRORS, downloadRoutes } from '../downloadMirrors'

const release = 'https://github.com/useLexora/Lexora/releases/download/v1.0.0/app.exe'

it('puts mirrors before GitHub for GitHub downloads', () => {
  expect(downloadRoutes(release, 'auto')).toEqual([...DOWNLOAD_MIRRORS.map(prefix => `${prefix}${release}`), release])
})

it('tries only the chosen mirror, then GitHub', () => {
  expect(downloadRoutes(release, 'gh-proxy.com')).toEqual([`https://gh-proxy.com/${release}`, release])
})

it('goes to GitHub only when mirrors are off', () => {
  expect(downloadRoutes(release, 'off')).toEqual([release])
})

it('never sends other hosts or non-https URLs through a mirror', () => {
  expect(downloadRoutes('https://example.com/a.zip', 'auto')).toEqual(['https://example.com/a.zip'])
  expect(downloadRoutes('http://github.com/a', 'auto')).toEqual(['http://github.com/a'])
  expect(downloadRoutes('not a url', 'auto')).toEqual(['not a url'])
})
