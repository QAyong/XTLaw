import type { BigIntStats } from 'node:fs'
import type { EventSnapshot } from '../../../shared/events/eventTypes'
import type { LoadedSkill } from './skillFiles'
import { createHash } from 'node:crypto'
import { lstat, readdir } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { readNativeBoundedFiles } from '../../../platform/filesystem/nativeBoundedFile'
import { copyEventSnapshot } from '../../../shared/events/eventSnapshot'
import { MAX_SKILL_BYTES, MAX_SKILL_FILES, MAX_SKILL_PACKAGE_BYTES, parseSkillDocument, readSkill, readSkillDocument, requireSkillPath, SkillError } from './skillFiles'

export type ResolvedSkill = EventSnapshot<Omit<LoadedSkill, 'files' | 'modes'>>
export type SkillMetadata = Pick<ResolvedSkill, 'name' | 'description' | 'path' | 'baseDirectory' | 'referenceRevision' | 'revision' | 'manualOnly'>

interface CachedPackage {
  signature: string
  skill: ResolvedSkill
}

const MAX_CACHED_PACKAGES = 256

export class SkillPackageCache {
  readonly #packages = new Map<string, CachedPackage>()
  readonly #documents = new Map<string, CachedPackage>()
  readonly #pending = new Map<string, Promise<ResolvedSkill>>()
  #generation = 0

  async load(filePath: string, allowedRoot: string): Promise<ResolvedSkill> {
    const generation = this.#generation
    const path = await requireSkillPath(allowedRoot, filePath)
    this.#assertGeneration(generation)
    const pending = this.#pending.get(path)
    if (pending)
      return pending
    const loading = this.#load(path, allowedRoot, generation).finally(() => {
      if (this.#pending.get(path) === loading)
        this.#pending.delete(path)
    })
    this.#pending.set(path, loading)
    return loading
  }

  async loadMetadata(filePath: string, allowedRoot: string): Promise<ResolvedSkill> {
    const generation = this.#generation
    const path = await requireSkillPath(allowedRoot, filePath)
    const signature = fileSignature(path, await lstat(path, { bigint: true }))
    this.#assertGeneration(generation)
    const cached = this.#documents.get(path)
    if (cached?.signature === signature) {
      this.#documents.delete(path)
      this.#documents.set(path, cached)
      return cached.skill
    }
    this.#documents.delete(path)
    const document = await readSkillDocument(path, allowedRoot)
    if (!document.description)
      throw new SkillError('SKILL_INVALID')
    if (fileSignature(path, await lstat(path, { bigint: true })) !== signature)
      throw new SkillError('SKILL_CHANGED')
    this.#assertGeneration(generation)
    const skill = copyEventSnapshot({ ...document, revision: document.referenceRevision })
    this.#documents.set(path, { signature, skill })
    while (this.#documents.size > MAX_CACHED_PACKAGES)
      this.#documents.delete(this.#documents.keys().next().value!)
    return skill
  }

  async loadMetadataBatch(filePaths: readonly string[], allowedRoot: string): Promise<PromiseSettledResult<SkillMetadata>[]> {
    const generation = this.#generation
    const results: PromiseSettledResult<SkillMetadata>[] = []
    for (let offset = 0; offset < filePaths.length; offset += 64) {
      const inspected = await Promise.allSettled(filePaths.slice(offset, offset + 64).map(async (filePath) => {
        const path = await requireSkillPath(allowedRoot, filePath)
        const metadata = await lstat(path, { bigint: true })
        if (!metadata.isFile() || metadata.size > BigInt(MAX_SKILL_BYTES))
          throw new SkillError('SKILL_INVALID')
        return { path, signature: fileSignature(path, metadata) }
      }))
      this.#assertGeneration(generation)
      const requests = inspected.flatMap(result => result.status === 'fulfilled' ? [{ root: allowedRoot, path: result.value.path, maxBytes: MAX_SKILL_BYTES }] : [])
      const contents = await readNativeBoundedFiles(requests)
      let index = 0
      const parsed = await Promise.allSettled(inspected.map(async (result) => {
        if (result.status === 'rejected')
          throw result.reason
        const content = contents[index++]!
        if (content.status === 'rejected')
          throw content.reason
        const { path, signature } = result.value
        if (fileSignature(path, await lstat(path, { bigint: true })) !== signature)
          throw new SkillError('SKILL_CHANGED')
        const document = parseSkillDocument(path, content.value)
        if (!document.description)
          throw new SkillError('SKILL_INVALID')
        return copyEventSnapshot({ name: document.name, description: document.description, path: document.path, baseDirectory: document.baseDirectory, referenceRevision: document.referenceRevision, revision: document.referenceRevision, manualOnly: document.manualOnly })
      }))
      this.#assertGeneration(generation)
      results.push(...parsed)
    }
    return results
  }

  clear() {
    this.#generation++
    this.#packages.clear()
    this.#documents.clear()
    this.#pending.clear()
  }

  async #load(path: string, allowedRoot: string, generation: number): Promise<ResolvedSkill> {
    const signature = await inspectPackage(path)
    this.#assertGeneration(generation)
    const cached = this.#packages.get(path)
    if (cached?.signature === signature) {
      this.#packages.delete(path)
      this.#packages.set(path, cached)
      return cached.skill
    }
    this.#packages.delete(path)
    const { files: _files, modes: _modes, ...loaded } = await readSkill(path, allowedRoot)
    if (await inspectPackage(path) !== signature)
      throw new SkillError('SKILL_CHANGED')
    this.#assertGeneration(generation)
    const skill = copyEventSnapshot(loaded)
    this.#packages.set(path, { signature, skill })
    while (this.#packages.size > MAX_CACHED_PACKAGES)
      this.#packages.delete(this.#packages.keys().next().value!)
    return skill
  }

  #assertGeneration(generation: number): void {
    if (generation !== this.#generation)
      throw new SkillError('SKILL_CHANGED')
  }
}

async function inspectPackage(path: string): Promise<string> {
  const document = await lstat(path, { bigint: true })
  if (!document.isFile())
    throw new SkillError('SKILL_INVALID')
  if (document.size > BigInt(MAX_SKILL_BYTES))
    throw new SkillError('SKILL_TOO_LARGE')
  const hash = createHash('sha256')
  const root = dirname(path)
  hash.update(fileSignature(basename(path), document))
  if (basename(path) !== 'SKILL.md')
    return hash.digest('hex')
  let entries = 0
  let files = 0
  let bytes = 0n
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > 16)
      throw new SkillError('SKILL_TOO_LARGE')
    const metadata = await lstat(directory, { bigint: true })
    if (!metadata.isDirectory())
      throw new SkillError('SKILL_INVALID')
    hash.update(fileSignature(relative(root, directory), metadata))
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git')
        continue
      if (++entries > MAX_SKILL_FILES)
        throw new SkillError('SKILL_TOO_LARGE')
      const target = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(target, depth + 1)
        continue
      }
      const metadata = await lstat(target, { bigint: true })
      if (!entry.isFile() || !metadata.isFile())
        throw new SkillError('SKILL_INVALID')
      bytes += metadata.size
      if (bytes > BigInt(MAX_SKILL_PACKAGE_BYTES) || ++files > MAX_SKILL_FILES)
        throw new SkillError('SKILL_TOO_LARGE')
      hash.update(fileSignature(relative(root, target), metadata))
    }
  }
  await visit(root, 0)
  return hash.digest('hex')
}

function fileSignature(path: string, metadata: BigIntStats): string {
  return JSON.stringify([path, ...[
    metadata.dev,
    metadata.ino,
    metadata.mode,
    metadata.size,
    metadata.mtimeNs,
    metadata.ctimeNs,
  ].map(value => value.toString())])
}
