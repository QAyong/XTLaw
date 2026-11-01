import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { win32 } from 'node:path'
import process from 'node:process'

const MAX_CAPTURE_BYTES = 8 * 1024 * 1024
const MAX_STDERR_BYTES = 16 * 1024
const MAX_HEAD_BYTES = 4 * 1024
const SEARCH_TIMEOUT_MS = 30_000
// wsl.exe reports its own failures as `<3>WSL (pid - Relay) ERROR: ...` and may still exit with 0 or 1.
const RELAY_ERROR = /^<\d>WSL \([^)]*\) ERROR: (.*)$/m
const MISSING_PROGRAM = /execvpe\((.+?)\) failed/

export type SpawnWsl = (executable: string, args: string[]) => ChildProcessByStdio<null, Readable, Readable>

export interface WslSearchProcess {
  distribution: string
  program: string
  args: readonly string[]
  signal?: AbortSignal
  /** Byte that ends a record on stdout. */
  separator: number
  /** Return false to stop reading; the process is killed and the search counts as successful. */
  onRecord: (record: Buffer) => boolean | void
  successCodes: readonly number[]
  spawnProcess?: SpawnWsl
}

export type RunWslSearch = (request: WslSearchProcess) => Promise<void>

// The program ran and failed. Its message is in the language of the distribution (find, unlike rg, is localized),
// so callers decide from the exit code and the records already read, never from the text.
export class WslProgramError extends Error {
  readonly exitCode: number

  constructor(message: string, exitCode: number) {
    super(message)
    this.name = 'WslProgramError'
    this.exitCode = exitCode
  }
}

const spawnWsl: SpawnWsl = (executable, args) => spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })

// System32 is used instead of PATH so that a planted wsl.exe earlier on PATH is never run.
export function wslExecutable(): string {
  return process.platform === 'win32' ? win32.join(process.env.SystemRoot ?? String.raw`C:\Windows`, 'System32', 'wsl.exe') : 'wsl.exe'
}

// Messages that wsl.exe writes itself are UTF-16LE; everything a Linux program writes is UTF-8.
function decodeDiagnostic(bytes: Buffer): string {
  return (bytes.includes(0) ? bytes.toString('utf16le') : bytes.toString('utf8')).trim()
}

function describeFailure(request: WslSearchProcess, stderr: Buffer, head: Buffer, code: number | null): Error | null {
  const text = decodeDiagnostic(stderr)
  const relay = RELAY_ERROR.exec(text)
  if (relay) {
    const missing = MISSING_PROGRAM.exec(relay[1]!)
    if (missing)
      return new Error(`${missing[1]} is not installed in the WSL distribution ${request.distribution}${missing[1] === 'rg' ? '; install ripgrep there (sudo apt install ripgrep)' : ''}`)
    return new Error(`wsl.exe failed: ${relay[1]}`)
  }
  if (code !== null && !request.successCodes.includes(code))
    return new WslProgramError(text || decodeDiagnostic(head) || `Search exited with code ${code}`, code)
  return null
}

// Runs a program inside a WSL distribution through wsl.exe without a shell, so no argument is ever re-parsed by PowerShell or bash.
export function runWslSearch(request: WslSearchProcess): Promise<void> {
  const { distribution, program, args, signal, separator, onRecord } = request
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const child = (request.spawnProcess ?? spawnWsl)(wslExecutable(), ['-d', distribution, '--exec', program, ...args])
    let failure: Error | undefined
    let stopped = false
    let total = 0
    let stderr = Buffer.alloc(0)
    let head = Buffer.alloc(0)
    let pending: Buffer[] = []
    const stop = (error?: Error) => {
      failure ??= error
      stopped = true
      child.kill('SIGKILL')
    }
    const abort = () => stop(new Error('Operation aborted', { cause: signal?.reason }))
    const timer = setTimeout(() => stop(new Error('Search timed out; narrow the search path')), SEARCH_TIMEOUT_MS)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted)
      abort()
    const emit = (tail: Buffer) => {
      const record = pending.length ? Buffer.concat([...pending, tail]) : tail
      pending = []
      if (record.length && onRecord(record) === false)
        stop()
    }
    child.stdout.on('data', (chunk: Buffer) => {
      if (stopped)
        return
      // A line-oriented stream never contains NUL, so UTF-16 text here is wsl.exe itself failing (for example an unknown distribution).
      if (total === 0 && separator !== 0 && chunk.includes(0)) {
        stop(new Error(`wsl.exe failed: ${decodeDiagnostic(chunk)}`))
        return
      }
      if (head.length < MAX_HEAD_BYTES)
        head = Buffer.concat([head, chunk]).subarray(0, MAX_HEAD_BYTES)
      total += chunk.length
      if (total > MAX_CAPTURE_BYTES) {
        stop(new Error('Search output limit exceeded; narrow the search path or pattern'))
        return
      }
      try {
        let start = 0
        for (let end = chunk.indexOf(separator); end !== -1; end = chunk.indexOf(separator, start)) {
          emit(chunk.subarray(start, end))
          if (stopped)
            return
          start = end + 1
        }
        if (start < chunk.length)
          pending.push(chunk.subarray(start))
      }
      catch (error) {
        stop(error as Error)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stopped)
        return
      if (stderr.length + chunk.length > MAX_STDERR_BYTES) {
        stop(new Error('Search diagnostic output limit exceeded'))
        return
      }
      stderr = Buffer.concat([stderr, chunk])
    })
    child.once('error', (error) => {
      failure ??= error
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (!failure && !stopped)
        failure = describeFailure(request, stderr, head, code) ?? undefined
      if (!failure && !stopped && pending.length) {
        try {
          emit(Buffer.alloc(0))
        }
        catch (error) {
          failure = error as Error
        }
      }
      if (failure)
        reject(failure)
      else
        resolve()
    })
  })
}
