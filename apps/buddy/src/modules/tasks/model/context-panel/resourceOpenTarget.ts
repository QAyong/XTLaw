import type { SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskContextTab } from './taskContextPanel'
import type { WorkbenchView } from '@/workbench/common/workbench'
import { spaceFileTargetSchema } from '@buddy-shared/spaces/spaceFileApi'

export type ResourceOpenTarget
  = | { key: string, kind: 'directory', directory: SpaceFileTarget }
    | { key: string, kind: 'file', target: SpaceFileTarget }
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
      ? spaceFileTargetSchema.safeParse(resource.data.fileTarget)
      : ['file', 'file-preview'].includes(resource.scheme) ? spaceFileTargetSchema.strip().safeParse(resource.data) : null
    if (parsed?.success && parsed.data.path)
      return { key: JSON.stringify([tab.id, parsed.data]), kind: 'file', target: parsed.data }
  }
  return null
}
