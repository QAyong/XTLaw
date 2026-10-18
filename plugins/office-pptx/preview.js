import { readPptx } from './pptx.js'

const messages = {
  zh: { loading: '正在加载预览…', open: '选择 PPTX', readOnly: '只读预览', error: '无法预览这份文件，请重试。', invalid: '文件不是受支持的 PPTX，或超出安全限制', changed: '文件在读取时被其他程序修改，请重新打开。', empty: '选择一个 PPTX 文件开始预览。', render: '预览渲染失败，文件可能包含不受支持的内容。' },
  en: { loading: 'Loading preview…', open: 'Choose PPTX', readOnly: 'Read-only preview', error: 'Cannot preview this file. Please retry.', invalid: 'Unsupported PPTX or file exceeds safety limits', changed: 'The file changed while reading. Please reopen it.', empty: 'Choose a PPTX file to preview.', render: 'Preview failed. The file may contain unsupported content.' },
}

export async function render(context, container) {
  let copy = messages[context.environment.language.startsWith('zh') ? 'zh' : 'en']
  container.className = 'pptx-shell'
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = new URL('./preview.css', import.meta.url).href
  document.head.append(link)

  const toolbar = document.createElement('div')
  toolbar.className = 'pptx-toolbar'
  const name = document.createElement('span')
  name.className = 'pptx-name'
  const mode = document.createElement('span')
  mode.textContent = copy.readOnly
  const choose = document.createElement('button')
  choose.type = 'button'
  choose.textContent = copy.open
  toolbar.append(name, mode, choose)
  const stage = document.createElement('div')
  stage.className = 'pptx-stage'
  const status = document.createElement('p')
  status.className = 'pptx-status'
  status.setAttribute('role', 'status')
  stage.append(status)
  container.append(toolbar, stage)

  const describe = error => /^OFFICE_(?:INVALID|UNSUPPORTED)_PPTX$/.test(error?.message) ? copy.invalid : /RESOURCE_CHANGED|RESOURCE_UNAVAILABLE/.test(error?.message) ? copy.changed : copy.error
  function show(text, alert = false) {
    status.textContent = text
    status.setAttribute('role', alert ? 'alert' : 'status')
    status.hidden = !text
  }

  let bytes = null
  let previewer = null
  let host = null
  let generation = 0
  let busy = false
  const { init } = await import('./vendor/pptx-preview.js')
  context.signal.throwIfAborted()

  function clear() {
    try { previewer?.destroy() }
    catch {}
    previewer = null
    host?.remove()
    host = null
  }
  async function draw() {
    if (!bytes)
      return
    const current = ++generation
    clear()
    const width = Math.max(320, Math.min(1280, stage.clientWidth - 32))
    host = document.createElement('div')
    stage.append(host)
    try {
      previewer = init(host, { width, height: Math.round(width * 9 / 16), mode: 'list' })
      await previewer.preview(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
      if (current === generation)
        show('')
    }
    catch {
      if (current === generation) {
        clear()
        show(copy.render, true)
      }
    }
  }
  async function load(resource) {
    if (busy)
      return
    busy = true
    show(copy.loading)
    try {
      let target = resource
      if (!target)
        [target] = await context.resources.pickFiles({ filters: [{ name: 'PowerPoint PPTX', extensions: ['pptx'] }], multiple: false })
      context.signal.throwIfAborted()
      if (!target) {
        show(bytes ? '' : copy.empty)
        return
      }
      if (target.size === undefined) {
        const metadata = await context.resources.readBytes(target, { offset: 0, length: 1 })
        target = { ...target, size: metadata.size }
      }
      const data = await readPptx(context.resources, target, context.signal)
      context.signal.throwIfAborted()
      bytes = data
      name.textContent = target.name
      await draw()
    }
    catch (error) {
      if (!context.signal.aborted)
        show(describe(error), true)
    }
    finally {
      busy = false
    }
  }

  choose.addEventListener('click', () => { void load(null) }, { signal: context.signal })
  let timer = 0
  let lastWidth = stage.clientWidth
  const observer = new ResizeObserver(() => {
    if (Math.abs(stage.clientWidth - lastWidth) < 24)
      return
    lastWidth = stage.clientWidth
    clearTimeout(timer)
    timer = setTimeout(() => { void draw() }, 200)
  })
  observer.observe(stage)
  const appearance = context.onEnvironmentChange((environment) => {
    copy = messages[environment.language.startsWith('zh') ? 'zh' : 'en']
    mode.textContent = copy.readOnly
    choose.textContent = copy.open
  })
  context.signal.addEventListener('abort', () => {
    clearTimeout(timer)
    observer.disconnect()
    appearance.dispose()
    generation++
    clear()
    link.remove()
  }, { once: true })

  if (context.resource)
    await load(context.resource)
  else
    show(copy.empty)
}
