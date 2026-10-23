import type { BuddyFileQuote } from '../buddyUserContent'
import { describe, expect, it } from 'vitest'
import { extensionQuoteInputSchema } from '../../extensions/extensionApi'
import { appendBuddyResourceQuote, BUDDY_QUOTE_TOTAL_TEXT_LIMIT, buddyResourceQuoteSchema, buddyUserMessageContentV1Schema, createBuddyUserContent } from '../buddyUserContent'
import { projectBuddyUserContent } from '../buddyUserContentProjection'
import { EXTENSION_QUOTE_LOCATION_BYTES, extensionQuoteLocationIssue } from '../extensionQuoteLocation'

const hash = 'a'.repeat(64)
const file = { spaceId: 'space', directoryId: 'directory', revision: 1, path: 'data/table.csv' }
type FileSource = Extract<BuddyFileQuote['source'], { kind: 'file' }>
function quote(location: unknown = { row: 3, columns: [1, 2] }, patch: Partial<BuddyFileQuote> = {}): BuddyFileQuote {
  return {
    id: 'csv-quote',
    text: '3,4',
    source: { kind: 'file', title: 'table.csv', file, format: 'extension', extension: { extensionId: 'pabc.csv-sheet', kind: 'range', hash, location: location as never } },
    ...patch,
  }
}

describe('extension quote location', () => {
  it('accepts plain bounded JSON', () => {
    for (const value of [null, true, 7, 'x', [1, 2, 3], { row: 3, columns: [1, 2], nested: { a: { b: { c: 1 } } } }, Object.assign(Object.create(null), { ok: 1 })])
      expect(extensionQuoteLocationIssue(value), JSON.stringify(value)).toBeNull()
  })

  it('rejects values that are not plain JSON', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const getter = Object.defineProperty({}, 'a', { get: () => 1, enumerable: true })
    class Point { x = 1 }
    const symbolKey = { [Symbol('s')]: 1 }
    const sparse = Array.from({ length: 3 })
    sparse[0] = 1
    sparse[2] = 3
    delete sparse[1]
    const bad: [string, unknown][] = [
      ['function', { run: () => 1 }],
      ['undefined member', { a: undefined }],
      ['undefined', undefined],
      ['NaN', { a: Number.NaN }],
      ['Infinity', [Number.POSITIVE_INFINITY]],
      ['bigint', { a: 1n }],
      ['symbol', { a: Symbol('s') }],
      ['Date', { a: new Date(0) }],
      ['Map', new Map()],
      ['Set', new Set()],
      ['class instance', new Point()],
      ['getter', getter],
      ['symbol key', symbolKey],
      ['cycle', cyclic],
      ['sparse array', sparse],
      ['__proto__ key', JSON.parse('{"__proto__":{"polluted":true}}')],
      ['constructor key', { constructor: 1 }],
      ['prototype key', { prototype: 1 }],
      ['odd key', { 'a b': 1 }],
      ['numeric key', { 1: 1 }],
      ['long key', { [`a${'b'.repeat(32)}`]: 1 }],
    ]
    for (const [name, value] of bad)
      expect(extensionQuoteLocationIssue(value), name).not.toBeNull()
  })

  it('rejects oversized shapes', () => {
    const deep = (levels: number): unknown => levels === 0 ? 1 : { a: deep(levels - 1) }
    expect(extensionQuoteLocationIssue(deep(4))).toBeNull()
    expect(extensionQuoteLocationIssue(deep(5))).not.toBeNull()
    expect(extensionQuoteLocationIssue([[[[1]]]])).toBeNull()
    expect(extensionQuoteLocationIssue([[[[[1]]]]])).not.toBeNull()
    expect(extensionQuoteLocationIssue('x'.repeat(512))).toBeNull()
    expect(extensionQuoteLocationIssue('x'.repeat(513))).not.toBeNull()
    expect(extensionQuoteLocationIssue(Array.from({ length: 64 }, (_, index) => index))).toBeNull()
    expect(extensionQuoteLocationIssue(Array.from({ length: 65 }, (_, index) => index))).not.toBeNull()
    expect(extensionQuoteLocationIssue(Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`k${index}`, 1])))).toBeNull()
    expect(extensionQuoteLocationIssue(Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`k${index}`, 1])))).not.toBeNull()
    // Each part is within its own limit; only the serialized size is too large.
    const wide = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`k${index}`, 'x'.repeat(512)]))
    expect(JSON.stringify(wide).length).toBeGreaterThan(EXTENSION_QUOTE_LOCATION_BYTES)
    expect(extensionQuoteLocationIssue(wide)).toBe('serialized location too large')
    // The limit counts UTF-8 bytes, not characters.
    expect(extensionQuoteLocationIssue(['汉'.repeat(512), '汉'.repeat(512), '汉'.repeat(512)])).not.toBeNull()
    // Many small values hit the node limit before any other limit.
    expect(extensionQuoteLocationIssue(Array.from({ length: 5 }, () => Array.from({ length: 64 }).fill(1)))).not.toBeNull()
  })
})

describe('extension quote input from plugins', () => {
  const base = { resourceId: '3b241101-e2bb-4255-8caf-4136c566a962', text: '3,4' }
  it('accepts the generic form and the earlier DOCX/PPTX and XLSX forms', () => {
    expect(extensionQuoteInputSchema.safeParse({ ...base, kind: 'range', location: { row: 3 } }).success).toBe(true)
    expect(extensionQuoteInputSchema.safeParse({ ...base, indexes: [0], from: 1, to: 2 }).success).toBe(true)
    expect(extensionQuoteInputSchema.safeParse({ ...base, cells: { sheetIndex: 0, sheet: 'S', range: 'A1:B2' } }).success).toBe(true)
  })

  it('rejects mixed shapes, invalid kinds and unbounded locations', () => {
    const invalid = [
      { ...base, kind: 'range', location: { row: 3 }, indexes: [0], from: 1, to: 2 },
      { ...base, kind: 'range', location: { row: 3 }, extensionId: 'pother.plugin' },
      { ...base, kind: 'Range', location: {} },
      { ...base, kind: '1range', location: {} },
      { ...base, kind: 'x'.repeat(33), location: {} },
      { ...base, kind: 'range' },
      { ...base, location: {} },
      { ...base, kind: 'range', location: { fn: () => 1 } },
      { ...base, kind: 'range', location: 'x'.repeat(600) },
      { ...base, text: ' ', kind: 'range', location: {} },
      { ...base, text: 'x'.repeat(32769), kind: 'range', location: {} },
    ]
    for (const input of invalid)
      expect(extensionQuoteInputSchema.safeParse(input).success, JSON.stringify(input).slice(0, 80)).toBe(false)
  })
})

describe('extension file quotes', () => {
  it('round-trips and keeps earlier formats readable', () => {
    const legacy: BuddyFileQuote[] = [
      { id: 'd', text: 't', source: { kind: 'file', title: 'a.docx', file, format: 'docx', docx: { hash, indexes: [0], from: 1, to: 2 } } },
      { id: 'p', text: 't', source: { kind: 'file', title: 'a.pptx', file, format: 'pptx', pptx: { hash, indexes: [0], from: 1, to: 2 } } },
      { id: 'x', text: 't', source: { kind: 'file', title: 'a.xlsx', file, format: 'xlsx', xlsx: { hash, sheetIndex: 0, sheet: 'S', range: 'A1' } } },
    ]
    const content = { userContent: { ...createBuddyUserContent(), resourceQuotes: [quote(), ...legacy] }, resourceSnapshots: [] }
    expect(buddyUserMessageContentV1Schema.parse(JSON.parse(JSON.stringify(content)))).toEqual(content)
  })

  it('requires the extension source exactly for the extension format', () => {
    const valid = quote()
    const source = valid.source as FileSource
    const { extension: _, ...withoutExtension } = source
    expect(buddyResourceQuoteSchema.safeParse(valid).success).toBe(true)
    expect(buddyResourceQuoteSchema.safeParse({ ...valid, source: withoutExtension }).success).toBe(false)
    expect(buddyResourceQuoteSchema.safeParse({ ...valid, source: { ...source, format: 'source' } }).success).toBe(false)
    expect(buddyResourceQuoteSchema.safeParse({ ...valid, source: { ...source, extension: { ...source.extension, extensionId: 'NOT AN ID' } } }).success).toBe(false)
  })

  it('rejects stored quotes whose location breaks the limits, whatever wrote them', () => {
    for (const location of [{ deep: { a: { b: { c: { d: { e: 1 } } } } } }, 'x'.repeat(600), JSON.parse('{"__proto__":1}')])
      expect(buddyResourceQuoteSchema.safeParse(quote(location)).success).toBe(false)
  })

  it('deduplicates by plugin, type and position', () => {
    const first = appendBuddyResourceQuote(createBuddyUserContent(), quote())
    expect(first.result).toBe('added')
    expect(appendBuddyResourceQuote(first.content, { ...quote(), id: 'again' }).result).toBe('duplicate')
    expect(appendBuddyResourceQuote(first.content, { ...quote({ row: 4 }), id: 'other-position' }).result).toBe('added')
    const source = quote().source as FileSource
    expect(appendBuddyResourceQuote(first.content, { ...quote(), id: 'other-plugin', source: { ...source, extension: { ...source.extension!, extensionId: 'pabc.other' } } }).result).toBe('added')
  })

  it('counts the location toward the total length', () => {
    const location = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(key => [key, key.repeat(500)]))
    const textLength = Math.floor(BUDDY_QUOTE_TOTAL_TEXT_LIMIT / 16) - 100
    let content = createBuddyUserContent()
    let result = 'added'
    for (let index = 0; index < 16 && result === 'added'; index++) {
      const next = appendBuddyResourceQuote(content, quote({ ...location, index }, { id: `q${index}`, text: `${index}`.padEnd(textLength, 'a') }))
      result = next.result
      content = next.content
    }
    // The text alone (16 x ~8,000) fits; with up to 4 KB of position each it does not.
    expect(result).toBe('limit')
  })

  it('tells the model the type name but not the position', () => {
    const projected = projectBuddyUserContent({ ...createBuddyUserContent('Look'), resourceQuotes: [quote({ secretPlace: 'row 3' })] }, () => {
      throw new Error('Do not read sources')
    }, () => '')
    const excerpts = JSON.parse(projected.prompt.split('\n')[1]!)
    expect(excerpts).toEqual([{ source: { title: 'table.csv', path: 'data/table.csv', format: 'extension', extensionKind: 'range' }, text: '3,4' }])
    expect(projected.prompt).not.toContain('secretPlace')
    expect(projected.prompt).not.toContain('pabc.csv-sheet')
  })

  it('keeps reading stored DOCX, PPTX and XLSX quotes next to the view references', () => {
    const office = (id: string, patch: object) => ({ id, text: 'Stored text', source: { kind: 'file', title: 'brief', file, ...patch } })
    const stored = [
      office('docx-quote', { format: 'docx', docx: { hash, indexes: [0, 1], from: 2, to: 9 } }),
      office('pptx-quote', { format: 'pptx', pptx: { hash, indexes: [3], from: 0, to: 4 } }),
      office('xlsx-quote', { format: 'xlsx', xlsx: { hash, sheetIndex: 0, sheet: 'Sheet1', range: 'A1:B2' } }),
      { id: 'view-quote', text: 'Shown text', source: { kind: 'view', title: 'Reader', provider: 'extension:tests.reader', target: { path: 'a.md' } }, locator: { version: 1, data: { block: 1 } } },
    ]
    for (const quote of stored)
      expect(buddyResourceQuoteSchema.safeParse(quote).success, quote.id).toBe(true)
    const content = stored.reduce((value, quote) => appendBuddyResourceQuote(value, quote as never).content, createBuddyUserContent('Keep'))
    expect(content.resourceQuotes?.map(quote => quote.id)).toEqual(['docx-quote', 'pptx-quote', 'xlsx-quote', 'view-quote'])
  })
})
