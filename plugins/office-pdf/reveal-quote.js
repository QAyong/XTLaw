import { findTextRange } from './document-kit/reveal.js'

// "Locate source" for a quote made in this viewer: scroll to the page the quote came from and mark the quoted text in that page's
// text layer. The stored position is only the page number, so the text decides: when it is not on that page, the answer is false
// (the page is still shown, which is where the host's "opened the file but could not find the place" message points the user).
const HIGHLIGHT = 'lexora-quote'
const PAGE_WAIT_MS = 5000

function wait(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

export function createQuoteReveal(root, signal) {
  const clear = () => {
    globalThis.CSS?.highlights?.delete(HIGHLIGHT)
  }
  // The mark stays until the user clicks or presses a key, like a selection would.
  root.addEventListener('pointerdown', clear, { capture: true, signal })
  document.addEventListener('keydown', clear, { capture: true, signal })
  signal.addEventListener('abort', clear, { once: true })

  function mark(range) {
    clear()
    if (globalThis.CSS?.highlights && typeof Highlight === 'function') {
      CSS.highlights.set(HIGHLIGHT, new Highlight(range))
    }
    else {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement
    anchor?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }

  return async function reveal({ text, data, signal: request }) {
    const page = data?.kind === 'pdf-page' && Number.isInteger(data.location?.page) ? data.location.page : 0
    if (page < 1)
      return false
    clear()
    // A quote that ran on into the next page still starts on this one: try the whole text, then its first line.
    const candidates = [text, text.split('\n').map(line => line.trim()).find(Boolean) ?? '']
    const deadline = Date.now() + PAGE_WAIT_MS
    let scrolled = null
    while (!request.aborted && Date.now() < deadline) {
      const element = root.querySelector(`.pdf-page[data-page="${page - 1}"]`)
      // Right after the document mounts the pages are not drawn yet; once some are, a page that is not there does not exist.
      if (!element && root.querySelector('.pdf-page'))
        return false
      if (element && scrolled !== element) {
        element.scrollIntoView({ block: 'start' })
        scrolled = element
      }
      // The text layer is drawn after the page scrolls into view.
      const layer = element?.querySelector('.textLayer')
      if (layer?.textContent?.trim()) {
        for (const candidate of candidates) {
          const range = candidate.length >= 3 ? findTextRange(layer, candidate) : null
          if (range) {
            mark(range)
            return true
          }
        }
        return false
      }
      await wait(100, request)
    }
    return false
  }
}
