import type { ExtensionCatalogEntry } from '../../../shared/extensions/extensionCatalog'
import type { ExtensionServicePorts } from '../ExtensionService'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { afterEach, expect, it, vi } from 'vitest'
import buddyVersion from '../../../buddy.version.json'
import { BUNDLED_EXTENSION_CATALOG_URL } from '../../../shared/extensions/extensionCatalog'
import { BundledExtensionCatalog, preinstallBundledExtensions } from '../BundledExtensionCatalog'
import { ExtensionCatalogService } from '../ExtensionCatalogService'
import { sha256 } from '../extensionFiles'
import { ExtensionPackageStore } from '../ExtensionPackageStore'
import { ExtensionService } from '../ExtensionService'
import { createStore, manifest, reviewPackage } from './fixtures'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action()
})
async function fixture() {
  const { root, store } = await createStore()
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const value = manifest({ id: 'tests.office', name: 'Office DOCX' })
  const bytes = zipSync({ 'extension.json': strToU8(JSON.stringify(value)), 'extension.js': strToU8('export function activate() {}'), 'view.js': strToU8('export function render() {}') })
  const entry: ExtensionCatalogEntry = { manifest: value, repository: 'https://github.com/QAyong/XTLaw', artifact: { kind: 'bundled', file: 'office.lexora-extension', sha256: sha256(bytes), size: bytes.length } }
  const directory = join(root, 'bundled')
  await mkdir(directory)
  await writeFile(join(directory, 'catalog.json'), JSON.stringify({ schemaVersion: 1, plugins: [entry] }))
  await writeFile(join(directory, 'office.lexora-extension'), bytes)
  const provider = new BundledExtensionCatalog(directory)
  const get = vi.fn(async () => {
    throw new Error('Offline')
  })
  const ports: ExtensionServicePorts = {
    bundled: provider,
    catalogUrl: null,
    get,
    createHost: () => ({ call: async () => null, dispose: async () => {}, devtools: () => {} }),
    createView: () => ({ token: 'fixture', url: 'lexora-extension://fixture', dispose: () => {} }),
    workbench: async event => event.requestId,
    readText: async () => '',
  }
  function service(target = store) {
    const result = new ExtensionService(target, ports)
    cleanup.push(() => result.dispose())
    return result
  }
  return { root, store, value, bytes, entry, directory, provider, get, ports, service }
}

it('preinstalls a real package before listing and shows its marketplace card without network', async () => {
  const { service, store, value, get } = await fixture()
  const app = service()
  expect(await app.list()).toMatchObject([{ enabled: true, compatible: true, manifest: { id: value.id }, source: { catalog: BUNDLED_EXTENSION_CATALOG_URL } }])
  expect(new Uint8Array(await store.asset(store.installed[value.id]!.current, 'view.js'))).toEqual(strToU8('export function render() {}'))
  expect(await app.catalog.list()).toMatchObject({ error: null, stale: false, plugins: [{ manifest: { id: value.id }, artifact: { kind: 'bundled' } }] })
  await app.catalog.list(true)
  expect(get).not.toHaveBeenCalled()
})

it('does not re-enable, replace or downgrade an existing installation or pending update', async () => {
  const { store, provider, value, root } = await fixture()
  await store.install((await reviewPackage(root, store, value)).token)
  await store.install((await reviewPackage(root, store, manifest({ id: value.id, version: '2.0.0' }))).token)
  await store.enable(value.id, false)
  await store.saveData(value.id, { retained: true }, 1)
  const before = structuredClone(store.installed[value.id])
  const read = vi.spyOn(provider, 'read')
  await preinstallBundledExtensions(store, provider)
  expect(store.installed[value.id]).toEqual(before)
  expect(await store.data(value.id)).toEqual({ version: 1, value: { retained: true } })
  expect(read).not.toHaveBeenCalled()
})

it('preserves uninstall across restart and allows reinstall from the bundled marketplace', async () => {
  const { service, store, value } = await fixture()
  const app = service()
  await app.initialize()
  await app.uninstall(value.id, false)
  await app.dispose()
  const restarted = service(new ExtensionPackageStore(store.root, store.appVersion))
  expect(await restarted.list()).toEqual([])
  expect((await restarted.catalog.list()).plugins[0]?.manifest.id).toBe(value.id)
  const review = await restarted.reviewCatalog(value.id, value.version)
  await restarted.install(review.token)
  expect(await restarted.list()).toMatchObject([{ enabled: true, manifest: { id: value.id } }])
})

it('keeps disabled state across restart and does not install twice', async () => {
  const { service, store, value, provider } = await fixture()
  const app = service()
  await app.initialize()
  await app.enable(value.id, false)
  await app.dispose()
  const read = vi.spyOn(provider, 'read')
  const restarted = service(new ExtensionPackageStore(store.root, store.appVersion))
  expect(await restarted.list()).toMatchObject([{ enabled: false, manifest: { id: value.id } }])
  expect(read).not.toHaveBeenCalled()
})

it('rejects modified archives before marking the plugin installed', async () => {
  const { store, provider, directory, bytes, value } = await fixture()
  const changed = bytes.slice()
  changed[changed.length - 1] ^= 1
  await writeFile(join(directory, 'office.lexora-extension'), changed)
  await expect(preinstallBundledExtensions(store, provider)).rejects.toThrow('EXTENSION_DOWNLOAD_CHECKSUM_FAILED')
  expect(store.installed[value.id]).toBeUndefined()
  await expect(readFile(join(store.root, 'preinstalled.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects unsafe bundled artifact paths and unreadable preinstall state', async () => {
  const { provider, directory, entry, store } = await fixture()
  await writeFile(join(directory, 'catalog.json'), JSON.stringify({ schemaVersion: 1, plugins: [{ ...entry, artifact: { ...entry.artifact, file: '../office.lexora-extension' } }] }))
  await expect(provider.list()).rejects.toThrow()
  await writeFile(join(store.root, 'preinstalled.json'), '{broken')
  await expect(preinstallBundledExtensions(store, provider)).rejects.toThrow('EXTENSION_PREINSTALL_STATE_UNREADABLE')
  expect(Object.keys(store.installed)).toEqual([])
})

it('packages and preinstalls the actual Office plugin with its view, icon and license files', async () => {
  const { root, ports } = await fixture()
  const directory = join(root, 'actual-office')
  const script = fileURLToPath(new URL('../../../../../packaging/buddy/release/prepare-bundled-extensions.mjs', import.meta.url))
  execFileSync(process.execPath, [script, '--output', directory], { stdio: 'pipe' })
  const provider = new BundledExtensionCatalog(directory)
  const store = new ExtensionPackageStore(join(root, 'actual-installation'), buddyVersion.version)
  const service = new ExtensionService(store, { ...ports, bundled: provider })
  cleanup.push(() => service.dispose())
  const [status] = await service.list()
  expect(status).toMatchObject({ enabled: true, compatible: true, manifest: { name: 'Office DOCX', author: 'XTLaw官方', version: '0.1.2', apiVersion: 4 } })
  const pkg = store.installed[status!.manifest.id]!.current
  for (const file of ['view.js', 'icon.svg', 'LICENSE', 'LICENSE-OFL.txt', 'LICENSE-UNICODE.txt', 'provenance.json'])
    expect((await store.asset(pkg, file)).length).toBeGreaterThan(0)
  expect((await service.catalog.list()).plugins).toMatchObject([{ manifest: { id: status!.manifest.id }, artifact: { kind: 'bundled' } }])
})

it('does not allow a remote catalog to replace or spoof bundled plugins', async () => {
  const { provider, store, value, entry, bytes } = await fixture()
  const remote = { ...entry, manifest: { ...value, version: '9.0.0' }, artifact: { url: 'https://example.com/office.lexora-extension', sha256: sha256(bytes), size: bytes.length } }
  const get = vi.fn(async () => Response.json({ schemaVersion: 1, plugins: [remote, { ...entry, manifest: manifest({ id: 'tests.spoof' }) }] }))
  const catalog = new ExtensionCatalogService(store.root, store.appVersion, get, { bundled: provider })
  cleanup.push(async () => catalog.dispose())
  expect((await catalog.list()).plugins.map(item => [item.manifest.id, item.manifest.version])).toEqual([[value.id, value.version]])
  await expect(catalog.download(value.id, '9.0.0', new AbortController().signal)).rejects.toThrow('EXTENSION_CATALOG_ENTRY_UNAVAILABLE')
})
