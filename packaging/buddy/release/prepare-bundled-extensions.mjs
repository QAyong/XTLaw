import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { writeOutput } from '../../shared/cli-output.mjs'

const buddy = fileURLToPath(new URL('../../../apps/buddy/', import.meta.url))
const require = createRequire(join(buddy, 'package.json'))
const { zipSync } = require('fflate')

const fileLimit = 16 * 1024 * 1024
const packageLimit = 64 * 1024 * 1024
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export async function prepareBundledExtensions({ sourceDirectory = resolve(buddy, '../../plugins/office'), outputDirectory = join(buddy, '.output/resources/bundled-extensions') } = {}) {
  const manifest = JSON.parse(await readFile(join(sourceDirectory, 'extension.json'), 'utf8'))
  assert(manifest.format === 'compiled', 'Bundled plugin must be precompiled')
  assert(typeof manifest.id === 'string' && typeof manifest.version === 'string', 'Invalid bundled plugin identity')
  const { sourceDateEpoch } = JSON.parse(await readFile(join(buddy, 'buddy.version.json'), 'utf8'))
  const mtime = new Date(Math.max(315532800, sourceDateEpoch) * 1000)
  const files = {}
  const names = new Set()
  let total = 0
  async function collect(directory) {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const name = relative(sourceDirectory, path).replaceAll('\\', '/')
      assert(!entry.isSymbolicLink() && !name.split('/').some(part => part === '..' || part === '.') && !name.includes(':'), 'Unsafe bundled plugin path')
      if (entry.isDirectory()) {
        await collect(path)
        continue
      }
      assert(entry.isFile(), 'Unsupported bundled plugin file')
      assert(!names.has(name.toLowerCase()), 'Duplicate bundled plugin path')
      names.add(name.toLowerCase())
      assert(names.size <= 512, 'Too many bundled plugin files')
      const info = await stat(path)
      assert(info.size <= fileLimit && total + info.size <= packageLimit, 'Bundled plugin exceeds package limits')
      const bytes = await readFile(path)
      total += bytes.length
      assert(bytes.length <= fileLimit && total <= packageLimit, 'Bundled plugin exceeds package limits')
      files[name] = [bytes, { mtime }]
    }
  }
  await collect(sourceDirectory)
  for (const entry of [manifest.entry, ...(manifest.contributes?.views ?? []).map(view => view.entry)].filter(Boolean))
    assert(files[entry], 'Bundled plugin entry is missing')
  const bytes = zipSync(files, { level: 6 })
  assert(bytes.length <= packageLimit, 'Bundled archive exceeds package limits')
  const file = 'office.lexora-extension'
  const icon = manifest.icon ? files[manifest.icon]?.[0] : null
  assert(!manifest.icon || (icon && manifest.icon.endsWith('.svg') && icon.length <= 65536), 'Invalid bundled icon')
  const catalog = { schemaVersion: 1, plugins: [{
    manifest,
    ...(icon ? { iconUrl: `data:image/svg+xml;base64,${icon.toString('base64')}` } : {}),
    repository: 'https://github.com/QAyong/XTLaw',
    artifact: { kind: 'bundled', file, sha256: hash(bytes), size: bytes.length },
  }] }
  await mkdir(outputDirectory, { recursive: true })
  async function commit(name, content) {
    const path = join(outputDirectory, name)
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, content, { flag: 'wx' })
      await rename(temporary, path)
    }
    finally { await rm(temporary, { force: true }) }
  }
  await commit(file, bytes)
  await commit('catalog.json', JSON.stringify(catalog))
  return { directory: outputDirectory, file, id: manifest.id, version: manifest.version, size: bytes.length, unpackedSize: total, files: names.size, sha256: hash(bytes) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  assert(!args.length || (args.length === 2 && args[0] === '--output'), 'Usage: prepare-bundled-extensions.mjs [--output <directory>]')
  prepareBundledExtensions(args.length ? { outputDirectory: resolve(args[1]) } : {}).then(result => writeOutput(JSON.stringify(result))).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
