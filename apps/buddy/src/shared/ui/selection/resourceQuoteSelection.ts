import type { BuddyTextQuote } from '@buddy-shared/conversation/buddyUserContent'
import { quoteExcludedSelector, readQuoteTextOffset } from './quoteText'

export function readResourceTextSelection(root: HTMLElement, selection: Selection | null, source: BuddyTextQuote['source']): BuddyTextQuote | null {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1)
    return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer))
    return null
  const excluded = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest(quoteExcludedSelector)
  if (excluded(range.startContainer) || excluded(range.endContainer)
    || Array.from(root.querySelectorAll(quoteExcludedSelector)).some(node => range.intersectsNode(node))) {
    return null
  }
  const text = selection.toString()
  if (!text.trim())
    return null
  return { id: crypto.randomUUID(), source, text, textOffset: readQuoteTextOffset(root, range) }
}
