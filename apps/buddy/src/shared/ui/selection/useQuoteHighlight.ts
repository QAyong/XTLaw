import { onScopeDispose } from 'vue'
import { findQuoteTextRanges, scrollQuoteRange } from './quoteText'

const highlightDuration = 2400

export function useQuoteHighlight(highlightName: string) {
  let current: Highlight | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function clear() {
    clearTimeout(timer)
    timer = undefined
    if (current && CSS.highlights.get(highlightName) === current)
      CSS.highlights.delete(highlightName)
    current = null
  }

  function show(body: HTMLElement, quote: { text: string, textOffset?: number }, root: HTMLElement): boolean {
    clear()
    const ranges = findQuoteTextRanges(body, quote)
    if (!ranges.length)
      return false
    current = new Highlight(...ranges)
    CSS.highlights.set(highlightName, current)
    scrollQuoteRange(ranges[0]!, root)
    timer = setTimeout(clear, highlightDuration)
    return true
  }

  onScopeDispose(clear)
  return { show, clear }
}
