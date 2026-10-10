import type { FSWatcher } from 'node:fs'
import type { LocalSkillCatalog } from '../../../shared/skills/skillApi'
import type { SkillMetadata, SkillPackageCache } from './SkillPackageCache'
import { watch } from 'node:fs'
import { basename, dirname } from 'node:path'
import { discoverSkillFiles, isWithin, requireSkillPath, SkillError } from './skillFiles'

interface SkillSource {
  root: string
  allowedRoot: string
  allowLooseFiles?: boolean
  files?: readonly string[]
}

export interface SkillSourceVersion {
  key: string
  generation: number
}

interface SourceSnapshot extends SkillSourceVersion {
  root: string
  files: readonly { path: string, skill: SkillMetadata | null }[]
  diagnostics: LocalSkillCatalog['diagnostics']
}

interface SourceEntry {
  generation: number
  cacheable: boolean
  ready: boolean
  pending: Promise<SourceSnapshot>
  watchers: Map<string, { watcher: FSWatcher, names: Set<string> | null }>
}

const MAX_CACHED_SOURCES = 64

export class SkillSourceCache {
  readonly #entries = new Map<string, SourceEntry>()
  readonly #packages: SkillPackageCache
  readonly #onChange: () => void
  #generation = 0
  #disposed = false
  #watching = true

  constructor(packages: SkillPackageCache, onChange: () => void) {
    this.#packages = packages
    this.#onChange = onChange
  }

  isCurrent(versions: readonly SkillSourceVersion[]): boolean {
    return versions.every((version) => {
      const entry = this.#entries.get(version.key)
      return entry?.generation === version.generation && entry.cacheable
    })
  }

  load(source: SkillSource): Promise<SourceSnapshot> {
    if (this.#disposed)
      return Promise.reject(new SkillError('SKILL_CHANGED'))
    const key = JSON.stringify([source.root, source.allowedRoot, source.allowLooseFiles ?? false, source.files ?? null])
    const cached = this.#entries.get(key)
    if (cached && (cached.cacheable || !cached.ready)) {
      this.#entries.delete(key)
      this.#entries.set(key, cached)
      return cached.pending
    }
    if (cached)
      this.#remove(key)
    const entry: SourceEntry = { generation: ++this.#generation, cacheable: true, ready: false, watchers: new Map(), pending: undefined! }
    this.#entries.set(key, entry)
    entry.pending = this.#read(source, key, entry).then((snapshot) => {
      if (this.#entries.get(key) !== entry)
        return this.load(source)
      entry.ready = true
      this.#trim()
      return snapshot
    }, (error) => {
      if (this.#entries.get(key) !== entry && !this.#disposed)
        return this.load(source)
      this.#remove(key)
      throw error
    })
    return entry.pending
  }

  clear() {
    for (const key of this.#entries.keys())
      this.#remove(key)
  }

  dispose() {
    this.#disposed = true
    this.clear()
  }

  stopWatching() {
    this.#watching = false
    for (const entry of this.#entries.values()) {
      for (const { watcher } of entry.watchers.values())
        watcher.close()
      entry.watchers.clear()
    }
  }

  async #read(source: SkillSource, key: string, entry: SourceEntry): Promise<SourceSnapshot> {
    const diagnostics: Array<LocalSkillCatalog['diagnostics'][number]> = []
    const snapshot: SourceSnapshot = { key, generation: entry.generation, root: source.root, files: [], diagnostics }
    await this.#watchAncestors(source.root, source.allowedRoot, key, entry)
    try {
      const root = await requireSkillPath(source.allowedRoot, source.root)
      const paths = source.files ?? await discoverSkillFiles(root, source.allowLooseFiles, path => diagnostics.push({ code: 'SKILL_PATH_OUTSIDE_SOURCE', message: 'Skill source is outside the allowed folder or cannot be read.', path }), path => this.#watch(path, null, key, entry))
      for (const path of paths) {
        if (source.files) {
          await this.#watchAncestors(path, root, key, entry)
        }
        else if (basename(path) === 'SKILL.md') {
          const watched = entry.watchers.get(dirname(path))
          if (watched)
            watched.names = new Set(['SKILL.md', basename(dirname(path))])
        }
      }
      const loaded = await this.#packages.loadMetadataBatch(paths, root)
      const files = loaded.map((result, index) => {
        const path = paths[index]!
        if (result.status === 'rejected') {
          return { path, skill: null }
        }
        this.#watch(dirname(result.value.path), new Set([basename(result.value.path)]), key, entry)
        return { path, skill: result.value }
      })
      return { ...snapshot, root, files }
    }
    catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
        diagnostics.push({ code: error instanceof SkillError ? 'SKILL_PATH_OUTSIDE_SOURCE' : 'SKILL_SOURCE_UNREADABLE', message: 'A skill source could not be read within its allowed directory.', path: source.root })
        entry.cacheable = false
      }
      return snapshot
    }
  }

  async #watchAncestors(path: string, allowedRoot: string, key: string, entry: SourceEntry) {
    let child = path
    while (isWithin(allowedRoot, child)) {
      const parent = dirname(child)
      if (parent === child)
        break
      try {
        const canonical = child === allowedRoot ? parent : await requireSkillPath(allowedRoot, parent)
        this.#watch(canonical, new Set([basename(child)]), key, entry)
      }
      catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
          entry.cacheable = false
      }
      child = parent
    }
  }

  #watch(path: string, names: Set<string> | null, key: string, entry: SourceEntry) {
    if (!this.#watching || this.#entries.get(key) !== entry)
      return
    const existing = entry.watchers.get(path)
    if (existing) {
      existing.names = existing.names && names ? new Set([...existing.names, ...names]) : null
      return
    }
    try {
      const watcher = watch(path, { persistent: false }, (_event, filename) => {
        const filter = entry.watchers.get(path)?.names
        if (!filename || !filter || filter.has(filename.toString()))
          this.#changed(key, entry)
      })
      watcher.on('error', () => {
        entry.cacheable = false
        watcher.close()
      })
      entry.watchers.set(path, { watcher, names })
    }
    catch {
      entry.cacheable = false
    }
  }

  #changed(key: string, entry: SourceEntry) {
    if (this.#entries.get(key) !== entry)
      return
    this.#remove(key)
    this.#onChange()
  }

  #remove(key: string) {
    const entry = this.#entries.get(key)
    this.#entries.delete(key)
    for (const { watcher } of entry?.watchers.values() ?? [])
      watcher.close()
  }

  #trim() {
    for (const [key, entry] of this.#entries) {
      if (this.#entries.size <= MAX_CACHED_SOURCES)
        break
      if (entry.ready)
        this.#remove(key)
    }
  }
}
