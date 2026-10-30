import { addQuote, captureQuote, QUOTE_TEXT_LIMIT } from './document-kit/quote.js'

// "Quote to chat" in the editor's own selection bar (the highlight, underline and strikeout buttons that appear over selected
// text), in the place the editor gave to its "Ask AI" button. The editor has no right-click menu for text to extend (unlike
// the DOCX, PPTX and XLSX editors); vite.config.mjs leaves an empty `.lexora-quote-slot` in the bar and this fills it.
const ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 12.5h5"/></svg>'

export function installSelectionQuote(context, root) {
  const copy = () => context.environment.language.startsWith('zh')
    ? { quote: '引用', title: '引用到聊天', unavailable: '对话或文档已变化，请重新选中文字。', noTarget: '请先打开一个聊天输入框。', failed: '无法加入引用，请重试。', tooLong: '选中的文字过长，请缩小范围。' }
    : { quote: 'Quote', title: 'Quote to chat', unavailable: 'The chat or document changed. Select the text again.', noTarget: 'Open a chat input first.', failed: 'Could not add the quote. Try again.', tooLong: 'The selection is too long. Select less text.' }
  const menu = document.createElement('div')
  // The editor's own menu (its page context menu), so the target list looks like the rest of the editor.
  menu.className = 'thumb-menu pdf-quote-menu'
  menu.setAttribute('role', 'menu')
  menu.hidden = true
  // Choosing a target must not clear the selection the quote was taken from.
  menu.addEventListener('mousedown', event => event.preventDefault())
  document.body.append(menu)
  let sequence = 0

  function hideMenu() {
    menu.hidden = true
    menu.replaceChildren()
  }
  function read() {
    const selection = window.getSelection()
    if (!context.resource || !selection || selection.isCollapsed || selection.rangeCount !== 1)
      return null
    const range = selection.getRangeAt(0)
    const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement
    const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement
    const layer = start?.closest('.textLayer')
    // A paragraph selected with a triple click ends in the next element of the page, not in the text layer.
    if (!layer || !root.contains(layer) || !end || !root.contains(end))
      return null
    const page = layer.closest('.pdf-page')?.getAttribute('data-page')
    const text = selection.toString().replace(/\s+\n/g, '\n').trim()
    if (!text || page === null || page === undefined || !Number.isInteger(Number(page)))
      return null
    return { text, page: Number(page) + 1 }
  }
  // Whether a quote was added, repeated or refused is shown by Lexora itself, like for the other Office plugins; the plugin
  // only explains on the button why it could not start one.
  function hint(button, text) {
    button.title = text
  }
  async function add(capture, targetId, row, button) {
    row.disabled = true
    try {
      await addQuote(context, capture, targetId)
      if (context.signal.aborted)
        return
      hideMenu()
    }
    catch (error) {
      if (!context.signal.aborted)
        hint(button, errorText(error))
      row.disabled = false
    }
  }
  function errorText(error) {
    return /RESOURCE_CHANGED|REFERENCE_UNAVAILABLE|VIEW_/.test(error?.message) ? copy().unavailable : copy().failed
  }
  async function open(button) {
    hideMenu()
    const selected = read()
    if (!selected) {
      hint(button, copy().unavailable)
      return
    }
    if (selected.text.length > QUOTE_TEXT_LIMIT) {
      hint(button, copy().tooLong)
      return
    }
    const request = ++sequence
    button.disabled = true
    try {
      const capture = await captureQuote(context, { text: selected.text, kind: 'pdf-page', location: { page: selected.page } })
      if (request !== sequence || context.signal.aborted)
        return
      if (!capture.targets.length) {
        hint(button, copy().noTarget)
        return
      }
      button.title = copy().title
      if (capture.targets.length === 1) {
        await add(capture, capture.defaultId ?? capture.targets[0].id, button, button)
        return
      }
      // One top-level command; several visible chat inputs are listed below it.
      menu.replaceChildren(...capture.targets.map((target) => {
        const row = document.createElement('button')
        row.type = 'button'
        row.setAttribute('role', 'menuitem')
        row.textContent = target.label
        row.title = target.label
        row.addEventListener('click', () => void add(capture, target.id, row, button))
        return row
      }))
      const anchor = button.getBoundingClientRect()
      menu.hidden = false
      const bounds = menu.getBoundingClientRect()
      menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8))}px`
      menu.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - bounds.height - 8))}px`
      menu.querySelector('button')?.focus({ preventScroll: true })
    }
    catch (error) {
      if (!context.signal.aborted)
        hint(button, errorText(error))
    }
    finally {
      button.disabled = false
    }
  }
  function fill() {
    for (const slot of root.querySelectorAll('.lexora-quote-slot:empty')) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'pdf-sel-quote'
      button.title = copy().title
      button.setAttribute('aria-label', copy().title)
      button.setAttribute('aria-haspopup', 'menu')
      button.innerHTML = ICON
      const label = document.createElement('span')
      label.textContent = copy().quote
      button.append(label)
      button.addEventListener('click', () => void open(button))
      slot.append(button)
    }
  }
  const observer = new MutationObserver(fill)
  observer.observe(root, { childList: true, subtree: true })
  fill()
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault()
      hideMenu()
    }
  }, { signal: context.signal })
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !menu.contains(event.target))
      hideMenu()
  }, { capture: true, signal: context.signal })
  root.addEventListener('scroll', hideMenu, { capture: true, signal: context.signal })
  window.addEventListener('resize', hideMenu, { signal: context.signal })
  context.signal.addEventListener('abort', () => {
    observer.disconnect()
    menu.remove()
  }, { once: true })
}
