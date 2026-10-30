import type { ContextPanelSelectionScope, TaskContextTab } from './taskContextPanel'
import { changeSetSummarySchema } from '@buddy-shared/changes/changeApi'
import { contextPanelSourceSchema } from '@buddy-shared/context-panel/contextPanel'
import { fileTargetSchema } from '@buddy-shared/spaces/spaceFileApi'
import { z } from 'zod'

const identity = z.string().min(1).max(256)
const scopeSchema = z.union([z.literal('independent'), z.literal('workspace'), z.templateLiteral(['task:', z.string().min(1)]), z.templateLiteral(['draft:', z.string().min(1)])])
const selectionSchema = z.tuple([z.union([scopeSchema, z.templateLiteral(['space:', z.string().min(1)])]), identity])
const base = z.object({ id: identity, scope: scopeSchema, source: contextPanelSourceSchema.optional(), pinned: z.boolean().optional() })
// A tab that showed an output in the old output preview is not restored: that preview is gone, and opening the card again lands in the file manager.
const tabSchema = z.discriminatedUnion('kind', [
  base.extend({ kind: z.literal('browser'), conversationId: identity.nullable(), browserKey: identity.optional() }),
  base.extend({ kind: z.literal('files'), target: fileTargetSchema, treeTarget: z.object({ path: z.string().max(4096), kind: z.enum(['file', 'directory']) }).optional(), rootName: z.string(), expand: z.object({ path: z.string().min(1).max(4096), token: identity }).optional(), tree: z.object({ visible: z.boolean(), token: identity }).optional() }),
  base.extend({ kind: z.literal('changes'), branchId: identity.nullable(), revision: z.string(), changeSet: changeSetSummarySchema.nullable(), conversationId: identity }),
  base.extend({ kind: z.literal('view'), viewId: identity, label: z.string(), dirty: z.boolean().optional() }),
])

export function readContextTab(value: unknown): TaskContextTab | null {
  const parsed = tabSchema.safeParse(value)
  if (!parsed.success || (parsed.data.kind === 'view' && parsed.data.viewId !== parsed.data.id))
    return null
  return parsed.data
}

export function readContextSelection(value: unknown): readonly [ContextPanelSelectionScope, string] | null {
  const parsed = selectionSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
