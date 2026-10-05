import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

// The view supplies bytes in bounded chunks; only the host chooses the target.
export class ExtensionSelectedFileWriter {
  readonly id = randomUUID()
  readonly #chunks: Buffer[] = []
  readonly #abort = new AbortController()
  #written = 0
  #closed = false
  #tail: Promise<unknown> = Promise.resolve()
  readonly size: number
  readonly save: (bytes: Buffer, signal: AbortSignal) => Promise<void>
  readonly assertCurrent: () => void

  constructor(size: number, save: (bytes: Buffer, signal: AbortSignal) => Promise<void>, assertCurrent: () => void) {
    if (!Number.isSafeInteger(size) || size < 0 || size > 64 * 1024 * 1024)
      throw new Error('EXTENSION_RESOURCE_WRITE_RANGE')
    this.size = size
    this.save = save
    this.assertCurrent = assertCurrent
  }

  append(offset: number, base64: string): Promise<void> {
    return this.#enqueue(async () => {
      const bytes = Buffer.from(base64, 'base64')
      if (offset !== this.#written || !bytes.length || bytes.length > 96 * 1024 || this.#written + bytes.length > this.size)
        throw new Error('EXTENSION_RESOURCE_WRITE_RANGE')
      this.#chunks.push(bytes)
      this.#written += bytes.length
    })
  }

  commit(): Promise<void> {
    return this.#enqueue(async () => {
      if (this.#written !== this.size)
        throw new Error('EXTENSION_RESOURCE_WRITE_INCOMPLETE')
      await this.save(Buffer.concat(this.#chunks, this.size), this.#abort.signal)
      this.#closed = true
      this.#chunks.length = 0
    })
  }

  async dispose(): Promise<void> {
    this.#abort.abort()
    this.#closed = true
    await this.#tail.catch(() => {})
    this.#chunks.length = 0
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const pending = this.#tail.then(async () => {
      this.assertCurrent()
      if (this.#closed)
        throw new Error('EXTENSION_RESOURCE_WRITE_EXPIRED')
      await operation()
    })
    this.#tail = pending.catch(() => {})
    return pending
  }
}
