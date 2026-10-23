import { BUNDLED_EXTENSION_CATALOG_URL } from './extensionCatalog'

// WebAssembly is open to every plugin, but only bundled/official plugins and development folders are exempt from the
// limits below. "Bundled" is where the host recorded the package as coming from, never anything the package says about itself.
export const EXTENSION_UNTRUSTED_WASM_FILE_LIMIT = 4
// A package file may be up to 64 MiB (the package budget), so this total is what actually bounds third-party engines.
export const EXTENSION_UNTRUSTED_WASM_BYTES_LIMIT = 24 * 1024 * 1024

export function extensionIsBundled(source: { catalog: string } | null | undefined): boolean {
  return source?.catalog === BUNDLED_EXTENSION_CATALOG_URL
}

// Development folders are loaded by their author on purpose, so they stay unrestricted for debugging.
export function extensionWebAssemblyUnrestricted(origin: { development: boolean, source: { catalog: string } | null | undefined }): boolean {
  return origin.development || extensionIsBundled(origin.source)
}

// Limits what a third-party package can ship as .wasm: a few files and a bounded total. Worker count and memory use
// inside the sandbox are not enforced by the host; the package limits and the install warning are the guard there.
export function assertExtensionWebAssemblyLimits(files: ReadonlyMap<string, Uint8Array>, origin: { development: boolean, source: { catalog: string } | null | undefined }): void {
  if (extensionWebAssemblyUnrestricted(origin))
    return
  let count = 0
  let bytes = 0
  for (const [path, content] of files) {
    if (!/\.wasm$/i.test(path))
      continue
    count++
    bytes += content.byteLength
  }
  if (count > EXTENSION_UNTRUSTED_WASM_FILE_LIMIT || bytes > EXTENSION_UNTRUSTED_WASM_BYTES_LIMIT)
    throw new Error('EXTENSION_WEBASSEMBLY_LIMIT')
}
