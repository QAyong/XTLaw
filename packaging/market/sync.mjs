import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError, writeOutput } from '../shared/cli-output.mjs'

// plugins/ here is the source of truth; the market repository only publishes what is synced into it.
const repoRoot = resolve(import.meta.dirname, '../..')
const sourceRoot = join(repoRoot, 'plugins')

async function listFiles(root, base = root) {
  const files = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory())
      files.push(...await listFiles(path, base))
    else
      files.push(relative(base, path))
  }
  return files.sort()
}

async function exists(path) {
  return stat(path).then(() => true, () => false)
}

async function sameDirectory(source, target) {
  if (!await exists(target))
    return false
  const [left, right] = await Promise.all([listFiles(source), listFiles(target)])
  if (left.join('\n') !== right.join('\n'))
    return false
  for (const file of left) {
    const [a, b] = await Promise.all([readFile(join(source, file)), readFile(join(target, file))])
    if (!a.equals(b))
      return false
  }
  return true
}

export async function syncMarketPlugins({ marketRoot, check = false }) {
  const targetRoot = join(marketRoot, 'plugins')
  if (!await exists(targetRoot))
    throw new Error(`Market repository not found: ${marketRoot} (set XTLAW_MARKET_DIR)`)
  const names = []
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && await exists(join(sourceRoot, entry.name, 'extension.json')))
      names.push(entry.name)
  }
  const changed = []
  for (const name of names.sort()) {
    const source = join(sourceRoot, name)
    const target = join(targetRoot, name)
    if (await sameDirectory(source, target))
      continue
    changed.push(name)
    if (check)
      continue
    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true })
    await cp(source, target, { recursive: true })
  }
  return { names, changed }
}

async function main() {
  const check = process.argv.includes('--check')
  const marketRoot = resolve(process.env.XTLAW_MARKET_DIR ?? join(repoRoot, '..', 'xtlaw-market'))
  const { names, changed } = await syncMarketPlugins({ marketRoot, check })
  if (!changed.length) {
    writeOutput(`市场仓库已与 plugins/ 一致（${names.length} 个插件）`)
    return
  }
  writeOutput(`${check ? '与市场仓库不一致' : '已同步到市场仓库'}：${changed.join('、')}`)
  if (check)
    process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    writeError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
