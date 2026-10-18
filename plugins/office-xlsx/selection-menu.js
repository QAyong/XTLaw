// Adds one "Quote to chat" entry to the end of the Sheets editor's cell context menu. The quote is the displayed text of the
// selected cell range (one line per row, tab between cells); the host records the workbook, sheet and range it came from.
const MAX_QUOTE_CHARS = 20000

export function installSelectionMenu(context) {
  let candidate = null
  let nativeMenu = null
  let entry = null
  let sequence = 0
  let gridClick = false
  const copy = () => context.environment.language.startsWith('zh')
    ? { quote: '引用到聊天', loading: '正在读取目标聊天…', adding: '正在加入引用…', unavailable: '对话或文档已变化，请重新选中单元格。', noTarget: '请先打开聊天输入框', limit: '引用内容过多（最多 20000 个字符），请缩小选区或减少已有引用。', failed: '无法加入引用，请重新选择后重试。', multiple: '请只选中一个连续区域后再引用。', notLoaded: '选区超出已载入的范围（大表只能引用屏幕附近的单元格），请稍后重试或缩小选区。' }
    : { quote: 'Quote to chat', loading: 'Loading chat targets…', adding: 'Adding quote…', unavailable: 'The chat or document changed. Select the cells again.', noTarget: 'Open a chat input first', limit: 'Too much content (20,000 characters at most). Select a smaller range or remove existing quotes.', failed: 'Could not add the quote. Select the cells and retry.', multiple: 'Select a single continuous range to quote.', notLoaded: 'The selection is outside the loaded data (in a large sheet only cells near the screen can be quoted). Retry shortly or select a smaller range.' }
  // The submenu lives in the popup section (the scrolling box inside it would clip it), outside the entry.
  let submenuElement = null
  function reset() {
    sequence++
    candidate = null
    nativeMenu = null
    entry?.remove()
    entry = null
    submenuElement?.remove()
    submenuElement = null
  }
  const control = request => window.__genofficeControl?.(request)
  const selectionKey = () => {
    const reply = control({ cmd: 'selection' })
    return reply?.status === 'ok' && !reply.result.none ? `${reply.result.sheet}\n${reply.result.range}` : null
  }
  // A selection that cannot be quoted still gets the entry, disabled, when the reason is worth telling the user.
  function readSelection() {
    const reply = control({ cmd: 'lexora-selection-text', maxChars: MAX_QUOTE_CHARS })
    if (!context.resource || !reply)
      return null
    if (reply.status === 'error')
      return reply.error.reason === 'multiple_ranges' ? { blocked: 'multiple' } : reply.error.reason === 'not_loaded' ? { blocked: 'notLoaded' } : null
    if (reply.status !== 'ok')
      return null
    const { text, tooLong, sheet, sheetIndex, range } = reply.result
    if (!tooLong && !text?.trim())
      return null
    return { key: `${sheet}\n${range}`, text, sheet, sheetIndex, range, tooLong: !!tooLong, capture: null }
  }
  // A closed menu stays in the DOM until its exit animation ends: it is already marked as leaving.
  const live = menu => !!menu?.isConnected && !menu.className.includes('exit')
  function current(snapshot) {
    return candidate === snapshot && !context.signal.aborted && live(nativeMenu) && selectionKey() === snapshot.key
  }
  // The menu items are React-owned: clone an existing item so the entry has the editor's own look in both themes.
  function item(menu, text) {
    const template = menu.querySelector('div.univer-relative > button')?.parentElement
    const wrapper = template ? template.cloneNode(true) : document.createElement('div')
    const element = wrapper.querySelector('button') ?? wrapper.appendChild(document.createElement('button'))
    for (const icon of element.querySelectorAll('svg'))
      icon.remove()
    element.type = 'button'
    element.setAttribute('role', 'menuitem')
    let label = element.querySelector('span > span') ?? element.querySelector('span')
    if (!label)
      label = element.appendChild(document.createElement('span'))
    label.textContent = text
    return { wrapper, element }
  }
  function errorText(error) {
    return /RESOURCE_CHANGED|REFERENCE_UNAVAILABLE|VIEW_/.test(error?.message) ? copy().unavailable : copy().failed
  }
  function disable(row, title) {
    row.disabled = true
    row.style.opacity = '0.5'
    row.style.cursor = 'default'
    if (title)
      row.title = title
  }
  function enable(row) {
    row.disabled = false
    row.style.opacity = ''
    row.style.cursor = ''
    row.removeAttribute('title')
  }
  async function add(snapshot, capture, targetId, row) {
    if (!current(snapshot)) {
      disable(row, copy().unavailable)
      return
    }
    const request = sequence
    const menu = nativeMenu
    disable(row, copy().adding)
    try {
      await context.composer.addQuote(capture.id, targetId)
      if (context.signal.aborted)
        return
      // Ask the editor's menu to close itself, preserving React ownership.
      if (sequence === request && live(menu))
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }
    catch (error) {
      if (!context.signal.aborted)
        row.title = errorText(error)
    }
  }
  function positionSubmenu(submenu, menu, row) {
    const anchor = row.getBoundingClientRect()
    const owner = menu.getBoundingClientRect()
    const bounds = submenu.getBoundingClientRect()
    const left = anchor.right + bounds.width <= window.innerWidth - 8 ? anchor.right : anchor.left - bounds.width
    const top = Math.max(8, Math.min(anchor.top - 4, window.innerHeight - bounds.height - 8))
    // The menu is a fixed-position popup: place the submenu relative to it so it follows the menu.
    submenu.style.left = `${Math.max(8, left) - owner.left}px`
    submenu.style.top = `${top - owner.top}px`
  }
  function attach(menu) {
    if (context.signal.aborted)
      return
    const box = menu.firstElementChild?.firstElementChild
    if (!box || !box.children.length)
      return
    gridClick = false
    const request = ++sequence
    nativeMenu = menu
    const snapshot = readSelection()
    if (!snapshot) {
      nativeMenu = null
      return
    }
    candidate = snapshot
    const group = document.createElement('div')
    group.className = 'univer-grid univer-gap-1 univer-py-1'
    group.dataset.lexoraQuote = ''
    // The previous last group has no divider: give it the one the other groups have.
    const previous = box.lastElementChild
    if (previous && !previous.className.includes('univer-border-b'))
      previous.classList.add('univer-border-gray-200', 'univer-border-solid', 'univer-border-l-0', 'univer-border-b', 'univer-border-t-0', 'univer-border-r-0')
    const { wrapper, element: row } = item(box, copy().quote)
    group.append(wrapper)
    // These handlers affect only the added item, not the editor's original menu.
    group.addEventListener('mousedown', event => event.preventDefault())
    entry = group
    box.append(group)
    const bounds = menu.getBoundingClientRect()
    if (bounds.bottom > window.innerHeight - 8)
      menu.style.top = `${Math.max(8, window.innerHeight - bounds.height - 8)}px`
    if (snapshot.blocked) {
      disable(row, copy()[snapshot.blocked])
      return
    }
    disable(row, snapshot.tooLong ? copy().limit : copy().loading)
    if (snapshot.tooLong)
      return
    void capture(snapshot, request, group, row, wrapper, menu)
  }
  async function capture(snapshot, request, group, row, wrapper, menu) {
    try {
      const { text, sheet, sheetIndex, range } = snapshot
      snapshot.capture ??= context.composer.captureQuote(context.resource, { text, cells: { sheetIndex, sheet, range } })
      const result = await snapshot.capture
      if (sequence !== request || entry !== group || !group.isConnected)
        return
      if (!current(snapshot)) {
        row.title = copy().unavailable
        return
      }
      if (!result.targets.length) {
        row.title = copy().noTarget
        return
      }
      enable(row)
      if (result.targets.length === 1) {
        row.addEventListener('click', () => void add(snapshot, result, result.targets[0].id, row))
        return
      }
      // Keep one top-level command. Multiple visible chat inputs live below it.
      const arrow = document.createElement('span')
      arrow.textContent = '▸'
      arrow.style.opacity = '0.6'
      row.append(arrow)
      row.setAttribute('aria-haspopup', 'menu')
      row.setAttribute('aria-expanded', 'false')
      const submenu = document.createElement('div')
      submenu.setAttribute('role', 'menu')
      submenu.setAttribute('aria-label', copy().quote)
      // Not the hidden attribute: the menu box classes set display, which would override it.
      submenu.style.display = 'none'
      submenu.style.position = 'absolute'
      submenu.style.zIndex = '1'
      // Same look as the editor's own menu box.
      submenu.className = menu.firstElementChild.firstElementChild.className
      submenu.style.maxHeight = '320px'
      const preferred = result.targets.find(target => target.id === result.defaultId)
      const targets = [...(preferred ? [preferred] : []), ...result.targets.filter(target => target !== preferred)]
      for (const target of targets) {
        const { wrapper: line, element: button } = item(menu.firstElementChild.firstElementChild, target.label)
        button.title = target.label
        button.addEventListener('click', () => {
          hide()
          void add(snapshot, result, target.id, row)
        })
        submenu.append(line)
      }
      // The popup section does not clip (overflow: visible), unlike the scrolling box inside it.
      menu.append(submenu)
      submenuElement = submenu
      const show = () => {
        if (row.disabled)
          return
        submenu.style.display = 'grid'
        row.setAttribute('aria-expanded', 'true')
        positionSubmenu(submenu, menu, row)
      }
      function hide() {
        submenu.style.display = 'none'
        row.setAttribute('aria-expanded', 'false')
      }
      // Only the entry and its own list keep the list open: hovering any other item (which may open the editor's own
      // submenu, such as Sort) or scrolling the menu closes it.
      menu.addEventListener('mouseover', (event) => {
        if (!wrapper.contains(event.target) && !submenu.contains(event.target))
          hide()
      })
      menu.firstElementChild.firstElementChild.addEventListener('scroll', hide, { passive: true })
      row.addEventListener('click', show)
      wrapper.addEventListener('mouseenter', show)
      submenu.addEventListener('mouseenter', show)
      wrapper.addEventListener('mouseleave', (event) => {
        if (!submenu.contains(event.relatedTarget))
          hide()
      })
      submenu.addEventListener('mouseleave', (event) => {
        if (!wrapper.contains(event.relatedTarget))
          hide()
      })
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
      if (sequence === request && entry === group)
        row.title = errorText(error)
    }
  }
  // Only menus opened from the grid (cells and row/column headers are all canvas) can carry a quote.
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.('.univer-popup'))
      return
    reset()
    gridClick = event.target.tagName === 'CANVAS' && !!event.target.closest?.('#univer-container')
  }, { capture: true, signal: context.signal })
  // The copy / cut / paste trio opens the cell, row and column menus; stale hidden submenu popups lack it.
  const isCellMenu = element => !!element.querySelector('.univer-grid-cols-3')
  const observer = new MutationObserver(() => {
    if (nativeMenu && !live(nativeMenu)) {
      reset()
      return
    }
    if (nativeMenu || !gridClick)
      return
    const menu = [...document.querySelectorAll('section.univer-popup')].find(element => live(element) && isCellMenu(element) && !element.querySelector('[data-lexora-quote]'))
    if (menu)
      attach(menu)
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  window.addEventListener('resize', reset, { signal: context.signal })
  window.addEventListener('blur', reset, { signal: context.signal })
  const appearance = context.onEnvironmentChange(reset)
  context.signal.addEventListener('abort', () => {
    observer.disconnect()
    appearance.dispose()
    reset()
  }, { once: true })
}
