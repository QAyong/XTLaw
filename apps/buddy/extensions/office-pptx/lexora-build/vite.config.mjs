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
  'export-images': 'noop-main.ts',
  'video-export': 'noop-main.ts',
  '../../../../packages/ppt2pptx/src': 'legacy-ppt.ts',
  'generated-page-temp': 'noop-main.ts',
  'font-store': 'noop-main.ts',
  'shaped-metrics': 'noop-main.ts',
  'fonts': 'fonts.ts',
  'tiff-decode': 'tiff-decode.ts',
}
// The plugin page cannot register the Electron protocol these URLs use, and its CSP
// allows only data: and blob: images. Convert at the point the URL is minted.
const slideMediaPatches = [
  [
    `const mediaCleanup = new FinalizationRegistry<Map<string, string>>((urls) => {
  for (const url of urls.values()) mediaSources.delete(url)
})`,
    `const mediaCleanup = new FinalizationRegistry<Map<string, string>>((urls) => {
  for (const url of urls.values()) releaseSlideMediaUrl(url)
})`,
  ],
  [
    `    if (!bytes || !retained.has(bytes)) {
      urls.delete(key)
      mediaSources.delete(url)
    }`,
    `    if (!bytes || !retained.has(bytes)) {
      releaseSlideMediaUrl(url)
      urls.delete(key)
    }`,
  ],
  [
    `    if (!url) {
      url = \`genoffice-slide-media://archive/\${randomUUID()}?mime=\${encodeURIComponent(mime)}\`
      urls.set(key, url)
      mediaSources.set(url, {
        opened: new WeakRef(opened),
        bytes: new WeakRef(bytes),
        mediaRef,
        ...(slidePath ? { slidePath } : {}),
      })
    }`,
    `    if (!url) {
      const token = \`genoffice-slide-media://archive/\${randomUUID()}?mime=\${encodeURIComponent(mime)}\`
      const source: MediaSource = {
        opened: new WeakRef(opened),
        bytes: new WeakRef(bytes),
        mediaRef,
        ...(slidePath ? { slidePath } : {}),
      }
      // readSlideMedia still keys off the protocol URL; drop that key before publishing.
      mediaSources.set(token, source)
      const media = readSlideMedia(token)
      mediaSources.delete(token)
      if (!media) return undefined
      url = browserSlideMediaUrl(media)
      if (!url) return undefined
      urls.set(key, url)
      mediaSources.set(url, source)
    }`,
  ],
  [
    'export function makeMediaResolver(opened: OpenedPptx, slidePath?: string) {',
    `/** EMF/WMF stay data URLs so the existing rasterizer and white-DC check still recognize them. */
const METAFILE_DATA_MIME: Record<string, string> = {
  'image/x-emf': 'image/x-emf',
  'image/emf': 'image/x-emf',
  'image/x-wmf': 'image/x-wmf',
  'image/wmf': 'image/x-wmf',
}
const MAX_METAFILE_BYTES = Math.floor((56 * 1024 * 1024 * 3) / 4)

function browserSlideMediaUrl(media: { body: Uint8Array, mime: string }): string {
  const dataMime = METAFILE_DATA_MIME[media.mime.toLowerCase()]
  if (dataMime) {
    if (media.body.byteLength > MAX_METAFILE_BYTES) return ''
    let binary = ''
    const chunk = 0x8000
    for (let offset = 0; offset < media.body.length; offset += chunk)
      binary += String.fromCharCode(...media.body.subarray(offset, offset + chunk))
    return \`data:\${dataMime};base64,\${btoa(binary)}\`
  }
  const copy = new Uint8Array(media.body.byteLength)
  copy.set(media.body)
  return URL.createObjectURL(new Blob([copy], { type: media.mime || 'application/octet-stream' }))
}

function releaseSlideMediaUrl(url: string): void {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  mediaSources.delete(url)
}

export function makeMediaResolver(opened: OpenedPptx, slidePath?: string) {`,
  ],
]

function showSlideMediaInPage() {
  return {
    name: 'lexora-slide-media-blob',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/apps/slides/src/main/session-state.ts'))
        return null
      let result = code
      for (const [from, to] of slideMediaPatches) {
        if (result.split(from).length !== 2)
          throw new Error('session-state.ts no longer has the media URL this plugin rewrites (see showSlideMediaInPage)')
        result = result.replace(from, () => to)
      }
      return result
    },
  }
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
      if (!source.startsWith('.'))
        return null
      const key = source.startsWith('./') ? source.slice(2) : source
      const stub = mainStubs[key]
      return stub ? shim(stub) : null
    },
  }
}

export default defineConfig({
  root: here,
  base: './',
  plugins: [showSlideMediaInPage(), stubMainModules(), react()],
  resolve: {
    alias: [
      { find: exact('electron'), replacement: shim('electron.ts') },
      { find: exact('@genoffice/electron-utils'), replacement: shim('electron-utils.ts') },
      { find: exact('@genoffice/electron-utils/print-window'), replacement: shim('print-stubs.ts') },
      { find: exact('@genoffice/electron-utils/print-job'), replacement: shim('print-stubs.ts') },
      { find: exact('@genoffice/electron-utils/print-cups'), replacement: shim('print-stubs.ts') },
      { find: exact('@genoffice/electron-utils/printer-options'), replacement: shim('print-stubs.ts') },
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
