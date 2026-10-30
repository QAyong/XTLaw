// "Locate source" for a quote made in this editor. A quote keeps the text and the ProseMirror positions it was selected at. The
// positions are only right while the document is unchanged, so: use them when the text there still matches, otherwise look for
// the text itself (the occurrence nearest the old position), and answer false when it is not in the document any more.
const EDITOR_WAIT_MS = 8000

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

// The document's text without whitespace, with the position of every character in it.
function readText(doc) {
  let text = ''
  const positions = []
  doc.descendants((node, pos) => {
    if (!node.isText)
      return true
    const value = node.text ?? ''
    for (let offset = 0; offset < value.length; offset++) {
      if (/\s/.test(value[offset]))
        continue
      text += value[offset]
      positions.push(pos + offset)
    }
    return false
  })
  return { text, positions }
}

function findRange(doc, wanted, from) {
  const { text, positions } = readText(doc)
  let best = null
  for (let index = text.indexOf(wanted); index >= 0; index = text.indexOf(wanted, index + 1)) {
    const distance = Number.isInteger(from) ? Math.abs(positions[index] - from) : index
    if (!best || distance < best.distance)
      best = { index, distance }
    if (!Number.isInteger(from))
      break
  }
  return best ? { from: positions[best.index], to: positions[best.index + wanted.length - 1] + 1 } : null
}

export function createQuoteReveal() {
  return async function reveal({ text, data, signal }) {
    const wanted = compact(text)
    if (data?.format !== 'docx' || !wanted)
      return false
    const deadline = Date.now() + EDITOR_WAIT_MS
    let editor = window.__aidocs?.editor
    while (!(editor?.state?.doc && editor.commands) && Date.now() < deadline && !signal.aborted) {
      await wait(100, signal)
      editor = window.__aidocs?.editor
    }
    if (signal.aborted || !editor?.state?.doc || !editor.commands)
      return false
    const doc = editor.state.doc
    const { from, to } = data
    const unchanged = Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to > from && to <= doc.content.size
      && compact(doc.textBetween(from, to, '\n')) === wanted
    const range = unchanged ? { from, to } : findRange(doc, wanted, from)
    if (!range)
      return false
    editor.commands.setTextSelection(range)
    editor.commands.scrollIntoView()
    try {
      editor.view.focus()
    }
    catch {}
    const { selection } = editor.state
    return selection.from === range.from && selection.to === range.to
  }
}
