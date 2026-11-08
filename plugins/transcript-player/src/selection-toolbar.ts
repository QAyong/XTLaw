import type { createReader } from './reader'
import type { TranscriptSelection } from './reference'
import { SELECTION_LIMIT } from './reference'

type Actions = {
  copy: (text: string) => Promise<void>
  quote: (selection: TranscriptSelection) => Promise<boolean>
  notice: (text: string) => void
}

export function createSelectionToolbar(root: HTMLElement, reader: ReturnType<typeof createReader>, signal: AbortSignal, actions: Actions) {
  const toolbar = document.createElement('div')
  toolbar.className = 'transcript-selection-toolbar'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.setAttribute('aria-label', '文字选区操作')
  toolbar.hidden = true
  const makeButton = (text: string) => {
    const result = document.createElement('button')
    result.type = 'button'
    result.textContent = text
    return result
  }
  const copy = makeButton('复制')
  const quote = makeButton('引用到 AI')
  const status = document.createElement('span')
  status.className = 'transcript-selection-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  toolbar.append(copy, quote)
  root.append(toolbar, status)
  let snapshot: ReturnType<typeof reader.readSelection> = null
  let busy = false
  let dragging = false
  let frame = 0

  function dismiss() {
    window.cancelAnimationFrame(frame)
    frame = 0
    toolbar.hidden = true
    snapshot = null
  }
  function notice(text: string) {
    status.textContent = text
    actions.notice(text)
  }
  function refresh() {
    frame = 0
    if (signal.aborted || busy || dragging) return
    snapshot = reader.readSelection()
    if (!snapshot) return dismiss()
    const bounds = root.getBoundingClientRect()
    const rect = snapshot.rect
    if (rect.bottom < bounds.top || rect.top > bounds.bottom) return dismiss()
    toolbar.hidden = false
    const width = toolbar.offsetWidth
    const height = toolbar.offsetHeight
    const left = Math.max(8, Math.min(bounds.width - width - 8, (rect.left + rect.right) / 2 - bounds.left - width / 2))
    let top = rect.top - bounds.top - height - 8
    if (top < 8) top = rect.bottom - bounds.top + 8
    top = Math.max(8, Math.min(bounds.height - height - 8, top))
    toolbar.style.left = `${left}px`
    toolbar.style.top = `${top}px`
    quote.disabled = snapshot.selection.text.length > SELECTION_LIMIT
    quote.title = quote.disabled ? '最多引用 32768 个字符，请缩小选区' : '加入聊天草稿，不会直接发送消息'
  }
  function schedule() {
    if (!frame && !signal.aborted) frame = window.requestAnimationFrame(refresh)
  }
  toolbar.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') event.preventDefault() // Keep the selection while clicking an action.
  }, { signal })
  document.addEventListener('selectionchange', schedule, { signal })
  document.addEventListener('pointerdown', event => {
    if (event.target instanceof Node && toolbar.contains(event.target)) return
    dragging = true
    dismiss()
  }, { signal })
  document.addEventListener('pointerup', () => {
    if (!dragging) return
    dragging = false
    schedule()
  }, { signal })
  document.addEventListener('pointercancel', () => { dragging = false; dismiss() }, { signal })
  document.addEventListener('keyup', event => {
    if (event.key === 'Escape') dismiss()
    else if (event.shiftKey || event.key.startsWith('Arrow')) schedule()
  }, { signal })
  root.addEventListener('scroll', dismiss, { signal, capture: true, passive: true })
  window.addEventListener('resize', dismiss, { signal })

  async function run(kind: 'copy' | 'quote') {
    if (busy || !snapshot || signal.aborted) return
    const selection = { ...snapshot.selection } // Freeze before any asynchronous target selection.
    busy = true
    copy.disabled = quote.disabled = true
    try {
      if (kind === 'copy') {
        await actions.copy(selection.text)
        if (!signal.aborted) notice('已复制选中文字。')
      }
      else if (await actions.quote(selection)) {
        if (!signal.aborted) notice('已加入聊天草稿，尚未发送。')
      }
    }
    catch (error) {
      if (!signal.aborted) notice(error instanceof Error ? error.message : '操作失败，请重新选择后重试。')
    }
    finally {
      busy = false
      if (!signal.aborted) {
        copy.disabled = quote.disabled = false
        dismiss()
      }
    }
  }
  copy.addEventListener('click', () => { void run('copy') }, { signal })
  quote.addEventListener('click', () => { void run('quote') }, { signal })
  signal.addEventListener('abort', () => window.cancelAnimationFrame(frame), { once: true })
  return { dismiss }
}
