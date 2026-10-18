// Document kit: send a selection from the document view to a chat draft with the generic extension quote.
// Copied into plugins by sync.mjs; edit the original in apps/buddy/extensions/document-kit.
//
// The host stores `kind` and `location` with the quote (it does not hand them back to the view when the quote card reopens
// the file yet). It checks the same limits as checkQuoteLocation below and refuses the quote when they are broken, so
// checking first just gives an early, readable error. See document-processor.md, section "引用到聊天".

export const QUOTE_TEXT_LIMIT = 32768
const LIMITS = { bytes: 4096, depth: 4, keys: 32, items: 64, nodes: 256, string: 512 }
const KEY = /^[A-Z_][\w-]{0,31}$/i
const KIND = /^[a-z][a-z0-9-]{0,31}$/
const RESERVED = new Set(['__proto__', 'constructor', 'prototype'])

/** Returns why a location would be refused, or null when it is plain JSON within the limits. */
export function checkQuoteLocation(value) {
  let nodes = 0
  let keys = 0
  const visit = (item, depth) => {
    if (++nodes > LIMITS.nodes)
      return 'too many values'
    if (item === null || typeof item === 'boolean')
      return null
    if (typeof item === 'number')
      return Number.isFinite(item) ? null : 'numbers must be finite'
    if (typeof item === 'string')
      return item.length <= LIMITS.string ? null : 'string too long'
    if (typeof item !== 'object')
      return 'only JSON values are allowed'
    if (depth >= LIMITS.depth)
      return 'nested too deeply'
    if (Object.getOwnPropertySymbols(item).length)
      return 'symbol keys are not allowed'
    const names = Object.keys(item)
    if (names.some(name => !('value' in Object.getOwnPropertyDescriptor(item, name))))
      return 'accessors are not allowed'
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || item.length > LIMITS.items || names.length !== item.length)
        return 'invalid array'
      for (const entry of item) {
        const issue = visit(entry, depth + 1)
        if (issue)
          return issue
      }
      return null
    }
    const prototype = Object.getPrototypeOf(item)
    if (prototype !== Object.prototype && prototype !== null)
      return 'only plain objects are allowed'
    keys += names.length
    if (keys > LIMITS.keys)
      return 'too many keys'
    for (const name of names) {
      if (!KEY.test(name) || RESERVED.has(name))
        return 'invalid key'
      const issue = visit(item[name], depth + 1)
      if (issue)
        return issue
    }
    return null
  }
  const issue = visit(value, 0)
  if (issue)
    return issue
  return new TextEncoder().encode(JSON.stringify(value)).length <= LIMITS.bytes ? null : 'serialized location too large'
}

/**
 * Captures the selection and returns { id, defaultId, targets: [{ id, label }] }; let the user pick a target
 * (or use defaultId) and then call addQuote. Throws before calling the host when the input would be refused.
 */
export function captureQuote(context, { text, kind, location }) {
  if (typeof text !== 'string' || !text.trim() || text.length > QUOTE_TEXT_LIMIT)
    throw new Error('DOCUMENT_QUOTE_TEXT_INVALID')
  if (!KIND.test(kind))
    throw new Error('DOCUMENT_QUOTE_KIND_INVALID')
  if (checkQuoteLocation(location))
    throw new Error('DOCUMENT_QUOTE_LOCATION_INVALID')
  return context.composer.captureQuote(context.resource, { text, kind, location })
}

/** Adds a captured quote to the chosen draft. Resolves to 'added', 'duplicate', 'limit' or 'unavailable'. */
export function addQuote(context, capture, targetId) {
  return context.composer.addQuote(capture.id, targetId)
}
