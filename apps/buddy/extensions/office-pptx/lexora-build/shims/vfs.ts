import { Buffer } from 'node:buffer'
/** Virtual file store: the plugin bridge puts the opened deck here and reads back what a save wrote. */
const files = new Map<string, Uint8Array>()
const key = (path: string) => String(path).replaceAll(String.fromCharCode(92), '/')
export type WriteHook = (path: string, bytes: Uint8Array) => void | Promise<void>
let writeHook: WriteHook | null = null

export const vfs = {
  put: (path: string, bytes: Uint8Array) => void files.set(key(path), bytes),
  get: (path: string) => files.get(key(path)),
  has: (path: string) => files.has(key(path)),
  delete: (path: string) => files.delete(key(path)),
  onWrite: (hook: WriteHook | null) => void (writeHook = hook),
  async write(path: string, bytes: Uint8Array) {
    // The host sees the write first: a refused save must not leave the new bytes behind.
    await writeHook?.(key(path), bytes)
    files.set(key(path), bytes)
  },
}
;(globalThis as any).__lexoraVfs = vfs

const missing = (path: string) => Object.assign(new Error(`ENOENT: no such file, '${path}'`), { code: 'ENOENT' })
function toBytes(data: unknown): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer)
}
const wrap = (bytes: Uint8Array, encoding?: unknown) => (encoding ? new TextDecoder().decode(bytes) : Buffer.from(bytes))

export const promises = {
  readFile: async (path: string, options?: unknown) => {
    const bytes = files.get(key(path))
    if (!bytes)
      throw missing(path)
    return wrap(bytes, typeof options === 'string' ? options : (options as any)?.encoding)
  },
  writeFile: async (path: string, data: unknown) => vfs.write(path, toBytes(data)),
  rm: async (path: string) => void files.delete(key(path)),
  unlink: async (path: string) => void files.delete(key(path)),
  rename: async (from: string, to: string) => {
    const bytes = files.get(key(from))
    if (!bytes)
      throw missing(from)
    files.delete(key(from))
    await vfs.write(to, bytes)
  },
  copyFile: async (from: string, to: string) => {
    const bytes = files.get(key(from))
    if (!bytes)
      throw missing(from)
    await vfs.write(to, bytes)
  },
  stat: async (path: string) => {
    const bytes = files.get(key(path))
    if (!bytes)
      throw missing(path)
    return { size: bytes.byteLength, mtimeMs: 0, mtime: new Date(0), isFile: () => true, isDirectory: () => false }
  },
  mkdir: async () => undefined,
  readdir: async () => [] as string[],
  access: async (path: string) => {
    if (!files.has(key(path)))
      throw missing(path)
  },
  open: async () => {
    throw new Error('SLIDES_FEATURE_UNAVAILABLE: fs.open')
  },
}
export const existsSync = (path: string) => files.has(key(path))
export function readFileSync(path: string, options?: unknown) {
  const bytes = files.get(key(path))
  if (!bytes)
    throw missing(path)
  return wrap(bytes, typeof options === 'string' ? options : (options as any)?.encoding)
}
export const writeFileSync = (path: string, data: unknown) => void files.set(key(path), toBytes(data))
export const mkdirSync = () => undefined
export const readdirSync = () => [] as string[]
export function statSync(path: string) {
  const bytes = files.get(key(path))
  if (!bytes)
    throw missing(path)
  return { size: bytes.byteLength, mtimeMs: 0, isFile: () => true, isDirectory: () => false }
}
export const rmSync = (path: string) => void files.delete(key(path))
export const unlinkSync = rmSync
export const constants = {}
export default { promises, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, unlinkSync, constants }
