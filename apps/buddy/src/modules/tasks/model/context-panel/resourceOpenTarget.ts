import type { SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskContextTab } from './taskContextPanel'

export type ResourceOpenTarget
  = | { key: string, kind: 'directory', directory: SpaceFileTarget }
    | { key: string, kind: 'artifact', artifact: { conversationId: string, artifactId: string }, file: boolean }

export function resourceOpenTarget(tab: TaskContextTab | null): ResourceOpenTarget | null {
  if (tab?.kind === 'files') {
    const directory = { ...tab.target, path: '' }
    return { key: JSON.stringify([tab.id, directory]), kind: 'directory', directory }
  }
  if (tab?.kind === 'artifact') {
    const artifact = { conversationId: tab.artifact.conversationId, artifactId: tab.artifact.artifactId }
    return { key: JSON.stringify([tab.id, artifact, tab.artifact.updatedAt]), kind: 'artifact', artifact, file: tab.artifact.kind === 'file' }
  }
  return null
}
