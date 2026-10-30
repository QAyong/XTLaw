import { nodeText } from './selection-menu.js'

// "Locate source" for a quote made in this viewer. A quote keeps the slide it came from and the text, not which element held it,
// so: go to the slide, find the one element whose text contains the quoted text, and select it. The text decides: when no single
// element holds it (the slide was edited, or the quote spanned several elements) the answer is false and the slide stays shown,
// which is where the host's "opened the file but could not find the place" message points the user.
const READY_WAIT_MS = 8000

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

// Every element of a slide, groups included, outermost first.
function elements(nodes) {
  const found = []
  for (const node of nodes) {
    if (node.decoration)
      continue
    found.push(node)
    if (node.type === 'group')
      found.push(...elements(node.children ?? []))
  }
  return found
}

export function createQuoteReveal() {
  return async function reveal({ text, data, signal }) {
    const slide = data?.format === 'pptx' && Array.isArray(data.indexes) && Number.isInteger(data.indexes[0]) ? data.indexes[0] : -1
    const wanted = compact(text)
    if (slide < 0 || !wanted)
      return false
    // The editor answers "not ready" until the deck is loaded; going to the slide also clears any text editing in progress.
    const deadline = Date.now() + READY_WAIT_MS
    for (;;) {
      const reply = window.__genofficeControl?.({ cmd: 'goto', target: { slide } })
      if (reply?.status === 'ok')
        break
      if (reply?.status !== 'not_ready' || Date.now() > deadline || signal.aborted)
        return false
      await wait(100, signal)
    }
    const slides = await window.slidesApi.getRenderSlides()
    if (signal.aborted)
      return false
    // The smallest element that holds all the text: a group's text is its children's, which would hide the child.
    // On a tie the one listed later is the one inside the other.
    const holders = elements(slides[slide]?.nodes ?? [])
      .map((node, index) => ({ node, index, text: compact(nodeText(node)) }))
      .filter(item => item.text.includes(wanted))
      .sort((a, b) => a.text.length - b.text.length || b.index - a.index)
    const target = holders[0]?.node
    if (!target)
      return false
    const reply = window.__genofficeControl?.({ cmd: 'select', target: { slide, el: target.durableId ?? target.sourceId } })
    return reply?.status === 'ok'
  }
}
