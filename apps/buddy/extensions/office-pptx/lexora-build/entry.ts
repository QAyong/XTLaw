// Import order is load order: boot defines the Node globals the bundled code expects before anything else evaluates.
/* eslint-disable perfectionist/sort-imports */
import './shims/boot'
import { normalizeLang, setUiLang } from '@genoffice/i18n'
import { handlerRegistry } from './shims/electron'
import { vfs } from './shims/vfs'
// Upstream preload: exposes window.slidesApi / window.desktop over the in-page ipcRenderer.
import '../apps/slides/src/preload/index'
import { t } from '../apps/slides/src/renderer/i18n/locale'
import { sessions } from '../apps/slides/src/main/session-state'
import { registerSlidesIpc } from '../apps/slides/src/main/slides-main'
import { savePptx } from '@genoffice/pptx-engine'
/* eslint-enable perfectionist/sort-imports */

/** What the plugin view hands over before loading this bundle. */
export interface SlidesHost {
  /** Virtual file identity of the deck (never a real path). */
  path: string
  bytes: Uint8Array
  language: string
  theme: 'light' | 'dark'
  autoSave: boolean
  /** Writes the deck back to the selected file; rejects with a user-facing message when refused. Absent: saving is refused. */
  save?: (bytes: Uint8Array) => Promise<void>
  /** Exports a copy through the host's save dialog; false when the user cancels. */
  exportCopy?: (name: string, bytes: Uint8Array) => Promise<boolean>
  /** Confirmation and error dialogs; resolves with the chosen button index. */
  messageBox?: (options: { message?: string, detail?: string, buttons?: string[], cancelId?: number }) => Promise<number>
  notify?: (text: string, alert?: boolean) => void
}

const globals = globalThis as { __lexoraSlidesHost?: SlidesHost, __lexoraSlides?: unknown }
const host = globals.__lexoraSlidesHost
const handle = handlerRegistry.set

if (host)
  setUiLang(normalizeLang(host.language))
registerSlidesIpc()

// The shell process owns these in the full suite; the plugin answers from its host.
let aiPrefs = { side: 'left', fontSize: 'default', customFontSize: 14, spellcheck: true, openInNewDocs: false, showAiSidebar: false }
handle('app:get-theme', () => host?.theme ?? 'light')
handle('app:get-auto-save-default', () => ({ on: host?.autoSave ?? false, updatedAt: 0 }))
handle('app:get-author-name', () => 'XTLaw')
// Presenter view runs in the editor's own window: there is no second (audience) window to open.
handle('slides:presenter-start', () => ({ audience: false }))
handle('app:get-ai-panel-prefs', () => aiPrefs)
handle('app:set-ai-panel-prefs', (_event, patch: object) => (aiPrefs = { ...aiPrefs, ...patch, showAiSidebar: false }))

// Environment changes pushed by the plugin view (language / color scheme).
globals.__lexoraSlides = {
  setLanguage: (language: string) => {
    const lang = normalizeLang(language)
    setUiLang(lang)
    handlerRegistry.broadcast('app:language-changed', lang)
  },
  setTheme: (theme: 'light' | 'dark') => handlerRegistry.broadcast('app:theme-changed', theme),
  // Context-menu entries that only exist for the AI assistant, in the editor's current language.
  aiMenuLabels: () => [t('redactMenuLabel')],
}

const copyNotice = (language: string) => language.startsWith('zh') ? '已另存为副本，当前文档仍为原文件。' : 'Saved a copy. The open document is still the original file.'
// In Electron the application menu owns these accelerators; here they become the same menu commands.
function editable() {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}
window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey)
    return
  const key = event.key.toLowerCase()
  const command = key === 's'
    ? (event.shiftKey ? 'save-as' : 'save')
    : !event.shiftKey && !editable() && !window.getSelection()?.toString() && (key === 'c' || key === 'x' || key === 'v')
        ? ({ c: 'copy', x: 'cut', v: 'paste' } as const)[key]
        : null
  if (!command)
    return
  event.preventDefault()
  handlerRegistry.broadcast('slides:menu', command)
}, true)

const FONT_VARIANTS = ['', 'bold ', 'italic ', 'italic bold ']
/** Canvas measurement and drawing only see fonts that finished loading. */
function fontsReady() {
  return Promise.all([
    ...FONT_VARIANTS.map(variant => document.fonts?.load?.(`${variant}16px Carlito`).catch(() => [])),
    // Chinese fallback shipped with the plugin (see slides-overrides.css)
    document.fonts?.load?.('16px "Noto Sans CJK SC"', '中文').catch(() => []),
  ])
}

if (host) {
  vfs.put(host.path, host.bytes)
  // Writes to the deck itself go to the host; everything else (recovery copies, temp files) stays in memory.
  vfs.onWrite(async (path, bytes) => {
    if (path !== host.path)
      return
    if (!host.save)
      throw new Error('SLIDES_SAVE_UNAVAILABLE')
    await host.save(bytes)
  })
  // Save As exports a copy: the open document stays bound to the selected file and keeps its unsaved state.
  handle('slides:save-as', async (event: { sender: { id: number } }, defaultName: string) => {
    const session = sessions.get(event.sender.id)
    if (!session)
      return { ok: false, error: 'no file open' }
    try {
      const saved = await host.exportCopy?.(defaultName, await savePptx(session.opened))
      if (saved)
        host.notify?.(copyNotice(host.language))
      return { ok: false }
    }
    catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
  const openPath = handlerRegistry.get('slides:open-path')!
  // The renderer asks for a pending document right after it mounts; answer with the host's deck.
  handle('slides:consume-pending-open', async (event, fitWidthPx) => {
    await fontsReady()
    return openPath(event, host.path, fitWidthPx)
  })
}

// The renderer mounts into #root when imported; the host page creates it first.
export const ready = import('../apps/slides/src/renderer/main')
