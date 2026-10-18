import type { ExtensionWorkbenchEvent } from '../../../shared/extensions/extensionApi'
import type { ExtensionServicePorts } from '../ExtensionService'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { ExtensionService } from '../ExtensionService'
import { createStore, manifest, reviewPackage } from './fixtures'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action()
})

const content = Buffer.from('a,b\n3,4\n')
const etag = 'e'.repeat(64)
const csv = { spaceId: 'space', directoryId: 'directory', revision: 1, path: 'data/table.csv' }
const text = { ...csv, path: 'data/notes.txt' }

function documentManifest(slug: string, extensions: string[], permissions: Record<string, unknown> = {}) {
  const id = `tests.${slug}`
  return manifest({
    id,
    apiVersion: 4,
    engines: { lexora: '^0.7.3' },
    permissions: { selectedResource: 'read', composerReference: true, ...permissions } as never,
    contributes: { commands: [], views: [{ id: `${id}.document`, title: slug, entry: 'view.js', resource: 'selected-file', accepts: { extensions }, location: 'context' }] },
  })
}

async function fixture(plugins: ReturnType<typeof documentManifest>[]) {
  const { root, store } = await createStore()
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  for (const plugin of plugins)
    await store.install((await reviewPackage(root, store, plugin)).token)
  const events: ExtensionWorkbenchEvent[] = []
  const ports: ExtensionServicePorts = {
    createHost: () => ({ call: async () => null, dispose: async () => {}, devtools: () => {} }),
    createView: () => ({ token: randomUUID(), url: 'lexora-extension://fixture/__view.html', dispose: () => {} }),
    workbench: async (event) => {
      events.push(event)
      if (event.kind === 'quote-capture')
        return JSON.stringify({ id: event.captureId, defaultId: null, targets: [{ id: randomUUID(), label: 'Task' }] })
      return randomUUID()
    },
    readText: async () => '',
    readBytes: async request => ({ base64: content.subarray(request.offset, request.offset + request.length).toString('base64'), size: content.length, eof: request.offset + request.length >= content.length, etag }),
    get: async () => new Response(''),
  }
  const service = new ExtensionService(store, ports)
  cleanup.push(() => service.dispose())
  return { store, service, events }
}

// Opens the plugin's file view the way the workbench does, then reads the whole file so quotes can be bound to its content.
async function openView(f: Awaited<ReturnType<typeof fixture>>, extensionId: string, target: typeof csv) {
  const resource = await f.store.grant(extensionId, target, () => {})
  const viewId = randomUUID()
  const session = await f.service.openView({ viewId, extensionId, viewType: `${extensionId}.document`, resource, state: {}, stateVersion: 1 })
  const request = (method: string, params: unknown) => f.service.viewRequest(session.id, session.generation, session.token, method, params as never)
  await request('resources.readBytes', { id: resource.id, offset: 0, length: 128 * 1024 })
  return { resource, request }
}

it('hands a file to the one plugin that accepts its extension, and leaves ambiguous or unaccepted files in the built-in preview', async () => {
  const f = await fixture([documentManifest('sheet', ['csv']), documentManifest('also-sheet', ['csv', 'tsv']), documentManifest('docs', ['docx']), documentManifest('off', ['pdf'])])
  expect(await f.service.openFile(csv)).toBeNull()
  expect(await f.service.openFile({ ...csv, path: 'a.tsv' })).not.toBeNull()
  expect(await f.service.openFile({ ...csv, path: 'report.DOCX' })).not.toBeNull()
  expect(await f.service.openFile({ ...csv, path: 'docx' })).toBeNull()
  expect(await f.service.openFile({ ...csv, path: 'a.xlsx' })).toBeNull()
  await f.service.enable('tests.off', false)
  expect(await f.service.openFile({ ...csv, path: 'a.pdf' })).toBeNull()
  expect(f.events.filter(event => event.kind === 'open').map(event => event.kind === 'open' && event.extensionId)).toEqual(['tests.also-sheet', 'tests.docs'])
})

it('stores a generic quote under the capturing plugin and the file it read, never under another plugin', async () => {
  const f = await fixture([documentManifest('sheet', ['csv'])])
  const view = await openView(f, 'tests.sheet', csv)
  const capture = await view.request('composer.captureQuote', { resourceId: view.resource.id, text: '3,4', kind: 'range', location: { row: 2, columns: [0, 1] } })
  expect(capture).toMatchObject({ defaultId: null })
  const event = f.events.find(item => item.kind === 'quote-capture')
  expect(event).toMatchObject({ quote: { text: '3,4', source: { kind: 'file', title: 'table.csv', file: csv, format: 'extension', extension: { extensionId: 'tests.sheet', kind: 'range', location: { row: 2, columns: [0, 1] } } } } })
  expect((event as { quote: { source: { extension: { hash: string } } } }).quote.source.extension.hash).toMatch(/^[a-f0-9]{64}$/)
  await expect(view.request('composer.captureQuote', { resourceId: view.resource.id, text: '3,4', kind: 'range', location: {}, extensionId: 'tests.other' })).rejects.toThrow()
})

it('rejects unbounded or malformed locations before anything reaches the workbench', async () => {
  const f = await fixture([documentManifest('sheet', ['csv'])])
  const view = await openView(f, 'tests.sheet', csv)
  const deep = { a: { b: { c: { d: { e: 1 } } } } }
  const inputs = [
    { kind: 'range', location: deep },
    { kind: 'range', location: 'x'.repeat(513) },
    { kind: 'range', location: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`k${index}`, 1])) },
    { kind: 'Bad Kind', location: {} },
    { kind: 'range', location: Array.from({ length: 65 }).fill(0) },
    { kind: 'range', location: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`k${index}`, 'x'.repeat(512)])) },
  ]
  for (const input of inputs)
    await expect(view.request('composer.captureQuote', { resourceId: view.resource.id, text: 'x', ...input })).rejects.toThrow()
  expect(f.events.some(event => event.kind === 'quote-capture')).toBe(false)
  // The request parser already drops a prototype key; whatever arrives must not carry one.
  await view.request('composer.captureQuote', { resourceId: view.resource.id, text: 'x', kind: 'range', location: JSON.parse('{"__proto__":{"admin":true},"row":1}') })
  const event = f.events.find(item => item.kind === 'quote-capture')
  expect(event && event.kind === 'quote-capture' && event.quote.source.kind === 'file' && Object.keys(event.quote.source.extension!.location as object)).toEqual(['row'])
})

it('only lets a plugin quote files its own view takes over, and only with the permission', async () => {
  const f = await fixture([documentManifest('sheet', ['csv']), documentManifest('plain', ['csv'], { composerReference: false })])
  const other = await openView(f, 'tests.sheet', text)
  await expect(other.request('composer.captureQuote', { resourceId: other.resource.id, text: 'x', kind: 'range', location: {} })).rejects.toThrow('EXTENSION_REFERENCE_DENIED')
  const plain = await openView(f, 'tests.plain', csv)
  await expect(plain.request('composer.captureQuote', { resourceId: plain.resource.id, text: 'x', kind: 'range', location: {} })).rejects.toThrow('EXTENSION_REFERENCE_DENIED')
  expect(f.events.some(event => event.kind === 'quote-capture')).toBe(false)
})

it('keeps the earlier DOCX, PPTX and XLSX quote shapes working for matching files and refuses mismatches', async () => {
  const f = await fixture([documentManifest('docs', ['docx']), documentManifest('deck', ['pptx']), documentManifest('book', ['xlsx']), documentManifest('sheet', ['csv'])])
  const docx = { ...csv, path: 'a.docx' }
  const pptx = { ...csv, path: 'a.pptx' }
  const xlsx = { ...csv, path: 'a.xlsx' }
  const range = { indexes: [0], from: 1, to: 2 }
  const cells = { cells: { sheetIndex: 0, sheet: 'S', range: 'A1:B2' } }
  for (const [slug, target, input] of [['docs', docx, range], ['deck', pptx, range], ['book', xlsx, cells]] as const) {
    const view = await openView(f, `tests.${slug}`, target)
    await view.request('composer.captureQuote', { resourceId: view.resource.id, text: 'x', ...input })
  }
  expect(f.events.filter(event => event.kind === 'quote-capture').map(event => event.kind === 'quote-capture' && event.quote.source.kind === 'file' && event.quote.source.format)).toEqual(['docx', 'pptx', 'xlsx'])
  const sheet = await openView(f, 'tests.sheet', csv)
  for (const input of [range, cells])
    await expect(sheet.request('composer.captureQuote', { resourceId: sheet.resource.id, text: 'x', ...input })).rejects.toThrow('EXTENSION_REFERENCE_DENIED')
  const book = await openView(f, 'tests.docs', { ...csv, path: 'b.docx' })
  await expect(book.request('composer.captureQuote', { resourceId: book.resource.id, text: 'x', ...cells })).rejects.toThrow('EXTENSION_REFERENCE_DENIED')
})
