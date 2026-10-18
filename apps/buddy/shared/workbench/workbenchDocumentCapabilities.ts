// XTLaw document-processor capabilities, registered by name for plugin authoring and capability queries.
// Upstream Lexora supports API 1-3 only; `apiVersion: 4` is XTLaw's own switch for these manifest fields, so authors
// should rely on the capability name and `since`, not on the number. See document-processor.md in the plugin-creator skill.

interface DocumentCapabilityDefinition {
  title: { 'zh-CN': string, 'en-US': string }
  scope: 'resource'
  description: string
  /** First XTLaw application version that includes the capability. */
  since: string
  /** What the manifest must declare to use it. */
  requires: string
}

export const workbenchDocumentCapabilities = {
  'documents.handler': {
    title: { 'zh-CN': '文档处理器（接管文件格式）', 'en-US': 'Document handler (file type takeover)' },
    scope: 'resource',
    description: 'A selected-file context view declares accepts:{extensions:[...]} (lowercase, 1-16 characters, at most 16 per view). accepts.extensions is the only thing that makes the plugin open those files. The host hands the file over as a read-only context.resource handle when exactly one enabled, compatible view accepts the extension; none or several (including two views of one plugin) leave the file in the built-in preview. Reads are 128 KiB at a time, 64 MiB per file, with authorization checked on every read and a failure if the file changes meanwhile. See document-processor.md.',
    since: '0.2.0',
    requires: 'apiVersion 4; permissions.selectedResource "read"; a view with resource "selected-file", location "context" and accepts.extensions',
  },
  'documents.writeBack': {
    title: { 'zh-CN': '写回当前文件', 'en-US': 'Write back the current file' },
    scope: 'resource',
    description: 'permissions.selectedResourceWrite lets the view that opened a file save it with resources.saveFile({name,data,resource:context.resource}), at most 64 MiB. The host requires the whole file to have been read first, checks directory authorization, file version and content hash on every save, refuses to overwrite a file changed outside the plugin, and allows only the file of that view. Third-party plugins may declare it; the install review marks it high risk. See document-processor.md.',
    since: '0.2.0',
    requires: 'apiVersion 4; permissions.selectedResourceWrite true; permissions.selectedResource "read"',
  },
  'documents.reference': {
    title: { 'zh-CN': '选区引用到聊天', 'en-US': 'Selection reference to chat' },
    scope: 'resource',
    description: 'permissions.composerReference lets the view call context.composer.captureQuote(resource,{text,kind,location}) then addQuote(id,targetId). text is at most 32768 characters; kind matches ^[a-z][a-z0-9-]{0,31}$; location is plain JSON of at most 4096 bytes, 4 levels, 32 keys, 64 items per array and 512 characters per string. The host adds the plugin ID, accepts only files the view accepts, and reopens the file in the same plugin when the quote card is clicked (the stored kind and location are not handed back to the view yet). The model sees the text, the file and the kind, never the location. DOCX/PPTX {indexes,from,to} and XLSX {cells} remain accepted. See document-processor.md.',
    since: '0.2.0',
    requires: 'apiVersion 4; permissions.composerReference true; permissions.selectedResource "read"; the generic extension quote format needs XTLaw 0.2.3',
  },
  'documents.export': {
    title: { 'zh-CN': '另存为 / 导出', 'en-US': 'Save as / export' },
    scope: 'resource',
    description: 'permissions.resourceExport lets a view call resources.saveFile({name,data}) without a resource: every call opens the system save dialog and the user picks the target; cancelling returns false. It grants no permission to overwrite the opened file (that is documents.writeBack). See document-processor.md.',
    since: '0.2.0',
    requires: 'permissions.resourceExport true',
  },
  'documents.webAssembly': {
    title: { 'zh-CN': 'WebAssembly（第三方有限额）', 'en-US': 'WebAssembly (limited for third parties)' },
    scope: 'resource',
    description: 'permissions.webAssembly adds script-src wasm-unsafe-eval and blob: workers to the plugin view page only; JS eval stays forbidden and .wasm files must ship in the package. Any plugin may declare it. Plugins that are not bundled/official (and not a development directory) may ship at most 4 .wasm files, 24 MiB in total; the install review rejects more with EXTENSION_WEBASSEMBLY_LIMIT. Memory, CPU and worker counts are not enforced by the host, and the install review marks the permission high risk for third parties. See document-processor.md.',
    since: '0.2.3',
    requires: 'permissions.webAssembly true; third-party packages: at most 4 .wasm files and 24 MiB in total',
  },
} as const satisfies Record<string, DocumentCapabilityDefinition>

export type WorkbenchDocumentCapability = keyof typeof workbenchDocumentCapabilities

interface DocumentManifestShape {
  apiVersion: number
  permissions: { selectedResource: string, selectedResourceWrite: boolean, composerReference: boolean, resourceExport: boolean, webAssembly: boolean }
  contributes: { views: readonly { resource: string, location: string, accepts?: unknown }[] }
}
type DocumentPermission = 'selectedResourceWrite' | 'composerReference' | 'resourceExport' | 'webAssembly'

// How the manifest validator and the upgrade comparison read the registry: which permission guards which capability,
// and what the manifest must have declared next to it. resourceExport and webAssembly have no constraint beyond being declared.
export const documentPermissionCapabilities: Record<DocumentPermission, { capability: WorkbenchDocumentCapability, apiVersion: number, selectedResourceRead: boolean, issue: string }> = {
  selectedResourceWrite: { capability: 'documents.writeBack', apiVersion: 4, selectedResourceRead: true, issue: 'Writing the selected file requires API 4 and selected-resource read permission' },
  composerReference: { capability: 'documents.reference', apiVersion: 4, selectedResourceRead: true, issue: 'Adding file references requires API 4 and selected-resource read permission' },
  resourceExport: { capability: 'documents.export', apiVersion: 1, selectedResourceRead: false, issue: '' },
  webAssembly: { capability: 'documents.webAssembly', apiVersion: 1, selectedResourceRead: false, issue: '' },
}
const documentPermissions = Object.keys(documentPermissionCapabilities) as DocumentPermission[]

export function documentCapabilityIssues(manifest: DocumentManifestShape): string[] {
  const issues: string[] = []
  for (const permission of documentPermissions) {
    const rule = documentPermissionCapabilities[permission]
    if (manifest.permissions[permission] && (manifest.apiVersion < rule.apiVersion || (rule.selectedResourceRead && manifest.permissions.selectedResource !== 'read')))
      issues.push(rule.issue)
  }
  if (manifest.contributes.views.some(view => view.accepts && (manifest.apiVersion < 4 || view.resource !== 'selected-file' || view.location !== 'context')))
    issues.push('File handlers require API 4 and a selected-file context view')
  return issues
}

// Document permissions an update newly asks for, by manifest permission name.
export function addedDocumentPermissions(previous: Partial<Record<DocumentPermission, boolean>> | undefined, next: Record<DocumentPermission, boolean>): DocumentPermission[] {
  return documentPermissions.filter(permission => next[permission] && !previous?.[permission])
}
