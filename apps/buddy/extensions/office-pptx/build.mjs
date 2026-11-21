import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

// The upstream commit every shim and stub was written against. A different commit must be reviewed first.
export const upstream = { repository: 'https://github.com/genspark-ai/genoffice/', commit: '19a389b39be75f611ec21dcda4a7b91a658239d2' }

const here = import.meta.dirname
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

async function readGitHead(checkout) {
  const dotGit = path.join(checkout, '.git')
  const dotGitStat = await fs.stat(dotGit)
  let gitDir = dotGit
  if (dotGitStat.isFile()) {
    const gitFile = await fs.readFile(dotGit, 'utf8')
    const prefix = 'gitdir:'
    const gitDirLine = gitFile.trimEnd()
    const gitDirPath = gitDirLine.startsWith(prefix) ? gitDirLine.slice(prefix.length).trim() : ''
    assert(gitDirPath && !/[\r\n]/.test(gitDirPath), 'Invalid .git file in GenOffice checkout')
    gitDir = path.resolve(checkout, gitDirPath)
  }

  const head = (await fs.readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim()
  if (/^[a-f0-9]{40}$/i.test(head))
    return head
  const ref = /^ref:\s*(\S+)$/.exec(head)?.[1]
  assert(ref, 'Invalid HEAD in GenOffice checkout')
  try {
    return (await fs.readFile(path.join(gitDir, ref), 'utf8')).trim()
  }
  catch {
    const packed = await fs.readFile(path.join(gitDir, 'packed-refs'), 'utf8')
    const line = packed.split(/\r?\n/).find(item => !item.startsWith('^') && item.endsWith(` ${ref}`))
    assert(line, `Missing GenOffice ref ${ref}`)
    return line.split(' ')[0]
  }
}

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
 * Build the Slides editor bundle from a checkout of the pinned upstream commit.
 * The checkout needs `npm ci --ignore-scripts` plus `npm i --no-save --ignore-scripts path-browserify buffer`.
 */
export async function build(checkout, destination) {
  const head = await readGitHead(checkout)
  assert.equal(head, upstream.commit, 'Unexpected GenOffice commit: review the shims before building a new version')
  for (const dependency of ['path-browserify', 'buffer', 'vite'])
    await fs.access(path.join(checkout, 'node_modules', dependency)).catch(() => assert.fail(`Missing ${dependency} in the checkout (see build.mjs header)`))
  // The config resolves workspace packages from the checkout, so it has to live inside it.
  const staging = path.join(checkout, 'lexora-build')
  await fs.rm(staging, { recursive: true, force: true })
  await fs.cp(path.join(here, 'lexora-build'), staging, { recursive: true })
  const output = path.join(staging, 'dist')
  execFileSync(process.execPath, [path.join(checkout, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'lexora-build/vite.config.mjs'], { cwd: checkout, stdio: 'inherit', env: { ...process.env, SLIDES_OUT: output } })
  const target = path.join(destination, 'slides')
  await fs.rm(target, { recursive: true, force: true })
  await fs.cp(output, target, { recursive: true })
  const resources = []
  for (const name of await listFiles(target)) {
    const bytes = await fs.readFile(path.join(target, name))
    resources.push({ name, size: bytes.length, sha256: sha256(bytes) })
  }
  const provenance = { upstream: upstream.repository, commit: upstream.commit, bundledWith: 'vite build via apps/buddy/extensions/office-pptx/build.mjs', resources }
  await fs.writeFile(path.join(destination, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  return { files: resources.length, bytes: resources.reduce((sum, file) => sum + file.size, 0) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [checkout, destination] = process.argv.slice(2)
  assert(checkout && destination, 'Usage: node apps/buddy/extensions/office-pptx/build.mjs <GenOffice checkout> <plugin directory>')
  build(path.resolve(checkout), path.resolve(destination)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
