import type { BrowserPageDialogResponse } from '../../shared/browser/browserDialogs'
import { contextBridge, ipcRenderer } from 'electron'
import { BROWSER_PAGE_DIALOG_CHANNEL } from '../../shared/browser/browserDialogs'

// This sandboxed Guest preload exposes only bounded alert/confirm requests. No filesystem,
// desktop API, generic IPC, Node.js, CDP or arbitrary evaluation is exposed to page content.
contextBridge.exposeInMainWorld('__lexoraPageDialog', Object.freeze({
  show(type: 'alert' | 'confirm', message: string): BrowserPageDialogResponse {
    if (!['alert', 'confirm'].includes(type) || typeof message !== 'string')
      return { handled: true, value: false }
    try {
      return ipcRenderer.sendSync(BROWSER_PAGE_DIALOG_CHANNEL, { type, message: message.slice(0, 2_048) })
    }
    catch { return { handled: true, value: false } }
  },
}))
contextBridge.executeInMainWorld({
  func: () => {
    const page = globalThis as unknown as {
      alert: (message?: unknown) => void
      confirm: (message?: string) => boolean
      __lexoraPageDialog: { show: (type: 'alert' | 'confirm', message: string) => { handled: boolean, value: boolean } }
    }
    const bridge = page.__lexoraPageDialog
    const alert = page.alert.bind(page)
    const confirm = page.confirm.bind(page)
    page.alert = (message?: unknown) => {
      const result = bridge.show('alert', String(message ?? ''))
      if (!result.handled)
        alert(message)
    }
    page.confirm = (message?: string) => {
      const result = bridge.show('confirm', String(message ?? ''))
      return result.handled ? result.value : confirm(message)
    }
  },
})
