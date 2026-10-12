import type { BuddyUserContentV1 } from '../../../shared/conversation/buddyUserContent'
import { buddyPromptDirectiveToText, readBuddyUserMessageContent } from '../../../shared/conversation/buddyUserContent'

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
const stopWords = new Set(['的', '了', '是', '什么', '为什么', '怎么', '如何', '请', 'the', 'a', 'an', 'is', 'was', 'were', 'what', 'why', 'how', 'to', 'of', 'in', 'and'])

export function createSessionQuery(query = '') {
  const normalized = query.trim().toLocaleLowerCase()
  const terms = [...new Set([...segmenter.segment(normalized)].filter(part => part.isWordLike && !stopWords.has(part.segment)).map(part => part.segment))].slice(0, 24).toSorted((a, b) => b.length - a.length)
  return (text: string): number => {
    if (!normalized)
      return 0
    const lower = text.toLocaleLowerCase()
    const phrase = lower.indexOf(normalized)
    if (phrase >= 0)
      return phrase
    const matched = terms.find(term => lower.includes(term))
    return matched ? lower.indexOf(matched) : -1
  }
}

// Tasks a user attached to a message stay visible as text, the way the model saw them when it was sent: an inline
// [SESSION:id] marker plus the reference list. Searching for "Referenced tasks" lists every message that carried
// one. Literal markers typed by the user are escaped; authorization never reads this text.
function escapeSessionMarkers(text: string): string {
  return text.replace(/\[SESSION:[^\]\s]+\]/g, match => `［${match.slice(1, -1)}］`)
}

function userContentText(content: BuddyUserContentV1): string {
  const body = content.body.map(paragraph => paragraph.content.map((node) => {
    switch (node.type) {
      case 'text': return escapeSessionMarkers(node.text)
      case 'hard_break': return '\n'
      case 'resource_ref': return '@file'
      case 'actor_ref': return escapeSessionMarkers(`@${node.name}`)
      case 'session_ref': return `[SESSION:${node.sessionId}]`
      case 'prompt_directive': return escapeSessionMarkers(buddyPromptDirectiveToText(node))
      default: return node satisfies never
    }
  }).join('')).join('\n')
  const references = content.sessionReferences?.length ? `Referenced tasks: ${JSON.stringify(content.sessionReferences)}` : ''
  return [body, references].filter(Boolean).join('\n')
}

export function sessionMessageText(role: string, content: unknown): string {
  if (role === 'user') {
    const structured = readBuddyUserMessageContent(content)
    if (structured)
      return [userContentText(structured.userContent), ...(structured.userContent.quotes ?? []).map(quote => quote.text)].filter(Boolean).join('\n')
  }
  if (typeof content === 'string')
    return content
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const text = (content as Record<string, unknown>).text
    return typeof text === 'string' ? text : ''
  }
  return ''
}

export function readSessionText(text: string, offset = 0, limit = 12000) {
  if (offset > text.length)
    throw new Error('SESSION_REFERENCE_OFFSET_OUT_OF_RANGE')
  const end = Math.min(text.length, offset + limit)
  return { text: text.slice(offset, end), offset, totalCharacters: text.length, nextOffset: end < text.length ? end : null }
}
