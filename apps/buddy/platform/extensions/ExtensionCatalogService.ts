import type { ExtensionCatalogEntry, ExtensionCatalogSnapshot } from '../../shared/extensions/extensionCatalog'
import type { BundledExtensionProvider } from './BundledExtensionCatalog'
import { join } from 'node:path'
import { rcompare } from 'semver'
import { z } from 'zod'
import { EXTENSION_CATALOG_URL, extensionCatalogSchema } from '../../shared/extensions/extensionCatalog'
import { extensionCompatible } from '../../shared/extensions/extensionManifest'
import { publicWebUrl, readResponseBytes } from '../network/publicWebTransport'
import { catalogEntrySource } from './BundledExtensionCatalog'
import { readExtensionJson, sha256, writeExtensionJson } from './extensionFiles'

const cacheSchema = z.object({ cachedAt: z.string(), catalog: extensionCatalogSchema }).strict()
// Product exclusions apply to both saved and refreshed catalogs, not just the UI.
const excludedCatalogIds = new Set(['lexora.water-reminder'])
function filterCatalog(catalog: z.infer<typeof extensionCatalogSchema>) {
  return { ...catalog, plugins: catalog.plugins.filter(entry => !excludedCatalogIds.has(entry.manifest.id) && 'url' in entry.artifact) }
}
export class ExtensionCatalogService {
  readonly #path: string
  readonly #version: string
  readonly #get: (url: string, init: { signal: AbortSignal }) => Promise<Response>
  readonly #catalogUrl: string | null
  readonly #bundled: BundledExtensionProvider | undefined
  #bundledEntries: ExtensionCatalogEntry[] = []
  #loadingBundles: Promise<void> | undefined
  #cache: z.infer<typeof cacheSchema> | null = null
  #loading: Promise<void> | null = null
  #refreshing: Promise<ExtensionCatalogSnapshot> | null = null
  readonly #abort = new AbortController()

  constructor(root: string, version: string, get: (url: string, init: { signal: AbortSignal }) => Promise<Response>, options: { bundled?: BundledExtensionProvider, catalogUrl?: string | null } = {}) {
    this.#path = join(root, 'catalog.json')
    this.#version = version
    this.#get = get
    this.#bundled = options.bundled
    this.#catalogUrl = options.catalogUrl === undefined ? EXTENSION_CATALOG_URL : options.catalogUrl
  }

  source(entry: ExtensionCatalogEntry) {
    return catalogEntrySource(entry, this.#catalogUrl ?? EXTENSION_CATALOG_URL)
  }

  async list(refresh = false): Promise<ExtensionCatalogSnapshot> {
    await (this.#loadingBundles ??= (this.#bundled?.list() ?? Promise.resolve([])).then((entries) => {
      if (entries.some(entry => !('kind' in entry.artifact)))
        throw new Error('EXTENSION_BUNDLED_CATALOG_INVALID')
      this.#bundledEntries = entries
    }))
    if (this.#catalogUrl === null)
      return this.#snapshot(false, null)
    await (this.#loading ??= readExtensionJson(this.#path, 4 * 1024 * 1024).then((raw) => {
      const cached = cacheSchema.parse(raw)
      this.#cache = { ...cached, catalog: filterCatalog(cached.catalog) }
    }).catch(() => {}))
    if (!refresh && this.#cache && Date.now() - Date.parse(this.#cache.cachedAt) < 3600000)
      return this.#snapshot(false, null)
    return this.#refreshing ??= this.#refresh().finally(() => {
      this.#refreshing = null
    })
  }

  async download(id: string, version: string, signal: AbortSignal): Promise<{ entry: ExtensionCatalogEntry, bytes: Uint8Array }> {
    if (excludedCatalogIds.has(id))
      throw new Error('EXTENSION_CATALOG_ENTRY_UNAVAILABLE')
    await this.list()
    const owned = this.#bundledEntries.filter(item => item.manifest.id === id)
    const entry = (owned.length ? owned : this.#cache?.catalog.plugins ?? []).find(item => item.manifest.id === id && item.manifest.version === version)
    if (!entry || !extensionCompatible(entry.manifest, this.#version))
      throw new Error('EXTENSION_CATALOG_ENTRY_UNAVAILABLE')
    const bytes = 'kind' in entry.artifact
      ? await this.#bundled!.read(entry, signal)
      : await this.#fetch(entry.artifact.url, entry.artifact.size, signal)
    if (bytes.byteLength !== entry.artifact.size || sha256(bytes) !== entry.artifact.sha256)
      throw new Error('EXTENSION_DOWNLOAD_CHECKSUM_FAILED')
    return { entry, bytes }
  }

  dispose(): void {
    this.#abort.abort()
  }

  async #refresh(): Promise<ExtensionCatalogSnapshot> {
    try {
      if (!this.#catalogUrl)
        throw new Error('EXTENSION_CATALOG_UNAVAILABLE')
      const bytes = await this.#fetch(this.#catalogUrl, 2 * 1024 * 1024, this.#abort.signal)
      const catalog = filterCatalog(extensionCatalogSchema.parse(JSON.parse(new TextDecoder().decode(bytes))))
      const next = { catalog, cachedAt: new Date().toISOString() }
      await writeExtensionJson(this.#path, next, () => this.#abort.signal.throwIfAborted())
      this.#cache = next
      return this.#snapshot(false, null)
    }
    catch {
      return this.#snapshot(true, 'EXTENSION_CATALOG_UNAVAILABLE')
    }
  }

  #snapshot(stale: boolean, error: string | null): ExtensionCatalogSnapshot {
    const selected = new Map<string, ExtensionCatalogEntry & { compatible: boolean }>()
    const localIds = new Set(this.#bundledEntries.map(entry => entry.manifest.id))
    const remote = this.#catalogUrl === null ? [] : (this.#cache?.catalog.plugins ?? []).filter(entry => !localIds.has(entry.manifest.id))
    for (const entry of [...remote, ...this.#bundledEntries].sort((a, b) => rcompare(a.manifest.version, b.manifest.version))) {
      const compatible = extensionCompatible(entry.manifest, this.#version)
      const previous = selected.get(entry.manifest.id)
      if (!previous || (!previous.compatible && compatible))
        selected.set(entry.manifest.id, { ...entry, compatible })
    }
    return { plugins: [...selected.values()], cachedAt: this.#catalogUrl === null ? null : this.#cache?.cachedAt ?? null, stale, error }
  }

  async #fetch(raw: string, limit: number, signal: AbortSignal): Promise<Uint8Array> {
    let url = raw
    const bounded = AbortSignal.any([signal, this.#abort.signal, AbortSignal.timeout(30000)])
    for (let redirects = 0; redirects < 5; redirects++) {
      const parsed = publicWebUrl(url)
      if (parsed.protocol !== 'https:')
        throw new Error('EXTENSION_DOWNLOAD_URL_DENIED')
      const response = await this.#get(parsed.href, { signal: bounded })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        const location = response.headers.get('location')
        if (!location)
          break
        url = new URL(location, parsed).href
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error('EXTENSION_DOWNLOAD_FAILED')
      }
      return readResponseBytes(response, limit)
    }
    throw new Error('EXTENSION_DOWNLOAD_FAILED')
  }
}
