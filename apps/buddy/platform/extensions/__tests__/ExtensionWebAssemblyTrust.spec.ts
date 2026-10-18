import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { BUNDLED_EXTENSION_CATALOG_URL } from '../../../shared/extensions/extensionCatalog'
import { EXTENSION_UNTRUSTED_WASM_FILE_LIMIT, extensionIsBundled } from '../../../shared/extensions/extensionTrust'
import { createStore, manifest, reviewPackage } from './fixtures'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

// The author and name claim to be official; the package cannot make itself official by saying so.
const wasm = manifest({ id: 'tests.engine', name: 'XTLaw官方', author: 'XTLaw官方', permissions: { selectedResource: 'read', webAssembly: true } })
const bundled = { catalog: BUNDLED_EXTENSION_CATALOG_URL, artifact: `${BUNDLED_EXTENSION_CATALOG_URL}/engine.lexora-extension`, sha256: 'a'.repeat(64) }
const remote = { catalog: 'https://raw.githubusercontent.com/QAyong/xtlaw-plugins/main/catalog/v1/index.json', artifact: 'https://example.com/engine.lexora-extension', sha256: 'b'.repeat(64) }
const MiB = 1024 * 1024
const piece = 'x'.repeat(10 * MiB)

async function fixture() {
  const { root, store } = await createStore()
  roots.push(root)
  return { root, store }
}

it('lets a package from disk or a remote catalog use a bounded amount of WebAssembly', async () => {
  const { root, store } = await fixture()
  for (const source of [undefined, remote]) {
    const review = await reviewPackage(root, store, wasm, { 'engine.wasm': '\0asm', 'extra/helper.WASM': '\0asm' }, source)
    expect(review.manifest.permissions.webAssembly).toBe(true)
    expect(review.addedPermissions).toContain('webAssembly')
    store.cancelReview(review.token)
  }
})

it('rejects too many or too large .wasm files from third parties, whatever author or name they claim', async () => {
  const { root, store } = await fixture()
  const many = Object.fromEntries(Array.from({ length: EXTENSION_UNTRUSTED_WASM_FILE_LIMIT + 1 }, (_, index) => [`m${index}.wasm`, '\0asm']))
  for (const source of [undefined, remote]) {
    await expect(reviewPackage(root, store, wasm, many, source)).rejects.toThrow('EXTENSION_WEBASSEMBLY_LIMIT')
    // 30 MiB in three files is within the package limit but over the third-party .wasm total.
    await expect(reviewPackage(root, store, wasm, { 'a.wasm': piece, 'b.wasm': piece, 'c.wasm': piece }, source)).rejects.toThrow('EXTENSION_WEBASSEMBLY_LIMIT')
  }
  expect(Object.keys(store.installed)).toEqual([])
})

it('does not apply the limits to bundled packages or development folders', async () => {
  const { root, store } = await fixture()
  const review = await reviewPackage(root, store, wasm, { 'a.wasm': piece, 'b.wasm': piece, 'c.wasm': piece }, bundled)
  expect(review.manifest.permissions.webAssembly).toBe(true)
  await store.install(review.token)
  expect(store.installed['tests.engine']!.current.source).toMatchObject({ catalog: BUNDLED_EXTENSION_CATALOG_URL })
  const directory = join(root, 'dev-plugin')
  await mkdir(directory)
  const files = { 'extension.json': JSON.stringify(wasm), 'extension.js': 'export function activate() {}', 'view.js': 'export function render() {}', 'a.wasm': piece, 'b.wasm': piece, 'c.wasm': piece }
  for (const [name, value] of Object.entries(files))
    await writeFile(join(directory, name), value)
  expect((await store.review(directory, true)).development).toBe(true)
})

it('treats only the recorded bundled catalog address as bundled', () => {
  expect(extensionIsBundled({ catalog: BUNDLED_EXTENSION_CATALOG_URL })).toBe(true)
  expect(extensionIsBundled({ catalog: `${BUNDLED_EXTENSION_CATALOG_URL}.example.com` })).toBe(false)
  expect(extensionIsBundled({ catalog: 'https://example.com/xtlaw-bundled://catalog' })).toBe(false)
  expect(extensionIsBundled(null)).toBe(false)
})

it('does not check packages that do not ask for WebAssembly', async () => {
  const { root, store } = await fixture()
  await store.install((await reviewPackage(root, store, manifest(), { 'a.wasm': piece, 'b.wasm': piece, 'c.wasm': piece })).token)
  expect(Object.keys(store.installed)).toEqual(['tests.reader'])
})
