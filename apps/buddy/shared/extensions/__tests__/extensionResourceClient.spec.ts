import type { JsonValue } from '../../workbench/workbenchState'
import { expect, it } from 'vitest'
import { writeExtensionResource } from '../extensionResourceClient'

function recorder(commit: JsonValue = null) {
  const calls: Array<[string, JsonValue | undefined]> = []
  const request = async (method: string, params?: JsonValue) => {
    calls.push([method, params])
    return method === 'resources.beginSave' || method === 'resources.beginCreate' ? 'upload-id' : method === 'resources.commitSave' ? commit : null
  }
  return { calls, request }
}

it('writes back to the opened file through resources.beginSave when a resource is given', async () => {
  const { calls, request } = recorder()
  await expect(writeExtensionResource(request, 'resources.beginSave', { name: 'report.docx', data: new Uint8Array([1, 2, 3]), resource: { id: 'resource-1' } })).resolves.toBe(true)
  expect(calls.map(([method]) => method)).toEqual(['resources.beginSave', 'resources.writeChunk', 'resources.commitSave'])
  expect(calls[0]![1]).toEqual({ name: 'report.docx', size: 3, resourceId: 'resource-1' })
})

it('leaves the save dialog flow alone without a resource and ignores one for resources.beginCreate', async () => {
  const saved = recorder()
  await writeExtensionResource(saved.request, 'resources.beginSave', { name: 'export.txt', data: new Blob(['x']) })
  expect(saved.calls[0]![1]).toEqual({ name: 'export.txt', size: 1 })

  const created = recorder({ id: '00000000-0000-4000-8000-000000000001', name: 'draft.txt', mimeType: 'text/plain', size: 1 })
  await writeExtensionResource(created.request, 'resources.beginCreate', { name: 'draft.txt', data: new Blob(['x']), mimeType: 'text/plain', resource: { id: 'resource-1' } })
  expect(created.calls[0]![1]).toEqual({ name: 'draft.txt', size: 1, mimeType: 'text/plain' })
})

it('cancels the upload when the request fails part-way', async () => {
  const calls: string[] = []
  const request = async (method: string) => {
    calls.push(method)
    if (method === 'resources.writeChunk')
      throw new Error('EXTENSION_RESOURCE_WRITE_RANGE')
    return method === 'resources.beginSave' ? 'upload-id' : null
  }
  await expect(writeExtensionResource(request, 'resources.beginSave', { name: 'a.bin', data: new Uint8Array([1]) })).rejects.toThrow('EXTENSION_RESOURCE_WRITE_RANGE')
  expect(calls).toEqual(['resources.beginSave', 'resources.writeChunk', 'resources.cancelSave'])
})
