import type { FileTarget, LocalSpaceDirectoryPage, LocalSpaceFilePreview, SpaceDirectoryRequest, SpaceFileByteChunk, SpaceFileByteRequest, SpaceFileMutation, SpaceFileOperation, SpaceFilesChange, SpaceSaveBytes, SpaceSaveBytesResult, SpaceSaveDocument, SpaceSaveResult, SpaceTextDocument } from '../../../shared/spaces/spaceFileApi'
import type { FileAction, NativeFileEngine, NativeFileOperation } from '../files/NativeFileEngine'
import type { SpaceRepository } from '../storage/spaceRepository'
import type { ConversationFileRoots } from './ConversationFileRoots'
import type { SpaceWorkspaceDirectories } from './SpaceWorkspaceDirectories'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { BoundedFileReadError, readBoundedFile, readBoundedFileChunk } from '../../../platform/filesystem/boundedFile'
import { saveBoundedBinaryFile } from '../../../platform/filesystem/saveBoundedTextFile'
import { Emitter } from '../../../shared/events/Emitter'
import { FILE_IMAGE_PREVIEW_MAX_BYTES } from '../../../shared/files/filePreview'
import { fileMediaUrl } from '../../../shared/files/mediaPreview'
import { isSpaceWorkspaceDirectoryId } from '../../../shared/spaces/spaceApi'
import { isGrantFileTarget } from '../../../shared/spaces/spaceFileApi'
import { GrantedPathError, resolveGrantedPath } from '../directories/resolveGrantedPath'
import { readFilePreview } from '../files/readFilePreview'
import { resolveMediaPreview } from '../files/resolveMediaPreview'
import { createSensitivePathMatcher } from '../permissions/sensitivePaths'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { requireActiveSpace } from './requireActiveSpace'

export type SpaceFileChange = SpaceFilesChange

const INTERNAL_WORKSPACE_ENTRIES: ReadonlySet<string> = new Set(['.attachments'])

export class SpaceFileService {
  readonly #spaces: Pick<SpaceRepository, 'findById'>
  readonly #engine: NativeFileEngine
  readonly #workspaces: SpaceWorkspaceDirectories | undefined
  readonly #grants: ConversationFileRoots | undefined
  readonly #changes = new Emitter<SpaceFileChange>(() => console.error('SPACE_FILE_OBSERVER_FAILED'))
  readonly onDidChange = this.#changes.event
  readonly #roots = new Map<string, { target: FileTarget, directoryId: string }>()
  readonly #operations = new Map<string, FileTarget>()
  readonly #pending = new Set<Promise<unknown>>()
  readonly #binarySaves = new Map<string, Promise<SpaceSaveBytesResult>>()
  readonly #subscription: { dispose: () => void }
  #revision = 0
  #disposed = false

  constructor(spaces: Pick<SpaceRepository, 'findById'>, engine: NativeFileEngine, workspaces?: SpaceWorkspaceDirectories, grants?: ConversationFileRoots) {
    this.#spaces = spaces
    this.#engine = engine
    this.#workspaces = workspaces
    this.#grants = grants
    this.#subscription = engine.onDidChange((event) => {
      if (event.event === 'changed') {
        for (const key of event.roots) {
          const input = this.#roots.get(key)?.target
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
    const directory = this.requireDirectory(input)
    const sensitive = createSensitivePathMatcher()
    // The space's own folder also holds the app's attachment copies, which are not the user's files.
    const internal = isSpaceWorkspaceDirectoryId(directory.id) ? INTERNAL_WORKSPACE_ENTRIES : null
    return { ...result, entries: result.entries.filter(entry => !internal?.has(entry.path) && !sensitive.matches(resolve(directory.canonicalRoot, entry.path))) }
  }

  async read(input: FileTarget): Promise<LocalSpaceFilePreview> {
    const target = await this.resolve(input).catch(rethrowMissingFile)
    this.requireDirectory(input)
    const url = fileMediaUrl(input)
    const preview = await readFilePreview(target.root, target.path, { image: url, media: url }).catch(error => rethrowMissingFile(error, target.path))
    this.requireDirectory(input)
    return preview
  }

  async resolveMedia(input: FileTarget) {
    const target = await this.resolve(input).catch(rethrowMissingFile)
    const preview = await resolveMediaPreview(target.root, target.path, { imageBytesLimit: FILE_IMAGE_PREVIEW_MAX_BYTES }).catch(error => rethrowMissingFile(error, target.path))
    const current = await this.resolve(input).catch(rethrowMissingFile)
    if (current.path !== preview.path || current.root !== preview.root)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    return preview
  }

  async locate(input: FileTarget): Promise<{ path: string, kind: 'directory' | 'file' }> {
    const target = await this.resolve(input)
    const metadata = await stat(target.path)
    this.requireDirectory(input)
    if (!metadata.isDirectory() && !metadata.isFile())
      throw new BuddyServiceError('VALIDATION_FAILED')
    return { path: target.path, kind: metadata.isDirectory() ? 'directory' : 'file' }
  }

  async readDocument(input: FileTarget): Promise<SpaceTextDocument> {
    const root = await this.root(input, 'existing').catch(rethrowMissingFile)
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
    const key = JSON.stringify(isGrantFileTarget(input) ? [input.conversationId, input.root, input.path] : [input.directoryId, input.revision, input.path])
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
      await this.prepare(input)
      this.requireDirectory(input)
      this.#operations.set(input.operationId, input)
      try {
        const root = await this.root(input)
        if (input.action.kind === 'rename')
          await this.resolve({ ...input, path: input.action.destination }, 'create')
        if (input.action.kind === 'copy' || input.action.kind === 'move')
          this.requireSameRoot(input, input.action.destination)
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

  async history(input: FileTarget): Promise<SpaceFileOperation[]> {
    const records = await this.#engine.history(await this.root(input))
    return records.map(record => this.present(input, record))
  }

  async query(input: FileTarget & { operationId: string }): Promise<SpaceFileOperation | null> {
    await this.root(input)
    const record = await this.#engine.query(input.operationId)
    return record ? this.present(input, record) : null
  }

  async acknowledge(input: FileTarget & { operationId: string }): Promise<SpaceFileOperation> {
    const root = await this.root(input)
    const record = await this.#engine.acknowledge(root, input.operationId)
    await this.root(input)
    this.publish(input, input.operationId, 'changed')
    return this.present(input, record)
  }

  async cancel(input: FileTarget & { operationId: string }): Promise<null> {
    await this.prepare(input)
    this.requireDirectory(input)
    const active = this.#operations.get(input.operationId)
    if (active && this.requireDirectory(active).id === this.requireDirectory(input).id)
      return this.#engine.cancel(input.operationId)
    await this.query(input)
    return null
  }

  revoke(directoryIds: readonly string[]): void {
    for (const [key, { directoryId }] of this.#roots) {
      if (directoryIds.includes(directoryId)) {
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

  private async root(input: FileTarget, mode: 'existing' | 'create' = 'create'): Promise<string> {
    await this.prepare(input)
    const directory = this.requireDirectory(input)
    await this.resolve(input, mode)
    const key = JSON.stringify([directory.id, directory.revision])
    await this.#engine.register(key, directory.canonicalRoot, true)
    this.requireDirectory(input)
    this.#roots.set(key, { target: { ...input }, directoryId: directory.id })
    return key
  }

  private present(input: FileTarget, record: NativeFileOperation): SpaceFileOperation {
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

  private publish(input: FileTarget, operationId: string, kind: SpaceFilesChange['kind']): void {
    const revision = ++this.#revision
    this.#changes.fire(isGrantFileTarget(input)
      ? { revision, operationId, conversationId: input.conversationId, root: input.root, kind }
      : { revision, operationId, spaceId: input.spaceId, directoryId: input.directoryId, directoryRevision: input.revision, kind })
  }

  // A granted-directory target needs one asynchronous lookup (the folder's real path) before the synchronous rechecks can run.
  private async prepare(input: FileTarget): Promise<void> {
    if (isGrantFileTarget(input))
      await this.requireGrants().resolve(input.conversationId, input.root)
  }

  private requireGrants(): ConversationFileRoots {
    if (!this.#grants)
      throw new BuddyServiceError('VALIDATION_FAILED')
    return this.#grants
  }

  // Copies and moves stay inside one directory: a granted root never reaches another root, and a space target keeps its current rules.
  private requireSameRoot(source: FileTarget, destination: FileTarget): void {
    if (isGrantFileTarget(source) !== isGrantFileTarget(destination))
      throw new BuddyServiceError('VALIDATION_FAILED')
    if (isGrantFileTarget(source) && isGrantFileTarget(destination)
      && (source.conversationId !== destination.conversationId || this.requireDirectory(source).id !== this.requireDirectory(destination).id)) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
  }

  private requireDirectory(input: FileTarget): { id: string, root: string, canonicalRoot: string, revision: number, revokedAt: string | null } {
    if (isGrantFileTarget(input))
      return this.requireGrants().require(input.conversationId, input.root)
    const space = requireActiveSpace(this.#spaces.findById(input.spaceId))
    // A workspace id carries its space id, so another space's id never resolves to this space's folder.
    const workspace = isSpaceWorkspaceDirectoryId(input.directoryId) ? this.#workspaces?.get(space) ?? null : null
    const directory = [space.primaryDirectory, ...space.additionalDirectories, workspace].find(directory => directory?.id === input.directoryId)
    if (!directory || directory.revision !== input.revision || directory.revokedAt)
      throw new BuddyServiceError('VALIDATION_FAILED')
    return directory
  }

  private async byteVersion(path: string) {
    const metadata = await stat(path, { bigint: true })
    return { size: Number(metadata.size), etag: createHash('sha256').update([metadata.dev, metadata.ino, metadata.size, metadata.mtimeNs, metadata.ctimeNs].join(':')).digest('hex') }
  }

  private async resolve(input: FileTarget, mode: 'existing' | 'create' = 'existing'): Promise<{ path: string, root: string }> {
    await this.prepare(input)
    const directory = this.requireDirectory(input)
    if (isAbsolute(input.path) || input.path.includes('\\') || input.path.split('/').includes('..'))
      throw new BuddyServiceError('VALIDATION_FAILED')
    if (await realpath(directory.root) !== directory.canonicalRoot)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const requestedPath = resolve(directory.canonicalRoot, input.path)
    const target = await resolveGrantedPath([{
      canonicalRoot: directory.canonicalRoot,
      grantId: directory.id,
      kind: 'workspace',
      root: directory.root,
    }], requestedPath, mode)
    const sensitive = createSensitivePathMatcher()
    if (sensitive.matches(directory.root) || sensitive.matches(requestedPath) || sensitive.matches(target.canonicalPath))
      throw new BuddyServiceError('VALIDATION_FAILED')
    this.requireDirectory(input)
    return { path: target.canonicalPath, root: directory.canonicalRoot }
  }
}

function rethrowMissingFile(error: unknown, targetPath?: string): never {
  if (error instanceof GrantedPathError && error.code === 'PATH_NOT_FOUND')
    throw new BuddyServiceError('FILE_NOT_FOUND')
  const failure = (error instanceof BoundedFileReadError && error.code === 'BOUNDED_FILE_READ_FAILED' ? error.cause : error) as NodeJS.ErrnoException | undefined
  if (targetPath && failure?.path === targetPath && (failure.code === 'ENOENT' || failure.code === 'ENOTDIR'))
    throw new BuddyServiceError('FILE_NOT_FOUND')
  throw error
}
