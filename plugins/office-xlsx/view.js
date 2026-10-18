import { readXlsx } from './xlsx.js'

const messages = {
  zh: { loading: '正在加载表格编辑器…', error: '操作失败，请重试。', invalid: '文件不是受支持的 XLSX，或超出安全限制', changed: '文件已被其他程序修改，请重新打开。', empty: '请从文件管理器选择一个 XLSX 文件。', readonly: '当前为只读预览：可浏览与计算，修改暂不能保存。', saveBlocked: '当前版本不能保存修改，请在其他软件中编辑并保存。', ok: '确定', crashed: '表格引擎意外停止，请重新打开文件。' },
  en: { loading: 'Loading spreadsheet editor…', error: 'Operation failed. Please retry.', invalid: 'Unsupported XLSX or file exceeds safety limits', changed: 'The file changed outside the editor. Reopen it.', empty: 'Select an XLSX file from the file manager.', readonly: 'Read-only preview: you can browse and calculate, but changes cannot be saved yet.', saveBlocked: 'This version cannot save changes. Edit and save in another application.', ok: 'OK', crashed: 'The spreadsheet engine stopped unexpectedly. Reopen the file.' },
}

// The sandbox has an opaque origin: keep editor preferences in bounded memory instead of weakening the iframe.
function memoryStorage() {
  const values = new Map()
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
    },
    removeItem: key => values.delete(String(key)),
    clear: () => values.clear(),
  }
}

export async function render(context, container) {
  let copy = messages[context.environment.language.startsWith('zh') ? 'zh' : 'en']
  container.className = 'sheets-shell'
  const links = []
  for (const file of ['xlsx/sheets.css', 'sheets-overrides.css']) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL(`./${file}`, import.meta.url).href
    document.head.append(link)
    links.push(link)
  }
  const status = document.createElement('p')
  status.className = 'sheets-status'
  status.setAttribute('role', 'status')
  status.textContent = copy.loading
  const root = document.createElement('div')
  root.id = 'root'
  root.className = 'sheets-editor-root'
  container.append(root, status)
  const show = (text, alert = false) => {
    status.textContent = text
    status.setAttribute('role', alert ? 'alert' : 'status')
    status.hidden = !text
  }
  status.addEventListener('click', () => {
    status.hidden = true
  }, { signal: context.signal })
  let dialogs = []
  context.signal.addEventListener('abort', () => {
    for (const link of links) link.remove()
    for (const finish of [...dialogs]) finish()
  }, { once: true })
  const describe = error => /^OFFICE_(?:INVALID|UNSUPPORTED)_XLSX$/.test(error?.message) ? copy.invalid : /RESOURCE_CHANGED|RESOURCE_UNAVAILABLE/.test(error?.message) ? copy.changed : copy.error
  if (!context.resource) {
    show(copy.empty)
    return
  }
  try {
    const resource = context.resource.size === undefined
      ? { ...context.resource, size: (await context.resources.readBytes(context.resource, { offset: 0, length: 1 })).size }
      : context.resource
    const bytes = await readXlsx(context.resources, resource, context.signal)
    context.signal.throwIfAborted()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: memoryStorage() })
    // Editor-only identity, never a local path; the host resolves the authorized file.
    globalThis.__lexoraSheetsHost = {
      path: `/document/${resource.id}/${resource.name}`,
      bytes,
      language: context.environment.language,
      theme: context.environment.colorScheme === 'dark' ? 'dark' : 'light',
      // Read-only preview: no save path is wired to the host yet.
      messageBox: options => new Promise((resolve) => {
        const dialog = document.createElement('dialog')
        const message = document.createElement('p')
        message.textContent = [options?.message, options?.detail].filter(Boolean).join('\n')
        message.style.whiteSpace = 'pre-wrap'
        const cancelId = Number.isInteger(options?.cancelId) ? options.cancelId : 0
        const finish = (index = cancelId) => {
          dialogs = dialogs.filter(item => item !== finish)
          dialog.close()
          dialog.remove()
          resolve(index)
        }
        dialogs.push(finish)
        dialog.addEventListener('cancel', (event) => {
          event.preventDefault()
          finish()
        })
        const buttons = (options?.buttons?.length ? options.buttons : [copy.ok]).map((label, index) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = label
          button.addEventListener('click', () => finish(index))
          return button
        })
        dialog.append(message, ...buttons)
        container.append(dialog)
        dialog.showModal()
        buttons[0]?.focus()
      }),
      // The engine glue reports a refused save by code; the page owns the wording.
      notify: (text, alert) => show(text === 'SHEETS_SAVE_UNAVAILABLE' ? copy.saveBlocked : text, alert),
    }
    const editor = await import('./xlsx/sheets.js')
    await editor.ready
    context.signal.throwIfAborted()
    const appearance = context.onEnvironmentChange((environment) => {
      copy = messages[environment.language.startsWith('zh') ? 'zh' : 'en']
      globalThis.__lexoraSheets?.setLanguage(environment.language)
      globalThis.__lexoraSheets?.setTheme(environment.colorScheme === 'dark' ? 'dark' : 'light')
    })
    context.signal.addEventListener('abort', () => appearance.dispose(), { once: true })
    show(copy.readonly)
    // The notice must not keep covering the sheet tabs; a refused save shows it again.
    const hide = setTimeout(() => {
      if (status.textContent === copy.readonly)
        show('')
    }, 8000)
    context.signal.addEventListener('abort', () => clearTimeout(hide), { once: true })
  }
  catch (error) {
    if (context.signal.aborted)
      return
    console.error('[office-xlsx]', error)
    show(describe(error), true)
  }
}
