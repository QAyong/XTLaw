export const INITIAL_DRAFT_DEFERRED_KEY = 'initialDraftDeferred'

interface InitialDraftLayout {
  source: 'startup' | 'onboarding'
  restored: boolean
  hasView: boolean
  deferred: boolean
}

interface InitialDraftHistory {
  activeConversationId: string | null
  spaceId: string | null
}

type InitialDraftGate = 'skip' | 'clear' | 'settle'

type InitialDraftAction
  = { type: 'defer' }
    | { type: 'open', id: string }
    | { type: 'create', spaceId: string | null }

function initialDraftGate(layout: InitialDraftLayout): InitialDraftGate {
  if (layout.hasView)
    return layout.deferred ? 'clear' : 'skip'
  if (layout.source === 'onboarding')
    return layout.deferred ? 'settle' : 'skip'
  return layout.restored && !layout.deferred ? 'skip' : 'settle'
}

function initialDraftAction(input: {
  onboardingCompleted: boolean | undefined
  history: InitialDraftHistory | null
}): InitialDraftAction {
  if (input.history?.activeConversationId)
    return { type: 'open', id: input.history.activeConversationId }
  if (input.onboardingCompleted === false)
    return { type: 'defer' }
  return { type: 'create', spaceId: input.history?.spaceId ?? null }
}

export async function runInitialDraftSettlement(options: {
  source: 'startup' | 'onboarding'
  restored: boolean
  hasView: () => boolean
  workspaceReady: () => boolean
  deferred: () => boolean
  onboardingCompleted: () => boolean | undefined
  readWorkspace: () => Promise<InitialDraftHistory | null>
  openTask: (id: string) => Promise<void>
  createDraft: (spaceId: string | null) => Promise<void>
  setDeferred: () => void
  clearDeferred: () => void
}): Promise<void> {
  const gate = initialDraftGate({
    source: options.source,
    restored: options.restored,
    hasView: options.hasView(),
    deferred: options.deferred(),
  })
  if (gate === 'skip')
    return
  if (gate === 'clear') {
    options.clearDeferred()
    return
  }
  const history = await options.readWorkspace()
  // The onboarding screen hides as soon as the setting is saved, so a manual task can appear during this read.
  if (options.hasView()) {
    if (options.workspaceReady())
      options.clearDeferred()
    return
  }
  const action = initialDraftAction({
    onboardingCompleted: options.onboardingCompleted(),
    history,
  })
  if (action.type === 'defer') {
    options.setDeferred()
    return
  }
  if (action.type === 'open')
    await options.openTask(action.id)
  else
    await options.createDraft(action.spaceId)
  if (options.workspaceReady())
    options.clearDeferred()
}
