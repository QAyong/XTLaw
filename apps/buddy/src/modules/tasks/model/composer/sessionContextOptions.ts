import type { LocalConversationSummary } from '@buddy-shared/conversation/conversationApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { ChatComposerSessionScope, ChatPromptContextOption } from '@/modules/prompt-input'
import { BUDDY_SESSION_REFERENCE_TITLE_LIMIT } from '@buddy-shared/conversation/buddyUserContent'

export function createSessionContextOptions(input: {
  conversations: readonly LocalConversationSummary[]
  spaces: readonly LocalSpace[]
  activeConversationId: string | null
  query: string
  scope?: ChatComposerSessionScope
  noSpaceTitle: string
  untitled: string
}): ChatPromptContextOption[] {
  const tasks = input.conversations.filter(task => !task.deletedAt && task.id !== input.activeConversationId)
  const query = input.query.trim().toLocaleLowerCase()
  const title = (task: LocalConversationSummary) => (task.title?.trim() || input.untitled).slice(0, BUDDY_SESSION_REFERENCE_TITLE_LIMIT)
  if (input.scope) {
    return tasks.filter(task => task.spaceId === input.scope!.spaceId && title(task).toLocaleLowerCase().includes(query)).map(task => ({
      kind: 'sessionReference',
      category: 'sessions',
      label: title(task),
      value: task.id,
      path: null,
      description: null,
      sessionReference: { id: task.id, title: title(task) },
    }))
  }
  return [...input.spaces.map(space => ({ spaceId: space.id, title: space.name })), { spaceId: null, title: input.noSpaceTitle }]
    .filter(scope => scope.title.toLocaleLowerCase().includes(query) || tasks.some(task => task.spaceId === scope.spaceId && title(task).toLocaleLowerCase().includes(query)))
    .map(scope => ({
      kind: 'sessionGroup',
      category: 'sessions',
      label: scope.title,
      value: `sessions:${scope.spaceId ?? ''}`,
      path: null,
      description: null,
      sessionScope: scope,
    }))
}
