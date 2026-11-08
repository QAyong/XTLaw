import { build } from 'esbuild'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
const root = new URL('./', import.meta.url)
await mkdir(new URL('dist/', root), { recursive: true })
const shared = { absWorkingDir: root.pathname, bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', minify: true, legalComments: 'eof' }
await build({ ...shared, entryPoints: [new URL('src/view.ts', root).pathname], outfile: new URL('dist/view.js', root).pathname, loader: { '.css': 'text' } })
await build({ ...shared, entryPoints: [new URL('src/host.ts', root).pathname], outfile: new URL('dist/host.js', root).pathname })
await copyFile(new URL('extension.json', root), new URL('dist/extension.json', root))
await copyFile(new URL('README.md', root), new URL('dist/README.md', root))
await copyFile(new URL('icon.svg', root), new URL('dist/icon.svg', root))
await copyFile(new URL('third-party/ArtPlayer.LICENSE', root), new URL('dist/LICENSE-ArtPlayer', root))
await copyFile(new URL('third-party/Fluent-icons.LICENSE', root), new URL('dist/LICENSE-Fluent-icons', root))
await copyFile(new URL('node_modules/.pnpm/option-validator@2.0.6/node_modules/option-validator/LICENSE', root), new URL('dist/LICENSE-option-validator', root))
await copyFile(new URL('node_modules/.pnpm/kind-of@6.0.3/node_modules/kind-of/LICENSE', root), new URL('dist/LICENSE-kind-of', root))
const manifest = JSON.parse(await readFile(new URL('dist/extension.json', root), 'utf8'))
console.log(`Built ${manifest.id}@${manifest.version} (ArtPlayer 5.4.0)`)
