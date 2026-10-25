import type { ExtensionCompatibilityIssue } from './extensionCompatibility'
import { z } from 'zod'
import { isBuiltinCapability } from './extensionCapabilities'
import { extensionIconUrlSchema, extensionManifestSchema, extensionMetadataSchema, extensionPathSchema } from './extensionManifest'
import { EXTENSION_ARCHIVE_LIMIT } from './extensionPackageBudget'

export const EXTENSION_CATALOG_URL = 'https://raw.githubusercontent.com/QAyong/xtlaw-plugins/main/catalog/v1/index.json'
export const BUNDLED_EXTENSION_CATALOG_URL = 'xtlaw-bundled://catalog'
const httpsUrl = z.string().url().max(2048).refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
})
const artifactIntegrity = {
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive().max(EXTENSION_ARCHIVE_LIMIT),
}
export const EXTENSION_CATALOG_KINDS = ['pack', 'mcp', 'skill', 'agent', 'plugin', 'cli'] as const
export const EXTENSION_CATALOG_SOURCES = ['official', 'listed'] as const
export type ExtensionCatalogKind = typeof EXTENSION_CATALOG_KINDS[number]
export type ExtensionCatalogSource = typeof EXTENSION_CATALOG_SOURCES[number]
// Listings parse only metadata so incompatible or newer entries can still be shown with a reason.
// `kind` and `source` default to the pre-market shape (an official plugin) so existing catalogs keep working.
export const extensionCatalogListingSchema = z.object({
  kind: z.enum(EXTENSION_CATALOG_KINDS).default('plugin'),
  source: z.enum(EXTENSION_CATALOG_SOURCES).default('official'),
  manifest: extensionMetadataSchema,
  iconUrl: extensionIconUrlSchema.optional(),
  repository: httpsUrl,
  artifact: z.union([
    z.object({ url: httpsUrl, ...artifactIntegrity }).strict(),
    z.object({ kind: z.literal('bundled'), file: extensionPathSchema, ...artifactIntegrity }).strict(),
  ]),
}).strict()
// A single-capability entry has to deliver the capability it is filed under. A built-in one delivers nothing: the application already has it.
export const extensionCatalogEntrySchema = extensionCatalogListingSchema.extend({ manifest: extensionManifestSchema }).superRefine((entry, context) => {
  const { skills, mcpConnectors, subagents } = entry.manifest.contributes
  const delivered = { skill: skills.length, mcp: mcpConnectors.length, agent: subagents.length }
  if ((entry.kind === 'skill' || entry.kind === 'mcp' || entry.kind === 'agent') && !delivered[entry.kind] && !isBuiltinCapability(entry))
    context.addIssue({ code: 'custom', message: `A ${entry.kind} entry must contribute at least one ${entry.kind}` })
})
export const extensionCatalogSchema = z.object({ schemaVersion: z.literal(1), plugins: z.array(z.unknown()).max(2000) }).strict().superRefine((catalog, context) => {
  const ids = new Set<string>()
  for (const entry of catalog.plugins) {
    const parsed = extensionCatalogListingSchema.safeParse(entry)
    if (!parsed.success)
      continue
    const key = `${parsed.data.manifest.id}@${parsed.data.manifest.version}`
    if (ids.has(key))
      context.addIssue({ code: 'custom', message: 'Duplicate plugin version' })
    ids.add(key)
  }
})
export type ExtensionCatalogEntry = z.infer<typeof extensionCatalogEntrySchema>
export type ExtensionCatalogListing = z.infer<typeof extensionCatalogListingSchema> & {
  compatible: boolean
  incompatibility: ExtensionCompatibilityIssue | null
}
export interface ExtensionCatalogSnapshot {
  plugins: ExtensionCatalogListing[]
  invalidEntries: number
  cachedAt: string | null
  stale: boolean
  error: string | null
}
