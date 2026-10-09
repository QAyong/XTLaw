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
  expect(result).toMatchObject({ ok: true, id: 'pd2ec0b9018e6402d8ada6873f7fa8721.office', name: 'Office DOCX', author: 'XTLaw官方', version: '0.1.1' })
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
