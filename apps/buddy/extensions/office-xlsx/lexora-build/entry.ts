// Import order is load order: boot defines the Node globals the bundled code expects before anything else evaluates.
/* eslint-disable perfectionist/sort-imports */
import './shims/boot'
import { normalizeLang, setUiLang } from '@genoffice/i18n'
import { handlerRegistry, sender } from './shims/electron'
import { vfs } from './shims/vfs'
// Upstream preload: exposes window.desktopApi over the in-page ipcRenderer.
import '../apps/sheets/src/preload/index'
import { configureSheetsRuntime, createSheetsView, queueWorkbookForView, sendSheetsMenuAction } from '../apps/sheets/src/main/sheets-main'
/* eslint-enable perfectionist/sort-imports */

/** What the plugin view hands over before loading this bundle. */
export interface SheetsHost {
  /** Virtual file identity of the workbook (never a real path). */
  path: string
  bytes: Uint8Array
  language: string
  theme: 'light' | 'dark'
  /** AutoSave starts on (the plugin remembers an explicit choice per view). */
  autoSave?: boolean
  /** Writes the workbook back to the selected file; rejects with a user-facing message when refused. Absent: saving is refused. */
  save?: (bytes: Uint8Array) => Promise<void>
  /** Exports a copy through the host's save dialog; false when the user cancels. Absent: Save As is unavailable. */
  exportCopy?: (name: string, bytes: Uint8Array) => Promise<boolean>
  /** Confirmation and error dialogs; resolves with the chosen button index. */
  messageBox?: (options: { message?: string, detail?: string, buttons?: string[], cancelId?: number }) => Promise<number>
  notify?: (text: string, alert?: boolean) => void
}

/** While a Save As export runs, the copy the save pipeline writes (never the workbook itself) lands here. */
let exportCapture: Map<string, Uint8Array> | null = null

const globals = globalThis as { __lexoraSheetsHost?: SheetsHost, __lexoraSheets?: unknown, __lexoraCopyExported?: boolean }
const host = globals.__lexoraSheetsHost
const handle = handlerRegistry.set

if (host) {
  setUiLang(normalizeLang(host.language))
  vfs.put(host.path, host.bytes)
  // Writes to the workbook itself go to the host; everything else (snapshots, temp files) stays in memory.
  vfs.onWrite(async (path, bytes) => {
    if (path !== host.path) {
      exportCapture?.set(path, bytes)
      return
    }
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
handle('app:get-auto-save-default', () => ({ on: host?.autoSave ?? false, updatedAt: 0 }))
handle('app:get-author-name', () => 'XTLaw')
// The AI panel is not part of the plugin; the renderer only needs a record to hold.
handle('ai:get-settings', () => ({}))
handle('app:get-ai-panel-prefs', () => aiPrefs)
handle('app:set-ai-panel-prefs', (_event, patch: object) => (aiPrefs = { ...aiPrefs, ...patch, showAiSidebar: false }))
// Save writes through vfs.onWrite to the host. The periodic crash-recovery copy would serialize the whole
// workbook in memory, and a recovery file in the virtual file system is useless after a reload, so it is skipped.
const writeCopy = handlerRegistry.get('workbook:write-recovery')!
const saveWorkbook = handlerRegistry.get('workbook:save')!
handle('workbook:write-recovery', () => ({ ok: false }))
// Save As exports a copy: the open document stays bound to the selected file and keeps its unsaved state. The upstream
// "recovery copy" is the same save pipeline (cell edits, sheet operations, untouched entries kept byte for byte) without a
// dialog or a session swap, so its bytes are what gets exported. The renderer is told the save was cancelled, which leaves
// its journal and file identity alone; shims/locale-fix.ts words the status line it then shows (through a global flag: the two
// modules end up in different chunks, so a shared module variable would be two variables).
handle('workbook:save', async (event: unknown, input: { mode?: string, targetPath?: string }) => {
  if (!host || input?.mode !== 'save-as' || input.targetPath !== undefined)
    return saveWorkbook(event, input)
  if (!host.exportCopy)
    throw new Error('SHEETS_SAVE_AS_UNAVAILABLE')
  if (exportCapture)
    throw new Error('SHEETS_SAVE_AS_BUSY')
  const capture = exportCapture = new Map()
  try {
    const written = await writeCopy(event, input) as { ok?: boolean }
    // The pipeline writes a temporary file and renames it: the last write is the finished package.
    const [path] = [...capture.keys()].reverse()
    if (!written?.ok || !path)
      throw new Error('SHEETS_SAVE_AS_FAILED')
    const bytes = capture.get(path)!
    vfs.delete(path)
    const name = host.path.slice(host.path.lastIndexOf('/') + 1)
    if (await host.exportCopy(name, bytes))
      globals.__lexoraCopyExported = true
  }
  finally {
    exportCapture = null
  }
  return { canceled: true }
})
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

// In Electron the application menu owns the file accelerators; here they become the same menu actions.
window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's')
    return
  event.preventDefault()
  sendSheetsMenuAction(event.shiftKey ? 'save-as' : 'save')
}, true)

// The renderer mounts into #root when imported; the host page creates it first.
export const ready = import('../apps/sheets/src/renderer/main')
