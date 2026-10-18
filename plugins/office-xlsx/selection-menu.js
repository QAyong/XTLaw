// Shapes the Sheets editor's cell context menu and adds a "Quote to chat" entry to its end. The quote is the displayed text of the
// selected cell range (one line per row, tab between cells); the host records the workbook, sheet and range it came from.
const MAX_QUOTE_CHARS = 20000

// The editor's cell menu lists every Excel-style action (about 25 entries) and has to scroll in an ordinary window. Like Google Sheets'
// "more cell actions", the plain commands used now and then move into one "More actions" submenu (zh and en wording; the plugin only
// follows those two languages), and submenu entries the ribbon already offers (View > Freeze, Review > Protect, the number format
// drop-down) are hidden. The items are React-owned: they are hidden, not removed, and the submenu forwards its clicks to them.
const MORE_ENTRIES = [
  ['选择性粘贴…', 'Paste Special…'],
  ['粘贴图片/形状', 'Paste Picture or Shape'],
  ['从下拉列表中选择…', 'Pick From Drop-down List…'],
  ['新建批注', 'New Comment'],
  ['回复批注', 'Reply to Comment'],
  ['删除批注', 'Delete Comment'],
  ['解决批注', 'Resolve Comment'],
  ['定义名称…', 'Define Name…'],
  ['插入函数…', 'Insert Function…'],
]
const MORE_RANK = new Map(MORE_ENTRIES.flatMap((names, rank) => names.map(name => [name, rank])))
const RIBBON_ENTRIES = new Set(['数字格式', 'Number Format', '冻结', 'Freeze', '保护行列', 'Protect Rows And Columns'])

const labelOf = element => element.querySelector('button')?.textContent.trim()

// Hides entries and a group that ends up with nothing visible; returns the plain commands that go into "More actions".
function reshapeMenu(box) {
  const more = []
  for (const group of box.children) {
    const items = [...group.querySelectorAll(':scope > div.univer-relative')]
    for (const item of items) {
      const label = labelOf(item)
      if (MORE_RANK.has(label)) {
        const button = item.querySelector('button')
        more.push({ rank: MORE_RANK.get(label), label, disabled: button.disabled, pick: () => button.click() })
      }
      if (MORE_RANK.has(label) || RIBBON_ENTRIES.has(label))
        item.style.display = 'none'
    }
    if (items.length && items.every(item => item.style.display === 'none'))
      group.style.display = 'none'
  }
  return more.sort((a, b) => a.rank - b.rank)
}

export function installSelectionMenu(context) {
  let candidate = null
  let nativeMenu = null
  let entry = null
  let sequence = 0
  const zh = () => context.environment.language.startsWith('zh')
  const copy = () => zh()
    ? { quote: '引用到聊天', more: '更多操作', loading: '正在读取目标聊天…', adding: '正在加入引用…', unavailable: '对话或文档已变化，请重新选中单元格。', noTarget: '请先打开聊天输入框', limit: '引用内容过多（最多 20000 个字符），请缩小选区或减少已有引用。', failed: '无法加入引用，请重新选择后重试。', multiple: '请只选中一个连续区域后再引用。', notLoaded: '选区超出已载入的范围（大表只能引用屏幕附近的单元格），请稍后重试或缩小选区。' }
    : { quote: 'Quote to chat', more: 'More actions', loading: 'Loading chat targets…', adding: 'Adding quote…', unavailable: 'The chat or document changed. Select the cells again.', noTarget: 'Open a chat input first', limit: 'Too much content (20,000 characters at most). Select a smaller range or remove existing quotes.', failed: 'Could not add the quote. Select the cells and retry.', multiple: 'Select a single continuous range to quote.', notLoaded: 'The selection is outside the loaded data (in a large sheet only cells near the screen can be quoted). Retry shortly or select a smaller range.' }
  // The submenus live in the popup section (the scrolling box inside it would clip them), outside the entry.
  let submenus = []
  // Listeners put on the (possibly reused) menu elements end with the menu they were added for.
  let menuListeners = new AbortController()
  let menuObservers = []
  function reset() {
    menuListeners.abort()
    menuListeners = new AbortController()
    for (const observer of menuObservers)
      observer.disconnect()
    menuObservers = []
    sequence++
    candidate = null
    nativeMenu = null
    entry?.remove()
    entry = null
    for (const submenu of submenus)
      submenu.element.remove()
    submenus = []
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
  // Univer places its popup from the size it measured before our changes (the added group makes it taller), so near the bottom of a
  // short window the end of the menu would be cut off. Keep the popup inside the window, and let the box scroll when it cannot fit.
  function fit(menu) {
    const box = menu.firstElementChild?.firstElementChild
    // Layout size and the style position: the bounding box is scaled while the popup animates in.
    const height = menu.offsetHeight
    const top = Number.parseFloat(menu.style.top)
    // Still being measured off screen.
    if (!box || !height || !Number.isFinite(top) || top < -1000)
      return
    const margin = 8
    const room = window.innerHeight - margin * 2
    if (height > room + 1) {
      box.style.maxHeight = `${room}px`
      menu.style.top = `${margin}px`
    }
    else if (top + height > window.innerHeight - margin + 1 || top < margin - 1) {
      menu.style.top = `${Math.max(margin, window.innerHeight - margin - height)}px`
    }
  }
  // Turns an entry row into a submenu parent. Lines are { label, title?, disabled?, pick }.
  function attachSubmenu(menu, wrapper, row, ariaLabel, lines) {
    const box = menu.firstElementChild.firstElementChild
    const arrow = document.createElement('span')
    arrow.textContent = '▸'
    arrow.style.opacity = '0.6'
    row.append(arrow)
    row.setAttribute('aria-haspopup', 'menu')
    row.setAttribute('aria-expanded', 'false')
    const element = document.createElement('div')
    element.setAttribute('role', 'menu')
    element.setAttribute('aria-label', ariaLabel)
    // Not the hidden attribute: the menu box classes set display, which would override it.
    element.style.display = 'none'
    element.style.position = 'absolute'
    element.style.zIndex = '1'
    // Same look as the editor's own menu box.
    element.className = box.className
    element.style.maxHeight = '320px'
    function hide() {
      element.style.display = 'none'
      row.setAttribute('aria-expanded', 'false')
    }
    for (const line of lines) {
      const { wrapper: lineWrapper, element: button } = item(box, line.label)
      if (line.title)
        button.title = line.title
      if (line.disabled) {
        disable(button)
      }
      else {
        button.addEventListener('click', () => {
          hide()
          line.pick()
        })
      }
      element.append(lineWrapper)
    }
    // The popup section does not clip (overflow: visible), unlike the scrolling box inside it.
    menu.append(element)
    const show = () => {
      if (row.disabled)
        return
      // One list at a time.
      for (const other of submenus) {
        if (other.element !== element)
          other.hide()
      }
      element.style.display = 'grid'
      row.setAttribute('aria-expanded', 'true')
      positionSubmenu(element, menu, row)
    }
    row.addEventListener('click', show)
    wrapper.addEventListener('mouseenter', show)
    element.addEventListener('mouseenter', show)
    wrapper.addEventListener('mouseleave', (event) => {
      if (!element.contains(event.relatedTarget))
        hide()
    })
    element.addEventListener('mouseleave', (event) => {
      if (!wrapper.contains(event.relatedTarget))
        hide()
    })
    row.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        show()
        element.querySelector('button')?.focus()
      }
    })
    element.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        hide()
        row.focus()
      }
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const buttons = [...element.querySelectorAll('button')]
        const index = buttons.indexOf(document.activeElement)
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus()
      }
    })
    submenus.push({ element, wrapper, hide })
    if (wrapper.matches(':hover'))
      show()
  }
  function attach(menu) {
    if (context.signal.aborted)
      return
    const box = menu.firstElementChild?.firstElementChild
    if (!box || !box.children.length)
      return
    const more = reshapeMenu(box)
    const request = ++sequence
    nativeMenu = menu
    const snapshot = readSelection()
    if (!snapshot && !more.length) {
      nativeMenu = null
      return
    }
    candidate = snapshot
    const group = document.createElement('div')
    group.className = 'univer-grid univer-gap-1 univer-py-1'
    group.dataset.lexoraQuote = ''
    // The previous last group has no divider: give it the one the other groups have.
    const previous = [...box.children].reverse().find(element => element.style.display !== 'none')
    if (previous && !previous.className.includes('univer-border-b'))
      previous.classList.add('univer-border-gray-200', 'univer-border-solid', 'univer-border-l-0', 'univer-border-b', 'univer-border-t-0', 'univer-border-r-0')
    // These handlers affect only the added items, not the editor's original menu.
    group.addEventListener('mousedown', event => event.preventDefault())
    entry = group
    if (more.length) {
      const { wrapper, element: row } = item(box, copy().more)
      group.append(wrapper)
      box.append(group)
      attachSubmenu(menu, wrapper, row, copy().more, more)
    }
    else {
      box.append(group)
    }
    // A hovered item that is not ours (which may open the editor's own submenu, such as Sort) or a scrolling menu closes our lists.
    menu.addEventListener('mouseover', (event) => {
      for (const submenu of submenus) {
        if (!submenu.wrapper.contains(event.target) && !submenu.element.contains(event.target))
          submenu.hide()
      }
    }, { signal: menuListeners.signal })
    box.addEventListener('scroll', () => {
      for (const submenu of submenus)
        submenu.hide()
    }, { passive: true, signal: menuListeners.signal })
    if (snapshot) {
      const { wrapper, element: row } = item(box, copy().quote)
      group.append(wrapper)
      if (snapshot.blocked) {
        disable(row, copy()[snapshot.blocked])
      }
      else {
        disable(row, snapshot.tooLong ? copy().limit : copy().loading)
        if (!snapshot.tooLong)
          void capture(snapshot, request, group, row, wrapper, menu)
      }
    }
    // Univer positions the popup after it is measured and again when it settles: fit it every time its place or size changes.
    fit(menu)
    const watchers = [new MutationObserver(() => fit(menu)), new ResizeObserver(() => fit(menu))]
    watchers[0].observe(menu, { attributes: true, attributeFilter: ['style', 'class'] })
    watchers[1].observe(menu)
    menuObservers.push(...watchers)
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
      const preferred = result.targets.find(target => target.id === result.defaultId)
      const targets = [...(preferred ? [preferred] : []), ...result.targets.filter(target => target !== preferred)]
      attachSubmenu(menu, wrapper, row, copy().quote, targets.map(target => ({ label: target.label, title: target.label, pick: () => void add(snapshot, result, target.id, row) })))
    }
    catch (error) {
      if (sequence === request && entry === group)
        row.title = errorText(error)
    }
  }
  // Univer opens its menu from the pointer events and the browser's contextmenu event follows, so nothing here may depend on that
  // event (it can arrive after the menu is already on screen): any menu with the copy / cut / paste trio is reshaped as it appears.
  // The copy / cut / paste trio opens the cell, row and column menus; stale hidden submenu popups lack it.
  const isCellMenu = element => !!element.querySelector('.univer-grid-cols-3')
  const observer = new MutationObserver(() => {
    if (nativeMenu && !live(nativeMenu)) {
      reset()
      return
    }
    if (nativeMenu)
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
