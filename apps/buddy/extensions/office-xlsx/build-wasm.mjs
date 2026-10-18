import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { upstream } from './build.mjs'

const here = import.meta.dirname
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options })
const capture = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', ...options }).trim()

async function edit(file, replacements) {
  let text = await fs.readFile(file, 'utf8')
  for (const [from, to] of replacements) {
    assert(text.includes(from), `Expected text not found in ${path.basename(file)}: ${from.slice(0, 60)}`)
    text = text.replaceAll(from, to)
  }
  await fs.writeFile(file, text)
}

/**
 * Compile the upstream Rust xlsx engine to wasm32-wasip1 with the small changes the browser needs.
 * Prerequisites: a Rust toolchain with the wasm32-wasip1 target (`rustup target add wasm32-wasip1`), network access for
 * crates.io, and optionally Binaryen's wasm-opt (pass its path, e.g. node_modules/binaryen/bin/wasm-opt from `npm i binaryen`).
 *
 * Changes to the upstream tree (the checkout itself is never modified):
 * - src/wasm_api.rs: reactor entry points calling the engine's own `Engine::handle_line` (this directory's wasm/wasm_api.rs).
 * - Cargo.toml: also build a cdylib; use local copies of ironcalc and ironcalc_base.
 * - ironcalc: zip without its bzip2/zstd features (C code that needs a wasm C toolchain); deflate is all the engine uses.
 * - ironcalc_base: NOW()/RAND() use std::time and getrandom on WASI instead of js-sys, which only exists on wasm32-unknown-unknown.
 */
export async function buildWasm(checkout, output, { wasmOpt } = {}) {
  const head = capture('git', ['rev-parse', 'HEAD'], { cwd: checkout })
  assert.equal(head, upstream.commit, 'Unexpected GenOffice commit: review the engine changes before building a new version')
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'xlsx-engine-wasm-'))
  const engine = path.join(work, 'engine')
  await fs.cp(path.join(checkout, 'apps/sheets/native/xlsx-engine'), engine, { recursive: true, filter: source => !/[\\/](?:target|\.cargo)(?:[\\/]|$)/.test(source) })
  const env = { ...process.env, CARGO_TARGET_DIR: path.join(work, 'target'), CARGO_HOME: process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo') }
  run('cargo', ['fetch', '--locked'], { cwd: engine, env })
  const metadata = JSON.parse(capture('cargo', ['metadata', '--format-version', '1', '--locked', '--filter-platform', 'wasm32-wasip1'], { cwd: engine, env, maxBuffer: 256 * 1024 * 1024 }))
  const versions = {}
  for (const name of ['ironcalc', 'ironcalc_base']) {
    const crate = metadata.packages.find(item => item.name === name)
    assert(crate, `Missing crate ${name}`)
    versions[name] = crate.version
    await fs.cp(path.dirname(crate.manifest_path), path.join(work, 'patched', name), { recursive: true })
  }
  assert.equal(versions.ironcalc, '0.7.1')
  assert.equal(versions.ironcalc_base, '0.7.1')
  await edit(path.join(work, 'patched/ironcalc/Cargo.toml'), [['[dependencies.zip]\nversion = "0.6"\n', '[dependencies.zip]\nversion = "0.6"\ndefault-features = false\nfeatures = ["deflate"]\n']])
  const unknownOs = 'all(target_arch = "wasm32", target_os = "unknown")'
  await edit(path.join(work, 'patched/ironcalc_base/Cargo.toml'), [['cfg(not(target_arch = "wasm32"))', `cfg(not(${unknownOs}))`], ['cfg(target_arch = "wasm32")', `cfg(${unknownOs})`]])
  for (const file of ['src/model.rs', 'src/functions/mathematical.rs'])
    await edit(path.join(work, 'patched/ironcalc_base', file), [['#[cfg(not(target_arch = "wasm32"))]', `#[cfg(not(${unknownOs}))]`], ['#[cfg(target_arch = "wasm32")]', `#[cfg(${unknownOs})]`]])
  await fs.copyFile(path.join(here, 'wasm/wasm_api.rs'), path.join(engine, 'src/wasm_api.rs'))
  await edit(path.join(engine, 'src/lib.rs'), [['pub mod protocol;\n', 'pub mod protocol;\n#[cfg(target_family = "wasm")]\npub mod wasm_api;\n']])
  await fs.appendFile(path.join(engine, 'Cargo.toml'), '\n[lib]\ncrate-type = ["rlib", "cdylib"]\n\n[patch.crates-io]\nironcalc = { path = "../patched/ironcalc" }\nironcalc_base = { path = "../patched/ironcalc_base" }\n')
  const profile = { CARGO_PROFILE_RELEASE_OPT_LEVEL: 'z', CARGO_PROFILE_RELEASE_LTO: 'true', CARGO_PROFILE_RELEASE_CODEGEN_UNITS: '1', CARGO_PROFILE_RELEASE_PANIC: 'abort', CARGO_PROFILE_RELEASE_STRIP: 'true' }
  // The lock file gains the two path overrides; every other crate stays at the locked version.
  run('cargo', ['build', '--release', '--lib', '--target', 'wasm32-wasip1'], { cwd: engine, env: { ...env, ...profile } })
  const built = path.join(work, 'target/wasm32-wasip1/release/xlsx_sidecar.wasm')
  let optimizer = 'none'
  if (wasmOpt) {
    const optimized = `${built}.opt`
    // npm's binaryen ships wasm-opt as a Node script; a native binary runs directly.
    const script = (await fs.readFile(wasmOpt)).subarray(0, 2).toString() === '#!'
    const [command, prefix] = script ? [process.execPath, [wasmOpt]] : [wasmOpt, []]
    run(command, [...prefix, built, '-Oz', '--enable-bulk-memory', '--enable-nontrapping-float-to-int', '--enable-sign-ext', '--enable-mutable-globals', '--enable-reference-types', '-o', optimized])
    await fs.rename(optimized, built)
    optimizer = capture(command, [...prefix, '--version'])
  }
  const bytes = await fs.readFile(built)
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, bytes)
  const provenance = { upstream: upstream.repository, commit: upstream.commit, rustc: capture('rustc', ['--version']), target: 'wasm32-wasip1', ironcalc: versions, optimizer, size: bytes.length, sha256: sha256(bytes) }
  await fs.writeFile(`${output}.provenance.json`, `${JSON.stringify(provenance, null, 2)}
`)
  await fs.rm(work, { recursive: true, force: true })
  return provenance
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [checkout, output, wasmOpt] = process.argv.slice(2)
  assert(checkout && output, 'Usage: node apps/buddy/extensions/office-xlsx/build-wasm.mjs <GenOffice checkout> <output .wasm> [wasm-opt path]')
  buildWasm(path.resolve(checkout), path.resolve(output), { wasmOpt: wasmOpt ? path.resolve(wasmOpt) : undefined }).then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
