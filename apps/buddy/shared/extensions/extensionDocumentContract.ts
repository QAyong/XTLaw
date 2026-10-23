import type { ExtensionManifest } from './extensionManifest'
import { compare, minVersion } from 'semver'
import { documentPermissionCapabilities, workbenchDocumentCapabilities } from '../workbench/workbenchDocumentCapabilities'

export interface DocumentContractReport {
  /** Capability names from the registry that this manifest relies on, with the first XTLaw version that has each. */
  capabilities: { name: string, since: string }[]
  /** Things that will not behave as the author probably expects. They never block checking or packing. */
  warnings: string[]
}
export interface DocumentContractOptions {
  files: readonly { path: string, size: number }[]
  /** Development folders are exempt from the third-party WebAssembly limits. */
  development: boolean
  /** File types already taken over by plugins that ship with XTLaw. */
  bundledHandlers: readonly { id: string, name: string, extensions: readonly string[] }[]
}

// Authoring-time view of the document-processor contract (document-processor.md). The host enforces the same rules when
// installing; this reports them earlier and also points at problems the host only meets at run time.
export function documentContractReport(manifest: ExtensionManifest, options: DocumentContractOptions): DocumentContractReport {
  const warnings: string[] = []
  const used: (keyof typeof workbenchDocumentCapabilities)[] = []
  const handlerViews = manifest.contributes.views.filter(view => view.accepts)
  if (handlerViews.length)
    used.push('documents.handler')
  for (const [permission, rule] of Object.entries(documentPermissionCapabilities)) {
    if (manifest.permissions[permission as keyof typeof documentPermissionCapabilities])
      used.push(rule.capability)
  }
  if (!used.length)
    return { capabilities: [], warnings }

  if (manifest.permissions.composerReference && !handlerViews.length)
    warnings.push('composerReference only works for files this plugin takes over; no view declares accepts, so quotes will be refused.')

  const seen = new Map<string, string>()
  for (const view of handlerViews) {
    for (const extension of view.accepts!.extensions) {
      const other = seen.get(extension)
      if (other && other !== view.id)
        warnings.push(`Views ${other} and ${view.id} both accept .${extension}: the host treats this as ambiguous and leaves such files in the built-in preview.`)
      seen.set(extension, view.id)
    }
  }
  for (const handler of options.bundledHandlers) {
    if (handler.id === manifest.id)
      continue
    const shared = [...seen.keys()].filter(extension => handler.extensions.includes(extension))
    if (shared.length)
      warnings.push(`${handler.name} (bundled) also accepts ${shared.map(extension => `.${extension}`).join(', ')}: while both are enabled these files stay in the built-in preview.`)
  }

  const floor = minVersion(manifest.engines.lexora)
  const late = used.filter(name => floor && floor.compare(workbenchDocumentCapabilities[name].since) < 0)
  if (floor && late.length) {
    const needed = late.map(name => workbenchDocumentCapabilities[name].since).sort(compare).at(-1)
    warnings.push(`engines.lexora starts at ${floor.version}, but ${late.map(name => `${name} (XTLaw ${workbenchDocumentCapabilities[name].since})`).join(', ')} appeared later; raise the minimum to at least ${needed} so older versions do not install the plugin without them.`)
  }

  return { capabilities: used.map(name => ({ name, since: workbenchDocumentCapabilities[name].since })), warnings }
}
