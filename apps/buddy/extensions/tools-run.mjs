// Runs tools.mjs with the repository's own module resolution.
//
// tools.mjs imports the host's TypeScript (manifest rules, limits, compiler). That code uses bundler-style imports
// (no file extensions, JSON without attributes) which plain `node` cannot load, so this runner loads it through Vite's
// SSR loader, the same resolution the application build uses. Usage is the same as tools.mjs:
//   node extensions/tools-run.mjs check|build|pack|dev|export-sdk <folder> [output]
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

async function main() {
  const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const tools = await server.ssrLoadModule('/extensions/tools.mjs')
    await tools.run()
  }
  finally {
    await server.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
