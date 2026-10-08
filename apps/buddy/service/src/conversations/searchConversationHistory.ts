import type { ConversationRecord } from '../storage/conversationRecord'
import type { ConversationRepository } from '../storage/conversationRepository'
import { setImmediate } from 'node:timers/promises'
import { createSessionQuery, sessionMessageText } from './sessionReferenceText'

const MAX_RESULTS = 8
const MAX_SCANNED = 500
const EXCERPT_LENGTH = 1600

export async function searchConversationHistory(
  conversations: Pick<ConversationRepository, 'findById' | 'listMessagePage'>,
  target: ConversationRecord,
  input: { query?: string, beforeMessageId?: string },
  signal?: AbortSignal,
) {
  const matchQuery = createSessionQuery(input.query)
  const matches: Array<{ source: { kind: 'message', messageId: string }, messageId: string, role: string, createdAt: string, excerpt: string, offset: number }> = []
  let cursor = input.beforeMessageId
  let scanned = 0
  let nextBeforeMessageId: string | null = null
  do {
    signal?.throwIfAborted()
    const current = conversations.findById(target.id)
    if (!current || current.deletedAt !== null || current.activeBranchId !== target.activeBranchId)
      throw new Error('SESSION_REFERENCE_UNAVAILABLE')
    const page = conversations.listMessagePage(target.id, target.activeBranchId!, { beforeMessageId: cursor, limit: 50 })
    for (const message of page.items.toReversed()) {
      scanned += 1
      if (message.role !== 'user' && message.role !== 'assistant')
        continue
      const text = sessionMessageText(message.role, message.content)
      if (!text)
        continue
      const anchor = matchQuery(text)
      if (anchor < 0)
        continue
      const start = Math.max(0, anchor - 300)
      matches.push({
        source: { kind: 'message', messageId: message.id },
        offset: start,
        messageId: message.id,
        role: message.role,
        createdAt: message.createdAt,
        excerpt: `${start ? '…' : ''}${text.slice(start, start + EXCERPT_LENGTH)}${text.length > start + EXCERPT_LENGTH ? '…' : ''}`,
      })
      if (matches.length === MAX_RESULTS) {
        nextBeforeMessageId = message.id
        break
      }
    }
    if (matches.length === MAX_RESULTS)
      break
    nextBeforeMessageId = page.nextBeforeMessageId
    cursor = page.nextBeforeMessageId ?? undefined
    if (cursor && scanned < MAX_SCANNED)
      await setImmediate(undefined, { signal })
  } while (cursor && scanned < MAX_SCANNED)
  signal?.throwIfAborted()
  return {
    sessionId: target.id,
    title: target.title,
    branchId: target.activeBranchId,
    matches,
    scanned,
    nextBeforeMessageId,
  }
}
