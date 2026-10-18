import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

const plugin = new URL('../../../plugins/office-pptx/', import.meta.url)
const { validatePptx, readPptx } = await import(new URL('pptx.js', plugin).href)
const pptx = () => zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'ppt/presentation.xml': strToU8('<presentation/>') })

describe('office pptx plugin', () => {
  it('accepts a minimal presentation package', () => {
    const bytes = pptx()
    expect(validatePptx(bytes)).toEqual(bytes)
  })

  it('rejects a package without a presentation part or with unsafe names', () => {
    expect(() => validatePptx(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<document/>') }))).toThrow('OFFICE_INVALID_PPTX')
    expect(() => validatePptx(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'ppt/presentation.xml': strToU8('<p/>'), '../evil.xml': strToU8('x') }))).toThrow('OFFICE_INVALID_PPTX')
    expect(() => validatePptx(new Uint8Array(10))).toThrow('OFFICE_INVALID_PPTX')
  })

  it('reads in chunks, refuses other extensions and detects a file that changed while reading', async () => {
    const bytes = pptx()
    const resource = { id: 'r', name: '汇报.pptx', size: bytes.length }
    const resources = { readBytes: async (_file, { offset, length }) => ({ data: bytes.slice(offset, offset + length), size: bytes.length, eof: offset + length >= bytes.length }) }
    await expect(readPptx(resources, resource, new AbortController().signal)).resolves.toEqual(bytes)
    await expect(readPptx(resources, { ...resource, name: 'a.docx' }, new AbortController().signal)).rejects.toThrow('OFFICE_UNSUPPORTED_PPTX')
    const changed = { readBytes: async (_file, { offset, length }) => ({ data: bytes.slice(offset, offset + length), size: bytes.length + 1, eof: true }) }
    await expect(readPptx(changed, resource, new AbortController().signal)).rejects.toThrow('OFFICE_RESOURCE_CHANGED')
  })
})
