import type { FileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskContextTab } from '@/modules/tasks'
import { toRaw } from 'vue'

// Remembers which target of each file-manager tab has already had its document opened, so returning to the tab does not open it again.
// Targets are compared by object identity: selecting a file again makes a new target, which opens its document again after the user closed it.
export class DocumentSelections {
  readonly #targets = new Map<string, FileTarget>()

  // A target restored at startup was handled by the run that saved it. Only a file selected from now on opens its document.
  seed(tabs: Iterable<TaskContextTab>): void {
    for (const tab of tabs) {
      if (tab.kind === 'files')
        this.#targets.set(tab.id, toRaw(tab.target))
    }
  }

  // True the first time the tab shows this target.
  claim(tabId: string, target: FileTarget): boolean {
    const raw = toRaw(target)
    if (this.#targets.get(tabId) === raw)
      return false
    this.#targets.set(tabId, raw)
    return true
  }
}
