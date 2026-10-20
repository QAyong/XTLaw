import type { LocalSpaceDirectoryPage, LocalSpaceFilePreview, SpaceDirectoryRequest, SpaceFileByteChunk, SpaceFileByteRequest, SpaceFileMutation, SpaceFileOperation, SpaceFilesChange, SpaceFileTarget, SpaceSaveBytes, SpaceSaveBytesResult, SpaceSaveDocument, SpaceSaveResult, SpaceTextDocument } from '../../../shared/spaces/spaceFileApi'
import type { FileAction, NativeFileEngine, NativeFileOperation } from '../files/NativeFileEngine'
import type { SpaceRepository } from '../storage/spaceRepository'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { readBoundedFile, readBoundedFileChunk } from '../../../platform/filesystem/boundedFile'
import { saveBoundedBinaryFile } from '../../../platform/filesystem/saveBoundedTextFile'
import { Emitter } from '../../../shared/events/Emitter'
import { mediaKindOf } from '../../../shared/files/mediaFiles'
import { resolveGrantedPath } from '../directories/resolveGrantedPath'
import { readFilePreview } from '../files/readFilePreview'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { requireActiveSpace } from './requireActiveSpace'

export type SpaceFileChange = SpaceFilesChange

export class SpaceFileService {
  readonly #spaces: Pick<SpaceRepository, 'findById'>
  readonly #engine: NativeFileEngine
  readonly #changes = new Emitter<SpaceFileChange>(() => console.error('SPACE_FILE_OBSERVER_FAILED'))
  readonly onDidChange = this.#changes.event
  readonly #roots = new Map<string, SpaceFileTarget>()
  readonly #operations = new Map<string, SpaceFileTarget>()
  readonly #pending = new Set<Promise<unknown>>()
  readonly #binarySaves = new Map<string, Promise<SpaceSaveBytesResult>>()
  readonly #subscription: { dispose: () => void }
  #revision = 0
  #disposed = false

  constructor(spaces: Pick<SpaceRepository, 'findById'>, engine: NativeFileEngine) {
    this.#spaces = spaces
    this.#engine = engine
    this.#subscription = engine.onDidChange((event) => {
      if (event.event === 'changed') {
        for (const key of event.roots) {
          const input = this.#roots.get(key)
          if (!input)
            continue
          try {
            this.requireDirectory(input)
            this.publish(input, '', 'changed')
          }
          catch { void engine.revoke(key).catch(() => {}) }
        }
      }
    })
  }

  async list(input: SpaceDirectoryRequest): Promise<LocalSpaceDirectoryPage> {
    const root = await this.root(input)
    const result = await this.#engine.list(root, input.path, input.cursor)
    this.requireDirectory(input)
    return result
  }

  async read(input: SpaceFileTarget): Promise<LocalSpaceFilePreview> {
    const target = await this.resolve(input).catch(rethrowMissingFile)
    this.requireDirectory(input)
    const media = mediaKindOf(target.path)
    if (media) {
      // Audio and video are streamed by the media protocol, so the size limits that apply to inline previews do not.
      const metadata = await stat(target.path).catch(rethrowMissingFile)
      if (!metadata.isFile())
        throw new BuddyServiceError('VALIDATION_FAILED')
      this.requireDirectory(input)
      return { kind: media, sizeBytes: metadata.size, text: null, imageUrl: null }
    }
    const preview = await readFilePreview(target.root, target.path).catch(rethrowMissingFile)
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
    const root = await this.root(input)
    const result = await this.#engine.read(root, input.path)
    this.requireDirectory(input)
    if (Buffer.byteLength(result.text) > 1024 * 1024)
      throw new BuddyServiceError('VALIDATION_FAILED')
    return { text: result.text, etag: result.etag }
  }

  async readBytes(input: SpaceFileByteRequest, signal?: AbortSignal): Promise<SpaceFileByteChunk> {
    signal?.throwIfAborted()
    if (this.#disposed)
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
    input = { ...input }
    const key = JSON.stringify([input.directoryId, input.revision, input.path])
    const previous = this.#binarySaves.get(key) ?? Promise.resolve()
    const save = previous.catch(() => {}).then(() => this.track(async (): Promise<SpaceSaveBytesResult> => {
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
      this.publish(input, randomUUID(), status)
      this.requireDirectory(input)
      if (status === 'conflict')
        return { status }
      const saved = await this.byteVersion(target.path)
      const bytes = await readBoundedFile(target.root, target.path, 64 * 1024 * 1024, signal)
      this.requireDirectory(input)
      if (!bytes.equals(content) || (await this.byteVersion(target.path)).etag !== saved.etag)
        return { status: 'conflict' }
      return { status, etag: saved.etag }
    })).finally(() => {
      if (this.#binarySaves.get(key) === save)
        this.#binarySaves.delete(key)
    })
    this.#binarySaves.set(key, save)
    return save
  }

  saveDocument(input: SpaceSaveDocument): Promise<SpaceSaveResult> {
    return this.track(async () => {
      if (Buffer.byteLength(input.text) > 1024 * 1024)
        throw new BuddyServiceError('VALIDATION_FAILED')
      const root = await this.root(input)
      let result: NativeFileOperation
      try {
        result = await this.#engine.mutate({ root, path: input.path, operationId: input.operationId, action: { kind: 'write', text: input.text, expected: input.etag } })
      }
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'FILE_CONFLICT')
          throw error
        this.publish(input, input.operationId, 'conflict')
        return { status: 'conflict', document: await this.readDocument(input) }
      }
      this.requireDirectory(input)
      if (result.status === 'not-applied' && result.error === 'FILE_CONFLICT')
        return { status: 'conflict', document: await this.readDocument(input) }
      if (result.status !== 'applied' || typeof result.receipt?.etag !== 'string')
        throw new Error(result.error ?? 'FILE_RECOVERY_REQUIRED')
      this.publish(input, input.operationId, 'saved')
      try {
        this.requireDirectory(input)
      }
      catch (error) {
        this.publish(input, input.operationId, 'response-denied')
        throw error
      }
      return { status: 'saved', document: { text: input.text, etag: result.receipt.etag } }
    })
  }

  mutate(input: SpaceFileMutation): Promise<SpaceFileOperation> {
    return this.track(async () => {
      this.requireDirectory(input)
      this.#operations.set(input.operationId, input)
      try {
        const root = await this.root(input)
        const action: FileAction = input.action.kind === 'copy' || input.action.kind === 'move'
          ? { kind: input.action.kind, destinationRoot: await this.root(input.action.destination), destination: input.action.destination.path }
          : input.action
        if (action.kind === 'restore') {
          const original = await this.query({ ...input, operationId: action.originalOperationId })
          if (!original?.restorable || original.path !== input.path)
            throw new Error('FILE_INVALID_REQUEST')
        }
        const record = await this.#engine.mutate({ root, path: input.path, operationId: input.operationId, action })
        this.requireDirectory(input)
        if (input.action.kind === 'copy' || input.action.kind === 'move')
          this.requireDirectory(input.action.destination)
        this.publish(input, input.operationId, 'changed')
        return this.present(input, record)
      }
      finally { this.#operations.delete(input.operationId) }
    })
  }

  async history(input: SpaceFileTarget): Promise<SpaceFileOperation[]> {
    const records = await this.#engine.history(await this.root(input))
    return records.map(record => this.present(input, record))
  }

  async query(input: SpaceFileTarget & { operationId: string }): Promise<SpaceFileOperation | null> {
    await this.root(input)
    const record = await this.#engine.query(input.operationId)
    return record ? this.present(input, record) : null
  }

  async acknowledge(input: SpaceFileTarget & { operationId: string }): Promise<SpaceFileOperation> {
    const root = await this.root(input)
    const record = await this.#engine.acknowledge(root, input.operationId)
    await this.root(input)
    this.publish(input, input.operationId, 'changed')
    return this.present(input, record)
  }

  async cancel(input: SpaceFileTarget & { operationId: string }): Promise<null> {
    this.requireDirectory(input)
    const active = this.#operations.get(input.operationId)
    if (active && active.spaceId === input.spaceId && active.directoryId === input.directoryId && active.revision === input.revision)
      return this.#engine.cancel(input.operationId)
    await this.query(input)
    return null
  }

  revoke(directoryIds: readonly string[]): void {
    for (const [key, input] of this.#roots) {
      if (directoryIds.includes(input.directoryId)) {
        void this.#engine.revoke(key).catch(() => {})
        this.#roots.delete(key)
      }
    }
  }

  async dispose(): Promise<void> {
    this.#disposed = true
    await Promise.allSettled([...this.#pending, ...this.#binarySaves.values()])
    this.#subscription.dispose()
    this.#changes.dispose()
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#disposed)
      return Promise.reject(new Error('SPACE_FILES_STOPPED'))
    const pending = operation().finally(() => this.#pending.delete(pending))
    this.#pending.add(pending)
    return pending
  }

  private async root(input: SpaceFileTarget): Promise<string> {
    const directory = this.requireDirectory(input)
    const key = JSON.stringify([directory.id, directory.revision])
    await this.#engine.register(key, directory.canonicalRoot, true)
    this.requireDirectory(input)
    this.#roots.set(key, { ...input })
    return key
  }

  private present(input: SpaceFileTarget, record: NativeFileOperation): SpaceFileOperation {
    const directory = this.requireDirectory(input)
    const within = (path: string | null) => {
      if (path === null)
        return null
      const result = relative(directory.canonicalRoot, path)
      return isAbsolute(result) || result === '..' || result.startsWith(`..${sep}`) ? null : result.split(sep).join('/')
    }
    const path = within(record.source)
    const destination = within(record.destination)
    if (path === null && destination === null)
      throw new Error('FILE_PERMISSION_REVOKED')
    return { operationId: record.operationId, kind: record.kind, path, destination, status: record.status, error: record.error, createdAt: record.createdAt, updatedAt: record.updatedAt, temporaryPath: typeof record.receipt?.staging === 'string' ? within(record.receipt.staging) : null, restorable: record.kind === 'trash' && record.status === 'applied' && !!record.receipt && !record.receipt.restoredBy }
  }

  private publish(input: SpaceFileTarget, operationId: string, kind: SpaceFilesChange['kind']): void {
    this.#changes.fire({ revision: ++this.#revision, operationId, spaceId: input.spaceId, directoryId: input.directoryId, directoryRevision: input.revision, kind })
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

// A file moved or deleted after it was listed is reported on its own, so the preview can say so.
function rethrowMissingFile(error: unknown): never {
  for (let current = error, depth = 0; current && typeof current === 'object' && depth < 5; current = (current as { cause?: unknown }).cause, depth++) {
    const code = (current as { code?: unknown }).code
    if (code === 'ENOENT' || code === 'PATH_NOT_FOUND')
      throw new BuddyServiceError('FILE_NOT_FOUND')
  }
  throw error
}
