import { Buffer } from 'node:buffer'
import { bytesToHex } from '@noble/hashes/utils.js'
import CryptoJS from 'crypto-js'

// Synchronous digests and AES used by password-protected PDFs. Certificate and signature APIs stay unavailable.
const hashAlgorithms: Record<string, any> = {
  md5: CryptoJS.algo.MD5,
  sha256: CryptoJS.algo.SHA256,
  sha384: CryptoJS.algo.SHA384,
  sha512: CryptoJS.algo.SHA512,
}

function toWordArray(bytes: Uint8Array) {
  const words: number[] = []
  for (let i = 0; i < bytes.length; i++)
    words[i >>> 2] = (words[i >>> 2] ?? 0) | (bytes[i]! << (24 - (i % 4) * 8))
  return CryptoJS.lib.WordArray.create(words, bytes.length)
}

function fromWordArray(value: { words: number[], sigBytes: number }): Uint8Array {
  const bytes = new Uint8Array(value.sigBytes)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = (value.words[i >>> 2]! >>> (24 - (i % 4) * 8)) & 0xFF
  return bytes
}

export function createHash(algorithm: string) {
  const factory = hashAlgorithms[algorithm]
  if (!factory)
    throw new Error(`Unsupported hash algorithm: ${algorithm}`)
  const hash = factory.create()
  return {
    update(value: string | Uint8Array) {
      hash.update(toWordArray(typeof value === 'string' ? new TextEncoder().encode(value) : value))
      return this
    },
    digest(encoding?: string) {
      const bytes = fromWordArray(hash.finalize())
      if (encoding === 'hex')
        return bytesToHex(bytes)
      if (encoding)
        throw new Error('Unsupported digest encoding')
      return Buffer.from(bytes)
    },
  }
}

export function randomUUID(): string {
  return globalThis.crypto.randomUUID()
}

export function randomBytes(length: number): Buffer {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(length)))
}

type CipherMode = 'encrypt' | 'decrypt'

function createAesCipher(mode: CipherMode, algorithm: string, key: Uint8Array, iv: Uint8Array | null) {
  const match = /^aes-(128|256)-(cbc|ecb)$/.exec(algorithm)
  if (!match)
    throw new Error(`Unsupported cipher: ${algorithm}`)
  const keyBits = Number(match[1])
  const aesMode = match[2] === 'ecb' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC
  if (match[2] === 'cbc' && !iv)
    throw new Error('AES-CBC requires an IV')
  let autoPadding = true
  let finalized = false
  const parts: Uint8Array[] = []

  return {
    setAutoPadding(enabled = true) {
      autoPadding = enabled
      return this
    },
    update(value: Uint8Array) {
      if (finalized)
        throw new Error('Cipher already finalized')
      parts.push(value.slice())
      return Buffer.alloc(0)
    },
    final() {
      if (finalized)
        throw new Error('Cipher already finalized')
      finalized = true
      const length = parts.reduce((sum, part) => sum + part.length, 0)
      const input = new Uint8Array(length)
      let offset = 0
      for (const part of parts) {
        input.set(part, offset)
        offset += part.length
      }
      const options = {
        mode: aesMode,
        padding: autoPadding ? CryptoJS.pad.Pkcs7 : CryptoJS.pad.NoPadding,
        ...(iv ? { iv: toWordArray(iv) } : {}),
      }
      const keyWords = toWordArray(key)
      const output = mode === 'encrypt'
        ? CryptoJS.AES.encrypt(toWordArray(input), keyWords, options).ciphertext
        : CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: toWordArray(input) }), keyWords, options)
      // The upstream code supplies only 128-bit or 256-bit keys for these modes.
      if (key.length * 8 !== keyBits)
        throw new Error('Invalid AES key length')
      return Buffer.from(fromWordArray(output))
    },
  }
}

export function createCipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array | null) {
  return createAesCipher('encrypt', algorithm, key, iv)
}

export function createDecipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array | null) {
  return createAesCipher('decrypt', algorithm, key, iv)
}

export class X509Certificate {
  constructor() {
    throw new Error('OFFICE_FEATURE_UNAVAILABLE')
  }
}

export function verify(): never {
  throw new Error('OFFICE_FEATURE_UNAVAILABLE')
}
