/**
 * Replacement for the upstream XlsxSidecarClient: same surface, but the engine runs as WebAssembly in a worker
 * instead of a native child process. The main-process code keeps its virtual file paths; this class copies the
 * bytes a command needs into the worker's in-memory file system and copies the files a command writes back.
 */
import type { WorkerRequest, WorkerResponse } from './engine.worker'
import { vfs } from './vfs'

const PROTOCOL_VERSION = 1
const REQUEST_TIMEOUT_MS = 120_000
const ARCHIVE_TIMEOUT_MS = 600_000

// Which request fields name files: read by the engine, or written by it.
const inputFields: Record<string, string[]> = {
  open: ['path'],
  read_entries: ['path'],
  scan_entries: ['path'],
  archive_manifest: ['path'],
  convert_workbook: ['path'],
  save_archive: ['sourcePath'],
  recalc_cells: ['path'],
}
const outputFiles: Record<string, string[]> = { convert_workbook: ['targetPath'], save_archive: ['targetPath'] }
const outputDirs: Record<string, string[]> = { read_entries: ['outputDir'] }

interface Pending {
  resolve: (value: WorkerResponse) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}
interface Mounted { bytes: Uint8Array, guest: string }

const extensionOf = (path: string) => /\.[a-z0-9]{1,8}$/i.exec(path)?.[0] ?? ''

export class XlsxSidecarClient {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private nextId = 1
  private nextGuest = 1
  private readonly pending = new Map<number, Pending>()
  private readonly mounted = new Map<string, Mounted>()
  private readonly sessionGuests = new Map<string, string>()
  private readonly exitListeners = new Set<() => void>()

  constructor(_binaryPath: string) {}

  onProcessExit(listener: () => void): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  start(): void {
    void this.ensureStarted().catch(() => {})
  }

  getProcessId(): number | null {
    return null
  }

  stop(): void {
    this.teardown(new Error('XLSX engine stopped.'), false)
  }

  async open(path: string, locale = 'zh', shortDateFormat?: string): Promise<unknown> {
    const result = await this.request({ command: 'open', path, locale, ...(shortDateFormat === undefined ? {} : { shortDateFormat }) }) as { sessionId?: string }
    const guest = this.mounted.get(path)?.guest
    if (typeof result?.sessionId === 'string' && guest)
      this.sessionGuests.set(result.sessionId, path)
    // The engine names the workbook after the file it streams from (the session's snapshot copy); the user
    // opened the plugin's selected file, so that name is what the editor shows.
    const hostPath = (globalThis as { __lexoraSheetsHost?: { path?: string } }).__lexoraSheetsHost?.path ?? path
    if (result && typeof (result as { name?: unknown }).name === 'string')
      (result as { name: string }).name = hostPath.slice(hostPath.lastIndexOf('/') + 1)
    return result
  }

  readRange(input: { sessionId: string, sheetId: string, range: { startRow: number, endRow: number, startColumn: number, endColumn: number } }) {
    return this.request({ command: 'read_range', ...input })
  }

  readFormulaCells(input: { sessionId: string, sheetId: string }) {
    return this.request({ command: 'read_formula_cells', ...input })
  }

  findCells(input: Readonly<Record<string, unknown>> & { sessionId: string }) {
    return this.request({ command: 'find_cells', ...input })
  }

  readRowOutline(input: { sessionId: string, sheetId: string }) {
    return this.request({ command: 'read_row_outline', ...input })
  }

  async close(sessionId: string): Promise<void> {
    const path = this.sessionGuests.get(sessionId)
    this.sessionGuests.delete(sessionId)
    // The workbook copy the session streamed from can go once the engine has closed it.
    const mounted = path === undefined ? undefined : this.mounted.get(path)
    if (path !== undefined && mounted && ![...this.sessionGuests.values()].includes(path))
      this.mounted.delete(path)
    await this.request({ command: 'close', sessionId }, REQUEST_TIMEOUT_MS, mounted ? [mounted.guest] : [])
  }

  readMedia(input: { sessionId: string, visualId: string }) {
    return this.request({ command: 'read_media', ...input })
  }

  convertWorkbook(input: { path: string, targetPath: string }) {
    return this.request({ command: 'convert_workbook', ...input }, ARCHIVE_TIMEOUT_MS)
  }

  archiveManifest(path: string) {
    return this.request({ command: 'archive_manifest', path }, ARCHIVE_TIMEOUT_MS)
  }

  readEntries(input: { path: string, entries: readonly string[], outputDir: string }) {
    return this.request({ command: 'read_entries', ...input }, ARCHIVE_TIMEOUT_MS)
  }

  scanEntries(input: { path: string, entries: readonly string[], needle: string }) {
    return this.request({ command: 'scan_entries', ...input }, ARCHIVE_TIMEOUT_MS)
  }

  saveArchive(input: { sourcePath: string, targetPath: string, replacements: readonly { name: string, contentPath: string }[], removals: readonly string[], additions: readonly { name: string, contentPath: string }[] }) {
    return this.request({ command: 'save_archive', ...input }, ARCHIVE_TIMEOUT_MS)
  }

  recalcCells(input: { path: string, edits: readonly unknown[], reads: readonly unknown[] }) {
    return this.request({ command: 'recalc_cells', ...input }, ARCHIVE_TIMEOUT_MS)
  }

  private async ensureStarted(): Promise<void> {
    if (this.worker && this.ready)
      return this.ready
    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const pending = this.pending.get(event.data.id)
      if (!pending)
        return
      clearTimeout(pending.timeout)
      this.pending.delete(event.data.id)
      pending.resolve(event.data)
    }
    worker.onerror = (event) => {
      event.preventDefault()
      this.teardown(new Error(`XLSX engine stopped: ${event.message}`), true)
    }
    const ready = (async () => {
      const wasm = await (await fetch(new URL('./xlsx_engine.wasm', import.meta.url))).arrayBuffer()
      const reply = await this.post({ type: 'init', wasm }, REQUEST_TIMEOUT_MS)
      if (!reply.ok)
        throw new Error(reply.error ?? 'XLSX engine failed to start.')
    })()
    this.ready = ready
    ready.catch(() => {
      if (this.worker === worker)
        this.teardown(new Error('XLSX engine failed to start.'), false)
    })
    return ready
  }

  private post(message: Omit<WorkerRequest, 'id'> & { line?: string }, timeoutMs: number): Promise<WorkerResponse> {
    const worker = this.worker
    if (!worker)
      return Promise.reject(new Error('XLSX engine is not running.'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('XLSX engine request timed out.'))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      worker.postMessage({ id, ...message })
    })
  }

  private teardown(reason: Error, crashed: boolean): void {
    const worker = this.worker
    this.worker = null
    this.ready = null
    worker?.terminate()
    // The next worker has never heard of these workbooks or sessions.
    this.mounted.clear()
    this.sessionGuests.clear()
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(reason)
    }
    this.pending.clear()
    if (crashed) {
      for (const listener of this.exitListeners) listener()
    }
  }

  private mount(path: string, put: NonNullable<WorkerRequest['put']>): string {
    const bytes = vfs.get(path)
    if (!bytes)
      throw new Error(`XLSX engine input not found: ${path}`)
    const known = this.mounted.get(path)
    if (known && known.bytes === bytes)
      return known.guest
    const guest = known?.guest ?? `/data/f${this.nextGuest++}${extensionOf(path)}`
    put.push({ path: guest, bytes })
    this.mounted.set(path, { bytes, guest })
    return guest
  }

  private async request(command: Readonly<Record<string, unknown>>, timeoutMs: number = REQUEST_TIMEOUT_MS, drop: string[] = []): Promise<unknown> {
    await this.ensureStarted()
    const name = String(command.command)
    const put: NonNullable<WorkerRequest['put']> = []
    const mkdirs: string[] = []
    const pull: NonNullable<WorkerRequest['pull']> = []
    const request: Record<string, unknown> = { ...command }
    for (const field of inputFields[name] ?? [])
      request[field] = this.mount(String(command[field]), put)
    if (name === 'save_archive') {
      const map = (list: unknown) => (list as { name: string, contentPath: string }[]).map(item => ({ name: item.name, contentPath: this.mount(item.contentPath, put) }))
      request.replacements = map(command.replacements)
      request.additions = map(command.additions)
    }
    const outputs = new Map<string, { original: string, kind: 'file' | 'dir' }>()
    for (const field of outputFiles[name] ?? []) {
      const guest = `/data/o${this.nextGuest++}${extensionOf(String(command[field]))}`
      request[field] = guest
      outputs.set(guest, { original: String(command[field]), kind: 'file' })
      pull.push({ path: guest, kind: 'file' })
    }
    for (const field of outputDirs[name] ?? []) {
      const guest = `/tmp/o${this.nextGuest++}`
      request[field] = guest
      outputs.set(guest, { original: String(command[field]), kind: 'dir' })
      mkdirs.push(guest)
      pull.push({ path: guest, kind: 'dir' })
    }
    const requestId = crypto.randomUUID()
    const line = JSON.stringify({ version: PROTOCOL_VERSION, requestId, ...request })
    const reply = await this.post({ type: 'call', command: name, line, put, mkdirs, pull, drop: [...drop, ...[...outputs.keys()].filter(guest => outputs.get(guest)!.kind === 'file')] }, timeoutMs).catch((error) => {
      throw error
    })
    if (!reply.ok) {
      if (reply.trapped)
        this.teardown(new Error(`XLSX engine stopped: ${reply.error}`), true)
      throw new Error(reply.trapped ? 'XLSX engine stopped unexpectedly.' : (reply.error ?? 'XLSX engine request failed.'))
    }
    for (const file of reply.files ?? []) {
      for (const [guest, output] of outputs) {
        if (file.path === guest)
          vfs.put(output.original, file.bytes)
        else if (output.kind === 'dir' && file.path.startsWith(`${guest}/`))
          vfs.put(`${output.original}/${file.path.slice(guest.length + 1)}`, file.bytes)
      }
    }
    let text = reply.line ?? ''
    for (const [guest, output] of outputs) text = text.split(guest).join(output.original)
    let response: { ok?: boolean, requestId?: string, result?: unknown, error?: { message?: string } }
    try {
      response = JSON.parse(text)
    }
    catch {
      throw new Error('XLSX engine returned an unreadable response.')
    }
    if (response.requestId !== requestId || typeof response.ok !== 'boolean')
      throw new Error('XLSX engine returned an unexpected response.')
    if (!response.ok)
      throw new Error(response.error?.message ?? 'XLSX engine request failed.')
    return response.result
  }
}
