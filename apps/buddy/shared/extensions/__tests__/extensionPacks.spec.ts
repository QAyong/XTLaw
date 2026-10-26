import type { ExtensionCatalogListing } from '../extensionCatalog'
import { describe, expect, it } from 'vitest'
import { EXTENSION_CATALOG_URL, EXTENSION_PACKS_URL, extensionPackSchema, extensionPacksSchema, extensionPacksUrl } from '../extensionCatalog'
import { resolvePack } from '../extensionPacks'

function listing(id: string, kind: ExtensionCatalogListing['kind'] = 'plugin', compatible = true) {
  return { kind, source: 'official', manifest: { id }, compatible, incompatibility: null } as unknown as ExtensionCatalogListing
}
const pack = extensionPackSchema.parse({ id: 'office', name: 'Office', includes: ['tests.docx', 'tests.pptx', 'tests.xlsx'] })

describe('pack file', () => {
  it('sits next to the catalog and does not touch its strict shape', () => {
    expect(extensionPacksUrl(EXTENSION_CATALOG_URL)).toBe(EXTENSION_PACKS_URL)
    expect(EXTENSION_PACKS_URL).toBe('https://raw.githubusercontent.com/QAyong/xtlaw-market/main/catalog/v1/packs.json')
    expect(extensionPacksSchema.safeParse({ schemaVersion: 1, packs: [] }).success).toBe(true)
    expect(extensionPacksSchema.safeParse({ schemaVersion: 1, packs: [], extra: true }).success).toBe(false)
  })

  it('fills defaults and rejects what is not a plain list of references', () => {
    expect(pack).toMatchObject({ description: '', tags: [], source: 'official' })
    expect(extensionPackSchema.safeParse({ id: 'office', name: 'Office', includes: [] }).success).toBe(false)
    expect(extensionPackSchema.safeParse({ id: 'office', name: 'Office', includes: ['tests.docx', 'tests.docx'] }).success).toBe(false)
    expect(extensionPackSchema.safeParse({ id: 'office', name: 'Office', includes: ['not-an-id'] }).success).toBe(false)
    expect(extensionPackSchema.safeParse({ id: 'office', name: 'Office', includes: ['tests.docx'], artifact: {} }).success).toBe(false)
  })
})

describe('resolvePack', () => {
  const all = [listing('tests.docx'), listing('tests.pptx'), listing('tests.xlsx')]

  it('is available with every member remaining when nothing is installed', () => {
    const resolved = resolvePack(pack, all, new Set())
    expect(resolved.state).toBe('available')
    expect(resolved.remaining.map(member => member.id)).toEqual(['tests.docx', 'tests.pptx', 'tests.xlsx'])
  })

  it('only remains for what is missing, in the order the pack lists it', () => {
    const resolved = resolvePack(pack, all, new Set(['tests.pptx']))
    expect(resolved.members.map(member => member.state)).toEqual(['installable', 'installed', 'installable'])
    expect(resolved.remaining.map(member => member.id)).toEqual(['tests.docx', 'tests.xlsx'])
  })

  it('is complete when every member is installed or built in', () => {
    expect(resolvePack(pack, all, new Set(['tests.docx', 'tests.pptx', 'tests.xlsx'])).state).toBe('complete')
    const builtin = extensionPackSchema.parse({ id: 'legal', name: 'Legal', includes: ['xtlaw.pkulaw', 'tests.docx'] })
    const resolved = resolvePack(builtin, [listing('xtlaw.pkulaw', 'mcp'), listing('tests.docx')], new Set(['tests.docx']))
    expect(resolved.members[0]!.state).toBe('builtin')
    expect(resolved.state).toBe('complete')
  })

  it('refuses the whole pack when a needed member is gone or incompatible, so no half set is installed', () => {
    const missing = resolvePack(pack, [listing('tests.docx'), listing('tests.pptx')], new Set())
    expect(missing.state).toBe('unavailable')
    expect(missing.members[2]!.state).toBe('missing')
    const incompatible = resolvePack(pack, [listing('tests.docx'), listing('tests.pptx', 'plugin', false), listing('tests.xlsx')], new Set())
    expect(incompatible.state).toBe('unavailable')
    expect(incompatible.members[1]!.state).toBe('incompatible')
  })

  it('does not block on a member that is already installed even if the catalog dropped or outdated it', () => {
    expect(resolvePack(pack, [listing('tests.docx')], new Set(['tests.pptx', 'tests.xlsx'])).state).toBe('available')
    expect(resolvePack(pack, [listing('tests.docx'), listing('tests.pptx', 'plugin', false), listing('tests.xlsx')], new Set(['tests.pptx'])).state).toBe('available')
  })
})
