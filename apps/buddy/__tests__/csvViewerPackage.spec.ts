import { Buffer } from 'node:buffer'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverBundledPlugins } from '../../../packaging/buddy/release/bundled-plugins.mjs'
import { createStore } from '../platform/extensions/__tests__/fixtures'
import { buildExtensionPackage } from '../platform/extensions/buildExtensionPackage'
import { readExtensionDirectory, unpackExtension, validateExtensionFiles } from '../platform/extensions/extensionFiles'
import { documentContractReport } from '../shared/extensions/extensionDocumentContract'
import { extensionManifestSchema } from '../shared/extensions/extensionManifest'

const folder = fileURLToPath(new URL('../extensions/examples/csv-viewer/', import.meta.url))
const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action()
})

describe('csv viewer example: package', () => {
  it('passes the manifest rules, the contract check and the package build', async () => {
    const files = await readExtensionDirectory(folder)
    const manifest = extensionManifestSchema.parse(JSON.parse(Buffer.from(files.get('extension.json')!).toString('utf8')))
    expect(manifest.apiVersion).toBe(4)
    expect(manifest.permissions).toMatchObject({ selectedResource: 'read', composerReference: true, selectedResourceWrite: false, webAssembly: false })
    const bundledHandlers = (await Promise.all(discoverBundledPlugins().map(async plugin => ({ files: await readExtensionDirectory(plugin.directory) })))).map(({ files: pluginFiles }) => {
      const bundled = JSON.parse(Buffer.from(pluginFiles.get('extension.json')!).toString('utf8'))
      return { id: bundled.id, name: bundled.name, extensions: bundled.contributes.views.flatMap((view: { accepts?: { extensions: string[] } }) => view.accepts?.extensions ?? []) }
    })
    const report = documentContractReport(manifest, { files: [...files].map(([path, bytes]) => ({ path, size: bytes.length })), development: false, bundledHandlers })
    expect(report.warnings).toEqual([])
    expect(report.capabilities.map(capability => capability.name)).toEqual(['documents.handler', 'documents.reference'])

    const archive = Buffer.from(zipSync(Object.fromEntries(files), { level: 6 })).toString('base64')
    const result = await buildExtensionPackage({ archive }, async () => {
      throw new Error('A compiled package must not run a compiler')
    }, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, id: manifest.id, version: '0.1.0' })
    if (!result.ok)
      throw new Error(result.code)
    const unpacked = unpackExtension(Buffer.from(result.archive, 'base64'))
    validateExtensionFiles(unpacked)
    expect([...unpacked.keys()].sort()).toEqual(['csv.js', 'document-kit/quote.js', 'document-kit/read-file.js', 'document-kit/zip-validate.js', 'extension.json', 'icon.svg', 'view.js'])
  })

  it('installs from a local package, takes over .csv files, and is not preinstalled', async () => {
    const { root, store } = await createStore()
    cleanup.push(() => rm(root, { recursive: true, force: true }))
    const files = await readExtensionDirectory(folder)
    const review = await store.reviewFiles(files, false, null)
    await store.install(review.token)
    const installed = Object.values(store.installed)[0]!
    expect(installed.current.manifest.contributes.views[0]!.accepts).toEqual({ extensions: ['csv'] })
    expect(discoverBundledPlugins().map(plugin => plugin.name)).not.toContain('csv-viewer')
  })
})
