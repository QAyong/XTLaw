import type { ExtensionPackageStore } from '../extensions/ExtensionPackageStore'
import { join } from 'node:path'
import { lt } from 'semver'
import manifest from '../../extensions/bundled/xtlaw.themes/extension.json'
import icon from '../../extensions/bundled/xtlaw.themes/icon.svg?raw'
import paperDark from '../../extensions/bundled/xtlaw.themes/themes/paper-dark.json'
import paperLight from '../../extensions/bundled/xtlaw.themes/themes/paper-light.json'
import { extensionCompatible, extensionManifestSchema } from '../../shared/extensions/extensionManifest'
import { readExtensionJson, writeExtensionJson } from '../extensions/extensionFiles'

// XTLaw-owned theme package, kept apart from the upstream-synced lexora.themes package.
export function xtlawThemeFiles(): Map<string, Uint8Array> {
  const encoder = new TextEncoder()
  const themes = { 'paper-light': paperLight, 'paper-dark': paperDark }
  return new Map([
    ['extension.json', encoder.encode(JSON.stringify(manifest))],
    ['icon.svg', encoder.encode(icon)],
    ...Object.entries(themes).map(([name, document]) => [`themes/${name}.json`, encoder.encode(JSON.stringify(document))] as const),
  ])
}

export async function seedXtlawThemes(store: ExtensionPackageStore): Promise<void> {
  if (!extensionCompatible(extensionManifestSchema.parse(manifest), store.appVersion))
    return
  const marker = join(store.root, 'xtlaw-themes.json')
  let seeded = false
  try {
    await readExtensionJson(marker)
    seeded = true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }
  const installed = store.installed[manifest.id]
  const upgrade = installed && !installed.development && !installed.pending && lt(installed.current.manifest.version, manifest.version)
  if ((!seeded && !installed) || upgrade) {
    const review = await store.reviewFiles(xtlawThemeFiles())
    await store.install(review.token)
    if (upgrade)
      await store.promote(manifest.id)
  }
  if (!seeded)
    await writeExtensionJson(marker, { version: 1 })
}
