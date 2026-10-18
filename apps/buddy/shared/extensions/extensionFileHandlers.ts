import type { ExtensionManifest } from './extensionManifest'

export type ExtensionViewContribution = ExtensionManifest['contributes']['views'][number]
export interface ExtensionFileHandlerSource {
  enabled: boolean
  compatible: boolean
  manifest: ExtensionManifest
}
export interface ExtensionFileHandler {
  id: string
  manifest: ExtensionManifest
  view: ExtensionViewContribution
}

// A name without a dot has no extension: "pptx" is a file name, not a presentation.
export function fileExtensionOf(path: string): string | null {
  const match = /\.([^./\\]+)$/.exec(path)
  return match ? match[1]!.toLowerCase() : null
}

// `accepts.extensions` is the only thing that makes a plugin take over a file type.
export function matchFileHandlers(sources: Iterable<ExtensionFileHandlerSource>, path: string): ExtensionFileHandler[] {
  const extension = fileExtensionOf(path)
  if (!extension)
    return []
  const handlers: ExtensionFileHandler[] = []
  for (const source of sources) {
    if (!source.enabled || !source.compatible)
      continue
    for (const view of source.manifest.contributes.views) {
      if (view.accepts?.extensions.includes(extension))
        handlers.push({ id: source.manifest.id, manifest: source.manifest, view })
    }
  }
  return handlers
}

// Several matching views are ambiguous: nothing chooses for the user, so the file stays in the built-in preview.
export function resolveFileHandler(sources: Iterable<ExtensionFileHandlerSource>, path: string): ExtensionFileHandler | null {
  const handlers = matchFileHandlers(sources, path)
  return handlers.length === 1 ? handlers[0]! : null
}
