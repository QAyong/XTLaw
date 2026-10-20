import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import { isTextArtifactMimeType } from '@buddy-shared/artifacts/artifactApi'

export function cleanChatToolFilePath(path: string): string {
  let cleaned = path.trim()
  if (cleaned.startsWith('sandbox:'))
    cleaned = cleaned.slice(8)
  else if (cleaned.startsWith('file:///'))
    cleaned = cleaned.slice(7)
  else if (cleaned.startsWith('file://'))
    cleaned = cleaned.slice(7)
  try {
    cleaned = decodeURIComponent(cleaned)
  }
  catch {}
  return cleaned.split('#')[0]!.split('?')[0]!
}

// Space file previews read at most 1 MiB of text and 8 MiB of image; larger outputs stay on the artifact tab, which reads more.
const SPACE_FILE_TEXT_PREVIEW_BYTES = 1024 * 1024
const SPACE_FILE_IMAGE_PREVIEW_BYTES = 8 * 1024 * 1024

export function fitsSpaceFilePreview(artifact: Pick<LocalArtifact, 'kind' | 'mimeType' | 'sizeBytes'>): boolean {
  if (artifact.kind !== 'file')
    return false
  if (artifact.mimeType.startsWith('image/'))
    return artifact.sizeBytes <= SPACE_FILE_IMAGE_PREVIEW_BYTES
  return !isTextArtifactMimeType(artifact.mimeType) || artifact.sizeBytes <= SPACE_FILE_TEXT_PREVIEW_BYTES
}

export function resolveChatArtifactTarget(artifacts: readonly LocalArtifact[], path: string): LocalArtifact | null {
  const normalized = cleanChatToolFilePath(path).replaceAll('\\', '/').replace(/^\/+([a-z]:\/)/i, '$1').replace(/^(\.\/)+/, '')
  if (!normalized || normalized.includes('\0') || normalized.split('/').includes('..')
    || (/^[a-z][a-z\d+.-]*:/i.test(normalized) && !/^[a-z]:\//i.test(normalized))) {
    return null
  }
  const absolute = normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)
  const matches = new Map<string, LocalArtifact>()
  for (const artifact of artifacts) {
    const target = artifact.path.replaceAll('\\', '/')
    const windows = /^[a-z]:\//i.test(target) || target.startsWith('//')
    const candidate = windows ? normalized.toLowerCase() : normalized
    const stored = windows ? target.toLowerCase() : target
    if (absolute ? stored === candidate : stored.endsWith(`/${candidate}`))
      matches.set(artifact.artifactId, artifact)
  }
  return matches.size === 1 ? matches.values().next().value! : null
}

export function resolveChatToolFileTarget(space: LocalSpace | null, path: string): SpaceFileTarget | null {
  const directory = space?.primaryDirectory
  if (!space || space.revokedAt || !directory || directory.revokedAt || !path || path.includes('\0'))
    return null
  let relative = cleanChatToolFilePath(path).replaceAll('\\', '/')
  if (relative.startsWith('/') || /^[a-z]:/i.test(relative)) {
    const roots = [directory.canonicalRoot, directory.root].map(root => root.replaceAll('\\', '/').replace(/\/+$/, ''))
    const windows = /^[a-z]:/i.test(roots[0]!) || roots[0]!.startsWith('//')
    const root = roots.find(root => (windows ? relative.toLowerCase() : relative)
      .startsWith(`${windows ? root.toLowerCase() : root}/`))
    if (root === undefined)
      return null
    relative = relative.slice(root.length + 1)
  }
  const segments = relative.split('/').filter(segment => segment && segment !== '.')
  if (!segments.length || segments.includes('..') || segments[0] === '~' || relative.includes(':'))
    return null
  return { spaceId: space.id, directoryId: directory.id, revision: directory.revision, path: segments.join('/') }
}
