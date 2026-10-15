import { resourceQuoteText } from '../../../shared/conversation/buddyResourceQuoteText'
import { readBuddyUserMessageContent } from '../../../shared/conversation/buddyUserContent'
import { escapeLiteralMarkers, projectBuddyUserText, sessionReferenceText } from '../../../shared/conversation/buddyUserReferenceText'

export function createSessionQuery(query = '') {
  const normalized = query.trim().toLowerCase()
  const terms = [...new Set(normalized.split(/\s+/u).filter(Boolean))]
  return (text: string): number => {
    if (!normalized)
      return 0
    const lower = text.toLowerCase()
    const phrase = lower.indexOf(normalized)
    if (phrase >= 0)
      return phrase
    const positions = terms.map(term => lower.indexOf(term))
    return positions.every(position => position >= 0) ? Math.min(...positions) : -1
  }
}

export function sessionMessageText(role: string, content: unknown): string {
  if (role === 'user') {
    const structured = readBuddyUserMessageContent(content)
    if (structured)
      return [projectBuddyUserText(structured.userContent), ...(structured.userContent.quotes ?? []).map(quote => escapeLiteralMarkers(quote.text)), resourceQuoteText(structured.userContent.resourceQuotes), sessionReferenceText(structured.userContent)].filter(Boolean).join('\n')
  }
  if (typeof content === 'string')
    return role === 'user' ? escapeLiteralMarkers(content) : content
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const text = (content as Record<string, unknown>).text
    return typeof text === 'string' ? text : ''
  }
  return ''
}

export function sessionMessageReferences(role: string, content: unknown) {
  return role === 'user' ? readBuddyUserMessageContent(content)?.userContent.sessionReferences ?? [] : []
}

export function readSessionText(text: string, offset = 0, limit = 12000) {
  if (offset > text.length)
    throw new Error('SESSION_REFERENCE_OFFSET_OUT_OF_RANGE')
  const end = Math.min(text.length, offset + limit)
  return { text: text.slice(offset, end), offset, totalCharacters: text.length, nextOffset: end < text.length ? end : null }
}
