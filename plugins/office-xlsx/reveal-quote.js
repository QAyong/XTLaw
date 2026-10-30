// "Locate source" for a quote made in this editor. A quote keeps the sheet and the A1 range of the cells and the text they showed.
// The editor's control hook (`target: { sheet, range }`) switches to the sheet and selects the range; then the cells' text is read the
// way the quote was taken and compared. Cells that changed since, or a range outside the sheet, answer false (the selection the
// editor made stays, which is where the host's "opened the file but could not find the place" message points the user).
const READY_WAIT_MS = 8000
const MAX_CHARS = 20000

const compact = text => String(text ?? '').replace(/\s+/g, '')

function wait(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

export function createQuoteReveal() {
  const control = request => window.__genofficeControl?.(request)
  return async function reveal({ text, data, signal }) {
    const range = typeof data?.range === 'string' ? data.range : ''
    const wanted = compact(text)
    if (data?.format !== 'xlsx' || !range || !wanted)
      return false
    let sheet = typeof data.sheet === 'string' ? data.sheet : undefined
    const deadline = Date.now() + READY_WAIT_MS
    let active = false
    while (!signal.aborted && Date.now() < deadline) {
      const reply = control({ cmd: 'open', target: { sheet, range } })
      if (reply?.status === 'ok') {
        active = true
        break
      }
      if (reply?.status === 'error') {
        // The sheet was renamed since: the same position in the workbook is the next best guess.
        const names = reply.error?.detail?.sheets
        const byIndex = Array.isArray(names) && Number.isInteger(data.sheetIndex) ? names[data.sheetIndex] : undefined
        if (reply.error?.reason !== 'sheet_not_found' || typeof byIndex !== 'string' || byIndex === sheet)
          return false
        sheet = byIndex
        continue
      }
      await wait(100, signal)
    }
    if (!active)
      return false
    // A large sheet loads its cells as they come into view: the read has to wait for them too.
    while (!signal.aborted && Date.now() < deadline) {
      const reply = control({ cmd: 'lexora-selection-text', maxChars: MAX_CHARS })
      if (reply?.status === 'ok')
        return typeof reply.result?.text === 'string' && compact(reply.result.text) === wanted
      if (reply?.status === 'error' && reply.error?.reason !== 'not_loaded')
        return false
      await wait(100, signal)
    }
    return false
  }
}
