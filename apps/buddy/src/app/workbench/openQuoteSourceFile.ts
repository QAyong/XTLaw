import type { FileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskResourcePanel } from '@/modules/tasks/contracts'

// "Locate source" on a file quote opens it in the matching space or granted-directory file manager tab (Spec-035, Spec-043).
export function createQuoteSourceOpener(deps: {
  resources: () => TaskResourcePanel
  // Opens the file inside a file manager tab; concurrent calls for the same tab and file share one view.
  openInTab: (target: FileTarget, tabId: string) => Promise<string | null | undefined>
}) {
  return async (target: FileTarget, current: () => boolean, acceptTab: (tabId: string) => boolean = () => true): Promise<string | null | undefined> => {
    if (!current())
      return null
    const opened = deps.resources().openQuoteSourceFile(target)
    if (!opened)
      return null
    // The active tab changed on purpose; let the locate scope follow it before anything else is checked.
    if (!acceptTab(opened.tabId))
      return null
    return opened.viewId ?? deps.openInTab(opened.target, opened.tabId)
  }
}
