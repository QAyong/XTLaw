import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverBundledPlugins } from '../../../packaging/buddy/release/bundled-plugins.mjs'
import { documentKitDrift, documentKitFiles, syncDocumentKit } from '../extensions/document-kit/sync.mjs'
import { extensionQuoteLocationIssue } from '../shared/conversation/extensionQuoteLocation.ts'
import { extensionQuoteInputSchema } from '../shared/extensions/extensionApi.ts'

const kit = new URL('../extensions/document-kit/', import.meta.url)
const { readWholeFile } = await import(new URL('read-file.js', kit).href)
const { validateZipContainer } = await import(new URL('zip-validate.js', kit).href)
const { checkQuoteLocation, captureQuote, addQuote } = await import(new URL('quote.js', kit).href)
const { Inflate } = await import(new URL('../../../plugins/office/vendor/fflate.js', import.meta.url).href)
const docx = await import(new URL('../../../plugins/office/docx.js', import.meta.url).href)
const pptx = await import(new URL('../../../plugins/office-pptx/pptx.js', import.meta.url).href)
const xlsx = await import(new URL('../../../plugins/office-xlsx/xlsx.js', import.meta.url).href)

const roots = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

// What each existing Office plugin passes to its own copy of the validator; the kit is the same code with these as options.
const plugins = {
  docx: { validate: docx.validateDocx, error: 'OFFICE_INVALID_DOCX', part: 'word/document.xml', options: { maxBytes: 64 * 1024 * 1024, maxEntryBytes: 64 * 1024 * 1024, maxExpandedBytes: 128 * 1024 * 1024, deadlineMs: 15000, inflateChunk: 1024 } },
  pptx: { validate: pptx.validatePptx, error: 'OFFICE_INVALID_PPTX', part: 'ppt/presentation.xml', options: { maxBytes: 64 * 1024 * 1024, maxEntryBytes: 64 * 1024 * 1024, maxExpandedBytes: 128 * 1024 * 1024, deadlineMs: 15000, inflateChunk: 1024 } },
  xlsx: { validate: xlsx.validateXlsx, error: 'OFFICE_INVALID_XLSX', part: 'xl/workbook.xml', options: { maxBytes: 64 * 1024 * 1024, maxEntryBytes: 256 * 1024 * 1024, maxExpandedBytes: 256 * 1024 * 1024, deadlineMs: 60000, inflateChunk: 64 * 1024 } },
}
function archive(part, extra = {}) {
  return zipSync({ '[Content_Types].xml': strToU8('<Types/>'), [part]: strToU8('<root>hello hello hello hello</root>'), ...extra })
}
function patch(bytes, change) {
  const copy = bytes.slice()
  change(new DataView(copy.buffer), copy)
  return copy
}
// Offsets of the first central directory entry, to flip individual fields.
function centralEntry(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let offset = bytes.length - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === 0x06054B50)
      return view.getUint32(offset + 16, true)
  }
  throw new Error('no directory')
}

describe('document kit ZIP validation matches the three Office plugins', () => {
  for (const [name, plugin] of Object.entries(plugins)) {
    it(`gives the same verdict as the ${name} plugin on valid and damaged archives`, () => {
      const valid = archive(plugin.part)
      const cases = {
        valid,
        missingPart: archive('other/file.xml'),
        notZip: new Uint8Array(40),
        tooSmall: new Uint8Array(10),
        truncated: valid.slice(0, valid.length - 5),
        encrypted: patch(valid, (view, bytes) => view.setUint16(centralEntry(bytes) + 8, view.getUint16(centralEntry(bytes) + 8, true) | 1, true)),
        oddMethod: patch(valid, (view, bytes) => view.setUint16(centralEntry(bytes) + 10, 12, true)),
        wrongSize: patch(valid, (view, bytes) => view.setUint32(centralEntry(bytes) + 24, 9999, true)),
        unsafeName: archive(plugin.part, { '../escape.xml': strToU8('x') }),
        absoluteName: archive(plugin.part, { '/abs.xml': strToU8('x') }),
        driveName: archive(plugin.part, { 'c:evil.xml': strToU8('x') }),
        stored: zipSync({ '[Content_Types].xml': [strToU8('<Types/>'), { level: 0 }], [plugin.part]: [strToU8('<root/>'), { level: 0 }] }),
      }
      for (const [label, data] of Object.entries(cases)) {
        const expected = (() => {
          try {
            plugin.validate(data)
            return 'ok'
          }
          catch (error) { return error.message }
        })()
        const actual = (() => {
          try {
            validateZipContainer(data, { ...plugin.options, Inflate, requiredParts: ['[Content_Types].xml', plugin.part], error: () => new Error(plugin.error) })
            return 'ok'
          }
          catch (error) { return error.message }
        })()
        expect(actual, `${name}: ${label}`).toBe(expected)
      }
      expect(cases.valid).toBeDefined()
    })
  }

  it('refuses archives over the limits it is given', () => {
    const data = archive('doc.xml')
    const options = { Inflate, maxBytes: 1 << 20, maxEntryBytes: 1 << 20, maxExpandedBytes: 1 << 20, error: () => new Error('BAD') }
    expect(validateZipContainer(data, options)).toEqual(data)
    expect(() => validateZipContainer(data, { ...options, maxBytes: 20 })).toThrow('BAD')
    expect(() => validateZipContainer(data, { ...options, maxEntryBytes: 4 })).toThrow('BAD')
    expect(() => validateZipContainer(data, { ...options, maxExpandedBytes: 4 })).toThrow('BAD')
    expect(() => validateZipContainer(data, { ...options, maxEntries: 1 })).toThrow('BAD')
    expect(() => validateZipContainer(data, { ...options, requiredParts: ['nope.xml'] })).toThrow('BAD')
  })
})

describe('document kit file reading', () => {
  const bytes = Uint8Array.from({ length: 300 * 1024 }, (_, index) => index % 251)
  const resource = { id: 'r', name: 'Report.CSV', size: bytes.length }
  const resources = { readBytes: async (_file, { offset, length }) => ({ data: bytes.slice(offset, offset + length), size: bytes.length, eof: offset + length >= bytes.length }) }

  it('reads chunk by chunk and returns the bytes', async () => {
    const calls = []
    const tracked = { readBytes: async (file, range) => {
      calls.push(range.length)
      return resources.readBytes(file, range)
    } }
    await expect(readWholeFile(tracked, resource, new AbortController().signal, { extensions: ['csv'] })).resolves.toEqual(bytes)
    expect(calls).toEqual([131072, 131072, 300 * 1024 - 2 * 131072])
  })

  it('refuses other names and sizes, and a file that changes while it is read', async () => {
    const signal = new AbortController().signal
    const options = { extensions: ['csv'], errors: { unsupported: 'NOPE', changed: 'CHANGED' } }
    await expect(readWholeFile(resources, { ...resource, name: 'a.txt' }, signal, options)).rejects.toThrow('NOPE')
    await expect(readWholeFile(resources, { ...resource, name: 'csv' }, signal, options)).rejects.toThrow('NOPE')
    await expect(readWholeFile(resources, resource, signal, { ...options, maxBytes: 10 })).rejects.toThrow('NOPE')
    await expect(readWholeFile(resources, { ...resource, size: 1.5 }, signal, options)).rejects.toThrow('NOPE')
    await expect(readWholeFile(resources, { ...resource, size: 70 * 1024 * 1024 }, signal, { extensions: ['csv'] })).rejects.toThrow('DOCUMENT_UNSUPPORTED')
    const grown = { readBytes: async (file, range) => ({ ...(await resources.readBytes(file, range)), size: bytes.length + 1 }) }
    await expect(readWholeFile(grown, resource, signal, options)).rejects.toThrow('CHANGED')
    const stopped = new AbortController()
    stopped.abort()
    await expect(readWholeFile(resources, resource, stopped.signal, options)).rejects.toThrow()
  })
})

describe('document kit quotes', () => {
  const location = value => ({ resourceId: '3b241101-e2bb-4255-8caf-4136c566a962', text: 'x', kind: 'range', location: value })

  it('judges locations exactly like the host does', () => {
    const deep = levels => levels === 0 ? 1 : { a: deep(levels - 1) }
    const cyclic = {}
    cyclic.self = cyclic
    const values = [
      null,
      true,
      7,
      'x',
      [1, 2],
      { row: 3, columns: [1, 2] },
      deep(4),
      deep(5),
      [[[[1]]]],
      [[[[[1]]]]],
      'x'.repeat(512),
      'x'.repeat(513),
      Array.from({ length: 64 }, (_, i) => i),
      Array.from({ length: 65 }, (_, i) => i),
      Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`k${i}`, 1])),
      Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, 1])),
      Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, 'x'.repeat(512)])),
      ['汉'.repeat(512), '汉'.repeat(512), '汉'.repeat(512)],
      { run: () => 1 },
      { a: undefined },
      undefined,
      { a: Number.NaN },
      [Number.POSITIVE_INFINITY],
      { a: 1n },
      { a: new Date(0) },
      new Map(),
      cyclic,
      JSON.parse('{"__proto__":{"x":1}}'),
      { constructor: 1 },
      { 'a b': 1 },
      { 1: 1 },
      Object.defineProperty({}, 'a', { get: () => 1, enumerable: true }),
      Object.assign(Object.create(null), { ok: 1 }),
      Array.from({ length: 5 }, () => Array.from({ length: 64 }).fill(1)),
    ]
    for (const value of values) {
      const kitRefuses = value === undefined || checkQuoteLocation(value) !== null
      const hostRefuses = value === undefined || extensionQuoteLocationIssue(value) !== null
      expect(kitRefuses, `value #${values.indexOf(value)}`).toBe(hostRefuses)
      // Whatever the kit lets through, the host's input schema accepts too.
      if (!kitRefuses)
        expect(extensionQuoteInputSchema.safeParse(location(value)).success).toBe(true)
    }
  })

  it('checks before calling the host and forwards valid quotes unchanged', async () => {
    const calls = []
    const context = { resource: { id: 'r', name: 'a.csv', size: 1 }, composer: {
      captureQuote: async (...args) => {
        calls.push(args)
        return { id: 'c', defaultId: null, targets: [] }
      },
      addQuote: async (...args) => {
        calls.push(args)
        return 'added'
      },
    } }
    expect(() => captureQuote(context, { text: ' ', kind: 'range', location: {} })).toThrow('DOCUMENT_QUOTE_TEXT_INVALID')
    expect(() => captureQuote(context, { text: 'x'.repeat(32769), kind: 'range', location: {} })).toThrow('DOCUMENT_QUOTE_TEXT_INVALID')
    expect(() => captureQuote(context, { text: 'x', kind: 'Range', location: {} })).toThrow('DOCUMENT_QUOTE_KIND_INVALID')
    expect(() => captureQuote(context, { text: 'x', kind: 'range', location: 'y'.repeat(600) })).toThrow('DOCUMENT_QUOTE_LOCATION_INVALID')
    expect(calls).toEqual([])
    const capture = await captureQuote(context, { text: 'x', kind: 'range', location: { row: 1 } })
    expect(await addQuote(context, capture, 'target')).toBe('added')
    expect(calls).toEqual([[context.resource, { text: 'x', kind: 'range', location: { row: 1 } }], ['c', 'target']])
  })
})

describe('document kit sync', () => {
  it('copies the kit into a plugin and reports copies that drifted', async () => {
    const plugin = await mkdtemp(join(tmpdir(), 'xtlaw-kit-'))
    roots.push(plugin)
    expect(await documentKitDrift(plugin)).toEqual(documentKitFiles)
    await syncDocumentKit(plugin)
    expect(await documentKitDrift(plugin)).toEqual([])
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(plugin, 'document-kit', 'quote.js'), '// edited\n')
    expect(await documentKitDrift(plugin)).toEqual(['quote.js'])
    expect(await readFile(fileURLToPath(new URL('quote.js', kit)), 'utf8')).toContain('checkQuoteLocation')
  })

  it('copies only the files asked for', async () => {
    const plugin = await mkdtemp(join(tmpdir(), 'xtlaw-kit-'))
    roots.push(plugin)
    await syncDocumentKit(plugin, ['reveal.js'])
    expect(await documentKitDrift(plugin, ['reveal.js'])).toEqual([])
    expect(await documentKitDrift(plugin)).toEqual(['read-file.js', 'zip-validate.js', 'quote.js'])
  })

  it.each(['office', 'office-pptx', 'office-xlsx', 'office-pdf'])('%s ships the current reveal.js', async (name) => {
    expect(await documentKitDrift(fileURLToPath(new URL(`../../../plugins/${name}/`, import.meta.url)), ['reveal.js'])).toEqual([])
  })

  it('is the code the example plugin ships, and never a bundled plugin by itself', async () => {
    expect(await documentKitDrift(fileURLToPath(new URL('../extensions/examples/csv-viewer/', import.meta.url)))).toEqual([])
    expect(discoverBundledPlugins().map(plugin => plugin.name)).not.toContain('csv-viewer')
    expect(discoverBundledPlugins().map(plugin => plugin.name)).not.toContain('document-kit')
  })
})
