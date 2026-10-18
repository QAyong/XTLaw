import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { BUNDLED_EXTENSION_CATALOG_URL } from '../../../shared/extensions/extensionCatalog'
import { extensionMayUseWebAssembly } from '../../../shared/extensions/extensionTrust'
import { createStore, manifest, reviewPackage } from './fixtures'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

// The author and name claim to be official; the package cannot make itself official by saying so.
const wasm = manifest({ id: 'tests.engine', name: 'XTLaw官方', author: 'XTLaw官方', permissions: { selectedResource: 'read', webAssembly: true } })
const bundled = { catalog: BUNDLED_EXTENSION_CATALOG_URL, artifact: `${BUNDLED_EXTENSION_CATALOG_URL}/engine.lexora-extension`, sha256: 'a'.repeat(64) }
const remote = { catalog: 'https://raw.githubusercontent.com/QAyong/xtlaw-plugins/main/catalog/v1/index.json', artifact: 'https://example.com/engine.lexora-extension', sha256: 'b'.repeat(64) }

async function fixture() {
  const { root, store } = await createStore()
  roots.push(root)
  return { root, store }
}

it('rejects WebAssembly in a package picked from disk, whatever author or name it claims', async () => {
  const { root, store } = await fixture()
  await expect(reviewPackage(root, store, wasm)).rejects.toThrow('EXTENSION_WEBASSEMBLY_RESTRICTED')
  expect(Object.keys(store.installed)).toEqual([])
})

it('rejects WebAssembly in a package that came from a remote catalog', async () => {
  const { root, store } = await fixture()
  await expect(reviewPackage(root, store, wasm, {}, remote)).rejects.toThrow('EXTENSION_WEBASSEMBLY_RESTRICTED')
})

it('rejects a catalog address that only resembles the bundled one', () => {
  expect(extensionMayUseWebAssembly({ development: false, source: { catalog: `${BUNDLED_EXTENSION_CATALOG_URL}.example.com` } })).toBe(false)
  expect(extensionMayUseWebAssembly({ development: false, source: { catalog: 'https://example.com/xtlaw-bundled://catalog' } })).toBe(false)
  expect(extensionMayUseWebAssembly({ development: false, source: null })).toBe(false)
  expect(extensionMayUseWebAssembly({ development: false, source: { catalog: BUNDLED_EXTENSION_CATALOG_URL } })).toBe(true)
  expect(extensionMayUseWebAssembly({ development: true, source: null })).toBe(true)
})

it('allows WebAssembly for packages installed from the bundled catalog and surfaces it as an added permission', async () => {
  const { root, store } = await fixture()
  const review = await reviewPackage(root, store, wasm, {}, bundled)
  expect(review.manifest.permissions.webAssembly).toBe(true)
  expect(review.addedPermissions).toContain('webAssembly')
  await store.install(review.token)
  expect(store.installed['tests.engine']!.current.source).toMatchObject({ catalog: BUNDLED_EXTENSION_CATALOG_URL })
})

it('allows WebAssembly in development directories', async () => {
  const { root, store } = await fixture()
  const directory = join(root, 'dev-plugin')
  await mkdir(directory)
  const files = { 'extension.json': JSON.stringify(wasm), 'extension.js': 'export function activate() {}', 'view.js': 'export function render() {}' }
  for (const [name, value] of Object.entries(files))
    await writeFile(join(directory, name), value)
  const review = await store.review(directory, true)
  expect(review.development).toBe(true)
  expect(review.manifest.permissions.webAssembly).toBe(true)
})

it('keeps ordinary packages without the permission installable from any source', async () => {
  const { root, store } = await fixture()
  await store.install((await reviewPackage(root, store, manifest())).token)
  expect(Object.keys(store.installed)).toEqual(['tests.reader'])
})
