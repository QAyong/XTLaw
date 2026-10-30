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

// The editor's autosave helper (every 30 s and on window blur) has no off switch of its own. The plugin page offers one like the
// other Office plugins do and publishes it as `window.__lexoraPdfAutoSave`; this makes the helper honour it. The anchor is the helper's
// minified body in the pinned commit's output, so a different commit that moves it fails here instead of silently shipping autosave
// that cannot be turned off.
const autoSaveHelper = 'const n=()=>{i()&&e()},a=window.setInterval(n,t)'
const autoSaveGated = 'const n=()=>{window.__lexoraPdfAutoSave!==!1&&i()&&e()},a=window.setInterval(n,t)'

async function gateAutoSave(directory) {
  const matches = []
  for (const name of await listFiles(directory)) {
    if (!name.endsWith('.js'))
      continue
    const file = path.join(directory, name)
    const text = await fs.readFile(file, 'utf8')
    const count = text.split(autoSaveHelper).length - 1
    if (count)
      matches.push({ file, text, count })
  }
  assert.equal(matches.length, 1, 'Expected the autosave helper in exactly one editor file: review the source edits before building a new version')
  assert.equal(matches[0].count, 1, 'Expected exactly one autosave helper')
  await fs.writeFile(matches[0].file, matches[0].text.replace(autoSaveHelper, autoSaveGated))
}

// Files the editor loads at run time (see shims/runtime.ts): copied next to the bundle, not into it.
const runtimeAssets = [
  ['node_modules/@embedpdf/pdfium/dist/pdfium.wasm', 'pdfium.wasm'],
  ['node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm', 'hb-subset.wasm'],
  ...['Sans', 'Serif', 'Mono'].flatMap(family => ['Regular', 'Bold', 'Italic', 'BoldItalic'].map(style => [`apps/docs/src/renderer/fonts/Liberation${family}-${style}.ttf`, `Liberation${family}-${style}.ttf`])),
]
const licenses = [
  ['LICENSE', 'LICENSE'],
  ['apps/docs/src/renderer/fonts/LICENSE-OFL.txt', 'LICENSE-OFL.txt'],
  ['node_modules/@embedpdf/pdfium/LICENSE.pdfium', 'LICENSE-pdfium.txt'],
  ['node_modules/harfbuzzjs/LICENSE', 'LICENSE-harfbuzzjs.txt'],
  ['node_modules/pdfjs-dist/LICENSE', 'LICENSE-pdfjs.txt'],
]
// pdf.js looks these up by URL (view-config.ts), and the page worker is started by the host from a plugin file.
const pdfjsAssets = ['cmaps', 'standard_fonts', 'wasm']

/**
 * Build the PDF editor bundle from a checkout of the pinned upstream commit.
 * The checkout needs `npm ci --ignore-scripts`; nothing else is installed into it.
 * `cjkFont` is the Noto Sans CJK SC subset (SIL OFL) the editor falls back to for Chinese text; it is not part of the checkout.
 */
export async function build(checkout, destination, cjkFont) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim()
  assert.equal(head, upstream.commit, 'Unexpected GenOffice commit: review the source edits before building a new version')
  await fs.access(path.join(checkout, 'node_modules/vite/bin/vite.js')).catch(() => assert.fail('Missing vite in the checkout (run npm ci --ignore-scripts)'))
  await fs.access(cjkFont).catch(() => assert.fail('Missing CJK font subset'))
  // The editor's save code uses Node's Buffer, which the checkout only has through Electron. Pinned, no install scripts.
  await fs.access(path.join(checkout, 'node_modules/buffer/package.json')).catch(() => execFileSync('npm', ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', 'buffer@6.0.3'], { cwd: checkout, stdio: 'inherit' }))
  // The config resolves workspace packages from the checkout, so it has to live inside it.
  const staging = path.join(checkout, 'lexora-build-pdf')
  await fs.rm(staging, { recursive: true, force: true })
  await fs.cp(path.join(here, 'lexora-build'), staging, { recursive: true })
  const output = path.join(staging, 'dist')
  execFileSync(process.execPath, [path.join(checkout, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'lexora-build-pdf/vite.config.mjs'], { cwd: checkout, stdio: 'inherit', env: { ...process.env, PDF_OUT: output } })
  const target = path.join(destination, 'editor')
  await fs.rm(target, { recursive: true, force: true })
  await fs.cp(output, target, { recursive: true })
  await gateAutoSave(target)
  const runtime = path.join(target, 'runtime')
  await fs.mkdir(runtime, { recursive: true })
  for (const [from, name] of runtimeAssets)
    await fs.copyFile(path.join(checkout, from), path.join(runtime, name))
  await fs.copyFile(cjkFont, path.join(runtime, 'NotoSansCJKsc-Regular-subset.otf'))
  for (const name of pdfjsAssets)
    await fs.cp(path.join(checkout, 'node_modules/pdfjs-dist', name), path.join(target, 'pdfjs', name), { recursive: true })
  await fs.copyFile(path.join(checkout, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'), path.join(target, 'pdf-worker.js'))
  // `@embedpdf/pdfium` names its wasm by URL, but the editor hands it the bytes from runtime/ instead, so this copy is never fetched.
  for (const name of await fs.readdir(path.join(target, 'assets')).catch(() => [])) {
    if (/^pdfium-.*\.wasm$/.test(name))
      await fs.rm(path.join(target, 'assets', name))
  }
  // Licenses of what the package ships: GenOffice (Apache-2.0), the fonts (SIL OFL), and the libraries behind runtime/ and pdfjs/.
  for (const [from, name] of licenses)
    await fs.copyFile(path.join(checkout, from), path.join(destination, name))
  const resources = []
  for (const name of await listFiles(target)) {
    const bytes = await fs.readFile(path.join(target, name))
    resources.push({ name, size: bytes.length, sha256: sha256(bytes) })
  }
  const provenance = {
    upstream: upstream.repository,
    commit: upstream.commit,
    bundledWith: 'vite build via apps/buddy/extensions/office-pdf/build.mjs',
    // Not part of the GenOffice checkout: a Noto Sans CJK SC subset (SIL OFL) taken from the useLexora/plugins Office plugin.
    cjkFont: { name: 'runtime/NotoSansCJKsc-Regular-subset.otf', size: (await fs.stat(cjkFont)).size, sha256: sha256(await fs.readFile(cjkFont)) },
    resources,
  }
  await fs.writeFile(path.join(destination, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  return { files: resources.length, bytes: resources.reduce((sum, file) => sum + file.size, 0) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [checkout, destination, cjkFont] = process.argv.slice(2)
  assert(checkout && destination && cjkFont, 'Usage: node apps/buddy/extensions/office-pdf/build.mjs <GenOffice checkout> <plugin directory> <NotoSansCJKsc subset .otf>')
  build(path.resolve(checkout), path.resolve(destination), path.resolve(cjkFont)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
