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
  'ai-ipc': 'noop-main.ts',
  'presenter-show': 'noop-main.ts',
  'attachments-ipc': 'noop-main.ts',
  'pdf-export': 'noop-main.ts',
  'print-window': 'noop-main.ts',
  'generated-page-temp': 'noop-main.ts',
  'font-store': 'noop-main.ts',
  'shaped-metrics': 'noop-main.ts',
  'fonts': 'fonts.ts',
  'tiff-decode': 'tiff-decode.ts',
}
function stubMainModules() {
  return {
    name: 'lexora-main-stubs',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !importer.replaceAll('\\', '/').includes('/apps/slides/src/main/'))
        return null
      if (source === '@genoffice/pptx-engine')
        return shim('pptx-engine.ts')
      if (!source.startsWith('./'))
        return null
      const stub = mainStubs[source.slice(2)]
      return stub ? shim(stub) : null
    },
  }
}

export default defineConfig({
  root: here,
  base: './',
  plugins: [stubMainModules(), react()],
  resolve: {
    alias: [
      { find: exact('electron'), replacement: shim('electron.ts') },
      { find: exact('@genoffice/electron-utils'), replacement: shim('electron-utils.ts') },
      { find: exact('@genoffice/electron-utils/atomic-write'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/ai-search'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/electron-utils/main-proxy'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/pipelines/slides'), replacement: shim('stubs.ts') },
      { find: exact('@genoffice/project-store'), replacement: shim('stubs.ts') },
      { find: node('buffer'), replacement: 'buffer' },
      { find: node('fs'), replacement: shim('vfs.ts') },
      { find: node('fs/promises'), replacement: shim('fs-promises.ts') },
      { find: node('path'), replacement: 'path-browserify' },
      { find: node('crypto'), replacement: shim('crypto.ts') },
      { find: node('zlib'), replacement: shim('zlib.ts') },
      { find: node('child_process|worker_threads|os|dns|dns/promises|net|url|stream/promises'), replacement: shim('node-misc.ts') },
      { find: exact('undici'), replacement: shim('node-misc.ts') },
    ],
  },
  define: { 'process.env.NODE_ENV': '"production"', '__dirname': '"/virtual"' },
  build: {
    outDir: process.env.SLIDES_OUT ?? path.join(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    minify: process.env.SLIDES_MINIFY === '0' ? false : 'esbuild',
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: path.join(here, 'entry.ts'),
      preserveEntrySignatures: 'strict',
      output: { inlineDynamicImports: true, entryFileNames: 'slides.js', assetFileNames: info => (info.names?.[0]?.endsWith('.css') ? 'slides.css' : 'assets/[name]-[hash][extname]') },
    },
  },
})
