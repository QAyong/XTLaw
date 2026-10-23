import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { discoverBundledPlugins } from '../../../packaging/buddy/release/bundled-plugins.mjs'
import { buildExtensionDirectory, packExtensionDirectory, readExtensionPackage } from '../platform/extensions/extensionPackageAuthoring.ts'
import { documentContractReport } from '../shared/extensions/extensionDocumentContract.ts'
import { extensionCompatible, extensionManifestSchema } from '../shared/extensions/extensionManifest.ts'

// Sizes of the files under the plugin folder, for checks that need them before packing.
async function listFiles(folder, root = folder) {
  const files = []
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const absolute = path.join(folder, entry.name)
    if (entry.isDirectory())
      files.push(...await listFiles(absolute, root))
    else if (entry.isFile())
      files.push({ path: path.relative(root, absolute).split(path.sep).join('/'), size: (await fs.stat(absolute)).size })
  }
  return files
}
async function bundledHandlers() {
  const handlers = []
  for (const plugin of discoverBundledPlugins()) {
    const bundled = JSON.parse(await fs.readFile(path.join(plugin.directory, 'extension.json'), 'utf8'))
    const extensions = (bundled.contributes?.views ?? []).flatMap(view => view.accepts?.extensions ?? [])
    if (extensions.length)
      handlers.push({ id: bundled.id, name: bundled.name, extensions })
  }
  return handlers
}

export async function run() {
  const buddy = fileURLToPath(new URL('../', import.meta.url))
  const version = JSON.parse(await fs.readFile(path.join(buddy, 'buddy.version.json'), 'utf8')).version
  const [command, input, output] = process.argv.slice(2)
  assert(input && ['export-sdk', 'check', 'build', 'pack', 'dev'].includes(command), 'Usage: node extensions/tools.mjs export-sdk|check|build|pack|dev <folder> [output]')
  if (command === 'export-sdk') {
    const destination = path.resolve(input)
    await build({ configFile: false, publicDir: false, build: { outDir: destination, emptyOutDir: false, minify: false, lib: { entry: path.join(buddy, 'extensions/sdk/authoring.ts'), formats: ['es'], fileName: () => 'authoring.mjs' }, rolldownOptions: { external: [/^node:/, 'typescript', 'zod', 'semver'] } } })
    await fs.copyFile(path.join(buddy, 'service/resources/skills/plugin-creator/references/api.d.ts'), path.join(destination, 'index.d.ts'))
    await fs.copyFile(path.join(buddy, 'extensions/sdk/plugin.mjs'), path.join(destination, 'plugin.mjs'))
    return
  }
  const source = path.resolve(input)
  const manifest = extensionManifestSchema.parse(JSON.parse(await fs.readFile(path.join(source, 'extension.json'), 'utf8')))
  assert(extensionCompatible(manifest, version), `Extension requires Lexora ${manifest.engines.lexora} / API ${manifest.apiVersion}`)
  // Document-processor contract: capability names and warnings only; nothing here stops a check, build or pack.
  const contract = documentContractReport(manifest, { files: await listFiles(source), development: command === 'dev', bundledHandlers: await bundledHandlers() })
  for (const warning of contract.warnings)
    process.stderr.write(`warning: ${warning}\n`)
  if (command === 'check') {
    await readExtensionPackage(source)
    if (contract.capabilities.length)
      process.stdout.write(`Document capabilities: ${contract.capabilities.map(({ name, since }) => `${name} (XTLaw ${since}+)`).join(', ')}. These are XTLaw extension capabilities, not upstream API numbers.\n`)
    process.stdout.write(`${manifest.id}@${manifest.version}: compatible with Lexora ${version}, API ${manifest.apiVersion}` + '\n')
  }
  else if (command === 'pack') {
    assert(output, 'An output package path is required')
    const result = await packExtensionDirectory(source, output)
    process.stdout.write(`${path.resolve(output)} (${result.size} bytes, SHA-256 ${result.sha256})` + '\n')
  }
  else {
    const development = command === 'dev'
    const home = development ? await fs.mkdtemp(path.join(os.tmpdir(), 'lexora-extension-dev-')) : null
    assert(home || output, 'An output directory is required')
    const destination = path.resolve(home ? path.join(home, 'package') : output)
    await buildExtensionDirectory(source, destination, message => process.stdout.write(`${message}\n`))
    if (development) {
      await fs.mkdir(path.join(home, 'buddy'), { recursive: true })
      await fs.writeFile(path.join(home, 'config.toml'), '[desktop]\nlanguage="zh-CN"\n[pet]\nenabled=false\n')
      process.stdout.write(`Development profile: ${home}\nPermissions: ${JSON.stringify(manifest.permissions)}\nClose the development window to stop. This profile is retained for inspection.` + '\n')
      const { ELECTRON_RUN_AS_NODE: _node, ...environment } = process.env
      const executable = (await import('electron')).default
      const child = spawn(executable, [...(process.platform === 'linux' ? ['--disable-setuid-sandbox'] : []), buddy], { cwd: buddy, stdio: 'inherit', env: { ...environment, XTLAW_HOME: home, XTLAW_BUDDY_PROFILE: 'test', LEXORA_EXTENSION_DEVELOPMENT_PATH: destination } })
      process.on('SIGINT', () => child.kill('SIGINT'))
      process.on('SIGTERM', () => child.kill('SIGTERM'))
      child.once('exit', (code) => {
        process.exitCode = code ?? 1
      })
    }
  }
}
// Run directly, or loaded by tools-run.mjs, which calls run itself and so is not the main script.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void run().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
