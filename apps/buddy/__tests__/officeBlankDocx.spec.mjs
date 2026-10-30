import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { blankDocx } from '../../../plugins/office/blank-docx.js'
import { createOfficeBridge } from '../../../plugins/office/bridge.js'
import { validateDocx } from '../../../plugins/office/docx.js'

function bridgeFor(size) {
  const readBytes = vi.fn(async (_resource, { offset, length }) => ({ size, data: new Uint8Array(Math.max(0, Math.min(length, size - offset))), eof: offset + length >= size }))
  const ui = { error: vi.fn(), busy: vi.fn(), file: vi.fn(), status: vi.fn(), describeError: error => error?.message }
  const lifetime = new AbortController()
  const context = { signal: lifetime.signal, environment: { language: 'en-US', colorScheme: 'light' }, onEnvironmentChange: () => ({ dispose() {} }), resource: { id: 'file', name: 'New.docx', size }, resources: { readBytes } }
  return { bridge: createOfficeBridge(context, ui), readBytes, ui, context, lifetime }
}

describe('a blank Word package', () => {
  it('is a valid document with one empty paragraph', () => {
    const bytes = blankDocx()
    validateDocx(bytes)
    const files = unzipSync(bytes)
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml'])
    expect(strFromU8(files['word/document.xml'])).toMatch(/<w:body><w:p>.*<\/w:p><w:sectPr>/)
  })
})

describe('opening an empty .docx file', () => {
  it('hands the editor a blank document and reads the file once so a later save knows which version it replaces', async () => {
    const f = bridgeFor(0)
    const file = await f.bridge.stage(f.context.resource)
    expect(f.ui.error).not.toHaveBeenCalled()
    expect(f.readBytes).toHaveBeenCalledOnce()
    expect(f.readBytes).toHaveBeenCalledWith(f.context.resource, { offset: 0, length: 1 })
    expect(file.name).toBe('New.docx')
    validateDocx(f.bridge.takeDocBytes(file.dataUrl))
    f.lifetime.abort()
  })

  it('still refuses a file that is neither empty nor a Word package', async () => {
    const f = bridgeFor(10)
    expect(await f.bridge.stage(f.context.resource)).toBeNull()
    expect(f.ui.error).toHaveBeenCalledOnce()
    f.lifetime.abort()
  })
})
