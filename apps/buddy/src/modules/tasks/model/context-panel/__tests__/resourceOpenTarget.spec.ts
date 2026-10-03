import type { TaskArtifactContextTab, TaskFilesContextTab } from '../taskContextPanel'
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

it('uses the artifact own conversation and ID without exposing its path to the opener', () => {
  const tab: TaskArtifactContextTab = { id: 'artifact-1', kind: 'artifact', scope: 'independent', label: 'report.docx', viewMode: 'preview', artifact: { artifactId: 'result-1', conversationId: 'original-conversation', createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z', kind: 'file', mimeType: 'application/octet-stream', name: 'report.docx', path: 'C:\\workspace\\report.docx', previewUrl: null, runId: 'run-1', sizeBytes: 100, sourceArtifactId: null, sourceToolCallId: 'tool-1' } }
  const target = resourceOpenTarget(tab)
  expect(target).toMatchObject({ kind: 'artifact', artifact: { conversationId: 'original-conversation', artifactId: 'result-1' }, file: true })
  expect(JSON.stringify(target)).not.toContain(tab.artifact.path)
  expect(resourceOpenTarget({ ...tab, artifact: { ...tab.artifact, kind: 'directory' } })).toMatchObject({ file: false })
})

it('does not reuse any resource for browser, plugin or empty tabs', () => {
  expect(resourceOpenTarget(null)).toBeNull()
  expect(resourceOpenTarget({ id: 'browser-1', kind: 'browser', scope: 'independent', conversationId: null })).toBeNull()
  expect(resourceOpenTarget({ id: 'view-1', kind: 'view', scope: 'independent', label: 'Plugin', viewId: 'view-1' })).toBeNull()
})
