import { createOfficeBridge } from './bridge.js'
import { installSelectionMenu } from './selection-menu.js'
import { installOfficeToolbarNavigation } from './office-toolbar-navigation.js'
import { installOfficeLayoutStability } from './layout-stability.js'

// Keep the inherited editor's ribbon and status bar as the document UI.
const messages = {
  zh: { discard: '当前文档有未保存修改。放弃修改并选择另一份文件？', cancel: '继续编辑', discardAction: '放弃并选择', error: '操作失败，修改尚未保存。请重试。', invalid: '文件不是受支持的 DOCX，或超出安全限制', changed: '文件已被其他程序修改，尚未保存。请另存为或重新打开。', loading: '正在加载编辑器…', preferences: '自动保存开关的设置未能记住。重新打开后请检查开关。' },
  en: { discard: 'This document has unsaved changes. Discard them and choose another file?', cancel: 'Keep editing', discardAction: 'Discard and choose', error: 'Operation failed. Changes have not been saved. Please retry.', invalid: 'Unsupported DOCX or file exceeds safety limits', changed: 'The file changed outside the editor. Changes have not been saved. Save a copy or reopen the file.', loading: 'Loading editor…', preferences: 'The AutoSave preference could not be remembered. Check the switch after reopening.' },
}

function memoryStorage(autoSave = false, onAutoSaveChange = () => {}) {
  const values = new Map([['aidocs.showAi', '0'], ['aidocs.showFiles', '0'], ['aidocs.autoSave', autoSave ? '1' : '0']])
  return {
    get length() { return values.size },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => {
      key = String(key)
      value = String(value)
      if (key.length + value.length > 16384 || (!values.has(key) && values.size >= 256))
        return
      values.set(key, value)
      if (key === 'aidocs.autoSave') {
        try {
          const on = value === '1' ? true : value === '0' ? false : JSON.parse(value)?.on
          if (typeof on === 'boolean')
            onAutoSaveChange(on)
        }
        catch {}
      }
    },
    removeItem: key => values.delete(String(key)),
    clear: () => values.clear(),
  }
}

export async function render(context, container) {
  let copy = messages[context.environment.language.startsWith('zh') ? 'zh' : 'en']
  container.className = 'office-shell'
  const links = []
  for (const file of ['assets/index-JQsJMU5H.css', 'vendor-overrides.css', 'office.css']) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL(`./${file}`, import.meta.url).href
    document.head.append(link)
    links.push(link)
  }
  const status = document.createElement('p')
  status.className = 'office-status'
  status.setAttribute('role', 'status')
  status.textContent = copy.loading
  const root = document.createElement('div')
  root.id = 'root'
  root.className = 'office-editor-root'
  container.append(root, status)
  installOfficeToolbarNavigation(root, context.signal)
  installOfficeLayoutStability(root, context.signal)
  let discardDialog = null
  let discardResolve = null
  const describeError = error => /^OFFICE_(?:INVALID|UNSUPPORTED)_DOCX$/.test(error?.message) ? copy.invalid : /RESOURCE_CHANGED|RESOURCE_UNAVAILABLE/.test(error?.message) ? copy.changed : copy.error
  const bridge = createOfficeBridge(context, {
    describeError,
    busy: () => {},
    file: () => { status.hidden = true },
    status: (value) => {
      if (value === 'saved' || value === 'savedCopy')
        status.hidden = true
    },
    error: (error) => {
      status.textContent = describeError(error)
      status.setAttribute('role', 'alert')
      status.hidden = false
    },
    confirmDiscard: () => new Promise((resolve) => {
      const dialog = document.createElement('dialog')
      discardDialog = dialog
      const message = document.createElement('p')
      message.textContent = copy.discard
      const keep = document.createElement('button')
      keep.type = 'button'
      keep.textContent = copy.cancel
      const discard = document.createElement('button')
      discard.type = 'button'
      discard.textContent = copy.discardAction
      const finish = (value) => {
        discardDialog = null
        discardResolve = null
        dialog.close()
        dialog.remove()
        resolve(value)
      }
      discardResolve = finish
      keep.addEventListener('click', () => finish(false))
      discard.addEventListener('click', () => finish(true))
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault()
        finish(false)
      })
      dialog.append(message, keep, discard)
      container.append(dialog)
      dialog.showModal()
      keep.focus()
    }),
  })
  // The sandbox has an opaque origin. Keep vendor preferences in bounded memory,
  // never weaken the iframe sandbox to make localStorage available.
  const viewState = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? { ...context.state } : {}
  let preferenceSave = Promise.resolve()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage(!!context.resource && viewState.autoSave !== false, (on) => {
    viewState.autoSave = on
    const nextState = { ...viewState }
    preferenceSave = preferenceSave.then(() => {
      context.signal.throwIfAborted()
      return context.setState(nextState)
    }).catch(() => {
      if (context.signal.aborted)
        return
      status.textContent = copy.preferences
      status.setAttribute('role', 'alert')
      status.hidden = false
    })
  }) })
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: memoryStorage() })
  window.desktop = bridge.desktop
  window.filesPaneApi = new Proxy({}, { get: () => async () => ({ ok: false, entries: [] }) })
  window.projectApi = new Proxy({}, { get: () => async () => null })
  status.addEventListener('click', () => { status.hidden = true }, { signal: context.signal })
  const appearance = context.onEnvironmentChange((environment) => {
    copy = messages[environment.language.startsWith('zh') ? 'zh' : 'en']
  })
  context.signal.addEventListener('abort', () => {
    discardResolve?.(false)
    discardDialog?.remove()
    appearance.dispose()
    bridge.dispose()
    window.__lexoraOfficeUnmount?.()
    for (const link of links) link.remove()
  }, { once: true })
  const editor = await import('./assets/index-CiXp5RFk.js')
  await editor.ready
  context.signal.throwIfAborted()
  installSelectionMenu(context)
  if (context.resource)
    await bridge.openFile(context.resource)
  else
    status.hidden = true
}
