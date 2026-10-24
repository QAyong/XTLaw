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
