// Document kit: answer Lexora's "locate source" request for a saved quote.
// Copied into plugins by sync.mjs; edit the original in apps/buddy/extensions/document-kit.
//
// When someone opens a quote card and asks for its source, Lexora opens the file in this plugin's view and then asks the view to
// show the quoted place. The request carries the quote text and the position the plugin stored with the quote. The position is a
// hint: the document may have changed since, so check the text before trusting it. Return false rather than a wrong place.
// See document-processor.md, section "引用到聊天".

/**
 * Registers the handler for locate requests. `handler({ text, data, signal })` gets the quote text, the stored position
 * (`data`, a plain object, or null when there is none) and a signal that fires when the request is cancelled; it returns
 * whether the place was found. Call `ready(true)` once the document is loaded (requests wait for it), or `ready(false)` when it
 * could not be loaded. A handler that throws counts as not found. On a host that cannot ask, nothing happens.
 */
export function registerReveal(context, handler) {
  let settle
  const loaded = new Promise((resolve) => {
    settle = resolve
  })
  const registration = context.references?.onReveal?.(async (input, signal) => {
    try {
      const open = await Promise.race([loaded, new Promise(resolve => signal.addEventListener('abort', () => resolve(false), { once: true }))])
      if (!open || signal.aborted)
        return false
      const locator = input.locator
      const data = locator && locator.version === 1 && locator.data && typeof locator.data === 'object' && !Array.isArray(locator.data) ? locator.data : null
      return (await handler({ text: input.text, data, signal })) === true && !signal.aborted
    }
    catch {
      return false
    }
  })
  context.signal.addEventListener('abort', () => {
    settle(false)
    registration?.dispose()
  }, { once: true })
  return { ready: (ok = true) => settle(ok) }
}

/**
 * Finds `needle` in the text of `root` and returns a DOM Range over it, or null. Whitespace is ignored on both sides: text read
 * from a page and text produced by a selection differ in where the spaces and line breaks fall. With several matches, the first
 * is used. Only text nodes under `root` count.
 */
export function findTextRange(root, needle) {
  const wanted = String(needle).replace(/\s+/g, '')
  if (!wanted)
    return null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let text = ''
  const map = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue ?? ''
    for (let offset = 0; offset < value.length; offset++) {
      if (/\s/.test(value[offset]))
        continue
      text += value[offset]
      map.push({ node, offset })
    }
  }
  const index = text.indexOf(wanted)
  if (index < 0)
    return null
  const start = map[index]
  const end = map[index + wanted.length - 1]
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset + 1)
  return range
}
