import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, expect, it } from 'vitest'
import { EXTENSION_CATALOG_URL } from '../../../shared/extensions/extensionCatalog'
import { EXTENSION_API_VERSION } from '../../../shared/extensions/extensionManifest'
import { ExtensionCatalogService } from '../ExtensionCatalogService'
import { sha256 } from '../extensionFiles'
import { createStore, manifest } from './fixtures'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})
async function fixture() {
  const { root, store } = await createStore()
  const value = manifest()
  const bytes = zipSync({ 'extension.json': strToU8(JSON.stringify(value)), 'extension.js': strToU8('export function activate() {}'), 'view.js': strToU8('export function render() {}') })
  const artifact = { url: 'https://example.com/plugin.lexora-extension', sha256: sha256(bytes), size: bytes.length }
  const catalog = { schemaVersion: 1, plugins: [{ manifest: value, repository: 'https://example.com/plugins', artifact }] }
  let offline = false
  let tampered = false
  let requests = 0
  const service = new ExtensionCatalogService(store.root, store.appVersion, async (url) => {
    requests++
    if (offline)
      throw new Error('Offline')
    if (url === EXTENSION_CATALOG_URL)
      return Response.json(catalog)
    const content = bytes.slice()
    if (tampered)
      content[content.length - 1] ^= 1
    return new Response(content)
  })
  cleanup.push(async () => {
    service.dispose()
    await rm(root, { recursive: true, force: true })
  })
  return {
    service,
    store,
    value,
    catalog,
    bytes,
    offline: () => { offline = true },
    tamper: () => { tampered = true },
    requests: () => requests,
  }
}

it('rejects altered downloads and missing versions', async () => {
  const { service, value, tamper } = await fixture()
  await service.list()
  tamper()
  await expect(service.download(value.id, value.version, new AbortController().signal)).rejects.toThrow('EXTENSION_DOWNLOAD_CHECKSUM_FAILED')
  await expect(service.download(value.id, '9.0.0', new AbortController().signal)).rejects.toThrow('EXTENSION_CATALOG_ENTRY_UNAVAILABLE')
})

it('shows only the latest release and refuses older marketplace versions', async () => {
  const { service, catalog, value } = await fixture()
  catalog.plugins.push({ ...catalog.plugins[0]!, manifest: manifest({ version: '2.0.0', engines: { lexora: '>=9' } }) })
  expect((await service.list()).plugins).toMatchObject([{ manifest: { version: '2.0.0' }, compatible: false, incompatibility: { reason: 'app-too-old', requiredVersion: '>=9' } }])
  await expect(service.download(value.id, value.version, new AbortController().signal)).rejects.toThrow('EXTENSION_CATALOG_ENTRY_UNAVAILABLE')
  await expect(service.download(value.id, '2.0.0', new AbortController().signal)).rejects.toMatchObject({ review: { incompatibility: { reason: 'app-too-old' } } })
})

it('isolates future APIs and invalid entries while preserving exact supported downloads and offline metadata', async () => {
  const { service, catalog, value, bytes, offline } = await fixture()
  const raw = catalog.plugins as unknown[]
  raw.push({ ...catalog.plugins[0], manifest: { ...value, id: 'tests.future', apiVersion: EXTENSION_API_VERSION + 1, engines: { lexora: '*' }, contributes: { futureCapability: {} } } })
  raw.push({ ...catalog.plugins[0], manifest: { ...value, id: 'tests.invalid', engines: { lexora: '*' }, futureField: true } })
  raw.push({ broken: true })
  const first = await service.list()
  expect(first).toMatchObject({ stale: false, error: null, invalidEntries: 1 })
  expect(first.plugins.find(item => item.manifest.id === 'tests.future')).toMatchObject({ compatible: false, incompatibility: { reason: 'api-unsupported' } })
  expect(first.plugins.find(item => item.manifest.id === 'tests.invalid')).toMatchObject({ compatible: false, incompatibility: { reason: 'manifest-invalid' } })
  const download = await service.download(value.id, value.version, new AbortController().signal)
  expect(download.entry.manifest.id).toBe(value.id)
  expect(new Uint8Array(download.bytes)).toEqual(bytes)
  await expect(service.download('tests.future', value.version, new AbortController().signal)).rejects.toMatchObject({ review: { incompatibility: { reason: 'api-unsupported' } } })
  await expect(service.download('tests.invalid', value.version, new AbortController().signal)).rejects.toThrow('EXTENSION_MANIFEST_INVALID')
  offline()
  const cached = await service.list(true)
  expect(cached).toMatchObject({ stale: true, error: 'EXTENSION_CATALOG_UNAVAILABLE' })
  expect(cached.plugins).toEqual(first.plugins)
})

it('removes the water reminder from refreshed and persisted catalogs without removing other plugins', async () => {
  const { service, store, catalog, value, offline } = await fixture()
  catalog.plugins.push({ ...catalog.plugins[0]!, manifest: manifest({ id: 'lexora.water-reminder' }) })
  expect((await service.list()).plugins.map(entry => entry.manifest.id)).toEqual([value.id])
  const saved = JSON.parse(await readFile(join(store.root, 'catalog.json'), 'utf8'))
  expect(saved.catalog.plugins.map((entry: { manifest: { id: string } }) => entry.manifest.id)).toEqual([value.id])
  offline()
  expect((await service.list(true)).plugins.map(entry => entry.manifest.id)).toEqual([value.id])
})

it('filters an existing water reminder cache before displaying it', async () => {
  const { service, store, catalog, value, offline, requests } = await fixture()
  catalog.plugins.push({ ...catalog.plugins[0]!, manifest: manifest({ id: 'lexora.water-reminder' }) })
  await writeFile(join(store.root, 'catalog.json'), JSON.stringify({ cachedAt: new Date().toISOString(), catalog }))
  offline()
  expect((await service.list()).plugins.map(entry => entry.manifest.id)).toEqual([value.id])
  expect(requests()).toBe(0)
})

it('rejects direct catalog downloads of the water reminder without making network requests', async () => {
  const { service, value, requests } = await fixture()
  await expect(service.download('lexora.water-reminder', value.version, new AbortController().signal)).rejects.toThrow('EXTENSION_CATALOG_ENTRY_UNAVAILABLE')
  expect(requests()).toBe(0)
})
