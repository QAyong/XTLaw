import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { extensionArchiveSchema } from '../../../shared/extensions/extensionAuthoring'
import { EXTENSION_ARCHIVE_BASE64_LIMIT } from '../../../shared/extensions/extensionPackageLimits'
import { EXTENSION_FILE_LIMIT, EXTENSION_PACKAGE_LIMIT, unpackExtension, validateExtensionFiles } from '../extensionFiles'

const chunk = new Uint8Array(EXTENSION_FILE_LIMIT)
const full = () => new Map(Array.from({ length: 4 }, (_, index) => [`part-${index}.bin`, chunk]))

describe('plugin package byte limits', () => {
  it('accepts 16 MiB files and exactly 64 MiB of expanded assets', () => {
    expect(EXTENSION_FILE_LIMIT).toBe(16 * 1024 * 1024)
    expect(EXTENSION_PACKAGE_LIMIT).toBe(64 * 1024 * 1024)
    expect(() => validateExtensionFiles(full())).not.toThrow()
  })
  it('rejects a byte beyond either expanded limit', () => {
    expect(() => validateExtensionFiles(new Map([['large.bin', new Uint8Array(EXTENSION_FILE_LIMIT + 1)]]))).toThrow('EXTENSION_PACKAGE_LIMIT')
    const files = full()
    files.set('extra.bin', new Uint8Array(1))
    expect(() => validateExtensionFiles(files)).toThrow('EXTENSION_PACKAGE_LIMIT')
  })
  it('accepts a formerly oversized asset and enforces aggregate expansion on compressed input', () => {
    const files = { 'editor.js': new Uint8Array(5 * 1024 * 1024) }
    expect(unpackExtension(zipSync(files)).get('editor.js')?.byteLength).toBe(5 * 1024 * 1024)
    const oversized = Object.fromEntries(full())
    oversized['extra.bin'] = new Uint8Array(1)
    expect(() => unpackExtension(zipSync(oversized))).toThrow('EXTENSION_PACKAGE_LIMIT')
  })
  it('bounds compressed input and preserves the file-count limit', () => {
    expect(() => unpackExtension(new Uint8Array(EXTENSION_PACKAGE_LIMIT + 1))).toThrow('EXTENSION_PACKAGE_LIMIT')
    expect(() => validateExtensionFiles(new Map(Array.from({ length: 513 }, (_, index) => [`${index}.txt`, new Uint8Array()])))).toThrow('EXTENSION_PACKAGE_LIMIT')
  })
  it('sizes base64 transport for a 64 MiB archive without the old 24 MiB ceiling', () => {
    expect(EXTENSION_ARCHIVE_BASE64_LIMIT).toBe(Math.ceil(EXTENSION_PACKAGE_LIMIT / 3) * 4)
    expect(extensionArchiveSchema.safeParse('A'.repeat(25 * 1024 * 1024)).success).toBe(true)
  })
})
