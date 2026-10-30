import type { DesktopContextPanelMode } from '@buddy-electron/shared/desktopApi'
import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { ContextPanelSource } from '@buddy-shared/context-panel/contextPanel'
import type { FileTarget } from '@buddy-shared/spaces/spaceFileApi'

export type ContextPanelScope = `task:${string}` | `draft:${string}` | 'independent' | 'workspace'
export type ContextPanelSelectionScope = ContextPanelScope | `space:${string}`

export function contextPanelSelectionScope(mode: DesktopContextPanelMode, scope: ContextPanelScope, spaceIds: ReadonlyMap<string, string | null>): ContextPanelSelectionScope {
  if (mode === 'independent')
    return 'independent'
  const spaceId = mode === 'space' ? spaceIds.get(scope) : null
  return spaceId ? `space:${spaceId}` : scope
}

interface ContextTabSource {
  pinned?: boolean
  scope: ContextPanelScope
  source?: ContextPanelSource
}

export interface TaskChangesContextTab extends ContextTabSource {
  branchId: string | null
  revision: string
  changeSet: LocalChangeSetSummary | null
  conversationId: string
  id: string
  kind: 'changes'
}

export interface TaskBrowserContextTab extends ContextTabSource {
  conversationId: string | null
  id: string
  kind: 'browser'
  browserKey?: string
}

export interface TaskFilesContextTab extends ContextTabSource {
  id: string
  kind: 'files'
  target: FileTarget
  rootName: string
  // Where "locate" points in the tree; selecting a file clears it.
  treeTarget?: { path: string, kind: 'file' | 'directory' }
  // A folder to open in the tree; a new token asks to expand it again after the user collapsed it.
  expand?: { path: string, token: string }
  // Shows or folds the tree pane; a new token applies it again after the user toggled the pane.
  tree?: { visible: boolean, token: string }
}

export interface TaskViewContextTab extends ContextTabSource {
  dirty?: boolean
  id: string
  kind: 'view'
  viewId: string
  label: string
}

export interface ContextPanelTab {
  pinned?: boolean
  dirty?: boolean
  favicon?: string | null
  id: string
  title: string
  icon: 'file' | 'folder' | 'changes' | 'browser'
  fileName?: string
}

export type TaskContextTab = TaskBrowserContextTab
  | TaskChangesContextTab
  | TaskFilesContextTab
  | TaskViewContextTab

export function spaceTaskBrowserTab(
  conversationId: string | null,
): TaskBrowserContextTab | null {
  return conversationId
    ? {
        conversationId,
        scope: taskContextPanelScope(conversationId),
        id: browserTabId(conversationId),
        kind: 'browser',
      }
    : null
}

export function browserTabId(conversationId: string | null, browserKey?: string): string {
  const prefix = conversationId === null ? 'browser:manual' : `browser:${conversationId}`
  return browserKey ? `${prefix}:${browserKey}` : prefix
}

export function changeTabId(conversationId: string): string {
  return `changes:${conversationId}`
}

export function taskContextPanelScope(conversationId: string): ContextPanelScope {
  return `task:${conversationId}`
}

export function contextTabSource(tab: TaskContextTab | null): ContextPanelSource | null {
  const source = tab?.kind === 'changes' ? tab.changeSet ?? tab.source : tab?.source
  return source ? { conversationId: source.conversationId, runId: source.runId } : null
}
