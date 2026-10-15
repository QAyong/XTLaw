import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'
import { useQuoteHighlight } from '@/shared/ui/selection/useQuoteHighlight'
import { chatQuoteBodySelector } from './chatQuoteText'

export function useChatQuoteHighlight() {
  const highlight = useQuoteHighlight('buddy-message-quote')
  return { clear: highlight.clear, show(source: HTMLElement, quote: BuddyMessageQuote, root: HTMLElement) {
    const body = source.querySelector<HTMLElement>(chatQuoteBodySelector)
    return !!body && highlight.show(body, quote, root)
  } }
}
