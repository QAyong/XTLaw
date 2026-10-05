// Adapted from XTLaw's office-selection-actions.js: freeze the editor selection
// before a menu takes focus. Extend GenOffice's menu without handling its items.
export function installSelectionMenu(context) {
  let candidate = null
  let nativeMenu = null
  let entry = null
  let sequence = 0
  const copy = () => context.environment.language.startsWith('zh')
    ? { quote: '引用到聊天', loading: '正在读取目标聊天…', adding: '正在加入引用…', unavailable: '对话或文档已变化，请重新选中文字。', noTarget: '请先打开聊天输入框', limit: '引用内容过多，请减少选中文字或已有引用。', failed: '无法加入引用，请重新选择后重试。' }
    : { quote: 'Quote to chat', loading: 'Loading chat targets…', adding: 'Adding quote…', unavailable: 'The chat or document changed. Select the text again.', noTarget: 'Open a chat input first', limit: 'Quote limit reached. Select less text or remove existing quotes.', failed: 'Could not add the quote. Select the text and retry.' }
  function reset() {
    sequence++
    candidate = null
    nativeMenu = null
    entry?.remove()
    entry = null
  }
  function readSelection(event) {
    if (!context.resource)
      return null
    const editor = window.__aidocs?.editor
    const root = editor?.view?.dom
    const selection = window.getSelection()
    if (!root || !root.contains(event.target) || !selection || selection.isCollapsed || selection.rangeCount !== 1)
      return null
    const range = selection.getRangeAt(0)
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer))
      return null
    let from, to
    try {
      from = editor.view.posAtDOM(range.startContainer, range.startOffset, 1)
      to = editor.view.posAtDOM(range.endContainer, range.endOffset, -1)
    }
    catch { return null }
    if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from)
      return null
    const doc = editor.state.doc
    const text = doc.textBetween(from, to, '\n').trim()
    if (!text)
      return null
    const indexes = []
    let start = 1
    for (let index = 0; index < doc.childCount; index++) {
      const node = doc.child(index)
      const end = start + node.nodeSize
      if (from < end && to > start && Number.isInteger(node.attrs?.docxIndex) && node.attrs.docxIndex >= 0 && indexes.length < 64)
        indexes.push(node.attrs.docxIndex)
      start = end
    }
    return { text, indexes, from, to, doc, range: range.cloneRange(), tooLong: text.length > 20000, capture: null }
  }
  function current(snapshot) {
    return candidate === snapshot && !context.signal.aborted && snapshot.doc === window.__aidocs?.editor?.state?.doc
      && snapshot.range.startContainer.isConnected && snapshot.range.endContainer.isConnected
  }
  function button(text) {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'ctx-item'
    element.setAttribute('role', 'menuitem')
    const label = document.createElement('span')
    label.className = 'ctx-label'
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
      // Ask the inherited component to close itself, preserving React ownership.
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
  async function attach() {
    const snapshot = candidate
    if (!snapshot || context.signal.aborted)
      return
    if (nativeMenu && !nativeMenu.isConnected) {
      reset()
      return
    }
    if (entry?.isConnected)
      return
    const menu = document.querySelector('.ctx-menu')
    if (!menu)
      return
    const selection = window.__aidocs?.editor?.state?.selection
    // The original handler can move the caret when right-clicking elsewhere.
    if (!current(snapshot) || selection?.from !== snapshot.from || selection?.to !== snapshot.to) {
      reset()
      return
    }
    const request = sequence
    nativeMenu = menu
    const wrapper = document.createElement('div')
    wrapper.className = 'ctx-item-wrap office-quote-entry'
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
      const { text, indexes, from, to } = snapshot
      snapshot.capture ??= context.composer.captureQuote(context.resource, { text, indexes, from, to })
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
      arrow.className = 'ctx-arrow'
      arrow.textContent = '›'
      row.append(arrow)
      row.setAttribute('aria-haspopup', 'menu')
      row.setAttribute('aria-expanded', 'false')
      const submenu = document.createElement('div')
      submenu.className = 'ctx-submenu office-quote-submenu'
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
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.('.ctx-menu'))
      return
    reset()
    candidate = readSelection(event)
    // Observe the original handler; do not cancel or stop the contextmenu event.
    requestAnimationFrame(() => void attach())
  }, { capture: true, signal: context.signal })
  const observer = new MutationObserver(() => void attach())
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
