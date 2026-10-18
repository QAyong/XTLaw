import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { satisfies } from 'semver'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverBundledPlugins } from '../../../packaging/buddy/release/bundled-plugins.mjs'
import buddyVersion from '../buddy.version.json'
import { createStore } from '../platform/extensions/__tests__/fixtures'
import { buildExtensionPackage } from '../platform/extensions/buildExtensionPackage'
import { readExtensionDirectory, unpackExtension, validateExtensionFiles } from '../platform/extensions/extensionFiles'
import { documentContractReport } from '../shared/extensions/extensionDocumentContract'
import { extensionCompatible, extensionManifestSchema } from '../shared/extensions/extensionManifest'

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

describe('plugin tools', () => {
  const runner = fileURLToPath(new URL('../extensions/tools-run.mjs', import.meta.url))
  const run = (...args: string[]) => spawnSync(process.execPath, [runner, ...args], { encoding: 'utf8', cwd: fileURLToPath(new URL('../', import.meta.url)) })

  it('keeps the example installable once the application reaches the version its engine range asks for', () => {
    const manifest = extensionManifestSchema.parse(JSON.parse(readFileSync(join(folder, 'extension.json'), 'utf8')))
    expect(extensionCompatible(manifest, '0.2.3')).toBe(true)
    expect(extensionCompatible(manifest, '0.2.2')).toBe(false)
    if (satisfies(buddyVersion.version, '>=0.2.3'))
      expect(extensionCompatible(manifest, buddyVersion.version)).toBe(true)
  })

  it('checks a plugin through tools-run.mjs and warns about contract problems without failing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'xtlaw-tools-'))
    cleanup.push(() => rm(root, { recursive: true, force: true }))
    const plugin = join(root, 'plugin')
    await cp(folder, plugin, { recursive: true })
    const manifestPath = join(plugin, 'extension.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    // The same csv plugin, but claiming to be older than its features, asking for WebAssembly, and sharing .docx with the bundled plugin.
    manifest.engines.lexora = '>=0.2.0 <1.0.0'
    manifest.permissions.webAssembly = true
    manifest.contributes.views[0].accepts.extensions.push('docx')
    writeFileSync(manifestPath, JSON.stringify(manifest))
    for (let index = 0; index < 5; index++)
      writeFileSync(join(plugin, `engine${index}.wasm`), '\0asm')
    const checked = run('check', plugin)
    expect(checked.status).toBe(0)
    expect(checked.stdout).toContain('Document capabilities: documents.handler (XTLaw 0.2.0+), documents.reference (XTLaw 0.2.0+), documents.webAssembly (XTLaw 0.2.3+)')
    expect(checked.stdout).toContain('not upstream API numbers')
    expect(checked.stderr).toContain('raise the minimum to at least 0.2.3')
    expect(checked.stderr).toContain('Office DOCX (bundled) also accepts .docx')
    expect(checked.stderr).toContain('EXTENSION_WEBASSEMBLY_LIMIT')
  }, 170000)
})
