import type { SearchCollector, SpawnWslHelper, WslSearchProcess } from './wslProcess'
import { Buffer } from 'node:buffer'
import { WSL_HELPER_SCRIPT, WSL_HELPER_VERSION } from './wslHelperScript'
import { collectSearch, decodeDiagnostic, relayError, runWslSearch, spawnWslHelper, wslExecutable } from './wslProcess'

const START_TIMEOUT_MS = 15_000
const STOP_TIMEOUT_MS = 1_000
const UNAVAILABLE_RETRY_MS = 5 * 60_000
const DEFAULT_IDLE_SECONDS = 300
const MAX_ACTIVE = 64

export interface WslHostPoolOptions {
  /** Seconds without a request after which the helper in the distribution exits. */
  idleSeconds?: number
  /** Replaces the wsl.exe launch of the helper, for tests. */
  spawnProcess?: SpawnWslHelper
  now?: () => number
}

interface HostOptions {
  idleSeconds: number
  spawnProcess: SpawnWslHelper
  now: () => number
}

// The helper went away (wsl --shutdown, an idle exit, a crash) while a search was running. A search that had produced
// no output yet is read-only and safe to start again.
class HelperClosedError extends Error {
  readonly received: boolean

  constructor(received: boolean) {
    super('The WSL helper stopped during the search; run it again')
    this.name = 'HelperClosedError'
    this.received = received
  }
}

interface Frame {
  t?: string
  v?: number
  id?: number
  d?: string
  code?: number | null
  err?: string
}

// One helper process: `wsl.exe -d <distribution> --exec python3 -u -c <script> <idle>`, kept open and shared by every search.
class HelperConnection {
  readonly closed = Promise.withResolvers<void>()
  alive = true
  readonly #child: ReturnType<SpawnWslHelper>
  readonly #ready = Promise.withResolvers<void>()
  readonly #requests = new Map<number, SearchCollector>()
  #buffer = ''
  #nextId = 1
  #stderr = Buffer.alloc(0)

  constructor(distribution: string, options: HostOptions) {
    this.#child = options.spawnProcess(wslExecutable(), ['-d', distribution, '--exec', 'python3', '-u', '-c', WSL_HELPER_SCRIPT, String(options.idleSeconds)])
    this.#child.stdout.setEncoding('utf8')
    this.#child.stdout.on('data', (chunk: string) => this.#read(chunk))
    this.#child.stderr.on('data', (chunk: Buffer) => {
      if (this.#stderr.length < 4096)
        this.#stderr = Buffer.concat([this.#stderr, chunk])
    })
    // A write to a helper that already exited surfaces as EPIPE here and as `close`; close settles the requests.
    this.#child.stdin.on('error', () => {})
    this.#child.once('error', error => this.#end(error))
    this.#child.once('close', () => this.#end())
    // Nobody waits on `ready` once the helper is running, so a later rejection must not go unhandled.
    this.#ready.promise.catch(() => {})
  }

  async ready(): Promise<void> {
    const timer = setTimeout(() => this.#ready.reject(new Error('The WSL helper did not start in time')), START_TIMEOUT_MS)
    try {
      await this.#ready.promise
    }
    finally {
      clearTimeout(timer)
    }
  }

  search(request: WslSearchProcess): Promise<void> {
    if (!this.alive)
      return Promise.reject(new HelperClosedError(false))
    if (this.#requests.size >= MAX_ACTIVE)
      return Promise.reject(new Error('Too many searches are running in WSL at once'))
    const id = this.#nextId++
    const collector = collectSearch(request, () => this.#send({ op: 'cancel', id }))
    this.#requests.set(id, collector)
    this.#send({ id, program: request.program, args: request.args })
    return collector.done.finally(() => this.#requests.delete(id))
  }

  // Closes stdin so the helper ends its programs and exits; kills it if it does not.
  async close(): Promise<void> {
    if (!this.alive)
      return
    this.#child.stdin.end()
    const timer = setTimeout(() => this.#child.kill('SIGKILL'), STOP_TIMEOUT_MS)
    try {
      await this.closed.promise
    }
    finally {
      clearTimeout(timer)
    }
  }

  #send(message: object): void {
    if (this.alive)
      this.#child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  #read(chunk: string): void {
    this.#buffer += chunk
    for (let end = this.#buffer.indexOf('\n'); end !== -1; end = this.#buffer.indexOf('\n')) {
      const line = this.#buffer.slice(0, end)
      this.#buffer = this.#buffer.slice(end + 1)
      try {
        this.#handle(JSON.parse(line) as Frame)
      }
      catch {
        // A line that is not a frame cannot belong to any request; the helper only ever writes frames.
      }
    }
  }

  #handle(frame: Frame): void {
    if (frame.t === 'ready') {
      if (frame.v === WSL_HELPER_VERSION)
        this.#ready.resolve()
      else
        this.#ready.reject(new Error(`The WSL helper speaks protocol ${frame.v}, not ${WSL_HELPER_VERSION}`))
      return
    }
    const collector = frame.id === undefined ? undefined : this.#requests.get(frame.id)
    if (!collector)
      return
    if (frame.t === 'o')
      collector.stdout(Buffer.from(frame.d ?? '', 'base64'))
    else if (frame.t === 'e')
      collector.stderr(Buffer.from(frame.d ?? '', 'base64'))
    else if (frame.t === 'exit')
      collector.exit(frame.code ?? null, typeof frame.code === 'number' ? undefined : frame.err ?? 'SPAWN')
  }

  #end(error?: Error): void {
    if (!this.alive)
      return
    this.alive = false
    this.#ready.reject(error ?? new Error(relayError(this.#stderr) ?? (decodeDiagnostic(this.#stderr) || 'The WSL helper exited before it was ready')))
    for (const collector of this.#requests.values())
      collector.fail(new HelperClosedError(collector.received))
    this.#requests.clear()
    this.closed.resolve()
  }
}

// The helper of one distribution: started on first use, started again after it ends, and marked unavailable for a while
// when it cannot start (no python3, an old Python, a protocol mismatch) so that searches use one wsl.exe each instead.
class WslHost {
  #connection: Promise<HelperConnection> | undefined
  #unavailableUntil = 0
  readonly #distribution: string
  readonly #options: HostOptions

  constructor(distribution: string, options: HostOptions) {
    this.#distribution = distribution
    this.#options = options
  }

  async acquire(): Promise<HelperConnection | null> {
    if (this.#options.now() < this.#unavailableUntil)
      return null
    // A second pass restarts a helper that ended since the last search.
    for (let pass = 0; pass < 2; pass++) {
      const starting = this.#connection ??= this.#start()
      try {
        const connection = await starting
        if (connection.alive)
          return connection
      }
      catch {
        this.#unavailableUntil = this.#options.now() + UNAVAILABLE_RETRY_MS
        if (this.#connection === starting)
          this.#connection = undefined
        return null
      }
      if (this.#connection === starting)
        this.#connection = undefined
    }
    return null
  }

  async close(): Promise<void> {
    const starting = this.#connection
    this.#connection = undefined
    const connection = await starting?.catch(() => undefined)
    await connection?.close()
  }

  async #start(): Promise<HelperConnection> {
    const connection = new HelperConnection(this.#distribution, this.#options)
    try {
      await connection.ready()
    }
    catch (error) {
      await connection.close()
      throw error
    }
    return connection
  }
}

// Runs searches in WSL through one resident helper per distribution, which turns about 200 ms per search (a wsl.exe start)
// into about 10 ms. A search still works without it: when the helper cannot run, each search starts its own wsl.exe.
export class WslHostPool {
  readonly #hosts = new Map<string, WslHost>()
  readonly #options: HostOptions

  constructor(options: WslHostPoolOptions = {}) {
    this.#options = { idleSeconds: options.idleSeconds ?? DEFAULT_IDLE_SECONDS, now: options.now ?? Date.now, spawnProcess: options.spawnProcess ?? spawnWslHelper }
  }

  readonly run = async (request: WslSearchProcess): Promise<void> => {
    request.signal?.throwIfAborted()
    let host = this.#hosts.get(request.distribution)
    if (!host)
      this.#hosts.set(request.distribution, host = new WslHost(request.distribution, this.#options))
    for (let attempt = 0; ; attempt++) {
      const connection = await host.acquire()
      if (!connection)
        return runWslSearch(request)
      try {
        return await connection.search(request)
      }
      catch (error) {
        if (error instanceof HelperClosedError && !error.received && attempt === 0)
          continue
        throw error
      }
    }
  }

  async dispose(): Promise<void> {
    const hosts = [...this.#hosts.values()]
    this.#hosts.clear()
    await Promise.all(hosts.map(host => host.close()))
  }
}
