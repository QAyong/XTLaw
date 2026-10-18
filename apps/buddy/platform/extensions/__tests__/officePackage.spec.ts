import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { expect, it } from 'vitest'
import { buildExtensionPackage } from '../buildExtensionPackage'
import { readExtensionDirectory, unpackExtension, validateExtensionFiles } from '../extensionFiles'

it('builds the real DOCX migration plugin under the 64 MiB contract without executing it', async () => {
  const source = fileURLToPath(new URL('../../../../../plugins/office/', import.meta.url))
  const files = await readExtensionDirectory(source)
  const input = Buffer.from(zipSync(Object.fromEntries(files), { level: 6 })).toString('base64')
  const result = await buildExtensionPackage({ archive: input }, async () => {
    throw new Error('Compiled package must not execute a compiler')
  }, new AbortController().signal)
  expect(result).toMatchObject({ ok: true, id: 'pd2ec0b9018e6402d8ada6873f7fa8721.office', name: 'Office DOCX', author: 'XTLaw官方', version: '0.1.6' })
  if (!result.ok)
    throw new Error(result.code)
  const bytes = Buffer.from(result.archive, 'base64')
  const unpacked = unpackExtension(bytes)
  validateExtensionFiles(unpacked)
  expect(unpacked.has('view.js')).toBe(true)
  expect([...unpacked.keys()].some(name => /\/pdf[.-]/.test(name))).toBe(false)
  expect([...unpacked.values()].reduce((size, file) => size + file.length, 0)).toBeGreaterThan(16 * 1024 * 1024)
  if (process.env.LEXORA_BUILD_OFFICE_PACKAGE === '1') {
    const directory = new URL('../../../.output/artifacts/', import.meta.url)
    await mkdir(directory, { recursive: true })
    await writeFile(new URL(`office-${result.version}.lexora-extension`, directory), bytes, { flag: 'wx' })
  }
}, 30000)

it('builds the PPTX read-only preview plugin without executing it', async () => {
  const source = fileURLToPath(new URL('../../../../../plugins/office-pptx/', import.meta.url))
  const files = await readExtensionDirectory(source)
  const input = Buffer.from(zipSync(Object.fromEntries(files), { level: 6 })).toString('base64')
  const result = await buildExtensionPackage({ archive: input }, async () => {
    throw new Error('Compiled package must not execute a compiler')
  }, new AbortController().signal)
  expect(result).toMatchObject({ ok: true, id: 'pd2ec0b9018e6402d8ada6873f7fa8721.office-pptx', name: 'Office PPTX', author: 'XTLaw官方', version: '0.4.8' })
  if (!result.ok)
    throw new Error(result.code)
  const unpacked = unpackExtension(Buffer.from(result.archive, 'base64'))
  validateExtensionFiles(unpacked)
  expect(unpacked.has('view.js')).toBe(true)
  expect(unpacked.has('slides/slides.js')).toBe(true)
  expect(unpacked.has('vendor/pptx-preview.js')).toBe(true)
}, 30000)

it('builds the XLSX preview plugin without executing it and keeps the WebAssembly permission', async () => {
  const source = fileURLToPath(new URL('../../../../../plugins/office-xlsx/', import.meta.url))
  const files = await readExtensionDirectory(source)
  const input = Buffer.from(zipSync(Object.fromEntries(files), { level: 6 })).toString('base64')
  const result = await buildExtensionPackage({ archive: input }, async () => {
    throw new Error('Compiled package must not execute a compiler')
  }, new AbortController().signal)
  expect(result).toMatchObject({ ok: true, id: 'pd2ec0b9018e6402d8ada6873f7fa8721.office-xlsx', name: 'Office XLSX', author: 'XTLaw官方', version: '0.3.6' })
  if (!result.ok)
    throw new Error(result.code)
  const unpacked = unpackExtension(Buffer.from(result.archive, 'base64'))
  validateExtensionFiles(unpacked)
  expect(unpacked.has('view.js')).toBe(true)
  expect(unpacked.has('xlsx/sheets.js')).toBe(true)
  expect([...unpacked.keys()].some(name => name.endsWith('.wasm'))).toBe(true)
}, 60000)
