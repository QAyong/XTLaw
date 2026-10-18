import { Buffer } from 'node:buffer'
/**
 * Virtual file store for the bundled main-process code: the plugin bridge puts the opened workbook here,
 * snapshots, temp files and saved bytes live in memory, and writes to the workbook itself go to the host first.
 */
const files = new Map<string, Uint8Array>()
const modified = new Map<string, number>()
const directories = new Set<string>(['/', '/virtual', '/virtual/tmp'])
function norm(path: string) {
  const value = String(path).replaceAll(String.fromCharCode(92), '/').replace(/\/{2,}/g, '/')
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value
}
const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0)) || '/'
export type WriteHook = (path: string, bytes: Uint8Array) => void | Promise<void>
let writeHook: WriteHook | null = null

function addDirectories(path: string) {
  for (let dir = norm(path); dir && !directories.has(dir); dir = parentOf(dir)) directories.add(dir)
}
function store(path: string, bytes: Uint8Array) {
  const key = norm(path)
  addDirectories(parentOf(key))
  files.set(key, bytes)
  modified.set(key, Date.now())
}

export const vfs = {
  put: (path: string, bytes: Uint8Array) => store(path, bytes),
  get: (path: string) => files.get(norm(path)),
  has: (path: string) => files.has(norm(path)),
  delete: (path: string) => files.delete(norm(path)),
  onWrite: (hook: WriteHook | null) => void (writeHook = hook),
  async write(path: string, bytes: Uint8Array) {
    // The host sees the write first: a refused save must not leave the new bytes behind.
    await writeHook?.(norm(path), bytes)
    store(path, bytes)
  },
}
;(globalThis as any).__lexoraVfs = vfs

const missing = (path: string, syscall = 'open') => Object.assign(new Error(`ENOENT: no such file or directory, ${syscall} '${path}'`), { code: 'ENOENT' })
const exists = (path: string) => Object.assign(new Error(`EEXIST: file already exists, open '${path}'`), { code: 'EEXIST' })
function toBytes(data: unknown): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer)
}
const wrap = (bytes: Uint8Array, encoding?: unknown) => (encoding ? new TextDecoder().decode(bytes) : Buffer.from(bytes))
function fileStats(path: string) {
  const key = norm(path)
  const bytes = files.get(key)
  if (bytes) {
    const mtimeMs = modified.get(key) ?? 0
    return { size: bytes.byteLength, mtimeMs, mtime: new Date(mtimeMs), isFile: () => true, isDirectory: () => false }
  }
  if (directories.has(key))
    return { size: 0, mtimeMs: 0, mtime: new Date(0), isFile: () => false, isDirectory: () => true }
  throw missing(path, 'stat')
}
function children(path: string): string[] {
  const prefix = `${norm(path)}/`.replace('//', '/')
  const names = new Set<string>()
  for (const key of [...files.keys(), ...directories]) {
    if (key.startsWith(prefix) && key.length > prefix.length)
      names.add(key.slice(prefix.length).split('/')[0]!)
  }
  return [...names].sort()
}
function remove(path: string, recursive: boolean, force: boolean) {
  const key = norm(path)
  if (files.delete(key)) {
    modified.delete(key)
    return
  }
  if (directories.has(key)) {
    const prefix = `${key}/`
    for (const file of [...files.keys()]) {
      if (file.startsWith(prefix)) {
        if (!recursive)
          throw Object.assign(new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`), { code: 'ENOTEMPTY' })
        files.delete(file)
        modified.delete(file)
      }
    }
    for (const dir of [...directories]) {
      if (dir === key || dir.startsWith(prefix))
        directories.delete(dir)
    }
    return
  }
  if (!force)
    throw missing(path, 'rm')
}
function makeTempDirectory(prefix: string) {
  const path = `${prefix}${Math.random().toString(36).slice(2, 8)}`
  addDirectories(path)
  return path
}

export const promises = {
  readFile: async (path: string, options?: unknown) => {
    const bytes = files.get(norm(path))
    if (!bytes)
      throw missing(path)
    return wrap(bytes, typeof options === 'string' ? options : (options as any)?.encoding)
  },
  writeFile: async (path: string, data: unknown) => vfs.write(path, toBytes(data)),
  rm: async (path: string, options?: { recursive?: boolean, force?: boolean }) => remove(path, !!options?.recursive, !!options?.force),
  unlink: async (path: string) => remove(path, false, false),
  rename: async (from: string, to: string) => {
    const bytes = files.get(norm(from))
    if (!bytes)
      throw missing(from, 'rename')
    await vfs.write(to, bytes)
    files.delete(norm(from))
  },
  copyFile: async (from: string, to: string) => {
    const bytes = files.get(norm(from))
    if (!bytes)
      throw missing(from, 'copyfile')
    await vfs.write(to, bytes)
  },
  stat: async (path: string) => fileStats(path),
  lstat: async (path: string) => fileStats(path),
  mkdir: async (path: string) => void addDirectories(path),
  mkdtemp: async (prefix: string) => makeTempDirectory(prefix),
  readdir: async (path: string) => children(path),
  access: async (path: string) => void fileStats(path),
  open: async () => {
    throw new Error('SHEETS_FEATURE_UNAVAILABLE: fs.open')
  },
}
export const existsSync = (path: string) => files.has(norm(path)) || directories.has(norm(path))
export function readFileSync(path: string, options?: unknown) {
  const bytes = files.get(norm(path))
  if (!bytes)
    throw missing(path)
  return wrap(bytes, typeof options === 'string' ? options : (options as any)?.encoding)
}
export const writeFileSync = (path: string, data: unknown) => void store(path, toBytes(data))
export const mkdirSync = (path: string) => void addDirectories(path)
export const mkdtempSync = makeTempDirectory
export const readdirSync = children
export const statSync = fileStats
export const rmSync = (path: string, options?: { recursive?: boolean, force?: boolean }) => remove(path, !!options?.recursive, !!options?.force)
export const unlinkSync = (path: string) => remove(path, false, false)
export function renameSync(from: string, to: string) {
  const bytes = files.get(norm(from))
  if (!bytes)
    throw missing(from, 'rename')
  store(to, bytes)
  files.delete(norm(from))
}

// Sequential writers: bytes accumulate until closeSync, matching how the gateway writes temp files.
let nextDescriptor = 100
const openFiles = new Map<number, { path: string, chunks: Uint8Array[], write: boolean }>()
export function openSync(path: string, flags = 'r') {
  const key = norm(path)
  const write = /[wa+]/.test(flags)
  if (flags.includes('x') && files.has(key))
    throw exists(path)
  if (!write && !files.has(key))
    throw missing(path)
  const descriptor = nextDescriptor++
  openFiles.set(descriptor, { path: key, chunks: write && !flags.startsWith('r') ? [] : [files.get(key) ?? new Uint8Array(0)], write })
  return descriptor
}
export function writeSync(descriptor: number, data: unknown, offset?: number, length?: number) {
  const handle = openFiles.get(descriptor)
  if (!handle?.write)
    throw new Error('EBADF: bad file descriptor')
  let bytes = toBytes(data)
  if (typeof data !== 'string' && typeof offset === 'number')
    bytes = bytes.subarray(offset, typeof length === 'number' ? offset + length : undefined)
  handle.chunks.push(bytes.slice())
  return bytes.byteLength
}
export const fsyncSync = () => undefined
export function closeSync(descriptor: number) {
  const handle = openFiles.get(descriptor)
  openFiles.delete(descriptor)
  if (handle?.write) {
    const total = handle.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    const all = new Uint8Array(total)
    let at = 0
    for (const chunk of handle.chunks) {
      all.set(chunk, at)
      at += chunk.byteLength
    }
    store(handle.path, all)
  }
}
/** Streams the file in 1 MiB chunks; enough for the hashing helper the upstream main process uses. */
export function createReadStream(path: string) {
  const listeners = new Map<string, Array<(value?: any) => void>>()
  const stream: { on: typeof add, once: typeof add } = { on: add, once: add }
  function add(event: string, listener: (value?: any) => void) {
    listeners.set(event, [...(listeners.get(event) ?? []), listener])
    return stream
  }
  const emit = (event: string, value?: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(value)
  }
  queueMicrotask(() => {
    const bytes = files.get(norm(path))
    if (!bytes)
      return emit('error', missing(path))
    for (let offset = 0; offset < bytes.byteLength; offset += 1 << 20) emit('data', Buffer.from(bytes.subarray(offset, offset + (1 << 20))))
    emit('end')
  })
  return stream
}
export const constants = {}
export default { promises, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, unlinkSync, renameSync, openSync, writeSync, closeSync, fsyncSync, createReadStream, constants }
