import { rm } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { BUNDLED_EXTENSION_CATALOG_URL } from '../../../shared/extensions/extensionCatalog'
import { extensionIsBundled } from '../../../shared/extensions/extensionTrust'
import { createStore, manifest, reviewPackage } from './fixtures'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const wasm = manifest({ id: 'tests.engine', permissions: { selectedResource: 'read', webAssembly: true } })
const remote = { catalog: 'https://raw.githubusercontent.com/QAyong/xtlaw-plugins/main/catalog/v1/index.json', artifact: 'https://example.com/engine.lexora-extension', sha256: 'b'.repeat(64) }
const MiB = 1024 * 1024
const piece = 'x'.repeat(10 * MiB)

// WebAssembly follows upstream: the package only has to fit the package budget, whoever it comes from.
it('installs packages from disk or a remote catalog with any number of .wasm files inside the package budget', async () => {
  const { root, store } = await createStore()
  roots.push(root)
  const many = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`m${index}.wasm`, '\0asm']))
  for (const source of [undefined, remote]) {
    for (const files of [many, { 'a.wasm': piece, 'b.wasm': piece, 'c.wasm': piece }]) {
      const review = await reviewPackage(root, store, wasm, files, source)
      expect(review.manifest.permissions.webAssembly).toBe(true)
      expect(review.addedPermissions).toContain('webAssembly')
      store.cancelReview(review.token)
    }
  }
})

it('treats only the recorded bundled catalog address as bundled', () => {
  expect(extensionIsBundled({ catalog: BUNDLED_EXTENSION_CATALOG_URL })).toBe(true)
  expect(extensionIsBundled({ catalog: `${BUNDLED_EXTENSION_CATALOG_URL}.example.com` })).toBe(false)
  expect(extensionIsBundled({ catalog: 'https://example.com/xtlaw-bundled://catalog' })).toBe(false)
  expect(extensionIsBundled(null)).toBe(false)
})
