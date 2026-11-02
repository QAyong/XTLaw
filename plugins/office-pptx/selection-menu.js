// Adds one "Quote to chat" entry to the Slides editor's own context menu. The quote is the text
// of the selected text-box range, or of the selected elements on the current slide (a picture or chart
// contributes a one-line description instead of text).
import { fitMenu, reshapeMenu } from './menu-shape.js'

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

export function nodeText(node) {
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

const collapse = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const percent = value => `${Math.round(value * 100)}%`

// A picture or chart has no text, but the model still has to know it was quoted and where it sits: the slide number, name and
// alt text are what an Office tool such as officecli prints for the same element. Fixed English so the same element always
// yields the same text (the quote is located again by comparing it). Position is only meaningful for a top-level element.
function describeMedia(node, slide, top) {
  const kind = node.type === 'picture' ? (node.media === 'video' || node.media === 'audio' ? node.media : 'picture') : node.type === 'chart' ? 'chart' : null
  if (!kind)
    return ''
  const name = collapse(node.name, 120)
  const parts = [`Slide ${slide.number} ${kind}${name ? ` ${JSON.stringify(name)}` : ''}`]
  const alt = collapse(node.descr, 200)
  if (alt)
    parts.push(`alt text: ${JSON.stringify(alt)}`)
  const box = node.box
  if (top && box && slide.widthPx > 0 && slide.heightPx > 0 && [box.x, box.y, box.cx, box.cy].every(Number.isFinite)) {
    parts.push(`at ${percent(box.x / slide.widthPx)},${percent(box.y / slide.heightPx)} of the slide`)
    parts.push(`size ${percent(box.cx / slide.widthPx)}x${percent(box.cy / slide.heightPx)}`)
  }
  parts.push(`the ${kind === 'picture' ? 'image' : kind} itself is not included`)
  return `[${parts.join(', ')}]`
}

// What a quote says about an element: its text, or a one-line description when it is a picture or chart. `slide` is
// { number (1-based), widthPx, heightPx }; `top` is false for an element inside a group, whose box is not in slide space.
export function nodeQuote(node, slide, top = true) {
  if (node.type === 'group')
    return (node.children ?? []).map(child => nodeQuote(child, slide, false)).filter(Boolean).join('\n')
  return nodeText(node) || describeMedia(node, slide, top)
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
  let clickY = Number.NaN
  let moreEntry = null
  const copy = () => context.environment.language.startsWith('zh')
    ? { quote: '引用到聊天', more: '更多操作', loading: '正在读取目标聊天…', adding: '正在加入引用…', unavailable: '对话或文档已变化，请重新选中内容。', noTarget: '请先打开聊天输入框', limit: '引用内容过多，请减少选中内容或已有引用。', failed: '无法加入引用，请重新选择后重试。' }
    : { quote: 'Quote to chat', more: 'More actions', loading: 'Loading chat targets…', adding: 'Adding quote…', unavailable: 'The chat or document changed. Select the content again.', noTarget: 'Open a chat input first', limit: 'Quote limit reached. Select less content or remove existing quotes.', failed: 'Could not add the quote. Select the content and retry.' }
  function reset() {
    sequence++
    candidate = null
    nativeMenu = null
    entry?.remove()
    entry = null
    moreEntry?.remove()
    moreEntry = null
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
      const { nodes = [], widthPx, heightPx } = slides[state.slide] ?? {}
      const slide = { number: state.slide + 1, widthPx, heightPx }
      text = state.elements.map(id => findNode(nodes, id)).filter(Boolean).map(node => nodeQuote(node, slide, nodes.includes(node))).filter(Boolean).join('\n').trim()
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
  // The plain commands moved out of the menu: one row with a submenu whose lines click the hidden original items.
  function addMoreActions(menu, lines) {
    const wrapper = document.createElement('div')
    wrapper.className = 'ctx-sub-host office-more-entry'
    const row = button(copy().more)
    const arrow = document.createElement('span')
    arrow.className = 'ctx-hint'
    arrow.textContent = '▸'
    row.append(arrow)
    row.setAttribute('aria-haspopup', 'menu')
    row.setAttribute('aria-expanded', 'false')
    const submenu = document.createElement('div')
    submenu.className = 'ctx-menu office-quote-submenu office-more-submenu'
    submenu.setAttribute('role', 'menu')
    submenu.setAttribute('aria-label', copy().more)
    submenu.hidden = true
    for (const line of lines) {
      const item = button(line.label)
      item.disabled = line.disabled
      item.addEventListener('click', () => line.pick())
      submenu.append(item)
    }
    wrapper.append(row, submenu)
    const show = () => {
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
        submenu.querySelector('button:not(:disabled)')?.focus()
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
        const buttons = [...submenu.querySelectorAll('button:not(:disabled)')]
        const index = buttons.indexOf(document.activeElement)
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }
    })
    // Like the editor's own items, these handlers only concern the added row.
    wrapper.addEventListener('mousedown', event => event.preventDefault())
    // Before the last separator, so it sits with the editing commands and Delete stays last.
    const separators = [...menu.children].filter(child => child.classList.contains('ctx-sep') && child.style.display !== 'none')
    menu.insertBefore(wrapper, separators.at(-1) ?? null)
    moreEntry = wrapper
  }
  // The editor's own submenus (Group, Bring to Front…) sit inside the menu, which clips them once it scrolls: lift them out.
  function liftSubmenus(menu) {
    if (!menu.classList.contains('office-menu-scroll'))
      return
    for (const submenu of menu.querySelectorAll('.ctx-submenu:not(.office-quote-submenu)')) {
      const host = submenu.closest('.ctx-sub-host')?.firstElementChild
      if (!host || submenu.dataset.lifted)
        continue
      submenu.dataset.lifted = '1'
      Object.assign(submenu.style, { position: 'fixed', margin: '0', right: 'auto', maxHeight: `${window.innerHeight - 16}px`, overflowY: 'auto', zIndex: '210' })
      positionSubmenu(submenu, host)
    }
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
    const more = reshapeMenu(menu)
    if (more?.length)
      addMoreActions(menu, more)
    fitMenu(menu, clickY)
    // A wheel turn anywhere closes the editor's menu; inside it, the turn is for scrolling the menu.
    menu.addEventListener('wheel', event => event.stopPropagation(), { signal: context.signal })
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
    fitMenu(menu, clickY)
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
    clickY = event.clientY
  }, { capture: true, signal: context.signal })
  const observer = new MutationObserver(() => {
    if (nativeMenu && !nativeMenu.isConnected) {
      reset()
      return
    }
    if (nativeMenu) {
      liftSubmenus(nativeMenu)
      return
    }
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
