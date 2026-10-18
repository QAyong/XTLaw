// Import order is load order: boot defines the Node globals the bundled code expects before anything else evaluates.
/* eslint-disable perfectionist/sort-imports */
import './shims/boot'
import { normalizeLang, setUiLang } from '@genoffice/i18n'
import { handlerRegistry, sender } from './shims/electron'
import { vfs } from './shims/vfs'
// Upstream preload: exposes window.desktopApi over the in-page ipcRenderer.
import '../apps/sheets/src/preload/index'
import { configureSheetsRuntime, createSheetsView, queueWorkbookForView } from '../apps/sheets/src/main/sheets-main'
/* eslint-enable perfectionist/sort-imports */

/** What the plugin view hands over before loading this bundle. */
export interface SheetsHost {
  /** Virtual file identity of the workbook (never a real path). */
  path: string
  bytes: Uint8Array
  language: string
  theme: 'light' | 'dark'
  /** Writes the workbook back to the selected file; rejects with a user-facing message when refused. Absent: saving is refused. */
  save?: (bytes: Uint8Array) => Promise<void>
  /** Confirmation and error dialogs; resolves with the chosen button index. */
  messageBox?: (options: { message?: string, detail?: string, buttons?: string[], cancelId?: number }) => Promise<number>
  notify?: (text: string, alert?: boolean) => void
}

const globals = globalThis as { __lexoraSheetsHost?: SheetsHost, __lexoraSheets?: unknown }
const host = globals.__lexoraSheetsHost
const handle = handlerRegistry.set

if (host) {
  setUiLang(normalizeLang(host.language))
  vfs.put(host.path, host.bytes)
  // Writes to the workbook itself go to the host; everything else (snapshots, temp files) stays in memory.
  vfs.onWrite(async (path, bytes) => {
    if (path !== host.path)
      return
    if (!host.save)
      throw new Error('SHEETS_SAVE_UNAVAILABLE')
    await host.save(bytes)
  })
}

// One tab, no shell, no AI: the plugin owns what the upstream shell process would answer.
configureSheetsRuntime({
  preloadPath: '',
  rendererFile: '',
  // The engine is WebAssembly in a worker (shims/wasm-client.ts); this path is never opened.
  sidecarPath: '/virtual/xlsx-engine',
  createDocument: async () => {
    throw new Error('SHEETS_FEATURE_UNAVAILABLE')
  },
})
createSheetsView({ includeAiHandlers: false, openingWorkbook: true })
let aiPrefs = { side: 'left', fontSize: 'default', customFontSize: 14, spellcheck: true, openInNewDocs: false, showAiSidebar: false }
handle('app:get-theme', () => host?.theme ?? 'light')
handle('app:get-document-theme', () => 'follow')
handle('app:get-auto-save-default', () => ({ on: false, updatedAt: 0 }))
handle('app:get-author-name', () => 'XTLaw')
// The AI panel is not part of the plugin; the renderer only needs a record to hold.
handle('ai:get-settings', () => ({}))
handle('app:get-ai-panel-prefs', () => aiPrefs)
handle('app:set-ai-panel-prefs', (_event, patch: object) => (aiPrefs = { ...aiPrefs, ...patch, showAiSidebar: false }))
// Read-only preview: no save path is wired to the host yet. A save attempt says so instead of writing anywhere,
// and the periodic crash-recovery copy (which would serialize the whole workbook in memory) is skipped.
handle('workbook:save', () => {
  host?.notify?.('SHEETS_SAVE_UNAVAILABLE', true)
  return { canceled: true }
})
handle('workbook:write-recovery', () => ({ ok: false }))
if (host)
  queueWorkbookForView(sender, host.path)

// Environment changes pushed by the plugin view (language / color scheme).
globals.__lexoraSheets = {
  setLanguage: (language: string) => {
    const lang = normalizeLang(language)
    setUiLang(lang)
    handlerRegistry.broadcast('app:language-changed', lang)
  },
  setTheme: (theme: 'light' | 'dark') => handlerRegistry.broadcast('app:theme-changed', theme),
}

// The renderer mounts into #root when imported; the host page creates it first.
export const ready = import('../apps/sheets/src/renderer/main')
