import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

// The upstream commit every shim and stub was written against. A different commit must be reviewed first.
export const upstream = { repository: 'https://github.com/genspark-ai/genoffice/', commit: '1f306a2a496227cae9194097897212c93d00a4e6' }

const here = import.meta.dirname
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

async function listFiles(directory, base = directory) {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory())
      files.push(...await listFiles(full, base))
    else files.push(path.relative(base, full).replaceAll('\\', '/'))
  }
  return files.sort()
}

/**
 * Build the Sheets editor bundle from a checkout of the pinned upstream commit and the engine wasm from build-wasm.mjs.
 * The checkout needs `npm ci --ignore-scripts` plus `npm i --no-save --ignore-scripts path-browserify buffer @bjorn3/browser_wasi_shim`.
 */
export async function build(checkout, wasmFile, destination) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim()
  assert.equal(head, upstream.commit, 'Unexpected GenOffice commit: review the shims before building a new version')
  for (const dependency of ['path-browserify', 'buffer', 'vite', '@bjorn3/browser_wasi_shim'])
    await fs.access(path.join(checkout, 'node_modules', dependency)).catch(() => assert.fail(`Missing ${dependency} in the checkout (see build.mjs header)`))
  const wasm = await fs.readFile(wasmFile)
  // The config resolves workspace packages from the checkout, so it has to live inside it.
  const staging = path.join(checkout, 'lexora-build-xlsx')
  await fs.rm(staging, { recursive: true, force: true })
  await fs.cp(path.join(here, 'lexora-build'), staging, { recursive: true })
  await fs.writeFile(path.join(staging, 'shims', 'xlsx_engine.wasm'), wasm)
  const output = path.join(staging, 'dist')
  execFileSync(process.execPath, [path.join(checkout, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'lexora-build-xlsx/vite.config.mjs'], { cwd: checkout, stdio: 'inherit', env: { ...process.env, SHEETS_OUT: output } })
  const target = path.join(destination, 'xlsx')
  await fs.rm(target, { recursive: true, force: true })
  await fs.cp(output, target, { recursive: true })
  const resources = []
  for (const name of await listFiles(target)) {
    const bytes = await fs.readFile(path.join(target, name))
    resources.push({ name, size: bytes.length, sha256: sha256(bytes) })
  }
  // build-wasm.mjs writes the toolchain record next to the engine; keep it with the plugin.
  const engine = JSON.parse(await fs.readFile(`${wasmFile}.provenance.json`, 'utf8').catch(() => 'null'))
  assert(!engine || engine.sha256 === sha256(wasm), 'The engine provenance does not describe this wasm file')
  const provenance = { upstream: upstream.repository, commit: upstream.commit, bundledWith: 'vite build via apps/buddy/extensions/office-xlsx/build.mjs', engine: engine ?? { sha256: sha256(wasm), note: 'built outside build-wasm.mjs' }, resources }
  await fs.writeFile(path.join(destination, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  return { files: resources.length, bytes: resources.reduce((sum, file) => sum + file.size, 0) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [checkout, wasmFile, destination] = process.argv.slice(2)
  assert(checkout && wasmFile && destination, 'Usage: node apps/buddy/extensions/office-xlsx/build.mjs <GenOffice checkout> <engine .wasm> <plugin directory>')
  build(path.resolve(checkout), path.resolve(wasmFile), path.resolve(destination)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
