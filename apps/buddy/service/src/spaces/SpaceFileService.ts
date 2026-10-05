import type { BoundedEntryMutation, BoundedEntryMutationResult } from '../../../platform/filesystem/mutateBoundedEntry'
import type { LocalSpaceDirectoryPage, LocalSpaceFileEntry, LocalSpaceFilePreview, SpaceDirectoryRequest, SpaceFileByteChunk, SpaceFileByteRequest, SpaceFileMutation, SpaceFileMutationResult, SpaceFileTarget, SpaceSaveBytes, SpaceSaveBytesResult, SpaceSaveDocument, SpaceSaveResult, SpaceTextDocument } from '../../../shared/spaces/spaceFileApi'
import type { SpaceRepository } from '../storage/spaceRepository'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { readBoundedFile, readBoundedFileChunk } from '../../../platform/filesystem/boundedFile'
import { mutateBoundedEntry } from '../../../platform/filesystem/mutateBoundedEntry'
import { saveBoundedBinaryFile, saveBoundedTextFile } from '../../../platform/filesystem/saveBoundedTextFile'
import { Emitter } from '../../../shared/events/Emitter'
import { validSpaceFileName } from '../../../shared/spaces/spaceFileNames'
import { resolveGrantedPath } from '../directories/resolveGrantedPath'
import { readFilePreview } from '../files/readFilePreview'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { requireActiveSpace } from './requireActiveSpace'

export interface SpaceFileChange {
  readonly revision: number
  readonly operationId: string
  readonly spaceId: string
  readonly directoryId: string
  readonly directoryRevision: number
  readonly kind: 'saved' | 'conflict' | 'response-denied' | 'mutated'
}

export class SpaceFileService {
  readonly #spaces: Pick<SpaceRepository, 'findById'>
  readonly #changes = new Emitter<SpaceFileChange>(() => console.error('SPACE_FILE_OBSERVER_FAILED'))
  readonly onDidChange = this.#changes.event
  #revision = 0
  #disposed = false
  readonly #saves = new Map<string, Promise<SpaceSaveResult>>()
  readonly #binarySaves = new Map<string, Promise<SpaceSaveBytesResult>>()
  readonly #mutations = new Map<string, Promise<SpaceFileMutationResult>>()

  readonly #mutateEntry: (input: BoundedEntryMutation, beforeCommit: () => void) => Promise<BoundedEntryMutationResult>

  constructor(spaces: Pick<SpaceRepository, 'findById'>, mutateEntry: (input: BoundedEntryMutation, beforeCommit: () => void) => Promise<BoundedEntryMutationResult> = mutateBoundedEntry) {
    this.#spaces = spaces
    this.#mutateEntry = mutateEntry
  }

  mutate(input: SpaceFileMutation): Promise<SpaceFileMutationResult> {
    input = { ...input }
    const directory = this.requireDirectory(input)
    if (this.#disposed || this.#mutations.has(directory.id) || [...this.#saves.keys(), ...this.#binarySaves.keys()].some(key => JSON.parse(key)[0] === directory.id))
      return Promise.resolve({ status: 'failed', reason: 'busy' })
    const creating = input.operation === 'create-file' || input.operation === 'create-directory'
    if (isAbsolute(input.path) || input.path.includes('\\') || input.path.split('/').some(part => part === '.' || part === '..' || (!part && input.path !== '')) || (!creating && !input.path))
      return Promise.resolve({ status: 'failed', reason: 'unsafe-path' })
    if (input.operation !== 'trash' && !validSpaceFileName(input.name, process.platform === 'win32'))
      return Promise.resolve({ status: 'failed', reason: 'invalid-name' })
    const oldName = input.path.split('/').at(-1)!
    if (input.operation === 'rename' && oldName !== input.name && oldName.toLowerCase() === input.name.toLowerCase())
      return Promise.resolve({ status: 'failed', reason: 'case-only' })
    const operation = Promise.resolve().then(async (): Promise<SpaceFileMutationResult> => {
      this.requireDirectory(input)
      // Pass the lexical path, NOT a realpath that would hide a link ancestor from the helper.
      const result = await this.#mutateEntry({ root: directory.canonicalRoot, path: resolve(directory.canonicalRoot, input.path), operation: input.operation, ...('name' in input ? { name: input.name } : {}) }, () => this.requireDirectory(input))
      if (result.status === 'failed')
        return result
      this.#changes.fire(Object.freeze({ revision: ++this.#revision, operationId: randomUUID(), spaceId: input.spaceId, directoryId: input.directoryId, directoryRevision: input.revision, kind: 'mutated' }))
      try {
        this.requireDirectory(input)
      }
      catch {
        return { status: 'failed', reason: 'result-unknown' }
      }
      const parent = input.path.includes('/') ? input.path.slice(0, input.path.lastIndexOf('/')) : ''
      const path = creating
        ? [input.path, 'name' in input ? input.name : ''].filter(Boolean).join('/')
        : input.operation === 'rename' ? [parent, input.name].filter(Boolean).join('/') : parent
      return { status: 'completed', path, kind: result.kind }
    }).finally(() => this.#mutations.delete(directory.id))
    this.#mutations.set(directory.id, operation)
    return operation
  }

  async list(input: SpaceDirectoryRequest): Promise<LocalSpaceDirectoryPage> {
    const target = await this.resolve(input)
    const entries = (await readdir(target.path, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() || entry.isFile() || entry.isSymbolicLink())
      .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
    const cursorIndex = input.cursor ? entries.findIndex(entry => entry.name === input.cursor) : -1
    const page = entries.slice(cursorIndex + 1, cursorIndex + 251)
    const result: LocalSpaceFileEntry[] = await Promise.all(page.map(async (entry) => {
      const path = input.path ? `${input.path}/${entry.name}` : entry.name
      let kind: 'directory' | 'file' = entry.isDirectory() ? 'directory' : 'file'
      let unavailable = false
      if (entry.isSymbolicLink()) {
        try {
          const resolved = await this.resolve({ ...input, path })
          kind = (await stat(resolved.path)).isDirectory() ? 'directory' : 'file'
        }
        catch {
          unavailable = true
        }
      }
      return { name: entry.name, path, kind, unavailable, writable: !entry.isSymbolicLink() && !unavailable }
    }))
    this.requireDirectory(input)
    return { entries: result, nextCursor: cursorIndex + 1 + page.length < entries.length ? page.at(-1)?.name ?? null : null }
  }

  async read(input: SpaceFileTarget): Promise<LocalSpaceFilePreview> {
    const target = await this.resolve(input)
    this.requireDirectory(input)
    const preview = await readFilePreview(target.root, target.path)
    this.requireDirectory(input)
    return preview
  }

  async locate(input: SpaceFileTarget): Promise<{ path: string, kind: 'directory' | 'file' }> {
    const target = await this.resolve(input)
    const metadata = await stat(target.path)
    this.requireDirectory(input)
    if (!metadata.isDirectory() && !metadata.isFile())
      throw new BuddyServiceError('VALIDATION_FAILED')
    return { path: target.path, kind: metadata.isDirectory() ? 'directory' : 'file' }
  }

  async readDocument(input: SpaceFileTarget): Promise<SpaceTextDocument> {
    if (this.#mutations.has(input.directoryId))
      throw new BuddyServiceError('VALIDATION_FAILED')
    const target = await this.resolve(input)
    const bytes = await readBoundedFile(target.root, target.path, 1024 * 1024)
    this.requireDirectory(input)
    if (bytes.includes(0))
      throw new BuddyServiceError('VALIDATION_FAILED')
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    return { text, etag: createHash('sha256').update(bytes).digest('hex') }
  }

  async readBytes(input: SpaceFileByteRequest, signal?: AbortSignal): Promise<SpaceFileByteChunk> {
    signal?.throwIfAborted()
    if (this.#disposed || this.#mutations.has(input.directoryId))
      throw new BuddyServiceError('VALIDATION_FAILED')
    const target = await this.resolve(input)
    const before = await this.byteVersion(target.path)
    if (input.etag && input.etag !== before.etag)
      throw new Error('EXTENSION_RESOURCE_CHANGED')
    const chunk = await readBoundedFileChunk(target.root, target.path, input.offset, input.length, signal)
    const after = await this.byteVersion(target.path)
    signal?.throwIfAborted()
    this.requireDirectory(input)
    if (before.etag !== after.etag || chunk.size !== before.size)
      throw new Error('EXTENSION_RESOURCE_CHANGED')
    return { ...chunk, etag: before.etag }
  }

  saveBytes(input: SpaceSaveBytes, signal?: AbortSignal): Promise<SpaceSaveBytesResult> {
    if (this.#disposed || this.#mutations.has(input.directoryId))
      return Promise.reject(new Error('SPACE_FILES_STOPPED'))
    input = { ...input }
    const key = JSON.stringify([input.directoryId, input.revision, input.path])
    const previous = this.#binarySaves.get(key) ?? Promise.resolve()
    const save = previous.catch(() => {}).then(async (): Promise<SpaceSaveBytesResult> => {
      signal?.throwIfAborted()
      const target = await this.resolve(input)
      const before = await this.byteVersion(target.path)
      if (before.etag !== input.etag)
        return { status: 'conflict' }
      const expected = await readBoundedFile(target.root, target.path, 64 * 1024 * 1024, signal)
      if ((await this.byteVersion(target.path)).etag !== before.etag || createHash('sha256').update(expected).digest('hex') !== input.expectedHash)
        return { status: 'conflict' }
      const content = Buffer.from(input.base64, 'base64')
      if (content.length > 64 * 1024 * 1024 || content.toString('base64') !== input.base64)
        throw new BuddyServiceError('VALIDATION_FAILED')
      this.requireDirectory(input)
      signal?.throwIfAborted()
      const status = await saveBoundedBinaryFile({ ...target, expected, content }, signal)
      this.#changes.fire(Object.freeze({ revision: ++this.#revision, operationId: randomUUID(), spaceId: input.spaceId, directoryId: input.directoryId, directoryRevision: input.revision, kind: status }))
      this.requireDirectory(input)
      if (status === 'conflict')
        return { status }
      const saved = await this.byteVersion(target.path)
      const bytes = await readBoundedFile(target.root, target.path, 64 * 1024 * 1024, signal)
      this.requireDirectory(input)
      if (!bytes.equals(content) || (await this.byteVersion(target.path)).etag !== saved.etag)
        return { status: 'conflict' }
      return { status, etag: saved.etag }
    }).finally(() => {
      if (this.#binarySaves.get(key) === save)
        this.#binarySaves.delete(key)
    })
    this.#binarySaves.set(key, save)
    return save
  }

  saveDocument(input: SpaceSaveDocument): Promise<SpaceSaveResult> {
    if (this.#disposed || this.#mutations.has(input.directoryId))
      return Promise.reject(new Error('SPACE_FILES_STOPPED'))
    input = { ...input }
    const operationId = randomUUID()
    const publish = (kind: SpaceFileChange['kind']) => this.#changes.fire(Object.freeze({ revision: ++this.#revision, operationId, spaceId: input.spaceId, directoryId: input.directoryId, directoryRevision: input.revision, kind }))
    const key = JSON.stringify([input.directoryId, input.revision, input.path])
    const previous = this.#saves.get(key) ?? Promise.resolve()
    const save = previous.catch(() => {}).then(async (): Promise<SpaceSaveResult> => {
      const target = await this.resolve(input)
      const current = await this.readDocument(input)
      if (current.etag !== input.etag) {
        publish('conflict')
        return { status: 'conflict', document: current }
      }
      this.requireDirectory(input)
      const status = await saveBoundedTextFile({ ...target, expected: current.text, content: input.text })
      publish(status)
      try {
        this.requireDirectory(input)
      }
      catch (error) {
        publish('response-denied')
        throw error
      }
      return status === 'saved'
        ? { status, document: { text: input.text, etag: createHash('sha256').update(input.text).digest('hex') } }
        : { status, document: await this.readDocument(input) }
    }).finally(() => {
      if (this.#saves.get(key) === save)
        this.#saves.delete(key)
    })
    this.#saves.set(key, save)
    return save
  }

  async dispose(): Promise<void> {
    this.#disposed = true
    await Promise.allSettled([...this.#saves.values(), ...this.#binarySaves.values(), ...this.#mutations.values()])
    this.#changes.dispose()
  }

  private requireDirectory(input: SpaceFileTarget) {
    const space = requireActiveSpace(this.#spaces.findById(input.spaceId))
    const directory = space.primaryDirectory
    if (!directory || directory.id !== input.directoryId || directory.revision !== input.revision || directory.revokedAt)
      throw new BuddyServiceError('VALIDATION_FAILED')
    return directory
  }

  private async byteVersion(path: string) {
    const metadata = await stat(path, { bigint: true })
    return { size: Number(metadata.size), etag: createHash('sha256').update([metadata.dev, metadata.ino, metadata.size, metadata.mtimeNs, metadata.ctimeNs].join(':')).digest('hex') }
  }

  private async resolve(input: SpaceFileTarget): Promise<{ path: string, root: string }> {
    const directory = this.requireDirectory(input)
    if (isAbsolute(input.path) || input.path.includes('\\') || input.path.split('/').includes('..'))
      throw new BuddyServiceError('VALIDATION_FAILED')
    const target = await resolveGrantedPath([{
      canonicalRoot: directory.canonicalRoot,
      grantId: directory.id,
      kind: 'workspace',
      root: directory.root,
    }], resolve(directory.canonicalRoot, input.path), 'existing')
    this.requireDirectory(input)
    return { path: target.canonicalPath, root: directory.canonicalRoot }
  }
}
