import { installAutoSaveToggle } from './auto-save-toggle.js'
import { readWholeFile } from './document-kit/read-file.js'
import { installOfficeToolbarNavigation } from './office-toolbar-navigation.js'
import { installSelectionQuote } from './selection-quote.js'

const MAX_PDF_BYTES = 64 * 1024 * 1024

const messages = {
  zh: {
    loading: '正在加载 PDF 编辑器…',
    open: '选择 PDF',
    hint: '从文件管理器打开 PDF，或选择一个文件。',
    invalid: '文件不是受支持的 PDF，或超出安全限制',
    changed: '文件已被其他程序修改，请重新打开。',
    error: '操作失败，修改尚未保存。请重试。',
    readonly: '该文件以只读方式打开，修改请使用“另存为”（Ctrl+Shift+S）。',
    unsupported: 'PDF 编辑器无法在当前环境启动。',
    autoSave: '自动保存',
    autoSaveTip: '每 30 秒及窗口失去焦点时自动保存修改',
    preferences: '自动保存的选择未能保存。',
  },
  en: {
    loading: 'Loading PDF editor…',
    open: 'Choose PDF',
    hint: 'Open a PDF from the file manager, or choose a file.',
    invalid: 'Unsupported PDF, or the file exceeds safety limits',
    changed: 'The file was changed by another program. Reopen it.',
    error: 'Operation failed. Changes have not been saved. Please retry.',
    readonly: 'This file is open read-only. Use Save As (Ctrl+Shift+S) to keep your changes.',
    unsupported: 'The PDF editor cannot start in this environment.',
    autoSave: 'AutoSave',
    autoSaveTip: 'Saves changes every 30 seconds and when the window loses focus',
    preferences: 'The AutoSave choice could not be saved.',
  },
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

function isPdf(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 1024)))
  return head.includes('%PDF-')
}

export async function render(context, container) {
  const language = () => context.environment.language.startsWith('zh') ? 'zh' : 'en'
  const copy = () => messages[language()]
  container.className = 'pdf-shell'
  const links = []
  for (const file of ['editor/editor.css', 'pdf-overrides.css']) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL(`./${file}`, import.meta.url).href
    document.head.append(link)
    links.push(link)
  }
  const status = document.createElement('p')
  status.className = 'pdf-status'
  status.setAttribute('role', 'status')
  const say = (text, alert = false) => {
    status.textContent = text
    if (alert)
      status.setAttribute('role', 'alert')
    else status.setAttribute('role', 'status')
    status.hidden = !text
  }
  say(copy().loading)
  const root = document.createElement('div')
  root.className = 'pdf-editor-root'
  container.append(root, status)
  installOfficeToolbarNavigation(root, context.signal, { tabPressExpands: true })
  status.addEventListener('click', () => {
    status.hidden = true
  }, { signal: context.signal })
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: memoryStorage() })

  // AutoSave is on unless the user turned it off in this file's view; the choice is kept with the view state, like the other Office plugins.
  const viewState = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? { ...context.state } : {}
  window.__lexoraPdfAutoSave = viewState.autoSave !== false
  let preferenceSave = Promise.resolve()
  let editor = null
  let hideTimer = 0
  const describe = error => /UNSUPPORTED|INVALID/.test(error?.message) ? copy().invalid : /RESOURCE_CHANGED|RESOURCE_UNAVAILABLE/.test(error?.message) ? copy().changed : copy().error
  const note = (text) => {
    say(text)
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      status.hidden = true
    }, 4000)
  }
  const environment = context.onEnvironmentChange(() => editor?.setTheme(context.environment.colorScheme))
  context.signal.addEventListener('abort', () => {
    clearTimeout(hideTimer)
    environment.dispose()
    editor?.dispose()
    for (const link of links) link.remove()
  }, { once: true })

  async function size(resource) {
    if (resource.size !== undefined)
      return resource
    const metadata = await context.resources.readBytes(resource, { offset: 0, length: 1 })
    return { ...resource, size: metadata.size }
  }
  async function read(resource) {
    const sized = await size(resource)
    const bytes = await readWholeFile(context.resources, sized, context.signal, {
      extensions: ['pdf'],
      minBytes: 8,
      maxBytes: MAX_PDF_BYTES,
      errors: { unsupported: 'OFFICE_UNSUPPORTED_PDF', changed: 'OFFICE_RESOURCE_CHANGED' },
    })
    if (!isPdf(bytes))
      throw new Error('OFFICE_INVALID_PDF')
    return bytes
  }
  async function pickPdfs(multiple) {
    const files = await context.resources.pickFiles({ filters: [{ name: 'PDF', extensions: ['pdf'] }], multiple })
    const result = []
    for (const file of files)
      result.push(await read(file))
    return result
  }
  async function mount(resource, writable) {
    const bytes = await read(resource)
    const base = new URL('./editor/', import.meta.url)
    const { mountPdf } = await import('./editor/editor.js')
    context.signal.throwIfAborted()
    editor = await mountPdf({
      container: root,
      base,
      name: resource.name,
      bytes,
      language: language(),
      theme: context.environment.colorScheme,
      signal: context.signal,
      createWorker: () => context.workers.create(new URL('./editor/pdf-worker.js', import.meta.url), { type: 'module' }),
      onDirty: () => {},
      onSave: writable
        ? async (data) => {
          const saved = await context.resources.saveFile({ name: resource.name, data, resource })
          if (!saved)
            throw new Error('OFFICE_SAVE_REFUSED')
        }
        : undefined,
      onExport: (name, data) => context.resources.saveFile({ name, data }),
      pickPdfs,
    })
    installSelectionQuote(context, root)
    if (writable) {
      installAutoSaveToggle(root, context.signal, {
        enabled: viewState.autoSave !== false,
        label: copy().autoSave,
        tip: copy().autoSaveTip,
        onChange: (on) => {
          viewState.autoSave = on
          const nextState = { ...viewState }
          preferenceSave = preferenceSave.then(() => {
            context.signal.throwIfAborted()
            return context.setState(nextState)
          }).catch(() => {
            if (!context.signal.aborted)
              note(copy().preferences)
          })
        },
      })
    }
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void editor.saveAs().catch(error => say(describe(error), true))
      }
    }, { signal: context.signal })
    if (writable)
      say('')
    else note(copy().readonly)
  }

  try {
    if (context.resource) {
      await mount(context.resource, true)
    }
    else {
      say('')
      const prompt = document.createElement('div')
      prompt.className = 'pdf-open'
      const hint = document.createElement('p')
      hint.textContent = copy().hint
      const choose = document.createElement('button')
      choose.type = 'button'
      choose.textContent = copy().open
      prompt.append(hint, choose)
      root.append(prompt)
      choose.addEventListener('click', async () => {
        choose.disabled = true
        try {
          const [file] = await context.resources.pickFiles({ filters: [{ name: 'PDF', extensions: ['pdf'] }], multiple: false })
          if (!file) {
            choose.disabled = false
            return
          }
          say(copy().loading)
          prompt.remove()
          await mount(file, false)
        }
        catch (error) {
          if (!context.signal.aborted) {
            say(describe(error), true)
            root.append(prompt)
            choose.disabled = false
          }
        }
      }, { signal: context.signal })
    }
  }
  catch (error) {
    if (context.signal.aborted)
      return
    say(/PDF_RUNTIME_MISSING|OFFICE_FEATURE_UNAVAILABLE/.test(error?.message) ? copy().unsupported : describe(error), true)
  }
}
