import type { ReferenceCapture, ReferenceInput } from '../lexora'
import type { createReader } from './reader'
import type { TranscriptSelection } from './reference'
import { SELECTION_LIMIT } from './reference'
import { orderedTargets, QuoteSession } from './quote-session'
import type { QuoteApi } from './quote-session'
import chatMenuCss from './chat-menu.css'
import { COPY_ICON, QUOTE_ICON } from './menu-icons'

type Actions = {
  copy: (text: string) => Promise<void>
  reference: (selection: TranscriptSelection) => ReferenceInput
  references: QuoteApi
  colorScheme: () => string
  notice: (text: string) => void
}

// Mirror ChatSelectionQuoteMenu's compact icon rows; keep the existing
// capture/choose/commit flow for file-backed plugin references.
// Selection and paragraph entry points deliberately share this single menu.
export function createSelectionToolbar(root: HTMLElement, reader: ReturnType<typeof createReader>, signal: AbortSignal, actions: Actions) {
  const style = document.createElement('style')
  style.textContent = chatMenuCss
  const menu = document.createElement('div')
  menu.className = 'transcript-reference-menu chat-selection-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', '文字引用菜单')
  menu.hidden = true
  const item = (text: string, svg?: string) => {
    const result = document.createElement('button')
    result.type = 'button'
    result.className = 'ctx-item'
    result.setAttribute('role', 'menuitem')
    const label = document.createElement('span')
    label.className = 'ctx-label'
    label.textContent = text
    if (svg) {
      const icon = document.createElement('span')
      icon.className = 'chat-menu-icon'
      icon.setAttribute('aria-hidden', 'true')
      icon.innerHTML = svg
      result.append(icon)
    }
    result.append(label)
    return result
  }
  const copy = item('复制', COPY_ICON)
  const wrapper = document.createElement('div')
  wrapper.className = 'ctx-item-wrap'
  const quote = item('引用', QUOTE_ICON)
  const arrow = document.createElement('span')
  arrow.className = 'ctx-arrow'
  arrow.setAttribute('aria-hidden', 'true')
  arrow.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>'
  arrow.hidden = true
  quote.append(arrow)
  const submenu = document.createElement('div')
  submenu.className = 'ctx-submenu'
  submenu.setAttribute('role', 'menu')
  submenu.setAttribute('aria-label', '选择目标聊天')
  submenu.hidden = true
  const status = document.createElement('span')
  status.className = 'transcript-selection-status'
  status.setAttribute('role', 'status')
  wrapper.append(quote, submenu)
  menu.append(copy, wrapper)
  root.append(style, menu, status)
  const session = new QuoteSession(actions.references)
  let snapshot: TranscriptSelection | null = null
  let capture: ReferenceCapture | null = null
  let sequence = 0
  let dragging = false
  let committing = false
  let frame = 0
  let selectionMenu = false

  function hideSubmenu() {
    submenu.hidden = true
    quote.setAttribute('aria-expanded', 'false')
  }
  function dismiss() {
    sequence++
    window.cancelAnimationFrame(frame)
    frame = 0
    menu.hidden = true
    hideSubmenu()
    submenu.replaceChildren()
    capture = null
    snapshot = null
    session.close()
  }
  function notice(text: string) {
    status.textContent = text
    actions.notice(text)
  }
  function errorText(error: unknown) {
    return error instanceof Error ? error.message : '无法加入引用，请重新选择后重试。'
  }
  function place(element: HTMLElement, x: number, y: number) {
    const bounds = element.getBoundingClientRect()
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`
  }
  function showSubmenu() {
    if (quote.disabled || !capture || capture.targets.length < 2) return
    submenu.hidden = false
    quote.setAttribute('aria-expanded', 'true')
    const anchor = quote.getBoundingClientRect()
    const bounds = submenu.getBoundingClientRect()
    place(submenu, anchor.right + bounds.width <= window.innerWidth - 8 ? anchor.right - 4 : anchor.left - bounds.width + 4, anchor.top - 5)
  }
  async function commit(targetId: string, row: HTMLButtonElement) {
    if (committing || menu.hidden || !capture) return
    const request = sequence
    committing = true
    row.disabled = quote.disabled = true
    quote.title = '正在加入引用…'
    try {
      const accepted = await session.commit(targetId)
      if (signal.aborted || request !== sequence) return
      if (accepted) dismiss()
      else quote.title = '对话或选区已变化，请重新选择后引用。'
    }
    catch (error) {
      if (!signal.aborted && request === sequence) {
        quote.title = errorText(error)
        notice(quote.title)
      }
    }
    finally { committing = false }
  }
  async function open(selected: TranscriptSelection, x: number, y: number, fromSelection: boolean) {
    if (signal.aborted || committing) return
    dismiss()
    const request = sequence
    snapshot = { ...selected }
    selectionMenu = fromSelection
    copy.disabled = false
    quote.disabled = true
    quote.title = selected.text.length > SELECTION_LIMIT ? '选中的文字过长，请缩小范围。' : '正在读取目标聊天…'
    quote.removeAttribute('aria-haspopup')
    quote.setAttribute('aria-expanded', 'false')
    arrow.hidden = true
    menu.dataset.colorScheme = actions.colorScheme()
    menu.hidden = false
    place(menu, x, y)
    if (selected.text.length > SELECTION_LIMIT) return
    try {
      const input = actions.reference({ ...selected })
      const frozen = await session.capture(input)
      if (signal.aborted || request !== sequence || menu.hidden) return
      if (!frozen) {
        quote.title = '对话或选区已变化，请重新选择后引用。'
        return
      }
      capture = frozen
      if (!frozen.targets.length) {
        quote.title = '请先打开一个聊天输入框。'
        return
      }
      quote.disabled = false
      quote.title = '引用到聊天'
      if (frozen.targets.length > 1) {
        arrow.hidden = false
        quote.setAttribute('aria-haspopup', 'menu')
        for (const target of orderedTargets(frozen)) {
          const row = item(target.label)
          row.title = target.label
          row.dataset.targetId = target.id
          submenu.append(row)
        }
      }
    }
    catch (error) {
      if (!signal.aborted && request === sequence) quote.title = errorText(error)
    }
  }

  // Like Office's native-context-menu adapter: cancel only the document surface,
  // leaving the browser/Electron native menu untouched for search and media UI.
  function textSurface(target: EventTarget | null) {
    return target instanceof Element && reader.element.contains(target) && !!target.closest('.transcript-scroll')
  }
  document.addEventListener('contextmenu', event => {
    if (event.target instanceof Node && menu.contains(event.target)) {
      event.preventDefault()
      return
    }
    if (!textSurface(event.target)) return
    event.preventDefault()
    dragging = false
    const selected = reader.readSelection()
    if (selected) void open(selected.selection, event.clientX || selected.rect.right, event.clientY || selected.rect.bottom, true)
    else dismiss()
  }, { capture: true, signal })
  menu.addEventListener('mousedown', event => event.preventDefault(), { signal })
  copy.addEventListener('click', () => {
    if (!snapshot) return
    const text = snapshot.text
    dismiss()
    void actions.copy(text).catch(error => { if (!signal.aborted) notice(errorText(error)) })
  }, { signal })
  submenu.addEventListener('click', event => {
    const row = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-target-id]') : null
    if (row?.dataset.targetId && !row.disabled) void commit(row.dataset.targetId, row)
  }, { signal })
  quote.addEventListener('click', () => {
    if (!capture || quote.disabled) return
    if (capture.targets.length === 1) void commit(capture.targets[0].id, quote)
    else showSubmenu()
  }, { signal })
  wrapper.addEventListener('mouseenter', showSubmenu, { signal })
  wrapper.addEventListener('mouseleave', () => { if (!wrapper.contains(document.activeElement)) hideSubmenu() }, { signal })
  wrapper.addEventListener('focusout', () => queueMicrotask(() => { if (!wrapper.contains(document.activeElement)) hideSubmenu() }), { signal })
  function focusNext(container: HTMLElement, event: KeyboardEvent) {
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled), :scope > .ctx-item-wrap > button:not(:disabled)')]
    if (!buttons.length) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus()
  }
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      dismiss()
    }
    else if (event.key === 'ArrowRight' && document.activeElement === quote) {
      event.preventDefault()
      showSubmenu()
      if (!submenu.hidden) submenu.querySelector<HTMLButtonElement>('button')?.focus()
    }
    else if (event.key === 'ArrowLeft' && !submenu.hidden) {
      event.preventDefault()
      hideSubmenu()
      quote.focus()
    }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      focusNext(!submenu.hidden && submenu.contains(document.activeElement) ? submenu : menu, event)
    }
  }, { signal })
  document.addEventListener('pointerdown', event => {
    if (event.target instanceof Node && menu.contains(event.target)) return
    dismiss()
    dragging = event.button === 0 && textSurface(event.target)
  }, { signal, capture: true })
  document.addEventListener('pointerup', event => {
    if (!dragging) return
    dragging = false
    frame = window.requestAnimationFrame(() => {
      frame = 0
      const selected = reader.readSelection()
      if (selected) void open(selected.selection, event.clientX, event.clientY, true)
    })
  }, { signal })
  document.addEventListener('pointercancel', () => { dragging = false; dismiss() }, { signal })
  document.addEventListener('selectionchange', () => {
    if (dragging || menu.hidden || !selectionMenu || committing) return
    const selected = reader.readSelection()
    if (!selected || JSON.stringify(selected.selection) !== JSON.stringify(snapshot)) dismiss()
  }, { signal })
  document.addEventListener('keyup', event => {
    if (event.key === 'Escape') dismiss()
    else if (event.shiftKey && (event.key.startsWith('Arrow') || ['Home', 'End'].includes(event.key))) {
      const selected = reader.readSelection()
      if (selected) void open(selected.selection, selected.rect.right, selected.rect.bottom, true)
    }
  }, { signal })
  root.addEventListener('scroll', event => {
    if (!(event.target instanceof Node) || !menu.contains(event.target)) dismiss()
  }, { signal, capture: true, passive: true })
  window.addEventListener('resize', dismiss, { signal })
  window.addEventListener('blur', dismiss, { signal })
  signal.addEventListener('abort', () => { dismiss(); style.remove(); menu.remove(); status.remove() }, { once: true })
  return { dismiss, openParagraph: (selection: TranscriptSelection, anchor: DOMRect) => { void open(selection, anchor.left, anchor.bottom, false) } }
}
