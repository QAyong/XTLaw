import { BUNDLED_EXTENSION_CATALOG_URL } from './extensionCatalog'

// "Bundled" is where the host recorded the package as coming from, never anything the package says about itself.
export function extensionIsBundled(source: { catalog: string } | null | undefined): boolean {
  return source?.catalog === BUNDLED_EXTENSION_CATALOG_URL
}
