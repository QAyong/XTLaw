import type { TaskFilesContextTab, TaskViewContextTab } from '../taskContextPanel'
import { expect, it } from 'vitest'
import { resourceOpenTarget } from '../resourceOpenTarget'

it('uses the file tab directory root and keeps its identity stable across file selections', () => {
  const tab: TaskFilesContextTab = { id: 'files-1', kind: 'files', scope: 'independent', rootName: 'workspace', target: { spaceId: 'space-1', directoryId: 'directory-1', revision: 1, path: 'report.docx' } }
  const first = resourceOpenTarget(tab)
  expect(first).toMatchObject({ kind: 'directory', directory: { ...tab.target, path: '' } })
  expect(resourceOpenTarget({ ...tab, target: { ...tab.target, path: 'code.ts' } })).toEqual(first)
  expect(tab.target.path).toBe('report.docx')
  expect(resourceOpenTarget({ ...tab, id: 'files-2', target: { ...tab.target, directoryId: 'directory-2' } })?.key).not.toBe(first?.key)
})

it.each(['report.docx', 'slides.pptx', 'budget.xlsx'])('resolves an Office plugin file from its own workbench view: %s', (path) => {
  const tab: TaskViewContextTab = { id: 'view-1', kind: 'view', scope: 'independent', label: path, viewId: 'view-1' }
  const fileTarget = { spaceId: 'space-1', directoryId: 'directory-1', revision: 1, path }
  const view = { id: tab.viewId, resource: { scheme: 'extension', id: 'plugin-resource', data: { fileTarget, resource: { id: 'opaque-plugin-file' } } } }
  const target = resourceOpenTarget(tab, view)
  expect(target).toMatchObject({ kind: 'file', target: fileTarget })
  expect(resourceOpenTarget(tab, { ...view, resource: { ...view.resource, data: { fileTarget: { ...fileTarget, revision: 2 } } } })?.key).not.toBe(target?.key)
  expect(resourceOpenTarget(tab, { ...view, id: 'other-view' })).toBeNull()
  expect(resourceOpenTarget(tab, { ...view, resource: { ...view.resource, data: { resource: { path: 'C:\\arbitrary.docx' } } } })).toBeNull()
  expect(resourceOpenTarget(tab, { ...view, resource: { ...view.resource, data: { fileTarget: { ...fileTarget, revision: 0 } } } })).toBeNull()
  expect(resourceOpenTarget(tab, { ...view, resource: { ...view.resource, data: { fileTarget: { ...fileTarget, path: '' } } } })).toBeNull()
})

it.each(['file', 'file-preview'])('resolves a %s workbench view without leaking extra metadata', (scheme) => {
  const tab: TaskViewContextTab = { id: 'view-1', kind: 'view', scope: 'independent', label: 'report.docx', viewId: 'view-1' }
  const target = { spaceId: 'space-1', directoryId: 'directory-1', revision: 1, path: 'report.docx' }
  const resolved = resourceOpenTarget(tab, { id: tab.viewId, resource: { scheme, id: 'file-1', data: { ...target, canonicalRoot: 'C:/workspace' } } })
  expect(resolved).toMatchObject({ kind: 'file', target })
  expect(JSON.stringify(resolved)).not.toContain('canonicalRoot')
})

it('does not reuse any resource for browser, resource-less plugin or empty tabs', () => {
  expect(resourceOpenTarget(null)).toBeNull()
  expect(resourceOpenTarget({ id: 'browser-1', kind: 'browser', scope: 'independent', conversationId: null })).toBeNull()
  expect(resourceOpenTarget({ id: 'view-1', kind: 'view', scope: 'independent', label: 'Plugin', viewId: 'view-1' })).toBeNull()
})

it('opens a granted-directory file tab at its root and keeps the identity stable across file selections', () => {
  const tab: TaskFilesContextTab = { id: 'files-1', kind: 'files', scope: 'independent', rootName: 'out', target: { conversationId: 'conversation-1', root: '/work/out', path: 'report.docx' } }
  const first = resourceOpenTarget(tab)
  expect(first).toMatchObject({ kind: 'directory', directory: { conversationId: 'conversation-1', root: '/work/out', path: '' } })
  expect(resourceOpenTarget({ ...tab, target: { ...tab.target, path: 'code.ts' } })).toEqual(first)
  expect(resourceOpenTarget({ ...tab, target: { ...tab.target, root: '/work/other' } })?.key).not.toBe(first?.key)
})

it.each(['file', 'file-preview'])('resolves a granted-directory %s view and a plugin view that shows one', (scheme) => {
  const tab: TaskViewContextTab = { id: 'view-1', kind: 'view', scope: 'independent', label: 'report.docx', viewId: 'view-1' }
  const target = { conversationId: 'conversation-1', root: '/work/out', path: 'report.docx' }
  expect(resourceOpenTarget(tab, { id: tab.viewId, resource: { scheme, id: 'file-1', data: { ...target, canonicalRoot: '/work/out' } } })).toMatchObject({ kind: 'file', target })
  const plugin = { id: tab.viewId, resource: { scheme: 'extension', id: 'plugin-resource', data: { fileTarget: target } } }
  expect(resourceOpenTarget(tab, plugin)).toMatchObject({ kind: 'file', target })
  expect(resourceOpenTarget(tab, { ...plugin, resource: { ...plugin.resource, data: { fileTarget: { ...target, path: '' } } } })).toBeNull()
})
