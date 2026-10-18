import { parseCsv, selectionText } from './csv.js'
import { addQuote, captureQuote, QUOTE_TEXT_LIMIT } from './document-kit/quote.js'
import { readWholeFile } from './document-kit/read-file.js'

const MAX_CSV_BYTES = 8 * 1024 * 1024
const copy = {
  'zh-CN': { loading: '正在读取…', empty: '请从文件管理器打开一个 CSV 文件。', failed: '无法读取此 CSV 文件。', changed: '文件已被其他程序修改，请重新打开。', truncated: '只显示前面一部分。', quote: '引用到聊天', tooLong: '选区太长，请缩小范围。', added: '已加入聊天草稿', duplicate: '这段已在草稿里', limit: '草稿里的引用已满', unavailable: '无法加入，请重新选择', choose: '加入到：' },
  'en-US': { loading: 'Reading…', empty: 'Open a CSV file from the file manager.', failed: 'This CSV file cannot be read.', changed: 'The file was changed by another program. Open it again.', truncated: 'Only the first part is shown.', quote: 'Quote in chat', tooLong: 'The selection is too long. Select less.', added: 'Added to the chat draft', duplicate: 'Already in the draft', limit: 'The draft has too many quotes', unavailable: 'Could not add it. Select again.', choose: 'Add to:' },
}

export async function render(context, container) {
  const text = () => copy[context.environment.language === 'zh-CN' ? 'zh-CN' : 'en-US']
  const style = document.createElement('style')
  style.textContent = `
    .csv { display: flex; flex-direction: column; height: 100%; color: var(--lexora-text); background: var(--lexora-background); font: 13px system-ui; }
    .csv__bar { display: flex; gap: 8px; align-items: center; min-height: 36px; padding: 4px 12px; border-bottom: 1px solid var(--lexora-border); color: var(--lexora-muted); }
    .csv__bar button { font: inherit; padding: 2px 10px; color: var(--lexora-text); background: transparent; border: 1px solid var(--lexora-border); border-radius: 6px; cursor: pointer; }
    .csv__bar button:disabled { opacity: .45; cursor: default; }
    .csv__scroll { flex: 1; overflow: auto; }
    .csv table { border-collapse: collapse; user-select: none; }
    .csv td { max-width: 320px; padding: 3px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 1px solid var(--lexora-border); }
    .csv td.is-selected { background: color-mix(in srgb, var(--lexora-accent) 22%, transparent); }
    .csv__message { padding: 16px; color: var(--lexora-muted); }`
  const root = document.createElement('div')
  root.className = 'csv'
  const bar = document.createElement('div')
  bar.className = 'csv__bar'
  const info = document.createElement('span')
  const quoteButton = document.createElement('button')
  quoteButton.type = 'button'
  quoteButton.disabled = true
  bar.append(quoteButton, info)
  const scroll = document.createElement('div')
  scroll.className = 'csv__scroll'
  root.append(bar, scroll)
  container.replaceChildren(style, root)
  quoteButton.textContent = text().quote
  const show = message => scroll.replaceChildren(Object.assign(document.createElement('div'), { className: 'csv__message', textContent: message }))

  if (!context.resource) {
    show(text().empty)
    return
  }
  show(text().loading)
  let parsed
  try {
    // The host remembers the version and hash of the file this view read completely; quotes are bound to them.
    const bytes = await readWholeFile(context.resources, context.resource, context.signal, { extensions: ['csv'], maxBytes: MAX_CSV_BYTES, errors: { unsupported: 'CSV_UNSUPPORTED', changed: 'CSV_CHANGED' } })
    parsed = parseCsv(new TextDecoder('utf-8').decode(bytes))
  }
  catch (error) {
    if (!context.signal.aborted)
      show(error?.message === 'CSV_CHANGED' ? text().changed : text().failed)
    return
  }
  const { rows } = parsed
  const table = document.createElement('table')
  const cells = []
  rows.forEach((values, r) => {
    const tr = table.insertRow()
    cells[r] = values.map((value, c) => {
      const td = tr.insertCell()
      td.textContent = value
      td.dataset.r = String(r)
      td.dataset.c = String(c)
      return td
    })
  })
  scroll.replaceChildren(table)
  info.textContent = parsed.truncated ? text().truncated : ''

  let anchor = null
  let focus = null
  let dragging = false
  const range = () => anchor && focus ? { from: [Math.min(anchor[0], focus[0]), Math.min(anchor[1], focus[1])], to: [Math.max(anchor[0], focus[0]), Math.max(anchor[1], focus[1])] } : null
  function paint() {
    const selected = range()
    cells.forEach((line, r) => line.forEach((td, c) => td.classList.toggle('is-selected', !!selected && r >= selected.from[0] && r <= selected.to[0] && c >= selected.from[1] && c <= selected.to[1])))
    quoteButton.disabled = !selected
  }
  const cellOf = event => event.target instanceof HTMLElement && event.target.dataset.r ? [Number(event.target.dataset.r), Number(event.target.dataset.c)] : null
  table.addEventListener('mousedown', (event) => {
    anchor = focus = cellOf(event)
    dragging = !!anchor
    paint()
  }, { signal: context.signal })
  table.addEventListener('mouseover', (event) => {
    const cell = dragging ? cellOf(event) : null
    if (cell) {
      focus = cell
      paint()
    }
  }, { signal: context.signal })
  addEventListener('mouseup', () => {
    dragging = false
  }, { signal: context.signal })

  async function quote() {
    const selected = range()
    if (!selected)
      return
    const quoted = selectionText(rows, selected.from, selected.to)
    if (!quoted.trim() || quoted.length > QUOTE_TEXT_LIMIT) {
      info.textContent = text().tooLong
      return
    }
    try {
      // kind and location are ours to define; the host keeps them with the quote and adds this plugin's ID.
      const capture = await captureQuote(context, { text: quoted, kind: 'cells', location: { from: selected.from, to: selected.to } })
      const target = capture.defaultId ?? (capture.targets.length === 1 ? capture.targets[0].id : null)
      if (target) {
        info.textContent = text()[await addQuote(context, capture, target)]
        return
      }
      info.replaceChildren(text().choose)
      for (const option of capture.targets) {
        const button = Object.assign(document.createElement('button'), { type: 'button', textContent: option.label })
        button.addEventListener('click', async () => {
          info.textContent = text()[await addQuote(context, capture, option.id)]
        }, { signal: context.signal, once: true })
        info.append(button)
      }
    }
    catch {
      if (!context.signal.aborted)
        info.textContent = text().unavailable
    }
  }
  quoteButton.addEventListener('click', () => void quote(), { signal: context.signal })
  context.onEnvironmentChange(() => {
    quoteButton.textContent = text().quote
  })
}
