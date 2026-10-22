import path from 'node:path'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = import.meta.dirname
const shim = name => path.join(here, 'shims', name)
const rendererFile = name => path.join('apps', 'docs', 'src', 'renderer', ...name.split('/'))

// Source edits. Each one is pinned to the upstream commit checked in build.mjs: the build fails when the text is not found,
// so a new upstream version is reviewed instead of silently producing a different editor.
const edits = {
  'main.tsx': [
    // `ready` settles once the first render is queued (what view.js awaits), and the view can unmount the tree.
    ['void bootstrap()', 'export const ready = bootstrap()'],
    ['createRoot(document.getElementById(\'root\')!).render(', 'const root = createRoot(document.getElementById(\'root\')!)\n  ;(window as unknown as { __lexoraOfficeUnmount?: () => void }).__lexoraOfficeUnmount = () => root.unmount()\n  root.render('],
  ],
  // The plugin has no PDF export: no Export PDF / Export as images entries, no keyboard or menu route to them, and no print dialog.
  'components/Ribbon.tsx': [
    ['      [\'pdf\', \'ribbonConvertPdf\'],\n', ''],
    ['      [\'images\', \'ribbonConvertImages\'],\n', ''],
    // The Convert group (PDF, HTML, Markdown, images) writes through the main process, which the plugin does not have:
    // the group is tagged here and hidden by vendor-overrides.css.
    ['            <div className="ribbon-group">\n              <div className="ribbon-group-items">\n                <div className="rb-split-wrap">\n                  <button\n                    className={`rb-big${dropdown === \'convert\'', '            <div className="ribbon-group lexora-convert-group">\n              <div className="ribbon-group-items">\n                <div className="rb-split-wrap">\n                  <button\n                    className={`rb-big${dropdown === \'convert\''],
  ],
  'App.tsx': [
    ['        case \'export-pdf\':\n          void exportPdf()\n          break\n', ''],
    ['        case \'export-images\':\n          void exportImages()\n          break\n', ''],
    ['        case \'print\':\n          if (doc) void printDoc()\n          break\n', ''],
    // Withholding a selection from the model is an AI feature; the plugin has no AI panel.
    ['          onRedact={startRedaction}\n          onUnredact={clearRedaction}\n', ''],
  ],
  // The document arrives through the bridge (bridge.js): a page cannot fetch a blob: URL under the view CSP, so the
  // handoff URL is resolved from bytes the bridge holds, and only falls back to fetch for anything else.
  'doc-bytes.ts': [
    [
      'export async function fetchDocBytes(url: string): Promise<Uint8Array> {\n',
      'export async function fetchDocBytes(url: string): Promise<Uint8Array> {\n  const held = (globalThis as { __lexoraTakeDocBytes?: (url: string) => Uint8Array | undefined }).__lexoraTakeDocBytes?.(url)\n  if (held) return held\n',
    ],
  ],
  // Module workers cannot start from the sandbox's opaque origin; parse inline instead of failing a worker first.
  'parse-off-thread.ts': [
    ['worker = new Worker(new URL(\'./parse-worker.ts\', import.meta.url), { type: \'module\' })', 'throw new Error(\'OFFICE_WORKER_UNAVAILABLE\')'],
  ],
}

function sourceEdits() {
  const pending = new Map(Object.entries(edits).map(([name, list]) => [path.resolve(rendererFile(name)), list]))
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

export default defineConfig({
  root: here,
  base: './',
  plugins: [sourceEdits(), react()],
  resolve: { alias: [{ find: /^pdfjs-dist\/.*/, replacement: shim('pdfjs.ts') }] },
  build: {
    outDir: process.env.DOCS_OUT ?? path.join(here, 'dist'),
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
