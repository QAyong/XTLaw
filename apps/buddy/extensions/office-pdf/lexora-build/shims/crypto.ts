import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

// Only the digests the editor's save code asks for; signing and certificate code is not reachable from the plugin.
export function createHash(algorithm: string) {
  if (algorithm !== 'sha256')
    throw new Error('Only SHA-256 is available in the PDF editor')
  const hash = sha256.create()
  return {
    update(value: string | Uint8Array) {
      hash.update(typeof value === 'string' ? new TextEncoder().encode(value) : value)
      return this
    },
    digest(encoding: string) {
      if (encoding !== 'hex')
        throw new Error('Unsupported digest encoding')
      return bytesToHex(hash.digest())
    },
  }
}

export function randomUUID(): string {
  return globalThis.crypto.randomUUID()
}

export function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length))
}

export class X509Certificate {
  constructor() {
    throw new Error('OFFICE_FEATURE_UNAVAILABLE')
  }
}

export function verify(): never {
  throw new Error('OFFICE_FEATURE_UNAVAILABLE')
}
