import type { BuddyTextQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { ExtensionViews } from '@/modules/extensions'
import type { WorkbenchController } from '@/workbench/services/WorkbenchController'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowReactive } from 'vue'
import { WorkbenchSelectionReferences } from '@/shared/ui/selection/workbenchSelectionReferences'
import { documentLocator } from '../extensionDocumentLocator'
import { useExtensionDocumentReveal } from '../useExtensionDocumentReveal'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

const file = { spaceId: 'space', directoryId: 'directory', revision: 1, path: 'report.docx' }
const hash = 'a'.repeat(64)
function docx(source: Record<string, unknown> = {}): BuddyTextQuote {
  return ({
    id: 'quote',
    text: 'Quoted words',
    source: { kind: 'file', title: 'report.docx', file, format: 'docx', docx: { hash, indexes: [2, 3], from: 10, to: 22 }, ...source },
  }) as BuddyTextQuote
}

function fixture() {
  const layoutViews: Record<string, { id: string, resource: { scheme: string } }> = { doc: { id: 'doc', resource: { scheme: 'extension' } }, task: { id: 'task', resource: { scheme: 'task' } } }
  const listeners = new Set<() => void>()
  const controller = { layout: { views: layoutViews }, onDidChangeLayout: (listener: () => void) => {
    listeners.add(listener)
    return { dispose: () => listeners.delete(listener) }
  } } as unknown as WorkbenchController
  const surface = shallowReactive({ ready: true, visible: true, eligible: true, error: null as unknown, session: { id: 'doc' } })
  const revealReference = vi.fn(async (_id: string, _input: unknown, _signal: AbortSignal) => true)
  const views = { surfaces: new Map([['doc', surface]]), revealReference } as unknown as ExtensionViews
  const references = new WorkbenchSelectionReferences({ targets: () => [] })
  const scope = effectScope()
  scope.run(() => useExtensionDocumentReveal({ references, controller, views }))
  cleanups.push(() => scope.stop())
  return { references, surface, revealReference, layoutViews, changeLayout: () => listeners.forEach(listener => listener()) }
}

describe('document locator', () => {
  it.each([
    ['docx', { docx: { hash, indexes: [2], from: 1, to: 4 } }, { format: 'docx', hash, indexes: [2], from: 1, to: 4 }],
    ['pptx', { pptx: { hash, indexes: [0], from: 0, to: 9 } }, { format: 'pptx', hash, indexes: [0], from: 0, to: 9 }],
    ['xlsx', { xlsx: { hash, sheetIndex: 1, sheet: 'Data', range: 'A1:B2' } }, { format: 'xlsx', hash, sheetIndex: 1, sheet: 'Data', range: 'A1:B2' }],
    ['extension', { extension: { extensionId: 'tests.pdf', kind: 'pdf-page', hash, location: { page: 3 } } }, { format: 'extension', kind: 'pdf-page', hash, location: { page: 3 } }],
  ])('hands the stored %s position back as locator data', (format, extra, data) => {
    const quote = docx({ format, docx: undefined, ...extra })
    expect(documentLocator((quote as { source: Parameters<typeof documentLocator>[0] }).source)).toEqual({ version: 1, data })
  })

  it('has nothing to hand back for source files', () => {
    expect(documentLocator((docx({ format: 'source', docx: undefined }) as { source: Parameters<typeof documentLocator>[0] }).source)).toBeNull()
  })
})

describe('revealing a quote in a plugin document view', () => {
  it('asks the plugin view with the quote text and the stored position', async () => {
    const f = fixture()
    const abort = new AbortController()
    expect(await f.references.reveal('doc', docx(), () => !abort.signal.aborted)).toBe(true)
    expect(f.revealReference).toHaveBeenCalledWith('doc', { referenceId: 'quote', text: 'Quoted words', locator: { version: 1, data: { format: 'docx', hash, indexes: [2, 3], from: 10, to: 22 } } }, expect.any(AbortSignal))
  })

  it('reports false when the plugin cannot find the place or the quote has no position', async () => {
    const f = fixture()
    f.revealReference.mockResolvedValueOnce(false)
    expect(await f.references.reveal('doc', docx(), () => true)).toBe(false)
    expect(await f.references.reveal('doc', docx({ docx: undefined }), () => true)).toBe(false)
    expect(f.revealReference).toHaveBeenCalledOnce()
  })

  it('waits for the plugin view to be ready before asking', async () => {
    const f = fixture()
    f.surface.ready = false
    const pending = f.references.reveal('doc', docx(), () => true)
    await new Promise(resolve => setTimeout(resolve, 120))
    expect(f.revealReference).not.toHaveBeenCalled()
    f.surface.ready = true
    expect(await pending).toBe(true)
  })

  it('gives up when the request stops being current or the view failed', async () => {
    const f = fixture()
    f.surface.ready = false
    let current = true
    const pending = f.references.reveal('doc', docx(), () => current)
    current = false
    expect(await pending).toBe(false)
    f.surface.error = new Error('failed')
    expect(await f.references.reveal('doc', docx(), () => true)).toBe(false)
    expect(f.revealReference).not.toHaveBeenCalled()
  })

  it('cancels the plugin request when the locate is no longer current', async () => {
    const f = fixture()
    let current = true
    let signal: AbortSignal | undefined
    f.revealReference.mockImplementationOnce((_id, _input, requestSignal) => new Promise<boolean>((resolve) => {
      signal = requestSignal
      requestSignal.addEventListener('abort', () => resolve(false))
    }))
    const pending = f.references.reveal('doc', docx(), () => current)
    await new Promise(resolve => setTimeout(resolve, 20))
    current = false
    expect(await pending).toBe(false)
    expect(signal?.aborted).toBe(true)
  })

  it('only registers plugin views, following the layout', async () => {
    const f = fixture()
    expect(await f.references.reveal('task', docx(), () => true)).toBe(false)
    f.layoutViews.second = { id: 'second', resource: { scheme: 'extension' } }
    f.surface.session = { id: 'doc' }
    expect(await f.references.reveal('second', docx(), () => true)).toBe(false)
    f.changeLayout()
    f.revealReference.mockClear()
    // A registered view without a mounted surface is not asked.
    const pending = f.references.reveal('second', docx(), () => false)
    expect(await pending).toBe(false)
    delete f.layoutViews.doc
    f.changeLayout()
    expect(await f.references.reveal('doc', docx(), () => true)).toBe(false)
    expect(f.revealReference).not.toHaveBeenCalled()
  })
})
