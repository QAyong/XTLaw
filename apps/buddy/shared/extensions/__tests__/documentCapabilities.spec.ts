import { valid } from 'semver'
import { describe, expect, it } from 'vitest'
import { documentPermissionCapabilities, workbenchDocumentCapabilities } from '../../workbench/workbenchDocumentCapabilities'
import { queryWorkbenchCapabilities, workbenchContributionCatalog } from '../../workbench/workbenchUi'
import { extensionCapabilitiesSchema } from '../extensionAuthoring'
import { addedExtensionPermissions, EXTENSION_API_VERSION, extensionManifestSchema, extensionPermissionsSchema } from '../extensionManifest'

const view = { id: 'tests.docs.view', title: 'Docs', entry: 'view.js', resource: 'selected-file', accepts: { extensions: ['csv'] }, location: 'context' }
function manifest(patch: Record<string, unknown> = {}, permissions: Record<string, unknown> = {}, views: unknown[] = [view]) {
  return { schemaVersion: 1, id: 'tests.docs', name: 'Docs', version: '1.0.0', apiVersion: 4, engines: { lexora: '>=0.1.0 <1.0.0' }, permissions: { selectedResource: 'read', ...permissions }, contributes: { views }, ...patch }
}
const valid4 = (input: unknown) => extensionManifestSchema.safeParse(input).success

describe('document capability registry', () => {
  it('lists the document capabilities in the runtime catalog with titles, scope, first version and requirements', () => {
    const names = Object.keys(workbenchDocumentCapabilities)
    expect(names).toEqual(['documents.handler', 'documents.writeBack', 'documents.reference', 'documents.export', 'documents.webAssembly'])
    const runtime = queryWorkbenchCapabilities({ kind: 'runtime' })
    for (const name of names) {
      const entry = runtime.find(item => item.target === name) as unknown as { title: Record<string, string>, scope: string, description: string, since: string, requires: string }
      expect(entry, name).toBeDefined()
      expect(entry.title['zh-CN'] && entry.title['en-US']).toBeTruthy()
      expect(entry.scope).toBe('resource')
      expect(entry.description.length).toBeGreaterThan(40)
      expect(valid(entry.since), name).not.toBeNull()
      expect(entry.requires.length).toBeGreaterThan(5)
    }
    // Existing upstream entries are untouched and names stay unique across the catalog.
    expect(runtime.some(item => item.target === 'resources')).toBe(true)
    const targets = workbenchContributionCatalog.map(item => `${item.kind}:${item.target}`)
    expect(new Set(targets).size).toBe(targets.length)
  })

  it('answers single-capability queries in the shape the authoring tool returns', () => {
    const targets = queryWorkbenchCapabilities({ kind: 'runtime', target: 'documents.webAssembly' })
    expect(targets).toHaveLength(1)
    expect(extensionCapabilitiesSchema.parse({ apiVersion: EXTENSION_API_VERSION, targets })).toMatchObject({ targets: [{ target: 'documents.webAssembly', since: '0.2.3' }] })
    expect(queryWorkbenchCapabilities({ target: 'documents.nothing' })).toEqual([])
  })

  it('maps every document permission to a catalog entry and a real manifest permission', () => {
    for (const [permission, rule] of Object.entries(documentPermissionCapabilities)) {
      expect(Object.keys(extensionPermissionsSchema.shape), permission).toContain(permission)
      expect(workbenchDocumentCapabilities[rule.capability], permission).toBeDefined()
    }
  })
})

describe('manifest validation from the registry', () => {
  it('accepts the three document plugin shapes and a plugin for a new format', () => {
    expect(valid4(manifest({}, { selectedResourceWrite: true, composerReference: true, resourceExport: true }))).toBe(true)
    expect(valid4(manifest({}, { webAssembly: true }))).toBe(true)
    expect(valid4(manifest({}, {}, [{ ...view, accepts: { extensions: ['pdf', 'md'] } }]))).toBe(true)
  })

  it('requires API 4 and read permission for write-back and references', () => {
    for (const permission of ['selectedResourceWrite', 'composerReference']) {
      expect(valid4(manifest({ apiVersion: 3 }, { [permission]: true }, [{ ...view, accepts: undefined }])), permission).toBe(false)
      expect(valid4(manifest({}, { selectedResource: 'none', [permission]: true })), permission).toBe(false)
    }
  })

  it('requires a selected-file context view for accepts', () => {
    expect(valid4(manifest({ apiVersion: 3 }, {}, [{ ...view, accepts: { extensions: ['csv'] } }]))).toBe(false)
    expect(valid4(manifest({}, {}, [{ ...view, resource: 'none' }]))).toBe(false)
    expect(valid4(manifest({}, {}, [{ ...view, location: 'page' }]))).toBe(false)
    expect(valid4(manifest({}, {}, [{ ...view, accepts: { extensions: ['Csv'] } }]))).toBe(false)
    expect(valid4(manifest({}, {}, [{ ...view, accepts: { extensions: [] } }]))).toBe(false)
  })

  it('lists newly requested document permissions for the install review, once', () => {
    const none = extensionManifestSchema.parse(manifest()).permissions
    const all = extensionManifestSchema.parse(manifest({}, { selectedResourceWrite: true, composerReference: true, resourceExport: true, webAssembly: true })).permissions
    expect(addedExtensionPermissions(none, all)).toEqual(['selectedResourceWrite', 'composerReference', 'resourceExport', 'webAssembly'])
    expect(addedExtensionPermissions(undefined, all)).toEqual(['selectedResource:read', 'selectedResourceWrite', 'composerReference', 'resourceExport', 'webAssembly'])
    expect(addedExtensionPermissions(all, all)).toEqual([])
  })
})
