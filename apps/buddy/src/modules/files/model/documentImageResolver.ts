import type { TaskFileTarget } from '@buddy-shared/files/taskFileApi'
import type { FileTarget } from '@buddy-shared/spaces/spaceFileApi'
import { fileMediaUrl, taskFileMediaUrl } from '@buddy-shared/files/mediaPreview'
import { documentRelativePath } from '@/shared/ui/markdown/markdownImage'

type SynchronousMarkdownImageResolver = (src: string) => string | null

// Images a document references by a path beside it load through the same media routes as the file itself, so the service keeps checking access.
export function fileImageResolver(target: FileTarget): SynchronousMarkdownImageResolver {
  return (src) => {
    const path = documentRelativePath(target.path, src)
    return path ? fileMediaUrl({ ...target, path }) : null
  }
}

export function taskFileImageResolver(target: TaskFileTarget): SynchronousMarkdownImageResolver {
  return (src) => {
    const path = documentRelativePath(target.path, src)
    return path ? taskFileMediaUrl({ conversationId: target.conversationId, path }) : null
  }
}
