import { Buffer } from 'node:buffer'
import { sha1 } from '@noble/hashes/legacy.js'
import { sha256 } from '@noble/hashes/sha2.js'

const algorithms: Record<string, (data: Uint8Array) => Uint8Array> = { sha256, sha1 }
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export function createHash(algorithm: string) {
  const hash = algorithms[algorithm.toLowerCase()]
  if (!hash)
    throw new Error(`SLIDES_FEATURE_UNAVAILABLE: hash ${algorithm}`)
  const chunks: Uint8Array[] = []
  const api = {
    update(data: string | Uint8Array) {
      chunks.push(typeof data === 'string' ? new TextEncoder().encode(data) : data)
      return api
    },
    digest(encoding?: string) {
      const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
      const all = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) {
        all.set(chunk, offset)
        offset += chunk.byteLength
      }
      const bytes = hash(all)
      return encoding === 'hex' ? hex(bytes) : Buffer.from(bytes)
    },
  }
  return api
}
export const randomUUID = () => globalThis.crypto.randomUUID()
export const randomBytes = (size: number) => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size)))
export default { createHash, randomUUID, randomBytes }
