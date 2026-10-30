import { registerReveal } from './document-kit/reveal.js'
import { withFirstSlide } from './empty-deck.js'
import { installOfficeToolbarNavigation } from './office-toolbar-navigation.js'
import { readPptx, validatePptx } from './pptx.js'
import { createQuoteReveal } from './reveal-quote.js'
import { installSelectionMenu } from './selection-menu.js'

const messages = {
  zh: { loading: '正在加载编辑器…', error: '操作失败，修改尚未保存。请重试。', invalid: '文件不是受支持的 PPTX，或超出安全限制', changed: '文件已被其他程序修改，尚未保存。请另存为或重新打开。', empty: '请从文件管理器选择一个 PPTX 文件。', cancelled: '保存已取消。', preferences: '自动保存开关的设置未能记住。重新打开后请检查开关。', ok: '确定' },
  en: { loading: 'Loading editor…', error: 'Operation failed. Changes have not been saved. Please retry.', invalid: 'Unsupported PPTX or file exceeds safety limits', changed: 'The file changed outside the editor. Changes have not been saved. Save a copy or reopen the file.', empty: 'Select a PPTX file from the file manager.', cancelled: 'Save cancelled.', preferences: 'The AutoSave preference could not be remembered. Check the switch after reopening.', ok: 'OK' },
}
const AUTO_SAVE_KEY = 'ai-slides-auto-save'

function memoryStorage(onAutoSaveChange = () => {}) {
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
      if (key === AUTO_SAVE_KEY) {
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
  container.className = 'slides-shell'
  const links = []
  for (const file of ['slides/slides.css', 'slides-overrides.css']) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL(`./${file}`, import.meta.url).href
    document.head.append(link)
    links.push(link)
  }
  const status = document.createElement('p')
  status.className = 'slides-status'
  status.setAttribute('role', 'status')
  status.textContent = copy.loading
  const root = document.createElement('div')
  root.id = 'root'
  root.className = 'slides-editor-root'
  container.append(root, status)
  const show = (text, alert = false) => {
    status.textContent = text
    status.setAttribute('role', alert ? 'alert' : 'status')
    status.hidden = !text
  }
  status.addEventListener('click', () => { status.hidden = true }, { signal: context.signal })
  installOfficeToolbarNavigation(root, context.signal)
  let dialogs = []
  context.signal.addEventListener('abort', () => {
    for (const link of links) link.remove()
    for (const finish of [...dialogs]) finish()
  }, { once: true })
  const describe = error => /^OFFICE_(?:INVALID|UNSUPPORTED)_PPTX$/.test(error?.message) ? copy.invalid : /RESOURCE_CHANGED|RESOURCE_UNAVAILABLE/.test(error?.message) ? copy.changed : copy.error
  // "Locate source" on a quote card: requests wait until the editor is up, and fail when only the read-only preview runs.
  const reveal = registerReveal(context, createQuoteReveal())
  if (!context.resource) {
    reveal.ready(false)
    show(copy.empty)
    return
  }
  try {
    const resource = context.resource.size === undefined
      ? { ...context.resource, size: (await context.resources.readBytes(context.resource, { offset: 0, length: 1 })).size }
      : context.resource
    // A deck without any slide would leave the editor on "Opening…" for good.
    const bytes = withFirstSlide(await readPptx(context.resources, resource, context.signal))
    context.signal.throwIfAborted()
    // The sandbox has an opaque origin: keep editor preferences in bounded memory instead of weakening the iframe.
    const viewState = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? { ...context.state } : {}
    let preferenceSave = Promise.resolve()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage((on) => {
      viewState.autoSave = on
      const nextState = { ...viewState }
      preferenceSave = preferenceSave.then(() => {
        context.signal.throwIfAborted()
        return context.setState(nextState)
      }).catch(() => {
        if (!context.signal.aborted)
          show(copy.preferences, true)
      })
    }) })
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: memoryStorage() })
    // Editor-only identity, never a local path; the host resolves the authorized file.
    globalThis.__lexoraSlidesHost = {
      path: `document/${resource.id}/${resource.name}`,
      bytes,
      language: context.environment.language,
      theme: context.environment.colorScheme === 'dark' ? 'dark' : 'light',
      autoSave: viewState.autoSave !== false,
      // The host checks the file version, directory grant and content hash before writing; a conflict rejects here.
      async save(data) {
        context.signal.throwIfAborted()
        try {
          const saved = await context.resources.saveFile({ name: resource.name, data: validatePptx(data), resource: context.resource })
          if (!saved)
            throw new Error('OFFICE_SAVE_CANCELLED')
        }
        catch (error) {
          throw new Error(error?.message === 'OFFICE_SAVE_CANCELLED' ? copy.cancelled : describe(error))
        }
      },
      // Save As leaves the open document untouched and exports a copy through the system dialog.
      async exportCopy(name, data) {
        context.signal.throwIfAborted()
        try {
          return !!(await context.resources.saveFile({ name: /\.pptx$/i.test(name) ? name : resource.name, data: validatePptx(data) }))
        }
        catch (error) {
          throw new Error(describe(error))
        }
      },
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
      notify: show,
    }
    const editor = await import('./slides/slides.js')
    await editor.ready
    context.signal.throwIfAborted()
    installSelectionMenu(context)
    reveal.ready(true)
    const appearance = context.onEnvironmentChange((environment) => {
      copy = messages[environment.language.startsWith('zh') ? 'zh' : 'en']
      globalThis.__lexoraSlides?.setLanguage(environment.language)
      globalThis.__lexoraSlides?.setTheme(environment.colorScheme === 'dark' ? 'dark' : 'light')
    })
    context.signal.addEventListener('abort', () => appearance.dispose(), { once: true })
    show('')
  }
  catch (error) {
    reveal.ready(false)
    if (context.signal.aborted)
      return
    // Fall back to the read-only preview when the editor cannot start.
    try {
      for (const link of links) link.remove()
      root.remove()
      status.remove()
      const preview = await import('./preview.js')
      await preview.render(context, container)
    }
    catch {
      show(describe(error), true)
    }
  }
}
