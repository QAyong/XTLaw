import type { ExtensionCatalogEntry } from '../../shared/extensions/extensionCatalog'
import type { ExtensionPackageStore } from './ExtensionPackageStore'
import { join } from 'node:path'
import { z } from 'zod'
import { BUNDLED_EXTENSION_CATALOG_URL, extensionCatalogSchema } from '../../shared/extensions/extensionCatalog'
import { extensionCompatible, extensionIdSchema } from '../../shared/extensions/extensionManifest'
import { readExtensionFile, readExtensionJson, sha256, unpackExtension, writeExtensionJson } from './extensionFiles'

export interface BundledExtensionProvider {
  list: () => Promise<ExtensionCatalogEntry[]>
  read: (entry: ExtensionCatalogEntry, signal: AbortSignal) => Promise<Uint8Array>
}

export class BundledExtensionCatalog implements BundledExtensionProvider {
  readonly #directory: string
  #entries: Promise<ExtensionCatalogEntry[]> | undefined

  constructor(directory: string) {
    this.#directory = directory
  }

  list(): Promise<ExtensionCatalogEntry[]> {
    return this.#entries ??= readExtensionJson(join(this.#directory, 'catalog.json'), 2 * 1024 * 1024).then((raw) => {
      const catalog = extensionCatalogSchema.parse(raw)
      if (catalog.plugins.some(entry => !('kind' in entry.artifact)))
        throw new Error('EXTENSION_BUNDLED_CATALOG_INVALID')
      return catalog.plugins
    })
  }

  async read(entry: ExtensionCatalogEntry, signal: AbortSignal): Promise<Uint8Array> {
    signal.throwIfAborted()
    const trusted = (await this.list()).find(item => item.manifest.id === entry.manifest.id && item.manifest.version === entry.manifest.version)
    if (!trusted || JSON.stringify(trusted) !== JSON.stringify(entry) || !('kind' in trusted.artifact))
      throw new Error('EXTENSION_CATALOG_ENTRY_UNAVAILABLE')
    const bytes = await readExtensionFile(join(this.#directory, trusted.artifact.file), trusted.artifact.size)
    signal.throwIfAborted()
    if (bytes.length !== trusted.artifact.size || sha256(bytes) !== trusted.artifact.sha256)
      throw new Error('EXTENSION_DOWNLOAD_CHECKSUM_FAILED')
    return bytes
  }
}

export function catalogEntrySource(entry: ExtensionCatalogEntry, catalogUrl: string) {
  return {
    catalog: 'kind' in entry.artifact ? BUNDLED_EXTENSION_CATALOG_URL : catalogUrl,
    artifact: 'kind' in entry.artifact ? `${BUNDLED_EXTENSION_CATALOG_URL}/${entry.artifact.file}` : entry.artifact.url,
    sha256: entry.artifact.sha256,
  }
}

const baselineSchema = z.object({ version: z.literal(1), initialized: z.array(extensionIdSchema).max(2000) }).strict()

// Run only from startup, before exposing plugin IPC. This installs product-shipped
// code through the normal package validation/store, never by forging installed.json.
export async function preinstallBundledExtensions(store: ExtensionPackageStore, provider: BundledExtensionProvider): Promise<void> {
  await store.load()
  const path = join(store.root, 'preinstalled.json')
  let baseline: z.infer<typeof baselineSchema> = { version: 1, initialized: [] }
  try {
    baseline = baselineSchema.parse(await readExtensionJson(path))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error('EXTENSION_PREINSTALL_STATE_UNREADABLE', { cause: error })
  }
  for (const entry of await provider.list()) {
    const id = entry.manifest.id
    if (baseline.initialized.includes(id) || !extensionCompatible(entry.manifest, store.appVersion))
      continue
    if (!store.installed[id]) {
      const bytes = await provider.read(entry, new AbortController().signal)
      if (bytes.byteLength !== entry.artifact.size || sha256(bytes) !== entry.artifact.sha256)
        throw new Error('EXTENSION_DOWNLOAD_CHECKSUM_FAILED')
      const review = await store.reviewFiles(unpackExtension(bytes), false, catalogEntrySource(entry, BUNDLED_EXTENSION_CATALOG_URL))
      if (JSON.stringify(review.manifest) !== JSON.stringify(entry.manifest)) {
        store.cancelReview(review.token)
        throw new Error('EXTENSION_CATALOG_MANIFEST_MISMATCH')
      }
      await store.install(review.token)
    }
    // Existing versions, disabled state, configuration and pending updates remain
    // untouched. Keeping this record separate preserves deliberate uninstall.
    baseline.initialized.push(id)
    await writeExtensionJson(path, baseline)
  }
}
