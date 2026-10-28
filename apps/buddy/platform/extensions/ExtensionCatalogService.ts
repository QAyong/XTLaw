import type { ExtensionCatalogEntry, ExtensionCatalogListing, ExtensionCatalogPack, ExtensionCatalogSnapshot } from '../../shared/extensions/extensionCatalog'
import type { DownloadMirrorMode } from '../../shared/network/proxySettings'
import type { BundledExtensionProvider } from './BundledExtensionCatalog'
import { join } from 'node:path'
import { rcompare } from 'semver'
import { z } from 'zod'
import { EXTENSION_CATALOG_URL, extensionCatalogEntrySchema, extensionCatalogListingSchema, extensionCatalogSchema, extensionPackSchema, extensionPacksSchema, extensionPacksUrl } from '../../shared/extensions/extensionCatalog'
import { ExtensionCompatibilityError, extensionCompatibilityIssue } from '../../shared/extensions/extensionCompatibility'
import { downloadRoutes } from '../../shared/network/downloadMirrors'
import { publicWebUrl, readResponseBytes } from '../network/publicWebTransport'
import { catalogEntrySource } from './BundledExtensionCatalog'
import { readExtensionJson, sha256, writeExtensionJson } from './extensionFiles'

const cacheSchema = z.object({ cachedAt: z.string(), catalog: extensionCatalogSchema }).strict()
const packsCacheSchema = z.object({ cachedAt: z.string(), packs: z.array(z.unknown()).max(200) }).strict()
// A pack that does not parse is dropped on its own; the first one wins when ids repeat.
function validPacks(raw: readonly unknown[]): ExtensionCatalogPack[] {
  const seen = new Set<string>()
  return raw.flatMap((item) => {
    const parsed = extensionPackSchema.safeParse(item)
    if (!parsed.success || seen.has(parsed.data.id))
      return []
    seen.add(parsed.data.id)
    return [parsed.data]
  })
}
// Product exclusions apply to both saved and refreshed catalogs, not just the UI.
const excludedCatalogIds = new Set(['lexora.water-reminder'])
function filterCatalog(catalog: z.infer<typeof extensionCatalogSchema>) {
  // Unparseable entries are kept so the snapshot can count them as invalid.
  return { ...catalog, plugins: catalog.plugins.filter((raw) => {
    const parsed = extensionCatalogListingSchema.safeParse(raw)
    return !parsed.success || (!excludedCatalogIds.has(parsed.data.manifest.id) && 'url' in parsed.data.artifact)
  }) }
}
export class ExtensionCatalogService {
  readonly #path: string
  readonly #packsPath: string
  readonly #version: string
  readonly #get: (url: string, init: { signal: AbortSignal }) => Promise<Response>
  readonly #catalogUrl: string | null
  readonly #bundled: BundledExtensionProvider | undefined
  readonly #mirror: () => DownloadMirrorMode
  #bundledEntries: ExtensionCatalogEntry[] = []
  #loadingBundles: Promise<void> | undefined
  #cache: z.infer<typeof cacheSchema> | null = null
  #packs: ExtensionCatalogPack[] = []
  #loading: Promise<void> | null = null
  #refreshing: Promise<ExtensionCatalogSnapshot> | null = null
  readonly #abort = new AbortController()

  constructor(root: string, version: string, get: (url: string, init: { signal: AbortSignal }) => Promise<Response>, options: { bundled?: BundledExtensionProvider, catalogUrl?: string | null, downloadMirror?: () => DownloadMirrorMode } = {}) {
    this.#path = join(root, 'catalog.json')
    this.#packsPath = join(root, 'packs.json')
    this.#version = version
    this.#get = get
    this.#bundled = options.bundled
    this.#mirror = options.downloadMirror ?? (() => 'auto')
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
    await (this.#loading ??= Promise.all([
      readExtensionJson(this.#path, 4 * 1024 * 1024).then((raw) => {
        const cached = cacheSchema.parse(raw)
        this.#cache = { ...cached, catalog: filterCatalog(cached.catalog) }
      }).catch(() => {}),
      readExtensionJson(this.#packsPath, 1024 * 1024).then((raw) => {
        this.#packs = validPacks(packsCacheSchema.parse(raw).packs)
      }).catch(() => {}),
    ]).then(() => {}))
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
    let entry: ExtensionCatalogEntry
    let bytes: Uint8Array
    if (owned.length) {
      const bundled = owned.find(item => item.manifest.version === version)
      if (!bundled)
        throw new Error('EXTENSION_CATALOG_ENTRY_UNAVAILABLE')
      const issue = extensionCompatibilityIssue(bundled.manifest, this.#version)
      if (issue)
        throw new ExtensionCompatibilityError(bundled.manifest, issue)
      entry = bundled
      bytes = await this.#bundled!.read(entry, signal)
    }
    else {
      if (this.#snapshot(false, null).plugins.find(item => item.manifest.id === id)?.manifest.version !== version)
        throw new Error('EXTENSION_CATALOG_ENTRY_UNAVAILABLE')
      const raw = this.#cache?.catalog.plugins.find((item) => {
        const parsed = extensionCatalogListingSchema.safeParse(item)
        return parsed.success && parsed.data.manifest.id === id && parsed.data.manifest.version === version
      })
      if (!raw)
        throw new Error('EXTENSION_CATALOG_ENTRY_UNAVAILABLE')
      const listing = extensionCatalogListingSchema.parse(raw)
      const issue = extensionCompatibilityIssue(listing.manifest, this.#version)
      if (issue)
        throw new ExtensionCompatibilityError(listing.manifest, issue)
      const parsed = extensionCatalogEntrySchema.safeParse(raw)
      if (!parsed.success || !('url' in parsed.data.artifact))
        throw new Error('EXTENSION_MANIFEST_INVALID')
      entry = parsed.data
      // The size and sha256 come from the catalog fetched straight from GitHub, so a mirror only carries bytes: a package it alters fails the check and the next route is tried.
      const matches = (candidate: Uint8Array) => candidate.byteLength === entry.artifact.size && sha256(candidate) === entry.artifact.sha256
      bytes = await this.#fetchVerified(downloadRoutes(parsed.data.artifact.url, this.#mirror()), entry.artifact.size, signal, matches)
    }
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
      await this.#refreshPacks(this.#catalogUrl)
      return this.#snapshot(false, null)
    }
    catch {
      return this.#snapshot(true, 'EXTENSION_CATALOG_UNAVAILABLE')
    }
  }

  // Packs are an optional shelf on top of the catalog: a missing or unreadable file keeps what was saved and never fails the refresh.
  async #refreshPacks(catalogUrl: string): Promise<void> {
    try {
      const bytes = await this.#fetch(extensionPacksUrl(catalogUrl), 1024 * 1024, this.#abort.signal)
      const parsed = extensionPacksSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
      const packs = validPacks(parsed.packs)
      await writeExtensionJson(this.#packsPath, { cachedAt: new Date().toISOString(), packs }, () => this.#abort.signal.throwIfAborted())
      this.#packs = packs
    }
    catch {}
  }

  #snapshot(stale: boolean, error: string | null): ExtensionCatalogSnapshot {
    const selected = new Map<string, ExtensionCatalogListing>()
    let invalidEntries = 0
    // Bundled entries own their IDs; remote listings for the same plugin are ignored.
    const localIds = new Set(this.#bundledEntries.map(entry => entry.manifest.id))
    const remote = (this.#catalogUrl === null ? [] : this.#cache?.catalog.plugins ?? []).flatMap((raw) => {
      const parsed = extensionCatalogListingSchema.safeParse(raw)
      if (!parsed.success) {
        invalidEntries++
        return []
      }
      return localIds.has(parsed.data.manifest.id) ? [] : [{ raw, entry: parsed.data }]
    })
    const entries = [...remote, ...this.#bundledEntries.map(entry => ({ raw: entry as unknown, entry }))]
    for (const { raw, entry } of entries.sort((a, b) => rcompare(a.entry.manifest.version, b.entry.manifest.version))) {
      const incompatibility = extensionCompatibilityIssue(entry.manifest, this.#version) ?? (extensionCatalogEntrySchema.safeParse(raw).success ? null : { reason: 'manifest-invalid' as const, currentVersion: this.#version, requiredVersion: entry.manifest.engines.lexora, requiredApiVersion: entry.manifest.apiVersion })
      const compatible = !incompatibility
      const previous = selected.get(entry.manifest.id)
      if (!previous)
        selected.set(entry.manifest.id, { ...entry, compatible, incompatibility })
    }
    return { plugins: [...selected.values()], packs: this.#catalogUrl === null ? [] : this.#packs, invalidEntries, cachedAt: this.#catalogUrl === null ? null : this.#cache?.cachedAt ?? null, stale, error }
  }

  async #fetchVerified(routes: readonly string[], limit: number, signal: AbortSignal, accept: (bytes: Uint8Array) => boolean): Promise<Uint8Array> {
    let failure: unknown
    for (const route of routes) {
      signal.throwIfAborted()
      try {
        const bytes = await this.#fetch(route, limit, signal)
        if (accept(bytes))
          return bytes
        failure = new Error('EXTENSION_DOWNLOAD_CHECKSUM_FAILED')
      }
      catch (error) {
        if (signal.aborted)
          throw error
        failure = error
      }
    }
    throw failure
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
