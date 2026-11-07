import type { DesktopContextPanelMode } from '@buddy-electron/shared/desktopApi'

export interface ContextPanePlacementState {
  contextOnLeft: boolean
  chatPaneHidden: boolean
}

// Only tasks whose resource panel was swapped to the left are stored; the standard layout needs no record.
export function serializeContextPanePlacements(states: ReadonlyMap<string, ContextPanePlacementState>): Record<string, true> {
  return Object.fromEntries([...states].filter(([, state]) => state.contextOnLeft).map(([scope]) => [scope, true as const]))
}

export function readContextPanePlacements(value: unknown): Map<string, ContextPanePlacementState> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return new Map()
  return new Map(Object.entries(value).filter(([scope, left]) => scope && left === true).map(([scope]) => [scope, { contextOnLeft: true, chatPaneHidden: false }]))
}

export function resolveContextPanePlacementOnChange(input: {
  mode: DesktopContextPanelMode
  previousMode: DesktopContextPanelMode
  taskChanged: boolean
  current: ContextPanePlacementState
  savedTaskState?: ContextPanePlacementState | null
}): ContextPanePlacementState {
  if (input.mode === 'task' && (input.mode !== input.previousMode || input.taskChanged)) {
    return input.savedTaskState ?? { contextOnLeft: false, chatPaneHidden: false }
  }
  return input.current
}

export function isDraftPlacementAdoption(input: {
  previousScope: string | null | undefined
  nextScope: string | null | undefined
  draftId: string
  conversationId: string
}): boolean {
  return input.previousScope === `draft:${input.draftId}` && input.nextScope === `task:${input.conversationId}`
}

// First send changes the scope key, not the task the user laid out. Carry the draft placement forward before that key change is observed.
export function adoptContextPanePlacement(
  states: Map<string, ContextPanePlacementState>,
  draftId: string,
  conversationId: string,
  current?: ContextPanePlacementState,
): void {
  const from = `draft:${draftId}`
  const to = `task:${conversationId}`
  if (states.has(to)) {
    states.delete(from)
    return
  }
  const source = current ?? states.get(from)
  if (!source)
    return
  states.set(to, { ...source })
  states.delete(from)
}
