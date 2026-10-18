import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverBundledPlugins } from '../../../packaging/buddy/release/bundled-plugins.mjs'
import { platformResources } from '../../../packaging/buddy/release/platform-definition.mjs'
import { prepareBundledExtensions } from '../../../packaging/buddy/release/prepare-bundled-extensions.mjs'
import { resolveBuildTarget } from '../../../packaging/buddy/release/targets.mjs'

const roots = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function plugins(layout) {
  const root = await mkdtemp(join(tmpdir(), 'xtlaw-bundled-plugins-'))
  roots.push(root)
  for (const [path, content] of Object.entries(layout)) {
    const file = join(root, path)
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, content)
  }
  return root
}
function manifest(name) {
  return JSON.stringify({ schemaVersion: 1, format: 'compiled', id: `tests.${name}`, name, version: '1.0.0', apiVersion: 4, engines: { lexora: '>=0.1.0' }, entry: 'extension.js', contributes: { views: [{ id: `tests.${name}.view`, title: name, entry: 'view.js' }] } })
}

describe('bundled plugin discovery', () => {
  it('finds every folder with an extension.json, sorted, and ignores everything else', async () => {
    const root = await plugins({
      'zeta/extension.json': manifest('zeta'),
      'alpha-2/extension.json': manifest('alpha'),
      'notes/README.md': 'not a plugin',
      'scratch/index.js': '',
      'loose-file.json': '{}',
    })
    expect(discoverBundledPlugins(root).map(({ name, file }) => [name, file])).toEqual([['alpha-2', 'alpha-2.lexora-extension'], ['zeta', 'zeta.lexora-extension']])
    expect(discoverBundledPlugins(join(root, 'missing'))).toEqual([])
  })

  it('refuses a plugin folder whose name cannot be a package file name', async () => {
    const root = await plugins({ 'Bad Name/extension.json': manifest('bad') })
    expect(() => discoverBundledPlugins(root)).toThrow('Bundled plugin directory name')
  })

  it('finds the three shipped Office plugins with their existing package names', () => {
    expect(discoverBundledPlugins().map(plugin => plugin.file)).toEqual(['office.lexora-extension', 'office-pptx.lexora-extension', 'office-xlsx.lexora-extension'])
  })
})

describe('bundled plugin packaging', () => {
  it('lists the catalog and every discovered package as application resources', () => {
    const resources = platformResources(resolveBuildTarget()).filter(resource => resource.to.startsWith('bundled-extensions/'))
    expect(resources).toEqual([
      { from: '.output/resources/bundled-extensions/catalog.json', to: 'bundled-extensions/catalog.json' },
      ...['office', 'office-pptx', 'office-xlsx'].map(name => ({ from: `.output/resources/bundled-extensions/${name}.lexora-extension`, to: `bundled-extensions/${name}.lexora-extension` })),
    ])
  })

  it('packs a plugin added as a new folder without touching any script', async () => {
    const root = await plugins({
      'csv-viewer/extension.json': manifest('csv-viewer'),
      'csv-viewer/extension.js': 'export function activate() {}',
      'csv-viewer/view.js': 'export function render() {}',
      'notes/README.md': 'not a plugin',
    })
    const output = join(root, 'out')
    const result = await prepareBundledExtensions({ sourceDirectories: discoverBundledPlugins(root).map(plugin => plugin.directory), outputDirectory: output })
    expect(result.plugins.map(plugin => [plugin.file, plugin.id])).toEqual([['csv-viewer.lexora-extension', 'tests.csv-viewer']])
    const catalog = JSON.parse(await readFile(join(output, 'catalog.json'), 'utf8'))
    expect(catalog.plugins.map(entry => entry.artifact.file)).toEqual(['csv-viewer.lexora-extension'])
    expect(Object.keys(unzipSync(await readFile(join(output, 'csv-viewer.lexora-extension')))).sort()).toEqual(['extension.js', 'extension.json', 'view.js'])
  })

  it('packs the shipped plugins under the existing file names', async () => {
    const output = await mkdtemp(join(tmpdir(), 'xtlaw-bundled-output-'))
    roots.push(output)
    const result = await prepareBundledExtensions({ outputDirectory: output })
    expect(result.plugins.map(plugin => plugin.file)).toEqual(['office.lexora-extension', 'office-pptx.lexora-extension', 'office-xlsx.lexora-extension'])
  }, 120000)
})
