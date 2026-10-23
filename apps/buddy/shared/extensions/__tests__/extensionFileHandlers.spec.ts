import { describe, expect, it } from 'vitest'
import { fileExtensionOf, matchFileHandlers, resolveFileHandler } from '../extensionFileHandlers'
import { extensionFileHandlers, extensionFileOpeningProviders, implicitFileHandlerId } from '../extensionFileOpening'
import { extensionManifestSchema } from '../extensionManifest'

function source(slug: string, extensions: string[], enabled = true, compatible = true) {
  const id = `p0123456789abcdef0123456789abcdef.${slug}`
  const manifest = extensionManifestSchema.parse({
    schemaVersion: 1,
    id,
    name: slug,
    version: '1.0.0',
    apiVersion: 4,
    engines: { lexora: '>=0.1.0 <1.0.0' },
    permissions: { selectedResource: 'read' },
    contributes: { views: [{ id: `${id}.view`, title: slug, entry: 'view.js', resource: 'selected-file', accepts: { extensions }, location: 'context' }] },
  })
  return { enabled, compatible, manifest }
}

describe('extension file handlers', () => {
  it('reads the extension after the last dot only', () => {
    expect(fileExtensionOf('a/b.c/Report.XLSX')).toBe('xlsx')
    expect(fileExtensionOf('pptx')).toBeNull()
    expect(fileExtensionOf('dir.d/file')).toBeNull()
    expect(fileExtensionOf('trailing.')).toBeNull()
  })

  it('matches enabled compatible views by accepted extension and resolves only a unique one', () => {
    const sources = [source('csv', ['csv']), source('both', ['csv', 'tsv']), source('off', ['pdf'], false), source('old', ['md'], true, false)]
    expect(matchFileHandlers(sources, 'a.csv').map(handler => handler.manifest.name)).toEqual(['csv', 'both'])
    expect(resolveFileHandler(sources, 'a.csv')).toBeNull()
    expect(resolveFileHandler(sources, 'a.tsv')?.manifest.name).toBe('both')
    expect(resolveFileHandler(sources, 'a.pdf')).toBeNull()
    expect(resolveFileHandler(sources, 'a.md')).toBeNull()
    expect(resolveFileHandler(sources, 'csv')).toBeNull()
  })

  it('turns accepts.extensions into implicit open-only handlers that are registered as file opening providers', () => {
    const { manifest } = source('docs', ['docx', 'doc'])
    const [entry] = extensionFileHandlers(manifest)
    expect(entry).toMatchObject({ implicit: true, handler: { id: implicitFileHandlerId(manifest.contributes.views[0]!.id), title: 'docs', extensions: ['.docx', '.doc'], open: { view: manifest.contributes.views[0]!.id, requestDefault: false } } })
    expect(entry!.handler.preview).toBeUndefined()
    expect(extensionFileOpeningProviders(manifest, true)).toEqual([expect.objectContaining({ id: entry!.handler.id, extensionId: manifest.id, locations: ['standalone'], implicit: true, builtin: false, viewTypes: { standalone: manifest.contributes.views[0]!.id } })])
  })

  it('keeps declared handlers first and lets a declared handler with the same ID replace the implicit one', () => {
    const { manifest } = source('docs', ['docx'])
    const id = implicitFileHandlerId(manifest.contributes.views[0]!.id)
    const declared = extensionManifestSchema.parse({ ...manifest, contributes: { ...manifest.contributes, fileHandlers: [{ id, title: 'Own', extensions: ['.docx'], preview: { view: manifest.contributes.views[0]!.id } }] } })
    expect(extensionFileHandlers(declared)).toEqual([{ handler: expect.objectContaining({ id, title: 'Own' }), implicit: false }])
  })
})
