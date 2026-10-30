import type { FileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskResourcePanel } from '@/modules/tasks/contracts'
import type { WorkbenchController } from '@/workbench/services/WorkbenchController'
import { readFileTarget, sameFileTarget } from '@buddy-shared/spaces/spaceFileApi'

// Card clicks should reveal an open Office editor without selecting its file-manager fallback.
// Keep manual file-manager selection and all other preview types unchanged.
export function revealOpenOfficeDocument(controller: WorkbenchController, resources: Pick<TaskResourcePanel, 'tabs' | 'openView'>, target: FileTarget): boolean {
  if (!/\.(?:docx|xlsx|pptx)$/i.test(target.path))
    return false
  for (const tab of resources.tabs.value) {
    if (tab.kind !== 'view')
      continue
    const view = controller.layout.views[tab.viewId]
    if (view?.location !== 'context' || view.resource.scheme !== 'extension' || !controller.registry.views.has(view.type))
      continue
    const file = readFileTarget(view.resource.data.fileTarget)
    if (!file || !sameFileTarget(file, target))
      continue
    resources.openView(view.id, view.title, tab.source)
    controller.focus(view.id)
    return true
  }
  return false
}
