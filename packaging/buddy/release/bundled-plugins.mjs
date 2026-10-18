import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const bundledPluginsRoot = fileURLToPath(new URL('../../../plugins/', import.meta.url))
const packageName = /^[a-z0-9][a-z0-9-]*$/

// A bundled plugin is a directory directly under plugins/ that holds an extension.json; anything else there
// (notes, scratch folders) is not a plugin. The directory name is the package name, so a new plugin ships by adding its folder.
export function discoverBundledPlugins(root = bundledPluginsRoot) {
  if (!existsSync(root))
    return []
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(root, entry.name, 'extension.json')))
    .map((entry) => {
      assert(packageName.test(entry.name), `Bundled plugin directory name must be lowercase letters, digits and hyphens: ${entry.name}`)
      return { name: entry.name, directory: join(root, entry.name), file: `${entry.name}.lexora-extension` }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}
