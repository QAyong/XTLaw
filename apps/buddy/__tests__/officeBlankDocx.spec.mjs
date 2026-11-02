import { strFromU8, unzipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { blankDocx } from '../../../plugins/office/blank-docx.js'
import { createOfficeBridge } from '../../../plugins/office/bridge.js'
import { validateDocx } from '../../../plugins/office/docx.js'

function bridgeFor(size) {
  // The selected file is opened as a working copy of the host, which hands the bytes over whole.
  const document = { id: 'copy', name: 'New.docx', location: 'folder/New.docx', version: 'a'.repeat(64), revision: 'b'.repeat(64), size, writable: true, kind: 'file', recovery: false, openedAt: 0 }
  const documents = { open: vi.fn(async () => document), read: vi.fn(async () => new Uint8Array(size)), status: vi.fn(async () => ({ changed: false })) }
  const ui = { error: vi.fn(), busy: vi.fn(), file: vi.fn(), status: vi.fn(), describeError: error => error?.message }
  const lifetime = new AbortController()
  const context = { signal: lifetime.signal, environment: { language: 'en-US', colorScheme: 'light' }, onEnvironmentChange: () => ({ dispose() {} }), resource: { id: 'file', name: 'New.docx', size }, documents }
  return { bridge: createOfficeBridge(context, ui), documents, ui, context, lifetime }
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
  // The session looks for changes when the page regains focus; a plain Node run has no page.
  beforeEach(() => {
    vi.stubGlobal('addEventListener', () => {})
    vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hands the editor a blank document and opens the file once so a later save knows which version it replaces', async () => {
    const f = bridgeFor(0)
    const file = await f.bridge.stage(f.context.resource)
    expect(f.ui.error).not.toHaveBeenCalled()
    expect(f.documents.open).toHaveBeenCalledOnce()
    expect(f.documents.open).toHaveBeenCalledWith(f.context.resource)
    expect(f.documents.read).toHaveBeenCalledOnce()
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
