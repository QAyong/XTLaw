/**
 * Runs the xlsx engine (Rust compiled to wasm32-wasip1) in a dedicated worker. The engine reads and writes
 * ordinary files, so a small in-memory WASI file system stands in for the disk: /data holds the workbooks the
 * page hands over, /tmp the engine's own cache. One request line in, one response line out (see wasm_api.rs).
 */
import { ConsoleStdout, Directory, File, OpenFile, PreopenDirectory, WASI } from '@bjorn3/browser_wasi_shim'

interface Exports {
  memory: WebAssembly.Memory
  xlsx_alloc: (length: number) => number
  xlsx_free: (pointer: number, capacity: number) => void
  xlsx_handle: (pointer: number, length: number) => bigint
}
export interface WorkerRequest {
  id: number
  type: 'init' | 'call'
  wasm?: ArrayBuffer
  command?: string
  /** Files the request reads: guest path (under /data) and bytes. */
  put?: { path: string, bytes: Uint8Array }[]
  /** Guest directories to create before the request (engine output folders). */
  mkdirs?: string[]
  /** Guest paths to hand back afterwards: a file, or every file under a directory. */
  pull?: { path: string, kind: 'file' | 'dir' }[]
  /** Guest files to forget (inputs no longer needed). */
  drop?: string[]
}
export interface WorkerResponse {
  id: number
  ok: boolean
  line?: string
  error?: string
  trapped?: boolean
  files?: { path: string, bytes: Uint8Array }[]
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const data = new Map<string, File | Directory>()
const temp = new Map<string, File | Directory>()
let exports: Exports | null = null

function roots(path: string): { root: Map<string, any>, parts: string[] } {
  const [, top, ...parts] = path.split('/')
  const root = top === 'data' ? data : top === 'tmp' ? temp : null
  if (!root || !parts.length)
    throw new Error(`Unsupported guest path ${path}`)
  return { root, parts }
}
function directory(root: Map<string, any>, parts: string[], create: boolean): Map<string, any> | null {
  let contents = root
  for (const part of parts) {
    let next = contents.get(part)
    if (!next && create)
      contents.set(part, (next = new Directory(new Map())))
    if (!(next instanceof Directory))
      return null
    contents = next.contents
  }
  return contents
}
function put(path: string, bytes: Uint8Array) {
  const { root, parts } = roots(path)
  const contents = directory(root, parts.slice(0, -1), true)!
  contents.set(parts.at(-1)!, new File(bytes))
}
function collect(path: string, kind: 'file' | 'dir', out: { path: string, bytes: Uint8Array }[]) {
  const { root, parts } = roots(path)
  if (kind === 'file') {
    const parent = directory(root, parts.slice(0, -1), false)
    const entry = parent?.get(parts.at(-1)!)
    if (entry instanceof File)
      out.push({ path, bytes: entry.data })
    return
  }
  const contents = directory(root, parts, false)
  const walk = (base: string, map: Map<string, any>) => {
    for (const [name, entry] of map) {
      if (entry instanceof File)
        out.push({ path: `${base}/${name}`, bytes: entry.data })
      else if (entry instanceof Directory)
        walk(`${base}/${name}`, entry.contents)
    }
  }
  if (contents)
    walk(path, contents)
}
function forget(path: string) {
  const { root, parts } = roots(path)
  directory(root, parts.slice(0, -1), false)?.delete(parts.at(-1)!)
}

async function init(wasm: ArrayBuffer) {
  const stdio = [
    new OpenFile(new File(new Uint8Array(0))),
    ConsoleStdout.lineBuffered(() => {}),
    ConsoleStdout.lineBuffered(() => {}),
    new PreopenDirectory('/data', data),
    new PreopenDirectory('/tmp', temp),
  ]
  const wasi = new WASI([], ['TMPDIR=/tmp'], stdio, { debug: false })
  const { instance } = await WebAssembly.instantiate(wasm, { wasi_snapshot_preview1: wasi.wasiImport })
  wasi.initialize(instance as any)
  exports = instance.exports as unknown as Exports
}

function handle(line: string): string {
  const x = exports!
  const request = encoder.encode(line)
  const pointer = x.xlsx_alloc(request.length)
  new Uint8Array(x.memory.buffer, pointer, request.length).set(request)
  const packed = x.xlsx_handle(pointer, request.length)
  x.xlsx_free(pointer, request.length)
  const length = Number(packed & 0xFFFFFFFFn)
  if (!length)
    return ''
  const at = Number(packed >> 32n)
  const text = decoder.decode(new Uint8Array(x.memory.buffer, at, length))
  x.xlsx_free(at, length)
  return text
}

globalThis.onmessage = async (event: MessageEvent<WorkerRequest & { line?: string }>) => {
  const request = event.data
  const reply = (response: Omit<WorkerResponse, 'id'>) => (globalThis as any).postMessage({ id: request.id, ...response })
  try {
    if (request.type === 'init') {
      await init(request.wasm!)
      return reply({ ok: true })
    }
    for (const file of request.put ?? []) put(file.path, file.bytes)
    for (const path of request.mkdirs ?? []) {
      const { root, parts } = roots(`${path}/x`)
      directory(root, parts.slice(0, -1), true)
    }
    const line = handle(request.line!)
    const files: { path: string, bytes: Uint8Array }[] = []
    for (const item of request.pull ?? []) collect(item.path, item.kind, files)
    for (const path of request.drop ?? []) forget(path)
    // Structured clone copies the bytes: the guest file system keeps its own.
    reply({ ok: true, line, files })
  }
  catch (error) {
    // Rust panics abort the instance (no unwinding on wasm): the page must start a fresh worker.
    reply({ ok: false, error: error instanceof Error ? error.message : String(error), trapped: error instanceof WebAssembly.RuntimeError })
  }
}
