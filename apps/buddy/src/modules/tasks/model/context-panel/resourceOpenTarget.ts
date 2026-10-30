import type { FileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskContextTab } from './taskContextPanel'
import type { WorkbenchView } from '@/workbench/common/workbench'
import { readFileTarget } from '@buddy-shared/spaces/spaceFileApi'

export type ResourceOpenTarget
  = | { key: string, kind: 'directory', directory: FileTarget }
    | { key: string, kind: 'file', target: FileTarget }
    | { key: string, kind: 'artifact', artifact: { conversationId: string, artifactId: string }, file: boolean }

export function resourceOpenTarget(tab: TaskContextTab | null, view?: Pick<WorkbenchView, 'id' | 'resource'> | null): ResourceOpenTarget | null {
  if (tab?.kind === 'files') {
    const directory = { ...tab.target, path: '' }
    return { key: JSON.stringify([tab.id, directory]), kind: 'directory', directory }
  }
  if (tab?.kind === 'artifact') {
    const artifact = { conversationId: tab.artifact.conversationId, artifactId: tab.artifact.artifactId }
    return { key: JSON.stringify([tab.id, artifact, tab.artifact.updatedAt]), kind: 'artifact', artifact, file: tab.artifact.kind === 'file' }
  }
  if (tab?.kind === 'view' && view?.id === tab.viewId) {
    const resource = view.resource
    const parsed = resource.scheme === 'extension'
      ? readFileTarget(resource.data.fileTarget)
      : ['file', 'file-preview'].includes(resource.scheme) ? readFileTarget(resource.data) : null
    if (parsed?.path)
      return { key: JSON.stringify([tab.id, parsed]), kind: 'file', target: parsed }
  }
  return null
}
