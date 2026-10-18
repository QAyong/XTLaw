import { BUNDLED_EXTENSION_CATALOG_URL } from './extensionCatalog'

// Permissions that only bundled/official plugins may hold. The test is where the package came from, as recorded by the
// host when it installed it, never anything the package says about itself (author, name, ID).
export function extensionIsBundled(source: { catalog: string } | null | undefined): boolean {
  return source?.catalog === BUNDLED_EXTENSION_CATALOG_URL
}

// Development directories are loaded by their author on purpose, so they stay usable for debugging.
export function extensionMayUseWebAssembly(origin: { development: boolean, source: { catalog: string } | null | undefined }): boolean {
  return origin.development || extensionIsBundled(origin.source)
}
