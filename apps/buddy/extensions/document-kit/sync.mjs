// Copies the document kit into a plugin folder. A plugin must be self-contained at run time, so shared code is
// copied in at build time rather than imported across folders.
//   node extensions/document-kit/sync.mjs <plugin folder>            copy the kit into <plugin folder>/document-kit/
//   node extensions/document-kit/sync.mjs <plugin folder> --check    only report copies that differ from the kit
//   --only a.js,b.js                                                 limit either form to those kit files (a plugin that needs just one)
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const kit = fileURLToPath(new URL('.', import.meta.url))
export const documentKitFiles = ['read-file.js', 'zip-validate.js', 'quote.js', 'reveal.js']

// Returns the kit files whose copy in the plugin is missing or different.
export async function documentKitDrift(plugin, files = documentKitFiles) {
  const drift = []
  for (const name of files) {
    const original = await fs.readFile(path.join(kit, name))
    const copy = await fs.readFile(path.join(plugin, 'document-kit', name)).catch(() => null)
    if (!copy || !copy.equals(original))
      drift.push(name)
  }
  return drift
}

export async function syncDocumentKit(plugin, files = documentKitFiles) {
  await fs.mkdir(path.join(plugin, 'document-kit'), { recursive: true })
  for (const name of files)
    await fs.copyFile(path.join(kit, name), path.join(plugin, 'document-kit', name))
}

async function main() {
  const args = process.argv.slice(2)
  const only = args.find(arg => arg.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean)
  const [folder, ...flags] = args.filter(arg => !arg.startsWith('--only='))
  assert(folder && flags.every(flag => flag === '--check') && flags.length < 2, 'Usage: node extensions/document-kit/sync.mjs <plugin folder> [--check] [--only=a.js,b.js]')
  assert(!only || (only.length && only.every(name => documentKitFiles.includes(name))), `--only takes kit files: ${documentKitFiles.join(', ')}`)
  const files = only ?? documentKitFiles
  const plugin = path.resolve(folder)
  assert((await fs.stat(path.join(plugin, 'extension.json'))).isFile(), 'Not a plugin folder: extension.json is missing')
  if (flags.length) {
    const drift = await documentKitDrift(plugin, files)
    process.stdout.write(drift.length ? `Out of date: ${drift.join(', ')}\n` : 'document-kit is up to date\n')
    process.exitCode = drift.length ? 1 : 0
  }
  else {
    await syncDocumentKit(plugin, files)
    process.stdout.write(`Copied ${files.join(', ')} to ${path.join(plugin, 'document-kit')}\n`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
