import { realpath } from 'node:fs/promises'
import { BoundedFileReadError } from './boundedFileError'
import { containsCanonicalPath, filePaths } from './filePaths'
import { readNativeBoundedFile } from './nativeBoundedFile'

export { BoundedFileReadError } from './boundedFileError'

export async function readBoundedFile(root: string, path: string, maxBytes = 8 * 1024 * 1024, signal?: AbortSignal, range?: { offset: number, length: number }) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 64 * 1024 * 1024)
    throw new BoundedFileReadError('BOUNDED_FILE_OUTPUT_LIMIT')
  try {
    signal?.throwIfAborted()
    const canonicalRoot = await realpath(filePaths.resolveInput(root))
    const canonicalPath = await realpath(filePaths.resolveInput(path))
    if (!containsCanonicalPath(canonicalRoot, canonicalPath))
      throw new BoundedFileReadError('BOUNDED_FILE_READ_FAILED')
    return await readNativeBoundedFile(canonicalRoot, canonicalPath, maxBytes, signal, undefined, range)
  }
  catch (error) {
    if (error instanceof BoundedFileReadError)
      throw error
    throw new BoundedFileReadError('BOUNDED_FILE_READ_FAILED', { cause: error })
  }
}

export async function readBoundedFileChunk(root: string, path: string, offset: number, length: number, signal?: AbortSignal) {
  const bytes = await readBoundedFile(root, path, 64 * 1024 * 1024, signal, { offset, length })
  if (bytes.length < 8)
    throw new BoundedFileReadError('BOUNDED_FILE_READ_FAILED')
  const size = Number(bytes.readBigUInt64LE(0))
  if (size > 64 * 1024 * 1024 || offset > size || bytes.length - 8 !== Math.min(length, size - offset))
    throw new BoundedFileReadError('BOUNDED_FILE_READ_FAILED')
  return { base64: bytes.subarray(8).toString('base64'), size, eof: offset + bytes.length - 8 === size }
}
