import { describe, expect, it } from 'vitest'
import { fileExtensionOf, matchFileHandlers, resolveFileHandler } from '../extensionFileHandlers'
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
})
