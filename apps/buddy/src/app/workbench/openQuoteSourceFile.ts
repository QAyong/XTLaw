import type { FileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskResourcePanel } from '@/modules/tasks/contracts'

// "Locate source" on a file quote opens the file the way an output card does: in the file manager tab
// (Spec-035, Spec-043). A file outside the task's space has no such tab and opens on its own as before.
export function createQuoteSourceOpener(deps: {
  resources: () => TaskResourcePanel
  // Opens the file inside a file manager tab; concurrent calls for the same tab and file share one view.
  openInTab: (target: FileTarget, tabId: string) => Promise<string | null | undefined>
  openStandalone: (target: FileTarget, current: () => boolean) => Promise<string | null | undefined>
}) {
  return async (target: FileTarget, current: () => boolean, acceptTab: (tabId: string) => boolean = () => true): Promise<string | null | undefined> => {
    if (!current())
      return null
    const opened = deps.resources().openQuoteSourceFile(target)
    if (!opened)
      return deps.openStandalone(target, current)
    // The active tab changed on purpose; let the locate scope follow it before anything else is checked.
    if (!acceptTab(opened.tabId))
      return null
    return opened.viewId ?? deps.openInTab(opened.target, opened.tabId)
  }
}
