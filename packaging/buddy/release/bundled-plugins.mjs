import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const bundledPluginsRoot = fileURLToPath(new URL('../../../plugins/', import.meta.url))
const packageName = /^[a-z0-9][a-z0-9-]*$/

// Source folders are retained for independent plugin development and marketplace releases.
// Merely adding a folder here must not increase the application installer or preinstall a plugin.
const bundledPluginNames = new Set()

export function discoverPluginSources(root = bundledPluginsRoot) {
  if (!existsSync(root))
    return []
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(root, entry.name, 'extension.json')))
    .map((entry) => {
      assert(packageName.test(entry.name), `Plugin directory name must be lowercase letters, digits and hyphens: ${entry.name}`)
      return { name: entry.name, directory: join(root, entry.name), file: `${entry.name}.lexora-extension` }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

// Office plugins are distributed through the XTLaw marketplace, never preinstalled.
export function discoverBundledPlugins(root = bundledPluginsRoot) {
  return discoverPluginSources(root).filter(plugin => bundledPluginNames.has(plugin.name))
}
