import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import process from 'node:process'

export function saveBoundedTextFile(input: { root: string, path: string, expected: string, content: string }): Promise<'saved' | 'conflict'> {
  const executable = process.env.LEXORA_BUDDY_FILE_READER
  if (!executable || Buffer.byteLength(input.expected) > 1024 * 1024 || Buffer.byteLength(input.content) > 1024 * 1024)
    return Promise.reject(new Error('BOUNDED_FILE_WRITE_FAILED'))
  return new Promise((resolve, reject) => {
    const child = execFile(executable, ['--save-text'], {
      env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {},
      maxBuffer: 4096,
      timeout: 30_000,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error && stderr.trim() === 'BOUNDED_FILE_CONFLICT')
        resolve('conflict')
      else if (error || stdout || stderr)
        reject(new Error('BOUNDED_FILE_WRITE_FAILED', { cause: error }))
      else
        resolve('saved')
    })
    child.stdin?.on('error', () => {})
    child.stdin?.end(JSON.stringify(input))
  })
}

export function saveBoundedBinaryFile(input: { root: string, path: string, expected: Buffer, content: Buffer }, signal?: AbortSignal): Promise<'saved' | 'conflict'> {
  const executable = process.env.LEXORA_BUDDY_FILE_READER
  if (!executable || input.expected.length > 64 * 1024 * 1024 || input.content.length > 64 * 1024 * 1024)
    return Promise.reject(new Error('BOUNDED_FILE_WRITE_FAILED'))
  const header = Buffer.from(JSON.stringify({ root: input.root, path: input.path, expectedSize: input.expected.length, contentSize: input.content.length }))
  if (header.length > 32 * 1024)
    return Promise.reject(new Error('BOUNDED_FILE_WRITE_FAILED'))
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32LE(header.length)
  return new Promise((resolve, reject) => {
    const child = execFile(executable, ['--save-binary'], {
      env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {},
      maxBuffer: 4096,
      timeout: 30_000,
      signal,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error && stderr.trim() === 'BOUNDED_FILE_CONFLICT')
        resolve('conflict')
      else if (error || stdout || stderr)
        reject(new Error('BOUNDED_FILE_WRITE_FAILED', { cause: error }))
      else
        resolve('saved')
    })
    child.stdin?.on('error', () => {})
    child.stdin?.write(prefix)
    child.stdin?.write(header)
    child.stdin?.write(input.expected)
    child.stdin?.end(input.content)
  })
}
