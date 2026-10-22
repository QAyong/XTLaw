import path from 'node:path'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = import.meta.dirname
const shim = name => path.join(here, 'shims', name)
const node = names => new RegExp(`^(?:node:)?(?:${names})$`)
const exact = name => new RegExp(`^${name.replaceAll('/', '\\/')}$`)

// Main-process siblings replaced by browser versions or no-ops (upstream files stay untouched).
const mainStubs = {
  'pdf-export': 'noop-main.ts',
  'xlsx-sidecar-client': 'wasm-client.ts',
}
function stubMainModules() {
  return {
    name: 'lexora-main-stubs',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !importer.replaceAll('\\', '/').includes('/apps/sheets/src/main/'))
        return null
      if (!source.startsWith('./'))
        return null
      const stub = mainStubs[source.slice(2)]
      return stub ? shim(stub) : null
    },
  }
}

// Univer ships a locale pack per language and loads them through dynamic imports. The plugin follows the host
// language (Chinese or English), so every other pack resolves to an empty module instead of adding files.
const keptLocales = new Set(['zh-CN', 'en-US'])
const emptyLocale = '\0lexora-empty-locale'
function pruneUniverLocales() {
  return {
    name: 'lexora-univer-locales',
    enforce: 'pre',
    resolveId(source) {
      const match = /^@univerjs\/[^/]+\/locales\/([A-Za-z-]+)$/.exec(source)
      return match && !keptLocales.has(match[1]) ? emptyLocale : null
    },
    load: id => (id === emptyLocale ? 'export default {}' : null),
  }
}

// One chunk for the Univer runtime and one for React keep every file under the package's per-file limit
// without circular chunks; lazily loaded modules (language data) stay in their own small chunks.
function manualChunks(id, { getModuleInfo }) {
  const normalized = id.replaceAll('\\', '/')
  const info = getModuleInfo(id)
  if (info && info.importers.length === 0 && info.dynamicImporters.length > 0)
    return undefined
  if (/node_modules\/@univerjs\//.test(normalized))
    return 'univer'
  if (/node_modules\/(?:react|react-dom|scheduler)\//.test(normalized))
    return 'react'
  return undefined
}

// Renderer modules the plugin replaces with a corrected copy (the upstream file stays untouched).
const rendererFixes = { './control': 'control-fix.ts' }
function fixRendererModules() {
  return {
    name: 'lexora-renderer-fixes',
    enforce: 'pre',
    resolveId(source, importer) {
      const fix = rendererFixes[source] ?? (/^\.{1,2}\/i18n\/locale$/.test(source) ? 'locale-fix.ts' : undefined)
      return fix && importer?.replaceAll('\\', '/').includes('/apps/sheets/src/renderer/') ? shim(fix) : null
    },
  }
}

// The control hook only receives "is a file loaded"; the selection reader (shims/control-fix.ts) also needs the lazy workbook
// state to refuse cells that have not streamed in yet. The call site is pinned by the upstream commit check in build.mjs.
const controlCall = /(handleSheetsControl\(\s*req,\s*univerRef\.current\?\.univerAPI\.getActiveWorkbook\(\),\s*lazyWorkbookRef\.current !== null,)/
function passLazyStateToControl() {
  return {
    name: 'lexora-control-state',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/apps/sheets/src/renderer/App.tsx'))
        return null
      if (!controlCall.test(code))
        throw new Error('The renderer no longer calls handleSheetsControl the way shims/control-fix.ts expects')
      return code.replace(controlCall, '$1 lazyWorkbookRef.current,')
    },
  }
}

export default defineConfig({
  root: here,
  base: './',
  plugins: [pruneUniverLocales(), stubMainModules(), fixRendererModules(), passLazyStateToControl(), react()],
  resolve: {
    alias: [
      { find: exact('electron'), replacement: shim('electron.ts') },
      { find: exact('@genoffice/electron-utils'), replacement: shim('electron-utils.ts') },
      { find: exact('@genoffice/electron-utils/atomic-write'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/electron-utils/headless-export'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/electron-utils/drop-open'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/ai-search'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/electron-utils/main-proxy'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/project-store'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/file-parse'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/ai-provider'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/ai-provider/codex-app-server'), replacement: shim('stubs.ts') },
      { find: node('buffer'), replacement: 'buffer' },
      { find: node('fs'), replacement: shim('vfs.ts') },
      { find: node('fs/promises'), replacement: shim('fs-promises.ts') },
      { find: node('path'), replacement: 'path-browserify' },
      { find: node('crypto'), replacement: shim('crypto.ts') },
      { find: node('zlib'), replacement: shim('zlib.ts') },
      { find: node('child_process|worker_threads|os|dns|dns/promises|net|url|stream/promises|http|https|readline'), replacement: shim('node-misc.ts') },
      { find: exact('undici'), replacement: shim('node-misc.ts') },
    ],
  },
  define: { 'process.env.NODE_ENV': '"production"', '__dirname': '"/virtual"' },
  // A classic script: module workers started from a blob URL are refused inside the sandbox's opaque origin.
  worker: { format: 'iife', rollupOptions: { output: { entryFileNames: 'assets/[name]-[hash].js' } } },
  build: {
    outDir: process.env.SHEETS_OUT ?? path.join(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    minify: process.env.SHEETS_MINIFY === '0' ? false : 'esbuild',
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 16384,
    rollupOptions: {
      input: path.join(here, 'entry.ts'),
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: 'sheets.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: info => (info.names?.[0]?.endsWith('.css') ? 'sheets.css' : 'assets/[name]-[hash][extname]'),
        manualChunks,
      },
    },
  },
})
