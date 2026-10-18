// Adds one "Quote to chat" entry to the Slides editor's own context menu. The quote is the text
// of the selected text-box range, or of the selected elements on the current slide.
const MAX_QUOTE_CHARS = 20000

function layoutText(layout) {
  let out = ''
  for (const line of layout?.lines ?? []) {
    const text = (line.runs ?? []).map(run => run.text ?? '').join('')
    if (out && line.paraStart !== false)
      out += '\n'
    else if (out)
      out += line.trailingText ?? (line.trailingSpace ? ' ' : '')
    out += text
  }
  return out
}

function nodeText(node) {
  if (node.type === 'group')
    return (node.children ?? []).map(nodeText).filter(Boolean).join('\n')
  if (node.type === 'table') {
    const rows = new Map()
    for (const cell of node.cells ?? []) {
      const text = layoutText(cell.text)
      if (!text)
        continue
      rows.set(cell.row, [...(rows.get(cell.row) ?? []), { col: cell.col, text }])
    }
    return [...rows.entries()].sort(([a], [b]) => a - b).map(([, cells]) => cells.sort((a, b) => a.col - b.col).map(cell => cell.text).join('\t')).join('\n')
  }
  return layoutText(node.text)
}

function findNode(nodes, id) {
  for (const node of nodes) {
    if (node.durableId === id || node.sourceId === id || node.id === id)
      return node
    if (node.type === 'group') {
      const inner = findNode(node.children ?? [], id)
      if (inner)
        return inner
    }
  }
  return null
}

export function installSelectionMenu(context) {
  let candidate = null
  let nativeMenu = null
  let entry = null
  let sequence = 0
  let stageClick = false
  const copy = () => context.environment.language.startsWith('zh')
    ? { quote: '引用到聊天', loading: '正在读取目标聊天…', adding: '正在加入引用…', unavailable: '对话或文档已变化，请重新选中内容。', noTarget: '请先打开聊天输入框', limit: '引用内容过多，请减少选中内容或已有引用。', failed: '无法加入引用，请重新选择后重试。' }
    : { quote: 'Quote to chat', loading: 'Loading chat targets…', adding: 'Adding quote…', unavailable: 'The chat or document changed. Select the content again.', noTarget: 'Open a chat input first', limit: 'Quote limit reached. Select less content or remove existing quotes.', failed: 'Could not add the quote. Select the content and retry.' }
  function reset() {
    sequence++
    candidate = null
    nativeMenu = null
    entry?.remove()
    entry = null
  }
  const selectionState = () => {
    const reply = window.__genofficeControl?.({ cmd: 'selection' })
    return reply?.status === 'ok' ? reply.result : null
  }
  const editorText = () => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1)
      return ''
    const anchor = selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement
    return anchor?.closest?.('.slide-text-editor') ? selection.toString().trim() : ''
  }
  async function readSelection() {
    const state = selectionState()
    if (!context.resource || !state || !Number.isInteger(state.slide))
      return null
    let text = editorText()
    if (!text && state.elements?.length) {
      const slides = await window.slidesApi.getRenderSlides()
      const nodes = slides[state.slide]?.nodes ?? []
      text = state.elements.map(id => findNode(nodes, id)).filter(Boolean).map(nodeText).filter(Boolean).join('\n').trim()
    }
    if (!text)
      return null
    return { text, slide: state.slide, elements: state.elements ?? [], viaEditor: !!editorText(), tooLong: text.length > MAX_QUOTE_CHARS, capture: null }
  }
  function current(snapshot) {
    if (candidate !== snapshot || context.signal.aborted || !nativeMenu?.isConnected)
      return false
    const state = selectionState()
    return !!state && state.slide === snapshot.slide && JSON.stringify(state.elements ?? []) === JSON.stringify(snapshot.elements)
      && (!snapshot.viaEditor || editorText() === snapshot.text)
  }
  function button(text) {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'ctx-item'
    element.setAttribute('role', 'menuitem')
    const label = document.createElement('span')
    label.textContent = text
    element.append(label)
    return element
  }
  function errorText(error) {
    return /RESOURCE_CHANGED|REFERENCE_UNAVAILABLE|VIEW_/.test(error?.message) ? copy().unavailable : copy().failed
  }
  async function add(snapshot, capture, targetId, row) {
    if (!current(snapshot)) {
      row.disabled = true
      row.title = copy().unavailable
      return
    }
    const request = sequence
    const menu = nativeMenu
    row.disabled = true
    row.title = copy().adding
    try {
      await context.composer.addQuote(capture.id, targetId)
      if (context.signal.aborted)
        return
      // Ask the editor's menu to close itself, preserving React ownership.
      if (sequence === request && menu?.isConnected)
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }
    catch (error) {
      if (!context.signal.aborted)
        row.title = errorText(error)
    }
  }
  function positionSubmenu(submenu, row) {
    const anchor = row.getBoundingClientRect()
    const bounds = submenu.getBoundingClientRect()
    const left = anchor.right + bounds.width <= window.innerWidth - 8 ? anchor.right - 4 : anchor.left - bounds.width + 4
    submenu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8))}px`
    submenu.style.top = `${Math.max(8, Math.min(anchor.top - 5, window.innerHeight - bounds.height - 8))}px`
  }
  // The editor's "hide from AI" entries have no meaning without the assistant.
  function removeAiItems(menu) {
    const labels = window.__lexoraSlides?.aiMenuLabels?.() ?? []
    for (const item of menu.querySelectorAll('.ctx-item')) {
      if (labels.includes(item.textContent.trim()))
        item.remove()
    }
  }
  async function attach(menu) {
    removeAiItems(menu)
    if (context.signal.aborted || !stageClick)
      return
    const request = ++sequence
    nativeMenu = menu
    const snapshot = await readSelection()
    // The menu may have closed or been replaced while the render tree was read.
    if (sequence !== request || !menu.isConnected || !snapshot)
      return
    candidate = snapshot
    const wrapper = document.createElement('div')
    wrapper.className = 'ctx-sub-host office-quote-entry'
    const separator = document.createElement('div')
    separator.className = 'ctx-sep'
    separator.setAttribute('role', 'separator')
    const row = button(copy().quote)
    row.disabled = true
    row.title = snapshot.tooLong ? copy().limit : copy().loading
    wrapper.append(separator, row)
    // These handlers affect only the added item, not the editor's original menu.
    wrapper.addEventListener('mousedown', event => event.preventDefault())
    entry = wrapper
    menu.append(wrapper)
    const bounds = menu.getBoundingClientRect()
    if (bounds.bottom > window.innerHeight - 8)
      menu.style.top = `${Math.max(8, window.innerHeight - bounds.height - 8)}px`
    if (snapshot.tooLong)
      return
    try {
      const { text, slide } = snapshot
      snapshot.capture ??= context.composer.captureQuote(context.resource, { text, indexes: [slide], from: 0, to: text.length })
      const capture = await snapshot.capture
      if (sequence !== request || entry !== wrapper || !wrapper.isConnected)
        return
      if (!current(snapshot)) {
        row.title = copy().unavailable
        return
      }
      if (!capture.targets.length) {
        row.title = copy().noTarget
        return
      }
      row.disabled = false
      row.removeAttribute('title')
      if (capture.targets.length === 1) {
        row.addEventListener('click', () => void add(snapshot, capture, capture.targets[0].id, row))
        return
      }
      // Keep one top-level command. Multiple visible chat inputs live below it.
      const arrow = document.createElement('span')
      arrow.className = 'ctx-hint'
      arrow.textContent = '▸'
      row.append(arrow)
      row.setAttribute('aria-haspopup', 'menu')
      row.setAttribute('aria-expanded', 'false')
      const submenu = document.createElement('div')
      // Not .ctx-submenu: the editor's rule for it positions absolutely against its own menu.
      submenu.className = 'ctx-menu office-quote-submenu'
      submenu.setAttribute('role', 'menu')
      submenu.setAttribute('aria-label', copy().quote)
      submenu.hidden = true
      const preferred = capture.targets.find(target => target.id === capture.defaultId)
      const targets = [...(preferred ? [preferred] : []), ...capture.targets.filter(target => target !== preferred)]
      for (const target of targets) {
        const item = button(target.label)
        item.title = target.label
        item.addEventListener('click', () => {
          submenu.hidden = true
          row.setAttribute('aria-expanded', 'false')
          void add(snapshot, capture, target.id, row)
        })
        submenu.append(item)
      }
      wrapper.append(submenu)
      const show = () => {
        if (row.disabled)
          return
        submenu.hidden = false
        row.setAttribute('aria-expanded', 'true')
        positionSubmenu(submenu, row)
      }
      const hide = () => {
        submenu.hidden = true
        row.setAttribute('aria-expanded', 'false')
      }
      row.addEventListener('click', show)
      wrapper.addEventListener('mouseenter', show)
      wrapper.addEventListener('mouseleave', () => {
        if (!wrapper.contains(document.activeElement))
          hide()
      })
      wrapper.addEventListener('focusout', () => queueMicrotask(() => {
        if (!wrapper.contains(document.activeElement))
          hide()
      }))
      row.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          show()
          submenu.querySelector('button')?.focus()
        }
      })
      submenu.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          hide()
          row.focus()
        }
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const buttons = [...submenu.querySelectorAll('button')]
          const index = buttons.indexOf(document.activeElement)
          buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus()
        }
      })
      if (wrapper.matches(':hover'))
        show()
    }
    catch (error) {
      if (sequence === request && entry === wrapper)
        row.title = errorText(error)
    }
  }
  // Only menus opened from the slide stage can carry a quote (not thumbnails or ribbon popups).
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.('.ctx-menu'))
      return
    reset()
    stageClick = !!event.target.closest?.('.stage-zoom-box, .slide-text-editor')
  }, { capture: true, signal: context.signal })
  const observer = new MutationObserver(() => {
    if (nativeMenu && !nativeMenu.isConnected) {
      reset()
      return
    }
    if (nativeMenu)
      return
    const menu = [...document.querySelectorAll('.ctx-menu')].find(element => !element.classList.contains('ctx-submenu') && !element.classList.contains('office-quote-submenu'))
    if (menu)
      void attach(menu)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', reset, { signal: context.signal })
  window.addEventListener('blur', reset, { signal: context.signal })
  const appearance = context.onEnvironmentChange(reset)
  context.signal.addEventListener('abort', () => {
    observer.disconnect()
    appearance.dispose()
    reset()
  }, { once: true })
}
