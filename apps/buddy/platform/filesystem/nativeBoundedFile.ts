import type { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { OPERATING_SYSTEM } from '../../shared/platform/identifiers'
import { BoundedFileReadError } from './boundedFileError'
import { filePaths } from './filePaths'

export async function readNativeBoundedFile(root: string, path: string, maxBytes: number, signal?: AbortSignal, executable = process.env.LEXORA_BUDDY_FILE_READER): Promise<Buffer> {
  if (!executable)
    throw new BoundedFileReadError('BOUNDED_FILE_READER_UNAVAILABLE')
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 64 * 1024 * 1024)
    throw new BoundedFileReadError('BOUNDED_FILE_OUTPUT_LIMIT')
  const request = JSON.stringify({
    root: filePaths.resolveInput(root),
    path: filePaths.resolveInput(path),
    maxBytes,
  })
  return executeReader(request, [], maxBytes, signal, executable)
}

export async function readNativeBoundedFiles(requests: readonly { root: string, path: string, maxBytes: number }[], signal?: AbortSignal, executable = process.env.LEXORA_BUDDY_FILE_READER): Promise<PromiseSettledResult<Buffer>[]> {
  if (!executable)
    throw new BoundedFileReadError('BOUNDED_FILE_READER_UNAVAILABLE')
  const maxBytes = requests.reduce((sum, request) => sum + request.maxBytes, 0)
  if (requests.length > 64 || requests.some(request => !Number.isSafeInteger(request.maxBytes) || request.maxBytes < 0) || maxBytes > 16 * 1024 * 1024)
    throw new BoundedFileReadError('BOUNDED_FILE_OUTPUT_LIMIT')
  if (!requests.length)
    return []
  const input = JSON.stringify(requests.map(request => ({ root: filePaths.resolveInput(request.root), path: filePaths.resolveInput(request.path), maxBytes: request.maxBytes })))
  const output = await executeReader(input, ['--batch'], maxBytes + requests.length * 5, signal, executable)
  const results: PromiseSettledResult<Buffer>[] = []
  let offset = 0
  for (const request of requests) {
    if (offset + 5 > output.length)
      throw new BoundedFileReadError('BOUNDED_FILE_READ_FAILED')
    const status = output[offset]!
    const length = output.readUInt32BE(offset + 1)
    offset += 5
    if (status > 3 || (status !== 0 && length !== 0) || length > request.maxBytes || offset + length > output.length)
      throw new BoundedFileReadError('BOUNDED_FILE_READ_FAILED')
    results.push(status === 0
      ? { status: 'fulfilled', value: output.subarray(offset, offset + length) }
      : { status: 'rejected', reason: new BoundedFileReadError(status === 2 ? 'BOUNDED_FILE_OUTPUT_LIMIT' : status === 3 ? 'BOUNDED_FILE_READER_UNAVAILABLE' : 'BOUNDED_FILE_READ_FAILED') })
    offset += length
  }
  if (offset !== output.length)
    throw new BoundedFileReadError('BOUNDED_FILE_READ_FAILED')
  return results
}

function executeReader(request: string, args: string[], maxBytes: number, signal: AbortSignal | undefined, executable: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const closed = Promise.withResolvers<void>()
    const child = execFile(filePaths.resolveInput(executable), args, {
      encoding: 'buffer',
      env: process.platform === OPERATING_SYSTEM.Windows ? { SystemRoot: process.env.SystemRoot } : {},
      maxBuffer: maxBytes + 4096,
      timeout: 30_000,
      killSignal: 'SIGKILL',
      signal,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      void closed.promise.then(() => {
        if (error) {
          const code = stderr.toString('utf8').trim()
          reject(new BoundedFileReadError(
            code === 'BOUNDED_FILE_OUTPUT_LIMIT' || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
              ? 'BOUNDED_FILE_OUTPUT_LIMIT'
              : error.code === 'ENOENT' || code === 'BOUNDED_FILE_READER_UNAVAILABLE'
                ? 'BOUNDED_FILE_READER_UNAVAILABLE'
                : 'BOUNDED_FILE_READ_FAILED',
            { cause: error },
          ))
        }
        else if (stdout.length > maxBytes || stderr.length > 0) {
          reject(new BoundedFileReadError('BOUNDED_FILE_READ_FAILED'))
        }
        else {
          resolve(stdout)
        }
      })
    })
    child.once('close', () => closed.resolve())
    child.stdin?.on('error', () => {})
    child.stdin?.end(request)
  })
}
