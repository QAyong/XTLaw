import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

// The upstream commit the source edits in lexora-build/vite.config.mjs were written against. A different commit must be reviewed first.
export const upstream = { repository: 'https://github.com/genspark-ai/genoffice/', commit: '58dfd0b5b5eb3710efac0029b0452c61dba69035' }

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
 * Build the DOCX editor bundle from a checkout of the pinned upstream commit.
 * The checkout needs `npm ci --ignore-scripts`; nothing else is installed into it.
 */
export async function build(checkout, destination) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim()
  assert.equal(head, upstream.commit, 'Unexpected GenOffice commit: review the source edits before building a new version')
  await fs.access(path.join(checkout, 'node_modules/vite/bin/vite.js')).catch(() => assert.fail('Missing vite in the checkout (run npm ci --ignore-scripts)'))
  // The config resolves workspace packages from the checkout, so it has to live inside it.
  const staging = path.join(checkout, 'lexora-build-docs')
  await fs.rm(staging, { recursive: true, force: true })
  await fs.cp(path.join(here, 'lexora-build'), staging, { recursive: true })
  const output = path.join(staging, 'dist')
  execFileSync(process.execPath, [path.join(checkout, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'lexora-build-docs/vite.config.mjs'], { cwd: checkout, stdio: 'inherit', env: { ...process.env, DOCS_OUT: output } })
  const target = path.join(destination, 'editor')
  await fs.rm(target, { recursive: true, force: true })
  await fs.cp(output, target, { recursive: true })
  const resources = []
  for (const name of await listFiles(target)) {
    const bytes = await fs.readFile(path.join(target, name))
    resources.push({ name, size: bytes.length, sha256: sha256(bytes) })
  }
  const provenance = { upstream: upstream.repository, commit: upstream.commit, bundledWith: 'vite build via apps/buddy/extensions/office/build.mjs', resources }
  await fs.writeFile(path.join(destination, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  return { files: resources.length, bytes: resources.reduce((sum, file) => sum + file.size, 0) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [checkout, destination] = process.argv.slice(2)
  assert(checkout && destination, 'Usage: node apps/buddy/extensions/office/build.mjs <GenOffice checkout> <plugin directory>')
  build(path.resolve(checkout), path.resolve(destination)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
