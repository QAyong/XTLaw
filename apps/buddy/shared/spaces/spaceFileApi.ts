import type { RuntimeRequestContract } from '../runtime/apiContract'
import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { artifactOpenRequestSchema } from '../artifacts/artifactApi'
import { directoryPageSchema, fileEntrySchema, filePreviewSchema } from '../files/filePreview'
import { mediaPreviewLocationSchema } from '../files/mediaPreview'
import { idSchema, isAbsolutePath } from '../runtime/apiValidation'

export const spaceFileTargetSchema = z.object({
  spaceId: idSchema,
  directoryId: idSchema,
  revision: z.number().int().positive(),
  path: z.string().max(4096),
}).strict()

// A file inside a directory the conversation is authorized to use, addressed by the directory's real path (Spec-044).
// The service accepts a root only when it equals one of the conversation's active grants; the path never leaves that root.
export const grantFileTargetSchema = z.object({
  conversationId: idSchema,
  root: z.string().min(1).max(4096).refine(isAbsolutePath),
  path: z.string().max(4096),
}).strict()
export const fileTargetSchema = z.union([spaceFileTargetSchema, grantFileTargetSchema])

function onFileTarget<T extends z.ZodRawShape>(shape: T) {
  return z.union([spaceFileTargetSchema.extend(shape).strict(), grantFileTargetSchema.extend(shape).strict()])
}

export const spaceFileEntrySchema = fileEntrySchema.extend({ writable: z.boolean().optional() })
export const spaceDirectoryPageSchema = directoryPageSchema.extend({ entries: z.array(spaceFileEntrySchema).max(250) })
export const spaceFilePreviewSchema = filePreviewSchema

export const spaceTextDocumentSchema = z.object({
  text: z.string().max(1024 * 1024),
  etag: z.string().length(64),
}).strict()
export type SpaceTextDocument = z.infer<typeof spaceTextDocumentSchema>
export const spaceFileByteRequestSchema = onFileTarget({
  offset: z.number().int().min(0).max(64 * 1024 * 1024),
  length: z.number().int().min(1).max(128 * 1024),
  etag: z.string().length(64).optional(),
})
export const spaceFileByteChunkSchema = z.object({
  base64: z.string().max(174764),
  size: z.number().int().min(0).max(64 * 1024 * 1024),
  eof: z.boolean(),
  etag: z.string().length(64),
}).strict()
export type SpaceFileByteRequest = z.infer<typeof spaceFileByteRequestSchema>
export type SpaceFileByteChunk = z.infer<typeof spaceFileByteChunkSchema>
export const spaceSaveBytesSchema = onFileTarget({ etag: z.string().length(64), expectedHash: z.string().length(64), base64: z.string().max(89478488) })
export const spaceSaveBytesResultSchema = z.object({ status: z.enum(['saved', 'conflict']), etag: z.string().length(64).optional() }).strict()
export type SpaceSaveBytes = z.infer<typeof spaceSaveBytesSchema>
export type SpaceSaveBytesResult = z.infer<typeof spaceSaveBytesResultSchema>
export const spaceSaveDocumentSchema = onFileTarget({
  text: z.string().max(1024 * 1024),
  etag: z.string().length(64),
  operationId: z.string().uuid(),
})
export type SpaceSaveDocument = z.infer<typeof spaceSaveDocumentSchema>
export const spaceSaveResultSchema = z.object({
  status: z.enum(['saved', 'conflict']),
  document: spaceTextDocumentSchema,
}).strict()
export type SpaceSaveResult = z.infer<typeof spaceSaveResultSchema>

export const spaceFileLocationSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['directory', 'file']),
}).strict()

export const spaceFileOpenRequestSchema = onFileTarget({ action: artifactOpenRequestSchema.shape.action })
export type SpaceFileOpenRequest = z.infer<typeof spaceFileOpenRequestSchema>
export type SpaceFileTarget = z.infer<typeof spaceFileTargetSchema>
export type GrantFileTarget = z.infer<typeof grantFileTargetSchema>
export type FileTarget = z.infer<typeof fileTargetSchema>

export function isGrantFileTarget(target: FileTarget): target is GrantFileTarget {
  return 'conversationId' in target
}

// The identity of a file target inside a resource id: stable across renderers and unique per directory and path.
export function fileTargetKey(target: FileTarget): string {
  return JSON.stringify(isGrantFileTarget(target) ? [target.conversationId, target.root, target.path] : [target.directoryId, target.revision, target.path])
}

// Plugin APIs still address space files only (Spec-044 step 4); a granted directory file has no plugin-facing target yet.
export function spaceFileTargetOnly(target: FileTarget): SpaceFileTarget | undefined {
  return isGrantFileTarget(target) ? undefined : target
}

export function requireFileTarget(data: unknown): FileTarget {
  const target = readFileTarget(data)
  if (!target)
    throw new Error('FILE_TARGET_INVALID')
  return target
}

// Two targets sit in the same file manager root: the same space directory binding, or the same granted directory of one conversation.
export function sameFileRoot(left: FileTarget, right: FileTarget): boolean {
  if (isGrantFileTarget(left) || isGrantFileTarget(right))
    return isGrantFileTarget(left) && isGrantFileTarget(right) && left.conversationId === right.conversationId && left.root === right.root
  return left.spaceId === right.spaceId && left.directoryId === right.directoryId && left.revision === right.revision
}

// Same directory ignoring the binding revision: a saved target can carry an older revision than the directory's current one.
export function sameFileDirectory(left: FileTarget, right: FileTarget): boolean {
  if (isGrantFileTarget(left) || isGrantFileTarget(right))
    return isGrantFileTarget(left) && isGrantFileTarget(right) && left.conversationId === right.conversationId && left.root === right.root
  return left.spaceId === right.spaceId && left.directoryId === right.directoryId
}

export function sameFileTarget(left: FileTarget, right: FileTarget): boolean {
  return left.path === right.path && sameFileRoot(left, right)
}

// Reads a file target out of resource data that carries other fields too (such as canonicalRoot); null when it holds neither shape.
export function readFileTarget(data: unknown): FileTarget | null {
  const space = spaceFileTargetSchema.strip().safeParse(data)
  if (space.success)
    return space.data
  const grant = grantFileTargetSchema.strip().safeParse(data)
  return grant.success ? grant.data : null
}
export type LocalSpaceFileEntry = DeepReadonly<z.infer<typeof spaceFileEntrySchema>>
export type LocalSpaceDirectoryPage = DeepReadonly<z.infer<typeof spaceDirectoryPageSchema>>
export type LocalSpaceFilePreview = DeepReadonly<z.infer<typeof spaceFilePreviewSchema>>
export type SpaceDirectoryRequest = z.infer<typeof spaceDirectoryRequestSchema>

export const spaceDirectoryRequestSchema = onFileTarget({ cursor: z.string().max(512).optional() })

export const spaceFileActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('createFile') }).strict(),
  z.object({ kind: z.literal('createDirectory') }).strict(),
  z.object({ kind: z.literal('rename'), destination: z.string().min(1).max(4096) }).strict(),
  z.object({ kind: z.literal('copy'), destination: fileTargetSchema }).strict(),
  z.object({ kind: z.literal('move'), destination: fileTargetSchema }).strict(),
  z.object({ kind: z.literal('trash') }).strict(),
  z.object({ kind: z.literal('restore'), originalOperationId: z.string().uuid() }).strict(),
])
export const spaceFileMutationSchema = onFileTarget({
  operationId: z.string().uuid(),
  action: spaceFileActionSchema,
})
export type SpaceFileMutation = z.infer<typeof spaceFileMutationSchema>
export const spaceFileOperationSchema = z.object({
  operationId: z.string().uuid(),
  kind: z.string(),
  path: z.string().nullable(),
  destination: z.string().nullable(),
  temporaryPath: z.string().nullable(),
  status: z.enum(['prepared', 'executing', 'applied', 'not-applied', 'needs-recovery', 'acknowledged']),
  error: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  restorable: z.boolean(),
}).strict()
export type SpaceFileOperation = z.infer<typeof spaceFileOperationSchema>
export const spaceFileOperationRequestSchema = onFileTarget({ operationId: z.string().uuid() })
const spaceFilesChangeKind = z.enum(['saved', 'conflict', 'response-denied', 'changed'])
export const spaceFilesChanged = {
  method: 'spaceFiles.changed',
  params: z.union([
    z.object({ spaceId: idSchema, directoryId: idSchema, directoryRevision: z.number().int().positive(), revision: z.number().int().positive(), operationId: z.string(), kind: spaceFilesChangeKind }).strict(),
    z.object({ conversationId: idSchema, root: z.string().min(1).max(4096).refine(isAbsolutePath), revision: z.number().int().positive(), operationId: z.string(), kind: spaceFilesChangeKind }).strict(),
  ]),
}
export type SpaceFilesChange = z.infer<typeof spaceFilesChanged.params>

export const spaceFilesRpc = {
  saveBytes: { method: 'spaceFiles.saveBytes', input: spaceSaveBytesSchema, response: spaceSaveBytesResultSchema },
  readBytes: { method: 'spaceFiles.readBytes', input: spaceFileByteRequestSchema, response: spaceFileByteChunkSchema },
  resolveMedia: { method: 'spaceFiles.resolveMedia', input: fileTargetSchema, response: mediaPreviewLocationSchema },
  mutate: { method: 'spaceFiles.mutate', input: spaceFileMutationSchema, response: spaceFileOperationSchema },
  history: { method: 'spaceFiles.history', input: fileTargetSchema, response: z.array(spaceFileOperationSchema) },
  query: { method: 'spaceFiles.query', input: spaceFileOperationRequestSchema, response: spaceFileOperationSchema.nullable() },
  acknowledge: { method: 'spaceFiles.acknowledge', input: spaceFileOperationRequestSchema, response: spaceFileOperationSchema },
  cancel: { method: 'spaceFiles.cancel', input: spaceFileOperationRequestSchema, response: z.null() },
  readDocument: { method: 'spaceFiles.readDocument', input: fileTargetSchema, response: spaceTextDocumentSchema },
  saveDocument: { method: 'spaceFiles.saveDocument', input: spaceSaveDocumentSchema, response: spaceSaveResultSchema },
  list: { method: 'spaceFiles.list', input: spaceDirectoryRequestSchema, response: spaceDirectoryPageSchema },
  read: { method: 'spaceFiles.read', input: fileTargetSchema, response: spaceFilePreviewSchema },
  locate: { method: 'spaceFiles.locate', input: fileTargetSchema, response: spaceFileLocationSchema },
} as const satisfies Record<string, RuntimeRequestContract>

// One change notice names the root it happened in; these two read it against a target without caring which kind of root it is.
export function fileChangeKey(change: SpaceFilesChange): string {
  return 'spaceId' in change ? `${change.directoryId}:${change.directoryRevision}` : `${change.conversationId}:${change.root}`
}

export function fileChangeAffects(change: SpaceFilesChange, target: FileTarget): boolean {
  if ('spaceId' in change)
    return !isGrantFileTarget(target) && target.directoryId === change.directoryId && target.revision === change.directoryRevision
  return isGrantFileTarget(target) && target.conversationId === change.conversationId && target.root === change.root
}
