import type { SpawnWsl, SpawnWslHelper, WslSearchProcess } from '../wslProcess'
import { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WSL_HELPER_VERSION } from '../wslHelperScript'
import { WslHostPool } from '../WslHostPool'
import { executeWslFind, executeWslGrep, executeWslLs } from '../wslSearch'

const distribution = 'Ubuntu-24.04'

function text(result: { content: { text: string }[] }) {
  return result.content.map(item => item.text).join('\n')
}

// Runs `wsl.exe -d <distribution> --exec python3 -u -c <script> <idle>` as a local python3, so the real helper script
// and the real rg and find are exercised. They are Linux tools, hence the skips elsewhere.
type Helper = ReturnType<SpawnWslHelper>
function localHelper(started: Helper[]): SpawnWslHelper {
  return (_executable, args) => {
    const [, , , program, ...rest] = args
    const child = spawn(program!, rest, { stdio: ['pipe', 'pipe', 'pipe'] })
    started.push(child)
    return child
  }
}
const python = process.platform !== 'win32' ? spawnSync('python3', ['-c', 'import asyncio; asyncio.get_running_loop; import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)']) : undefined
const hasStack = python?.status === 0 && spawnSync('rg', ['--version']).status === 0 && spawnSync('find', ['.', '-maxdepth', '0', '-printf', 'x']).status === 0

describe.skipIf(!hasStack)('wslHostPool with the real helper', () => {
  let root: string
  let target: { distribution: string, linuxPath: string }
  let started: Helper[]
  let pool: WslHostPool
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'wsl-pool-'))
    target = { distribution, linuxPath: root }
    started = []
    pool = new WslHostPool({ spawnProcess: localHelper(started), idleSeconds: 60 })
  })
  afterEach(async () => {
    await pool.dispose()
    await rm(root, { recursive: true, force: true })
  })

  it('answers grep, find and ls the way the one-shot runner does, from one helper', async () => {
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', '文档.txt'), 'one\nneedle here\n')
    await writeFile(join(root, ' odd\nname '), '')
    expect(text(await executeWslGrep(target, { pattern: 'needle', context: 1 }, undefined, pool.run))).toBe('src/文档.txt-1- one\nsrc/文档.txt:2: needle here')
    expect(text(await executeWslFind(target, { pattern: '*' }, undefined, pool.run)).split('\n').sort()).toEqual([' odd', 'name ', 'src/文档.txt'].sort())
    expect(text(await executeWslLs(target, {}, undefined, pool.run))).toBe(' odd\nname \nsrc/')
    expect(started).toHaveLength(1)
  })

  it('keeps the arguments exactly as given', async () => {
    await writeFile(join(root, 'a.ts'), 'A.b(c) "q" $x\n')
    expect(text(await executeWslGrep(target, { pattern: 'a.b(c) "q" $x', literal: true, ignoreCase: true, glob: '*.ts' }, undefined, pool.run))).toBe('a.ts:1: A.b(c) "q" $x')
  })

  it('runs searches at the same time', async () => {
    await writeFile(join(root, 'a.txt'), 'needle\n')
    const results = await Promise.all(Array.from({ length: 12 }, () => executeWslGrep(target, { pattern: 'needle' }, undefined, pool.run)))
    expect(results.map(text)).toEqual(Array.from({ length: 12 }).fill('a.txt:1: needle'))
    expect(started).toHaveLength(1)
  })

  it('cancels the program when the search is satisfied and stays usable', async () => {
    await writeFile(join(root, 'big.txt'), 'needle\n'.repeat(200_000))
    const limited = await executeWslGrep(target, { pattern: 'needle', limit: 1 }, undefined, pool.run)
    expect(text(limited)).toContain('[1 matches limit reached')
    expect(text(await executeWslLs(target, {}, undefined, pool.run))).toBe('big.txt')
    expect(started).toHaveLength(1)
  })

  it('cancels a search that is aborted', async () => {
    await writeFile(join(root, 'big.txt'), 'needle\n'.repeat(200_000))
    const controller = new AbortController()
    const search = executeWslGrep(target, { pattern: 'needle', limit: 10_000 }, controller.signal, pool.run)
    setTimeout(() => controller.abort(), 5)
    await expect(search).rejects.toThrow()
    expect(text(await executeWslLs(target, {}, undefined, pool.run))).toBe('big.txt')
  })

  it('starts a new helper after the old one is gone', async () => {
    await writeFile(join(root, 'a.txt'), 'needle\n')
    await executeWslGrep(target, { pattern: 'needle' }, undefined, pool.run)
    const first = started[0]!
    const closed = new Promise(resolve => first.once('close', resolve))
    first.kill('SIGKILL')
    await closed
    expect(text(await executeWslGrep(target, { pattern: 'needle' }, undefined, pool.run))).toBe('a.txt:1: needle')
    expect(started).toHaveLength(2)
  })

  it('lets the helper exit when idle and starts another on the next search', async () => {
    const idle = new WslHostPool({ spawnProcess: localHelper(started), idleSeconds: 1 })
    try {
      await writeFile(join(root, 'a.txt'), 'needle\n')
      await executeWslGrep(target, { pattern: 'needle' }, undefined, idle.run)
      const closed = new Promise(resolve => started[0]!.once('close', resolve))
      await closed
      expect(text(await executeWslGrep(target, { pattern: 'needle' }, undefined, idle.run))).toBe('a.txt:1: needle')
      expect(started).toHaveLength(2)
    }
    finally {
      await idle.dispose()
    }
  })

  it('closes the helper when the pool is disposed', async () => {
    await executeWslLs(target, {}, undefined, pool.run)
    const closed = new Promise(resolve => started[0]!.once('close', resolve))
    await pool.dispose()
    await closed
    expect(started[0]!.exitCode !== null || started[0]!.signalCode !== null).toBe(true)
  })

  it('refuses a program that is not on its list', async () => {
    await expect(pool.run({ distribution, program: 'sh', args: ['-c', 'true'], separator: 10, successCodes: [0], onRecord: () => {} })).rejects.toThrow('sh is not allowed in the WSL helper')
  })
})

// A helper that is scripted rather than run: it writes frames and closes when the test says so.
class FakeHelper {
  readonly child: Helper
  readonly requests: { id: number, program: string, args: string[], op?: string }[] = []
  readonly #stdout = new PassThrough()
  readonly #stderr = new PassThrough()
  readonly #stdin = new PassThrough()

  constructor(options: { ready?: unknown, onRequest?: (request: FakeHelper['requests'][number], helper: FakeHelper) => void } = {}) {
    this.child = Object.assign(new EventEmitter(), { stdout: this.#stdout, stderr: this.#stderr, stdin: this.#stdin, kill: () => this.close(null) }) as unknown as Helper
    let buffer = ''
    this.#stdin.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      for (let end = buffer.indexOf('\n'); end !== -1; end = buffer.indexOf('\n')) {
        const request = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        this.requests.push(request)
        options.onRequest?.(request, this)
      }
    })
    this.#stdin.on('end', () => this.close(0))
    if (options.ready !== null)
      setImmediate(() => this.frame(options.ready ?? { t: 'ready', v: WSL_HELPER_VERSION }))
  }

  frame(value: unknown) {
    this.#stdout.write(`${JSON.stringify(value)}\n`)
  }

  out(id: number, data: string) {
    this.frame({ id, t: 'o', d: Buffer.from(data).toString('base64') })
  }

  stderr(data: string) {
    this.#stderr.write(data)
  }

  close(code: number | null) {
    setImmediate(() => this.child.emit('close', code))
  }
}

function sequence(...helpers: FakeHelper[]) {
  const calls: string[][] = []
  const spawnProcess: SpawnWslHelper = (_executable, args) => {
    calls.push(args)
    const helper = helpers[calls.length - 1]
    if (!helper)
      throw new Error('No scripted helper left')
    return helper.child
  }
  return { spawnProcess, calls }
}

// The one-shot runner a search falls back to, answering with one record.
function oneShot(record: string, used: string[][] = []): SpawnWsl {
  return (_executable, args) => {
    used.push(args)
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => {} })
    setImmediate(() => {
      child.stdout.write(`${record}\n`)
      setImmediate(() => child.emit('close', 0))
    })
    return child as unknown as ReturnType<SpawnWsl>
  }
}

function request(overrides: Partial<WslSearchProcess> = {}, seen: string[] = []): WslSearchProcess {
  return { distribution, program: 'rg', args: ['--', 'x'], separator: 10, successCodes: [0, 1], onRecord: record => void seen.push(record.toString()), ...overrides }
}

describe('wslHostPool when the helper cannot serve', () => {
  it('uses one wsl.exe per search when python3 is missing, and does not try again for a while', async () => {
    const missing = () => new FakeHelper({ ready: null })
    const first = missing()
    const second = missing()
    let now = 1000
    const { spawnProcess, calls } = sequence(first, second)
    const pool = new WslHostPool({ spawnProcess, now: () => now })
    const used: string[][] = []
    const seen: string[] = []
    setImmediate(() => {
      first.stderr('<3>WSL (1 - Relay) ERROR: CreateProcessCommon:875: execvpe(python3) failed: No such file or directory')
      first.close(1)
    })
    await pool.run(request({ spawnProcess: oneShot('from one-shot', used) }, seen))
    expect(seen).toEqual(['from one-shot'])
    expect(used).toEqual([['-d', distribution, '--exec', 'rg', '--', 'x']])
    await pool.run(request({ spawnProcess: oneShot('again', used) }, seen))
    expect(calls).toHaveLength(1)
    now += 5 * 60_000 + 1
    setImmediate(() => second.close(1))
    await pool.run(request({ spawnProcess: oneShot('later', used) }, seen))
    expect(calls).toHaveLength(2)
    expect(seen).toEqual(['from one-shot', 'again', 'later'])
    await pool.dispose()
  })

  it('falls back when the helper speaks another protocol version', async () => {
    const helper = new FakeHelper({ ready: { t: 'ready', v: WSL_HELPER_VERSION + 1 } })
    const pool = new WslHostPool({ spawnProcess: sequence(helper).spawnProcess })
    const seen: string[] = []
    await pool.run(request({ spawnProcess: oneShot('one-shot') }, seen))
    expect(seen).toEqual(['one-shot'])
    await pool.dispose()
  })
})

describe('wslHostPool when the helper goes away mid-search', () => {
  it('starts a search again on a new helper when the old one ended before answering', async () => {
    const dying = new FakeHelper({ onRequest: (_request, helper) => helper.close(1) })
    const healthy = new FakeHelper({
      onRequest: (message, helper) => {
        helper.out(message.id, 'answer\n')
        helper.frame({ id: message.id, t: 'exit', code: 0 })
      },
    })
    const { spawnProcess, calls } = sequence(dying, healthy)
    const pool = new WslHostPool({ spawnProcess })
    const seen: string[] = []
    await pool.run(request({}, seen))
    expect(seen).toEqual(['answer'])
    expect(calls).toHaveLength(2)
    await pool.dispose()
  })

  it('reports it instead of starting again once output was delivered', async () => {
    const helper = new FakeHelper({
      onRequest: (message, self) => {
        self.out(message.id, 'partial\n')
        setTimeout(() => self.close(1), 20)
      },
    })
    const { spawnProcess, calls } = sequence(helper, new FakeHelper())
    const pool = new WslHostPool({ spawnProcess })
    const seen: string[] = []
    await expect(pool.run(request({}, seen))).rejects.toThrow('The WSL helper stopped during the search')
    expect(seen).toEqual(['partial'])
    expect(calls).toHaveLength(1)
    await pool.dispose()
  })

  it('maps a program the helper could not start to the missing-program error', async () => {
    const helper = new FakeHelper({ onRequest: (message, self) => self.frame({ id: message.id, t: 'exit', code: null, err: 'ENOENT' }) })
    const pool = new WslHostPool({ spawnProcess: sequence(helper).spawnProcess })
    await expect(pool.run(request())).rejects.toThrow('rg is not installed in the WSL distribution Ubuntu-24.04; install ripgrep there (sudo apt install ripgrep)')
    await pool.dispose()
  })

  it('sends a cancel when the search is satisfied', async () => {
    const helper = new FakeHelper({ onRequest: (message, self) => message.op ? undefined : self.out(message.id, 'a\nb\nc\n') })
    const pool = new WslHostPool({ spawnProcess: sequence(helper).spawnProcess })
    const seen: string[] = []
    await pool.run(request({ onRecord: (record) => {
      seen.push(record.toString())
      return false
    } }, seen))
    expect(seen).toEqual(['a'])
    await new Promise(resolve => setImmediate(resolve))
    expect(helper.requests.map(message => message.op)).toEqual([undefined, 'cancel'])
    await pool.dispose()
  })
})
