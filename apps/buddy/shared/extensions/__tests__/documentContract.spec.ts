import { describe, expect, it } from 'vitest'
import { documentContractReport } from '../extensionDocumentContract'
import { extensionManifestSchema } from '../extensionManifest'
import { EXTENSION_UNTRUSTED_WASM_FILE_LIMIT } from '../extensionTrust'

function plugin(patch: { engines?: string, permissions?: Record<string, unknown>, views?: unknown[] } = {}) {
  const id = 'tests.docs'
  return extensionManifestSchema.parse({
    schemaVersion: 1,
    id,
    name: 'Docs',
    version: '1.0.0',
    apiVersion: 4,
    engines: { lexora: patch.engines ?? '>=0.2.3 <1.0.0' },
    permissions: { selectedResource: 'read', ...patch.permissions },
    contributes: { views: patch.views ?? [{ id: `${id}.view`, title: 'Docs', entry: 'view.js', resource: 'selected-file', accepts: { extensions: ['csv'] }, location: 'context' }] },
  })
}
const options = { files: [], development: false, bundledHandlers: [{ id: 'bundled.office', name: 'Office DOCX', extensions: ['docx'] }] }

describe('document contract report', () => {
  it('has nothing to say about plugins that are not document processors', () => {
    expect(documentContractReport(plugin({ views: [] }), options)).toEqual({ capabilities: [], warnings: [] })
  })

  it('names the capabilities a plugin relies on, with the first version of each', () => {
    const report = documentContractReport(plugin({ permissions: { selectedResourceWrite: true, composerReference: true, resourceExport: true, webAssembly: true } }), options)
    expect(report.capabilities).toEqual([
      { name: 'documents.handler', since: '0.2.0' },
      { name: 'documents.writeBack', since: '0.2.0' },
      { name: 'documents.reference', since: '0.2.0' },
      { name: 'documents.export', since: '0.2.0' },
      { name: 'documents.webAssembly', since: '0.2.3' },
    ])
    expect(report.warnings).toEqual([])
  })

  it('warns when references have nothing to attach to', () => {
    const noHandler = documentContractReport(plugin({ permissions: { composerReference: true }, views: [] }), options)
    expect(noHandler.warnings.join('\n')).toContain('no view declares accepts')
  })

  it('warns about extensions accepted twice in the plugin or already taken by a bundled plugin', () => {
    const second = { id: 'tests.docs.second', title: 'Second', entry: 'view.js', resource: 'selected-file', accepts: { extensions: ['csv', 'docx'] }, location: 'context' }
    const first = { id: 'tests.docs.first', title: 'First', entry: 'view.js', resource: 'selected-file', accepts: { extensions: ['csv'] }, location: 'context' }
    const warnings = documentContractReport(plugin({ views: [first, second] }), options).warnings.join('\n')
    expect(warnings).toContain('both accept .csv')
    expect(warnings).toContain('Office DOCX (bundled) also accepts .docx')
    expect(documentContractReport(plugin(), { ...options, bundledHandlers: [{ id: 'tests.docs', name: 'Itself', extensions: ['csv'] }] }).warnings).toEqual([])
  })

  it('suggests the engine minimum that covers the capabilities used, once', () => {
    const warnings = documentContractReport(plugin({ engines: '>=0.1.0 <1.0.0', permissions: { webAssembly: true } }), options).warnings
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('at least 0.2.3')
    expect(documentContractReport(plugin({ engines: '>=0.2.3 <1.0.0', permissions: { webAssembly: true } }), options).warnings).toEqual([])
  })

  it('warns about WebAssembly beyond the third-party limits, except in development folders', () => {
    const files = Array.from({ length: EXTENSION_UNTRUSTED_WASM_FILE_LIMIT + 1 }, (_, index) => ({ path: `wasm/m${index}.wasm`, size: 1000 }))
    const manifest = plugin({ permissions: { webAssembly: true } })
    expect(documentContractReport(manifest, { ...options, files }).warnings.join('\n')).toContain('EXTENSION_WEBASSEMBLY_LIMIT')
    expect(documentContractReport(manifest, { ...options, files, development: true }).warnings).toEqual([])
    expect(documentContractReport(manifest, { ...options, files: [{ path: 'engine.wasm', size: 25 * 1024 * 1024 }] }).warnings.join('\n')).toContain('EXTENSION_WEBASSEMBLY_LIMIT')
    expect(documentContractReport(manifest, { ...options, files: [{ path: 'engine.wasm', size: 10 * 1024 * 1024 }] }).warnings).toEqual([])
  })
})
