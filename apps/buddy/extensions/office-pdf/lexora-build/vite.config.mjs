import path from 'node:path'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = import.meta.dirname
const shim = name => path.join(here, 'shims', name)
const pdfFile = (...parts) => path.join('apps', 'pdf', 'src', ...parts)

// Source edits. Each one is pinned to the upstream commit checked in build.mjs: the build fails when the text is not found,
// so a new upstream version is reviewed instead of silently producing a different editor.
const edits = {
  [pdfFile('renderer', 'App.tsx')]: [
    // pdf.js runs in a worker the host starts (entry.ts sets GlobalWorkerOptions.workerPort), not from a URL.
    ['import workerUrl from \'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url\'\n', ''],
    ['GlobalWorkerOptions.workerSrc = workerUrl\n', ''],
    // The plugin has no printing and no Office conversion (both go through the main process). The entries are tagged here and
    // hidden by pdf-overrides.css; the print shortcut is dropped so the dialog cannot be reached from the keyboard.
    // eslint-disable-next-line no-template-curly-in-string
    ['data-tip={`${t(\'print\')} (${platformShortcuts(\'⌘P\')})`}', 'data-lexora-hidden="" data-tip={`${t(\'print\')} (${platformShortcuts(\'⌘P\')})`}'],
    ['<div className="rb-drop-wrap" ref={convertWrapRef}>', '<div className="rb-drop-wrap" data-lexora-hidden="" ref={convertWrapRef}>'],
    // The "Ask AI" button of the selection bar is hidden; its place holds the quote button that selection-quote.js adds to this slot.
    ['                <button\n                  type="button"\n                  className="pdf-sel-ask"', '                <span className="lexora-quote-slot" />\n                <button\n                  type="button"\n                  className="pdf-sel-ask"'],
    // Permanent redaction and certificate signing need the main process and the system certificate store.
    ['data-tip={t(\'redactHint\')}', 'data-lexora-hidden="" data-tip={t(\'redactHint\')}'],
    ['data-tip={t(\'certSignHint\')}', 'data-lexora-hidden="" data-tip={t(\'certSignHint\')}'],
    ['} else if (k === \'p\' && !e.shiftKey) {\n          e.preventDefault()\n          openPrintDlg()\n', '} else if (k === \'p\' && !e.shiftKey) {\n          e.preventDefault()\n'],
  ],
  [pdfFile('renderer', 'view-config.ts')]: [
    // cmaps, standard fonts and pdf.js wasm sit next to the bundle, not next to the page.
    ['new URL(\'pdfjs/\', document.baseURI).href', 'new URL(\'../pdfjs/\', import.meta.url).href'],
  ],
}

function sourceEdits() {
  const pending = new Map(Object.entries(edits).map(([name, list]) => [path.resolve(name), list]))
  const applied = new Set()
  return {
    name: 'lexora-source-edits',
    enforce: 'pre',
    transform(code, id) {
      const file = path.resolve(id.split('?')[0])
      const list = pending.get(file)
      if (!list)
        return null
      applied.add(file)
      let text = code.replaceAll('\r\n', '\n')
      for (const [from, to] of list) {
        if (!text.includes(from))
          throw new Error(`The upstream ${path.basename(file)} no longer contains the text shims/ and vite.config.mjs expect: ${from.slice(0, 70)}`)
        text = text.replace(from, to)
      }
      return text
    },
    buildEnd() {
      for (const file of pending.keys()) {
        if (!applied.has(file))
          throw new Error(`${path.basename(file)} was never loaded, so its source edits were not applied`)
      }
    },
  }
}

// The renderer imports the save/edit code that runs in the Electron main process upstream. It runs in the page here, with
// the few Node and Electron entry points it touches replaced by shims/runtime.ts.
const runtime = shim('runtime.ts')
const mainShims = new Set(['./font-locate', './wasm-path', './atomic-write'])
function mainRuntime() {
  return {
    name: 'lexora-main-runtime',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer && mainShims.has(source) && path.resolve(importer).includes(path.join('apps', 'pdf', 'src', 'main')))
        return runtime
      return null
    },
  }
}

export default defineConfig({
  root: here,
  base: './',
  plugins: [mainRuntime(), sourceEdits(), react()],
  define: { 'process.env.NODE_ENV': '"production"', 'process.platform': '"browser"', 'process.env': '{}' },
  resolve: {
    alias: [
      { find: /^electron$/, replacement: runtime },
      // Node's Buffer is not in a page; the checkout carries the npm package of the same API (build.mjs installs it).
      { find: /^node:buffer$/, replacement: path.resolve(here, '..', 'node_modules', 'buffer', 'index.js') },
      { find: /^node:fs(\/promises)?$/, replacement: runtime },
      { find: /^node:crypto$/, replacement: shim('crypto.ts') },
      { find: /^node:(path|url|module|os|zlib|tls|child_process|stream\/promises)$/, replacement: shim('node-unavailable.ts') },
    ],
  },
  build: {
    outDir: process.env.PDF_OUT ?? path.join(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 16384,
    rollupOptions: {
      input: path.join(here, 'entry.ts'),
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: 'editor.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: info => (info.names?.[0]?.endsWith('.css') ? 'editor.css' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
})
