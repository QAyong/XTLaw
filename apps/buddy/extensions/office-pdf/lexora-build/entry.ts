import type { PdfApi } from '../apps/pdf/src/shared/ipc'
import { Buffer } from 'node:buffer'
import { applyAiPanelPrefs, installScreenTips } from '@genoffice/ui'
import { zipSync } from 'fflate'
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { listPageImages, renderImagePng, renderPagePreviewPng } from '../apps/pdf/src/main/image-edit'
import { applySaveRequest, cropPagesBytes, extractPagesBytes, insertBlankPageBytes, insertPdfBytes, mergePagesBytes, mergePdfBytes, readStaticFormFills, replacePagesBytes, setPageSizeBytes, splitPagesBytes, splitPdfBytes } from '../apps/pdf/src/main/save-pdf'
import { canDrawText, listEditFonts, validateTextEdits } from '../apps/pdf/src/main/text-edit'
import App from '../apps/pdf/src/renderer/App'
import { LocaleProvider } from '../apps/pdf/src/renderer/i18n/locale'
import { loadRuntime, prepareImage } from './shims/runtime'
import '@genoffice/ui/tokens.css'
import '@genoffice/ui/screentip.css'
import '@genoffice/ui/ai-model-picker.css'
import '@genoffice/ui/ai-queue-strip.css'
import '@genoffice/ui/ai-usage.css'
import '@genoffice/ui/ai-skills.css'
import '@genoffice/ui/color-picker.css'
import '@genoffice/ui/dropdown.css'
import '@genoffice/ui/ribbon-collapse.css'
import '@genoffice/ui/markdown.css'
import '@genoffice/ui/ai-panel-prefs.css'
import '@genoffice/ui/ai-scope-quote.css'
import '../apps/pdf/src/renderer/styles.css'

type SaveRequest = Parameters<PdfApi['save']>[0]

export interface PdfMountOptions {
  container: HTMLElement
  /** URL of the plugin's `editor/` folder: runtime files (wasm, fonts) are fetched from it. */
  base: URL
  name: string
  bytes: Uint8Array
  language: 'zh' | 'en'
  theme: 'light' | 'dark'
  signal: AbortSignal
  /** pdf.js runs in a worker the host starts; the editor sets it as the global worker port. */
  createWorker: () => Promise<Worker>
  /** Called whenever the unsaved state changes. */
  onDirty: (dirty: boolean) => void
  /** Writes the bytes to the open file. Absent when the file cannot be written; edits then stay unsaved. */
  onSave?: (bytes: Uint8Array) => Promise<void>
  /** Offers a finished file to the user to keep (save dialog). Resolves false when the user cancels. */
  onExport: (name: string, bytes: Uint8Array) => Promise<boolean>
  /** Lets the user choose PDF files to combine with this one. */
  pickPdfs: (multiple: boolean) => Promise<Uint8Array[]>
}

export interface PdfEditor {
  /** Applies pending edits and writes the file; resolves with the saved bytes. */
  save: () => Promise<Uint8Array>
  /** Applies pending edits to a copy and offers it through `onExport`. */
  saveAs: () => Promise<boolean>
  setTheme: (theme: 'light' | 'dark') => void
  dispose: () => void
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const failure = (error: unknown) => ({ ok: false as const, error: message(error) })
const pdfName = (name: string) => `${name.replace(/\.pdf$/i, '')}.pdf`

export async function mountPdf(options: PdfMountOptions): Promise<PdfEditor> {
  const { container, name, signal } = options
  const virtualPath = `office-pdf:${crypto.randomUUID()}/${name}`
  let bytes = options.bytes.slice()
  // `generation` counts changes to the bytes; `acknowledged` is the last one written to the file.
  let generation = 0
  let acknowledged = 0
  let appDirty = false
  let notified = false
  let disposed = false
  let saving = false
  let resolveSave: ((ok: boolean) => void) | undefined
  let lastError = ''
  const events = new Map<string, Set<(...args: unknown[]) => void>>()
  const active = () => {
    signal.throwIfAborted()
    if (disposed)
      throw new Error('PDF_CLOSED')
  }
  const emit = (event: string, ...args: unknown[]) => {
    for (const handler of events.get(event) ?? [])
      handler(...args)
  }
  const notify = () => {
    if (disposed)
      return
    const dirty = appDirty || generation > acknowledged
    if (dirty === notified)
      return
    notified = dirty
    options.onDirty(dirty)
  }
  const checkPath = (path: string) => {
    active()
    if (path !== virtualPath)
      throw new Error('PDF_REFERENCE_STALE')
  }
  // Makes `next` the current document. It is written to the file first, so a failed write leaves the document as it was
  // (the editor keeps its pending edits and retries them) instead of applying them twice. A file that cannot be written
  // stays unsaved until it is saved as a copy.
  const commit = async (next: Uint8Array) => {
    active()
    const copy = next.slice()
    if (options.onSave)
      await options.onSave(copy)
    active()
    bytes = copy
    generation++
    if (options.onSave)
      acknowledged = generation
    notify()
  }
  const apply = async (source: Uint8Array, request: SaveRequest) => {
    for (const edit of request.imageEdits ?? []) {
      if (edit.kind === 'insertImage')
        await prepareImage(edit.image)
    }
    const result = await applySaveRequest(source, request)
    return { bytes: result.bytes, skippedTextEdits: result.skippedTextEdits, skippedTextInserts: result.skippedTextInserts, skippedImageEdits: result.skippedImageEdits }
  }
  const exportPdf = async (next: Uint8Array, suggestedName: string) => {
    const fileName = pdfName(suggestedName)
    return await options.onExport(fileName, next) ? { ok: true as const, savedPath: fileName } : { ok: true as const, canceled: true as const }
  }
  // The editor shows these messages as they are, so they read as text rather than as a code.
  const unavailableText = options.language === 'zh' ? '当前环境不支持此功能。' : 'This is not available here.'
  const unavailable = async () => {
    throw new Error(unavailableText)
  }
  const prefs = { side: 'left', fontSize: 'default', customFontSize: 14, spellcheck: false, openInNewDocs: false, showAiSidebar: false } as const
  // Saved signatures are kept for this session only; the plugin has no place to persist them.
  let signatures: { id: string, createdAt: number, data: unknown }[] = []
  const api: Partial<Record<keyof PdfApi, unknown>> = {
    consumePending: async () => virtualPath,
    readFile: async (path: string) => {
      checkPath(path)
      return bytes.slice().buffer
    },
    save: async (request: SaveRequest) => {
      try {
        checkPath(request.path)
        if (request.targetPath !== undefined) {
          // Save as: the open document and its unsaved state stay as they are.
          const copy = await apply(bytes, request)
          const exported = await exportPdf(copy.bytes, name)
          return exported.ok ? { ok: true, skippedTextEdits: copy.skippedTextEdits, skippedTextInserts: copy.skippedTextInserts, skippedImageEdits: copy.skippedImageEdits } : exported
        }
        const next = await apply(bytes, request)
        await commit(next.bytes)
        return { ok: true, skippedTextEdits: next.skippedTextEdits, skippedTextInserts: next.skippedTextInserts, skippedImageEdits: next.skippedImageEdits }
      }
      catch (error) {
        lastError = message(error)
        return failure(error)
      }
    },
    requestRedactionCopy: unavailable,
    autoRename: async () => ({ renamed: false }),
    isUntitled: async () => false,
    validateTextEdits: async (request: { path: string, edits: Parameters<typeof validateTextEdits>[1] }) => {
      checkPath(request.path)
      return validateTextEdits(bytes, request.edits)
    },
    listEditFonts: async () => listEditFonts(),
    canDrawText: async (...args: Parameters<typeof canDrawText>) => canDrawText(...args),
    listPageImages: async (path: string) => {
      checkPath(path)
      return listPageImages(bytes)
    },
    listStaticFormFills: async (path: string) => {
      checkPath(path)
      return readStaticFormFills(bytes)
    },
    ocrPage: async () => null,
    pageImagePng: async (request: { path: string, pageIndex: number, rect: Parameters<typeof renderImagePng>[2], scale: number }) => {
      checkPath(request.path)
      return renderImagePng(bytes, request.pageIndex, request.rect, request.scale)
    },
    pagePreviewPng: async (request: { path: string } & Parameters<typeof renderPagePreviewPng>[1]) => {
      checkPath(request.path)
      return renderPagePreviewPng(bytes, request)
    },
    extractPages: async (request: { path: string, pages: number[], suggestedName: string }) => {
      try {
        checkPath(request.path)
        return await exportPdf(await extractPagesBytes(bytes, request.pages), request.suggestedName)
      }
      catch (error) { return failure(error) }
    },
    insertPdf: async (request: { path: string, afterPageIndex: number }) => {
      try {
        checkPath(request.path)
        const [other] = await options.pickPdfs(false)
        if (!other)
          return { ok: true, canceled: true }
        const result = await insertPdfBytes(bytes, other, request.afterPageIndex)
        await commit(result.merged)
        return { ok: true, insertedCount: result.count }
      }
      catch (error) { return failure(error) }
    },
    insertBlankPage: async (request: { path: string, afterPageIndex: number }) => {
      try {
        checkPath(request.path)
        await commit(await insertBlankPageBytes(bytes, request.afterPageIndex))
        return { ok: true }
      }
      catch (error) { return failure(error) }
    },
    splitPdf: async (request: { path: string, chunkSize: number, baseName: string }) => {
      try {
        checkPath(request.path)
        const parts = await splitPdfBytes(bytes, request.chunkSize)
        const archive = zipSync(Object.fromEntries(parts.map((part, index) => [`${request.baseName}-${index + 1}.pdf`, part])))
        return await options.onExport(`${request.baseName}.zip`, archive) ? { ok: true, count: parts.length, savedDir: `${request.baseName}.zip` } : { ok: true, canceled: true }
      }
      catch (error) { return failure(error) }
    },
    mergePdf: async (request: { path: string, suggestedName: string }) => {
      try {
        checkPath(request.path)
        const others = await options.pickPdfs(true)
        if (!others.length)
          return { ok: true, canceled: true }
        const result = await mergePdfBytes(bytes, others)
        const saved = await exportPdf(result.merged, request.suggestedName)
        return saved.ok ? { ...saved, appendedCount: result.appended } : saved
      }
      catch (error) { return failure(error) }
    },
    mergePages: async (request: { path: string, suggestedName: string } & Parameters<typeof mergePagesBytes>[1]) => {
      try {
        checkPath(request.path)
        return await exportPdf(await mergePagesBytes(bytes, request), request.suggestedName)
      }
      catch (error) { return failure(error) }
    },
    replacePages: async (request: { path: string, pages: number[] }) => {
      try {
        checkPath(request.path)
        const [other] = await options.pickPdfs(false)
        if (!other)
          return { ok: true, canceled: true }
        const result = await replacePagesBytes(bytes, other, request.pages)
        await commit(result.merged)
        return { ok: true, removed: result.removed, inserted: result.inserted }
      }
      catch (error) { return failure(error) }
    },
    setPageSize: async (request: { path: string, width: number, height: number }) => {
      try {
        checkPath(request.path)
        await commit(await setPageSizeBytes(bytes, request.width, request.height))
        return { ok: true }
      }
      catch (error) { return failure(error) }
    },
    splitPages: async (request: { path: string, perPage: 2 | 4 | 9, suggestedName: string }) => {
      try {
        checkPath(request.path)
        return await exportPdf(await splitPagesBytes(bytes, request.perPage), request.suggestedName)
      }
      catch (error) { return failure(error) }
    },
    cropPages: async (request: { path: string, pages: number[], rect: Parameters<typeof cropPagesBytes>[2] }) => {
      try {
        checkPath(request.path)
        await commit(await cropPagesBytes(bytes, request.pages, request.rect))
        return { ok: true }
      }
      catch (error) { return failure(error) }
    },
    exportImages: async (request: { baseName: string, images: string[], pageNumbers: number[] }) => {
      try {
        const files = Object.fromEntries(request.images.map((image, index) => [`${request.baseName}-${request.pageNumbers[index]}.png`, Buffer.from(image, 'base64')]))
        return await options.onExport(`${request.baseName}-images.zip`, zipSync(files)) ? { ok: true, count: request.images.length, savedDir: `${request.baseName}-images.zip` } : { ok: true, canceled: true }
      }
      catch (error) { return failure(error) }
    },
    listDigitalSignatures: async () => [],
    listSystemCertificates: async () => ({ certs: [], issues: ['platform-unsupported'] }),
    releaseCertificate: () => {},
    inspectCertificate: async () => ({ ok: false, error: 'cert-store-unsupported' }),
    signWithCertificate: async () => ({ ok: false, error: 'cert-store-unsupported' }),
    listSavedSignatures: async () => signatures,
    addSavedSignature: async (data: unknown) => {
      const encoded = JSON.stringify(data)
      signatures = [{ id: crypto.randomUUID(), createdAt: Date.now(), data }, ...signatures.filter(item => JSON.stringify(item.data) !== encoded)].slice(0, 20)
      return signatures
    },
    removeSavedSignature: async (id: string) => {
      signatures = signatures.filter(item => item.id !== id)
      return signatures
    },
    getUsername: async () => '',
    setDirty: (dirty: boolean) => {
      appDirty = dirty
      notify()
    },
    sendCloseSaveResult: (ok: boolean) => {
      resolveSave?.(ok)
      resolveSave = undefined
    },
    print: async () => ({ ok: false, error: unavailableText }),
    listPrinters: async () => [],
    getLanguage: async () => options.language,
    getTheme: async () => options.theme,
    getAiPanelPrefs: async () => prefs,
    setAiPanelPrefs: async () => prefs,
  }
  await loadRuntime(options.base, signal)
  const worker = await options.createWorker()
  if (signal.aborted) {
    worker.terminate()
    signal.throwIfAborted()
  }
  GlobalWorkerOptions.workerPort = worker
  const pdfWindow = window as unknown as { pdfApi: PdfApi }
  const previous = pdfWindow.pdfApi
  pdfWindow.pdfApi = new Proxy(api, {
    get(target, property) {
      if (property in target)
        return target[property as keyof typeof target]
      // `onXxx(handler)` subscriptions return an unsubscribe function.
      if (typeof property === 'string' && property.startsWith('on')) {
        return (handler: (...args: unknown[]) => void) => {
          const set = events.get(property) ?? new Set()
          set.add(handler)
          events.set(property, set)
          return () => set.delete(handler)
        }
      }
      return unavailable
    },
  }) as unknown as PdfApi
  const previousTheme = document.documentElement.getAttribute('data-theme')
  document.documentElement.setAttribute('data-theme', options.theme)
  applyAiPanelPrefs(prefs)
  const stopTips = installScreenTips()
  container.classList.add('office-pdf-editor')
  const root = createRoot(container)
  root.render(createElement(LocaleProvider, { initial: options.language, children: createElement(App) }))
  const dispose = () => {
    if (disposed)
      return
    disposed = true
    resolveSave?.(false)
    root.unmount()
    worker.terminate()
    GlobalWorkerOptions.workerPort = null
    events.clear()
    stopTips()
    container.classList.remove('office-pdf-editor')
    pdfWindow.pdfApi = previous
    if (previousTheme)
      document.documentElement.setAttribute('data-theme', previousTheme)
    else document.documentElement.removeAttribute('data-theme')
    signal.removeEventListener('abort', dispose)
  }
  signal.addEventListener('abort', dispose, { once: true })
  return {
    async save() {
      active()
      if (saving)
        throw new Error('PDF_BUSY')
      if (!events.get('onCloseSaveRequest')?.size)
        throw new Error('PDF_NOT_READY')
      saving = true
      lastError = ''
      try {
        const result = new Promise<boolean>((resolve) => {
          resolveSave = resolve
        })
        emit('onCloseSaveRequest', { flushAll: true })
        if (!await result)
          throw new Error(lastError || 'PDF_SAVE_FAILED')
        active()
        return bytes.slice()
      }
      finally {
        saving = false
        resolveSave = undefined
      }
    },
    async saveAs() {
      active()
      return new Promise<boolean>((resolve, reject) => {
        const off = events.get('onSaveAsRequest')
        if (!off?.size)
          return reject(new Error('PDF_NOT_READY'))
        api.sendSaveAsResult = (ok: boolean) => resolve(ok)
        emit('onSaveAsRequest', '')
      })
    },
    setTheme(theme: 'light' | 'dark') {
      document.documentElement.setAttribute('data-theme', theme)
      emit('onThemeChanged', theme)
    },
    dispose,
  }
}
