import type { ConversationRepository } from '../storage/conversationRepository'
import { readBuddyUserMessageContent } from '../../../shared/conversation/buddyUserContent'

/** How many hops below the sessions attached in the conversation the user's own references are followed. */
export const MAX_REFERENCE_DEPTH = 3
/** Upper bound on the sessions one conversation message can reach, directly or through references. */
export const MAX_REFERENCED_SESSIONS = 24

export interface ReferenceLink {
  readonly depth: number
  /**
   * The session whose active branch carried the user's reference to this one, with the branch that
   * was read. `null` for sessions attached in the conversation itself.
   */
  readonly via: { readonly sessionId: string, readonly branchId: string } | null
}

/**
 * Follows references the user attached inside referenced sessions.
 *
 * Only `sessionReferences` the user explicitly attached to a user message on a session's active
 * branch are followed; nothing else becomes reachable. Deleted sessions are not expanded, cycles
 * and the current conversation are skipped, and depth and size are bounded.
 */
export function expandReferenceChain(
  conversations: Pick<ConversationRepository, 'findById' | 'listBranchMessages'>,
  direct: Iterable<string>,
  currentConversationId: string,
): Map<string, ReferenceLink> {
  const links = new Map<string, ReferenceLink>()
  for (const id of direct) {
    if (id !== currentConversationId)
      links.set(id, { depth: 0, via: null })
  }
  let frontier = [...links.keys()]
  for (let depth = 0; depth < MAX_REFERENCE_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      const source = conversations.findById(id)
      if (!source || source.deletedAt !== null || !source.activeBranchId)
        continue
      for (const message of conversations.listBranchMessages(id, source.activeBranchId)) {
        if (message.role !== 'user')
          continue
        for (const reference of readBuddyUserMessageContent(message.content)?.userContent.sessionReferences ?? []) {
          if (reference.id === currentConversationId || links.has(reference.id) || links.size >= MAX_REFERENCED_SESSIONS)
            continue
          links.set(reference.id, { depth: depth + 1, via: { sessionId: id, branchId: source.activeBranchId } })
          next.push(reference.id)
        }
      }
    }
    frontier = next
  }
  return links
}
