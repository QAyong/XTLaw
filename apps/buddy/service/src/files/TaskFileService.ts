import type { TaskFile, TaskFileLink, TaskFileTarget } from '../../../shared/files/taskFileApi'
import type { TaskFileAccess } from './TaskFileAccess'
import { stat } from 'node:fs/promises'
import { basename, relative, sep } from 'node:path'
import { inferFileMimeType } from '../../../shared/files/fileMimeTypes'
import { FILE_IMAGE_PREVIEW_MAX_BYTES } from '../../../shared/files/filePreview'
import { GrantedPathError } from '../directories/resolveGrantedPath'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { resolveMediaPreview } from './resolveMediaPreview'

export class TaskFileService {
  private readonly access: TaskFileAccess

  constructor(access: TaskFileAccess) {
    this.access = access
  }

  resolve(link: TaskFileLink): Promise<TaskFile> {
    return withFileErrors(async () => {
      const location = await this.access.resolveLink(link.conversationId, link.href)
      const metadata = await stat(location.path)
      if (!metadata.isFile() && !metadata.isDirectory())
        throw new BuddyServiceError('VALIDATION_FAILED')
      const target = { conversationId: link.conversationId, path: location.path }
      await this.revalidate(target, location)
      return {
        target,
        root: location.root,
        relativePath: relative(location.root, location.path).split(sep).join('/'),
        name: basename(location.path) || location.path,
        kind: metadata.isDirectory() ? 'directory' : 'file',
        mimeType: metadata.isDirectory() ? 'inode/directory' : inferFileMimeType(location.path),
        sizeBytes: metadata.size,
        updatedAt: metadata.mtime.toISOString(),
      }
    })
  }

  locate(target: TaskFileTarget): Promise<{ path: string, kind: 'file' | 'directory' }> {
    return this.withTarget(target, async (location) => {
      const metadata = await stat(location.path)
      if (!metadata.isFile() && !metadata.isDirectory())
        throw new BuddyServiceError('VALIDATION_FAILED')
      return { path: location.path, kind: metadata.isDirectory() ? 'directory' : 'file' }
    })
  }

  resolveMedia(target: TaskFileTarget) {
    return this.withTarget(target, location => resolveMediaPreview(location.root, location.path, {
      imageBytesLimit: FILE_IMAGE_PREVIEW_MAX_BYTES,
    }))
  }

  resolveBrowser(target: TaskFileTarget) {
    return this.withTarget(target, async (location) => {
      if (inferFileMimeType(location.path) !== 'text/html' || !(await stat(location.path)).isFile())
        throw new BuddyServiceError('VALIDATION_FAILED')
      return { entryPath: location.path, rootPath: location.root }
    })
  }

  private withTarget<T>(target: TaskFileTarget, action: (location: { root: string, path: string }) => Promise<T>): Promise<T> {
    return withFileErrors(async () => {
      const location = await this.access.resolve(target)
      const result = await action(location)
      await this.revalidate(target, location)
      return result
    })
  }

  private async revalidate(target: TaskFileTarget, location: { root: string, path: string }) {
    const current = await this.access.resolve(target)
    if (current.root !== location.root || current.path !== location.path)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
  }
}

async function withFileErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  }
  catch (error) {
    if (error instanceof GrantedPathError && error.code === 'PATH_NOT_FOUND')
      throw new BuddyServiceError('FILE_NOT_FOUND')
    const failure = error as NodeJS.ErrnoException | undefined
    if (failure?.code === 'ENOENT' || failure?.code === 'ENOTDIR')
      throw new BuddyServiceError('FILE_NOT_FOUND')
    throw error
  }
}
