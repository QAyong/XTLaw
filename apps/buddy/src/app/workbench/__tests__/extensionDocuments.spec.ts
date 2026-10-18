import type { ExtensionStatus } from '@buddy-shared/extensions/extensionApi'
import { extensionManifestSchema } from '@buddy-shared/extensions/extensionManifest'
import { describe, expect, it, vi } from 'vitest'
import { ExtensionDocumentRouter } from '../extensionDocuments'

function status(slug: string, extensions: string[], options: { enabled?: boolean, compatible?: boolean, reference?: boolean, views?: number } = {}): ExtensionStatus {
  const id = `p0123456789abcdef0123456789abcdef.${slug}`
  const views = Array.from({ length: options.views ?? 1 }, (_, index) => ({ id: `${id}.view${index}`, title: slug, entry: 'view.js', resource: 'selected-file', accepts: { extensions }, location: 'context' }))
  const manifest = extensionManifestSchema.parse({
    schemaVersion: 1,
    id,
    name: slug,
    version: '1.0.0',
    apiVersion: 4,
    engines: { lexora: '>=0.1.0 <1.0.0' },
    permissions: { selectedResource: 'read', ...(options.reference ? { composerReference: true } : {}) },
    contributes: { views },
  })
  return { manifest, enabled: options.enabled ?? true, compatible: options.compatible ?? true, revision: slug } as ExtensionStatus
}

function router(initial: ExtensionStatus[]) {
  let statuses = initial
  let changed: (() => void) | undefined
  const stop = vi.fn()
  const api = { list: vi.fn(async () => statuses), onChanged: vi.fn((listener: () => void) => { changed = listener; return stop }) }
  const documents = new ExtensionDocumentRouter(api)
  return { documents, stop, update(next: ExtensionStatus[]) { statuses = next; changed?.() } }
}

describe('extension document routing', () => {
  it('routes files by the accepts.extensions of installed plugins, regardless of case', async () => {
    const { documents } = router([status('docs', ['docx']), status('sheets', ['xlsx', 'csv'])])
    await documents.whenReady()
    expect(['a/合同.DOCX', 'book.xlsx', 'x.y/z.CSV'].every(path => documents.isDocument(path))).toBe(true)
    expect(['a.xls', 'deck.pptx', 'docx', 'notes.md', 'book.xlsx.bak'].some(path => documents.isDocument(path))).toBe(false)
  })

  it('does not route to disabled or incompatible plugins, or when several views accept the extension', async () => {
    const { documents } = router([
      status('off', ['pdf'], { enabled: false }),
      status('old', ['md'], { compatible: false }),
      status('one', ['csv']),
      status('two', ['csv']),
      status('twice', ['txt'], { views: 2 }),
    ])
    await documents.whenReady()
    expect(['a.pdf', 'a.md', 'a.csv', 'a.txt'].some(path => documents.isDocument(path))).toBe(false)
  })

  it('allows quoting only where the handling plugin holds the composer reference permission', async () => {
    const { documents } = router([status('docs', ['docx'], { reference: true }), status('viewer', ['pdf'])])
    await documents.whenReady()
    expect(documents.isQuotable('a.docx')).toBe(true)
    expect(documents.isQuotable('a.pdf')).toBe(false)
    expect(documents.isQuotable('a.xlsx')).toBe(false)
  })

  it('follows plugin changes and reports readiness only after the first answer', async () => {
    const { documents, update, stop } = router([])
    expect(documents.loaded).toBe(false)
    await documents.whenReady()
    expect(documents.loaded).toBe(true)
    expect(documents.isDocument('a.docx')).toBe(false)
    update([status('docs', ['docx'])])
    await vi.waitFor(() => expect(documents.isDocument('a.docx')).toBe(true))
    update([status('docs', ['docx'], { enabled: false })])
    await vi.waitFor(() => expect(documents.isDocument('a.docx')).toBe(false))
    documents.dispose()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('keeps every file in the built-in preview when the plugin list cannot be read', async () => {
    const documents = new ExtensionDocumentRouter({ list: async () => { throw new Error('unavailable') }, onChanged: () => () => {} })
    await documents.whenReady()
    expect(documents.loaded).toBe(true)
    expect(documents.isDocument('a.docx')).toBe(false)
  })
})
