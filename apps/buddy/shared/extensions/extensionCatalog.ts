import { z } from 'zod'
import { extensionIconUrlSchema, extensionManifestSchema, extensionPathSchema } from './extensionManifest'
import { EXTENSION_PACKAGE_LIMIT } from './extensionPackageLimits'

export const EXTENSION_CATALOG_URL = 'https://raw.githubusercontent.com/useLexora/plugins/main/catalog/v1/index.json'
export const BUNDLED_EXTENSION_CATALOG_URL = 'xtlaw-bundled://catalog'
const httpsUrl = z.string().url().max(2048).refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
})
const artifactIntegrity = {
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive().max(EXTENSION_PACKAGE_LIMIT),
}
export const extensionCatalogEntrySchema = z.object({
  manifest: extensionManifestSchema,
  iconUrl: extensionIconUrlSchema.optional(),
  repository: httpsUrl,
  artifact: z.union([
    z.object({ url: httpsUrl, ...artifactIntegrity }).strict(),
    z.object({ kind: z.literal('bundled'), file: extensionPathSchema, ...artifactIntegrity }).strict(),
  ]),
}).strict()
export const extensionCatalogSchema = z.object({ schemaVersion: z.literal(1), plugins: z.array(extensionCatalogEntrySchema).max(2000) }).strict().superRefine((catalog, context) => {
  const ids = new Set<string>()
  for (const entry of catalog.plugins) {
    const key = `${entry.manifest.id}@${entry.manifest.version}`
    if (ids.has(key))
      context.addIssue({ code: 'custom', message: 'Duplicate plugin version' })
    ids.add(key)
  }
})
export type ExtensionCatalogEntry = z.infer<typeof extensionCatalogEntrySchema>
export interface ExtensionCatalogSnapshot {
  plugins: Array<ExtensionCatalogEntry & { compatible: boolean }>
  cachedAt: string | null
  stale: boolean
  error: string | null
}
