// Adapted from the PPTX plugin's toolbar navigation for the Sheets editor's ribbon: the header holds a tab row (nav.ribbon-tabs) and
// the command band (div.ribbon). The band is paged with two fixed arrows, like the DOCX and PPTX plugins. Collapsing the ribbon by
// pressing the active tab is the editor's own behavior and stays untouched.
export function installOfficeToolbarNavigation(root, signal) {
  const NAVIGATION_CLASS = 'pi-office-toolbar-nav'
  const OVERFLOW_CLASS = 'pi-office-toolbar-overflow'
  const SCROLL_CLASS = 'pi-office-toolbar-scroll'
  const HOST_CLASS = 'pi-office-toolbar-host'
  const PARTIAL_ITEM_CLASS = 'pi-office-toolbar-partial-item'
  const SINGLE_COLUMN_CLASS = 'pi-office-toolbar-single-column'
  const PAGE_CONTROL_GUTTER = 6
  const attachedRibbons = new Map()
  // The command band is one element for every category: a category switch starts again from the first page.
  const shownCategory = new WeakMap()
  const bindings = new AbortController()
  let updateFrame = 0
  let disposed = false

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  function getLabels() {
    const language = document.documentElement.lang || ''
    const isChinese = language.toLowerCase().startsWith('zh')
    return isChinese
      ? {
          previous: '上一页工具',
          next: '下一页工具',
        }
      : {
          previous: 'Previous toolbar page',
          next: 'Next toolbar page',
        }
  }

  function createArrow(direction, getBody) {
    const labels = getLabels()
    const button = document.createElement('button')
    const path = direction === 'previous' ? 'M14 5 8 12l6 7' : 'm10 5 6 7-6 7'

    button.type = 'button'
    button.className = `${NAVIGATION_CLASS} ${NAVIGATION_CLASS}-${direction}`
    button.setAttribute('aria-label', labels[direction])
    button.title = labels[direction]
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      pageToolbar(getBody(), direction === 'previous' ? -1 : 1)
    })

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('focusable', 'false')
    svg.innerHTML = `<path d="${path}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>`
    button.append(svg)
    return button
  }

  function getToolbarItemBounds(container) {
    const containerRect = container.getBoundingClientRect()
    return Array.from(
      container.querySelectorAll(
        'button, input, select, textarea, [role=\'button\'], .ribbon-sep',
      ),
    )
      .filter(item => item.offsetParent !== null)
      .map((item) => {
        const rect = item.getBoundingClientRect()
        return {
          element: item,
          left: rect.left - containerRect.left + container.scrollLeft,
          right:
            rect.right - containerRect.left
            + container.scrollLeft
            + PAGE_CONTROL_GUTTER,
        }
      })
      .filter(({ left, right }) => Number.isFinite(left) && right > left)
      .sort((a, b) => a.left - b.left || a.right - b.right)
  }

  function getToolbarPageStarts(container) {
    const pageWidth = Math.max(1, container.clientWidth)
    const maxScroll = Math.max(0, container.scrollWidth - pageWidth)
    if (maxScroll <= 1)
      return [0]

    const items = getToolbarItemBounds(container)
    if (items.length === 0) {
      return [0, maxScroll]
    }

    const starts = [0]
    let start = 0
    while (start < maxScroll - 1) {
      const viewportEnd = start + pageWidth
      const nextItem = items.find(
        ({ left, right }) => left > start + 1 && right > viewportEnd + 1,
      )
      const nextStart = clamp(
        nextItem?.left ?? maxScroll,
        start + 1,
        maxScroll,
      )
      starts.push(nextStart)
      start = nextStart
    }

    if (starts.at(-1) !== maxScroll)
      starts.push(maxScroll)
    return starts
  }

  function updatePartialToolbarItems(container) {
    const leftEdge = container.scrollLeft + 1
    const rightEdge = container.scrollLeft + container.clientWidth - 1
    for (const { element, left, right } of getToolbarItemBounds(container)) {
      element.classList.toggle(
        PARTIAL_ITEM_CLASS,
        left < leftEdge || right > rightEdge,
      )
    }
  }

  function getDirectToolbarChild(container, element) {
    let current = element
    while (current && current.parentElement !== container) {
      current = current.parentElement
    }
    return current?.parentElement === container ? current : null
  }

  function centerSingleColumn(container) {
    const containerRect = container.getBoundingClientRect()
    const viewportLeft = containerRect.left
    const viewportRight = viewportLeft + container.clientWidth
    const visibleItems = getToolbarItemBounds(container).filter(({ element, left, right }) => {
      if (element.classList.contains(PARTIAL_ITEM_CLASS))
        return false
      const itemLeft = left - container.scrollLeft + viewportLeft
      const itemRight = right - container.scrollLeft + viewportLeft
      return itemRight > viewportLeft + 1 && itemLeft < viewportRight - 1
    })
    const modules = new Set(
      visibleItems
        .map(({ element }) => getDirectToolbarChild(container, element))
        .filter(
          element =>
            element?.classList.contains('ribbon-group')
            || element?.classList.contains('table-ribbon-body'),
        ),
    )
    const isSingleColumn = modules.size === 1
    container.classList.toggle(SINGLE_COLUMN_CLASS, isSingleColumn)
    if (!isSingleColumn)
      return

    const [module] = modules
    const moduleRect = module.getBoundingClientRect()
    if (moduleRect.width > container.clientWidth + 1)
      return

    const shift
      = moduleRect.left + moduleRect.width / 2 - (viewportLeft + container.clientWidth / 2)
    if (Math.abs(shift) <= 1)
      return

    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth)
    container.scrollLeft = clamp(container.scrollLeft + shift, 0, maxScroll)
    updatePartialToolbarItems(container)
  }

  function pageToolbar(container, direction) {
    if (!container)
      return

    const starts = getToolbarPageStarts(container)
    const currentPage = starts.reduce(
      (page, start, index) =>
        start <= container.scrollLeft + 1 ? index : page,
      0,
    )
    const target = starts[clamp(currentPage + direction, 0, starts.length - 1)]
    if (Math.abs(target - container.scrollLeft) <= 1)
      return

    container.scrollTo({
      left: target,
      behavior: 'auto',
    })
  }

  function updateNavigation(container, state) {
    if (!container) {
      state.previous.hidden = false
      state.next.hidden = false
      state.previous.disabled = true
      state.next.disabled = true
      state.previous.setAttribute('aria-disabled', 'true')
      state.next.setAttribute('aria-disabled', 'true')
      return
    }

    updatePartialToolbarItems(container)
    centerSingleColumn(container)

    const pageStarts = getToolbarPageStarts(container)
    const hasOverflow = pageStarts.length > 1
    const currentPage = pageStarts.reduce(
      (page, start, index) =>
        start <= container.scrollLeft + 1 ? index : page,
      0,
    )
    const atStart = currentPage <= 0
    const atEnd = currentPage >= pageStarts.length - 1

    container.classList.toggle(OVERFLOW_CLASS, hasOverflow)
    state.previous.hidden = false
    state.next.hidden = false
    state.previous.disabled = !hasOverflow || atStart
    state.next.disabled = !hasOverflow || atEnd
    state.previous.setAttribute('aria-disabled', String(state.previous.disabled))
    state.next.setAttribute('aria-disabled', String(state.next.disabled))
  }

  function removeNavigationButtons(ribbon, body) {
    ribbon
      .querySelectorAll(`:scope > .${NAVIGATION_CLASS}`)
      .forEach(button => button.remove())
    body?.querySelectorAll(`:scope > .${NAVIGATION_CLASS}`).forEach((button) => {
      button.remove()
    })
  }

  function detachNavigation(ribbon) {
    const state = attachedRibbons.get(ribbon)
    if (state)
      detachBodyBinding(state)
    removeNavigationButtons(ribbon, state?.body)
    ribbon.classList.remove(HOST_CLASS)
    attachedRibbons.delete(ribbon)
  }

  function getOrCreateNavigationState(ribbon) {
    let state = attachedRibbons.get(ribbon)
    if (state)
      return state

    removeNavigationButtons(ribbon)
    state = {
      body: null,
      previous: createArrow('previous', () => state.body),
      next: createArrow('next', () => state.body),
      onScroll: null,
      resizeObserver: null,
    }
    attachedRibbons.set(ribbon, state)
    return state
  }

  function ensureNavigationControls(ribbon, state) {
    ribbon.classList.add(HOST_CLASS)
    if (!state.previous.isConnected || state.previous.parentElement !== ribbon) {
      ribbon.append(state.previous)
    }
    if (!state.next.isConnected || state.next.parentElement !== ribbon) {
      ribbon.append(state.next)
    }
  }

  function detachBodyBinding(state) {
    if (state.resizeObserver) {
      state.resizeObserver.disconnect()
      state.resizeObserver = null
    }

    if (state.onScroll && state.body) {
      state.body.removeEventListener('scroll', state.onScroll)
      state.body.classList.remove(SCROLL_CLASS, OVERFLOW_CLASS)
      state.body
        .querySelectorAll(`.${PARTIAL_ITEM_CLASS}`)
        .forEach(item => item.classList.remove(PARTIAL_ITEM_CLASS))
    }

    state.onScroll = null
  }

  function attachNavigation(ribbon, body) {
    const state = getOrCreateNavigationState(ribbon)
    ensureNavigationControls(ribbon, state)

    if (
      state.body === body
      && state.previous.isConnected
      && state.next.isConnected
      && state.previous.parentElement === ribbon
      && state.next.parentElement === ribbon
    ) {
      updateNavigation(body, state)
      return
    }

    // Category changes replace .ribbon-body, but the fixed controls belong to
    // the outer ribbon and must survive that replacement.
    detachBodyBinding(state)
    state.body = body
    body.classList.add(SCROLL_CLASS)

    state.onScroll = () => updateNavigation(state.body, state)
    body.addEventListener('scroll', state.onScroll, {
      passive: true,
    })

    if (typeof ResizeObserver === 'function') {
      const resizeObserver = new ResizeObserver(() => {
        updateNavigation(state.body, state)
      })
      resizeObserver.observe(ribbon)
      resizeObserver.observe(body)
      state.resizeObserver = resizeObserver
    }

    updateNavigation(body, state)
  }

  function decorateToolbar(host) {
    const clipboardLabels = new Set(['粘贴', 'Paste'])
    host.querySelectorAll(':scope > .ribbon > .ribbon-group').forEach((group) => {
      const hasPaste = Array.from(group.querySelectorAll('.ribbon-tool.large')).some(button =>
        clipboardLabels.has(button.textContent.trim()),
      )
      group.classList.toggle('pi-office-clipboard-group', hasPaste)
    })
  }

  function refresh() {
    for (const host of attachedRibbons.keys()) {
      if (!root.contains(host))
        detachNavigation(host)
    }
    root.querySelectorAll('.excel-header').forEach((host) => {
      const tabs = host.querySelector(':scope > .ribbon-tabs')
      const body = host.querySelector(':scope > .ribbon')
      host.classList.toggle('pi-office-ribbon-collapsed', host.classList.contains('ribbon-collapsed'))
      // Category switching stays in the fixed first row. Only the command band is paged.
      tabs?.classList.add('pi-office-toolbar-tabs')
      if (body) {
        const category = tabs?.querySelector(':scope > button.active')?.textContent
        if (shownCategory.get(host) !== category) {
          shownCategory.set(host, category)
          body.scrollLeft = 0
        }
        attachNavigation(host, body)
      }
      else {
        const state = getOrCreateNavigationState(host)
        detachBodyBinding(state)
        state.body = null
        ensureNavigationControls(host, state)
        updateNavigation(null, state)
      }
      decorateToolbar(host)
    })
  }

  function scheduleRefresh() {
    if (disposed || updateFrame)
      return
    updateFrame = requestAnimationFrame(() => {
      updateFrame = 0
      if (disposed)
        return
      refresh()
    })
  }

  const observer = new MutationObserver(scheduleRefresh)
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  window.addEventListener('resize', scheduleRefresh, { passive: true, signal: bindings.signal })
  function dispose() {
    if (disposed)
      return
    disposed = true
    observer.disconnect()
    bindings.abort()
    cancelAnimationFrame(updateFrame)
    for (const host of attachedRibbons.keys()) detachNavigation(host)
    signal.removeEventListener('abort', dispose)
  }
  signal.addEventListener('abort', dispose, { once: true })
  if (signal.aborted)
    dispose()
  scheduleRefresh()
  return dispose
}
