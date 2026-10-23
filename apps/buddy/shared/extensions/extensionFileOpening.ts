import type { FileOpeningLocation, FileOpeningProvider } from '../files/fileOpening'
import type { ExtensionManifest } from './extensionManifest'
import { z } from 'zod'
import { taskFileTargetSchema } from '../files/taskFileApi'
import { idSchema } from '../runtime/apiValidation'
import { spaceFileTargetSchema } from '../spaces/spaceFileApi'

export const extensionFileOpeningSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('space'), target: spaceFileTargetSchema }).strict(),
  z.object({ kind: z.literal('artifact'), artifactId: idSchema }).strict(),
  z.object({ kind: z.literal('task'), target: taskFileTargetSchema }).strict(),
])
export type ExtensionFileOpeningSource = z.infer<typeof extensionFileOpeningSourceSchema>

type FileHandler = ExtensionManifest['contributes']['fileHandlers'][number]

export interface ExtensionFileHandlerEntry {
  handler: FileHandler
  // Derived from a view's `accepts.extensions`: the plugin takes these files over by itself and never asks to become the default.
  implicit: boolean
}

export function implicitFileHandlerId(viewId: string): string {
  return `${viewId}.files`
}

// Declared handlers plus one implicit handler per view that lists `accepts.extensions`; a declared handler with the same ID wins.
export function extensionFileHandlers(manifest: ExtensionManifest): ExtensionFileHandlerEntry[] {
  const entries = manifest.contributes.fileHandlers.map(handler => ({ handler, implicit: false }))
  for (const view of manifest.contributes.views) {
    const id = implicitFileHandlerId(view.id)
    if (view.location !== 'context' || view.resource === 'none' || !view.accepts || entries.some(entry => entry.handler.id === id))
      continue
    entries.push({ implicit: true, handler: { id, title: view.title, extensions: view.accepts.extensions.map(extension => `.${extension}`), open: { view: view.id, requestDefault: false } } })
  }
  return entries
}

export function extensionFileHandlerBindings(handler: FileHandler) {
  const targets = [['inline', handler.preview], ['standalone', handler.open]] as const
  return targets.flatMap(([location, target]): { location: FileOpeningLocation, view: string, requestDefault: boolean }[] => target ? [{ location, ...target }] : [])
}

export function extensionFileOpeningProviders(manifest: ExtensionManifest, available: boolean): FileOpeningProvider[] {
  return extensionFileHandlers(manifest).map(({ handler, implicit }) => ({
    id: handler.id,
    title: handler.title,
    extensions: handler.extensions,
    locations: extensionFileHandlerBindings(handler).map(target => target.location),
    builtin: false,
    available,
    renderer: 'extension',
    extensionId: manifest.id,
    extensionName: manifest.name,
    viewTypes: Object.fromEntries(extensionFileHandlerBindings(handler).map(target => [target.location, target.view])),
    ...(implicit ? { implicit } : {}),
  }))
}
