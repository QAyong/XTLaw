import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

const plugin = new URL('../../../plugins/office-xlsx/', import.meta.url)
const { validateXlsx, readXlsx } = await import(new URL('xlsx.js', plugin).href)
const xlsx = () => zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook/>') })

describe('office xlsx plugin', () => {
  it('accepts a minimal workbook package', () => {
    const bytes = xlsx()
    expect(validateXlsx(bytes)).toEqual(bytes)
  })

  it('rejects a package without a workbook part or with unsafe names', () => {
    expect(() => validateXlsx(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<document/>') }))).toThrow('OFFICE_INVALID_XLSX')
    expect(() => validateXlsx(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<w/>'), '../evil.xml': strToU8('x') }))).toThrow('OFFICE_INVALID_XLSX')
    expect(() => validateXlsx(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<w/>'), [`a${String.fromCharCode(92)}b.xml`]: strToU8('x') }))).toThrow('OFFICE_INVALID_XLSX')
    expect(() => validateXlsx(new Uint8Array(10))).toThrow('OFFICE_INVALID_XLSX')
  })

  it('reads in chunks, refuses other extensions and detects a file that changed while reading', async () => {
    const bytes = xlsx()
    const resource = { id: 'r', name: '报表.xlsx', size: bytes.length }
    const resources = { readBytes: async (_file, { offset, length }) => ({ data: bytes.slice(offset, offset + length), size: bytes.length, eof: offset + length >= bytes.length }) }
    await expect(readXlsx(resources, resource, new AbortController().signal)).resolves.toEqual(bytes)
    await expect(readXlsx(resources, { ...resource, name: 'a.xls' }, new AbortController().signal)).rejects.toThrow('OFFICE_UNSUPPORTED_XLSX')
    const changed = { readBytes: async (_file, { offset, length }) => ({ data: bytes.slice(offset, offset + length), size: bytes.length + 1, eof: true }) }
    await expect(readXlsx(changed, resource, new AbortController().signal)).rejects.toThrow('OFFICE_RESOURCE_CHANGED')
  })

  it('declares the WebAssembly permission and ships a wasm engine inside the package limits', async () => {
    const manifest = JSON.parse(await readFile(new URL('extension.json', plugin), 'utf8'))
    expect(manifest.permissions).toMatchObject({ webAssembly: true, selectedResource: 'read', selectedResourceWrite: true, composerReference: true, resourceExport: true })
    expect(manifest.contributes.views.some(view => view.accepts?.extensions?.includes('xlsx'))).toBe(true)
    const root = fileURLToPath(plugin)
    const files = []
    const walk = async (directory) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory())
          await walk(path)
        else files.push({ path, size: (await stat(path)).size })
      }
    }
    await walk(root)
    expect(files.length).toBeLessThanOrEqual(512)
    expect(Math.max(...files.map(file => file.size))).toBeLessThanOrEqual(16 * 1024 * 1024)
    expect(files.reduce((sum, file) => sum + file.size, 0)).toBeLessThanOrEqual(64 * 1024 * 1024)
    const wasm = files.filter(file => file.path.endsWith('.wasm'))
    expect(wasm).toHaveLength(1)
    // WebAssembly binary magic and version
    expect([...(await readFile(wasm[0].path)).subarray(0, 8)]).toEqual([0, 0x61, 0x73, 0x6D, 1, 0, 0, 0])
    const provenance = JSON.parse(await readFile(new URL('provenance.json', plugin), 'utf8'))
    expect(provenance.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(provenance.resources.find(file => file.name.endsWith('.wasm'))?.size).toBe(wasm[0].size)
  })
})
