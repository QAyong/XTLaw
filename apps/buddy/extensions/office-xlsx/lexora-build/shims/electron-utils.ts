export { safeExternalUrl } from '@genoffice/electron-utils/safe-external-url'
export const MAX_REMOTE_IMAGE_BYTES = 0

const CFB_MAGIC = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]
const ENCRYPTED_STREAM_UTF16 = Array.from('EncryptedPackage').flatMap(character => [character.charCodeAt(0), 0])
function containsBytes(bytes: Uint8Array, needle: number[]): boolean {
  for (let start = 0; start <= bytes.length - needle.length; start++) {
    if (needle.every((value, index) => bytes[start + index] === value))
      return true
  }
  return false
}
export function isCfbFile(bytes: Uint8Array): boolean {
  return bytes.length >= CFB_MAGIC.length && CFB_MAGIC.every((value, index) => bytes[index] === value)
}
export function isEncryptedOoxml(bytes: Uint8Array): boolean {
  return isCfbFile(bytes) && containsBytes(bytes, ENCRYPTED_STREAM_UTF16)
}
export async function decryptOoxml(_bytes: Uint8Array, _password: string): Promise<never> {
  throw new Error('SHEETS_FEATURE_UNAVAILABLE: encrypted workbook decryption')
}
export function encryptOoxml(_bytes: Uint8Array, _password: string): never {
  throw new Error('SHEETS_FEATURE_UNAVAILABLE: encrypted workbook encryption')
}
function none() {}
export async function printHtmlToPdf(): Promise<never> {
  throw new Error('SHEETS_FEATURE_UNAVAILABLE')
}
export const buildPrintableHtml = () => ''
export const abortOnDestroyed = <T>(_contents: unknown, promise: Promise<T>) => promise
export const viewMenuTemplate = () => []
export const windowMenuTemplate = () => []
export async function writeJsonAtomic() {}
export const appMenuLabels = () => ({})
export const readLegacyImportSkip = (_settingsPath: string, _kind: string) => false
export function writeLegacyImportSkip(_settingsPath: string, _kind: string, _skip: boolean): void {}
// The plugin has no application menu: the menu builders return nothing.
export const appMenuTemplate = () => null
export const settingsMenuItem = () => ({})
export const contextMenuLabels = () => ({})
export const helpMenuTemplate = () => []
export const toggleDevToolsItem = () => ({})
export const installContextMenu = none
export const installNavigationGuard = none
export const installRendererProtocol = none
export const registerRendererScheme = none
export const rendererUrl = () => ''
export const isHeadlessMode = () => false
export const configuredDefaultSaveDir = () => '/virtual/documents'
export const configuredAuthorName = () => 'XTLaw'
export const saveAsSuggestion = (name: string) => name
export const recoveryCopyDiskNewer = () => false
export async function fetchRemoteImage() {
  throw new Error('SHEETS_FEATURE_UNAVAILABLE')
}
export const readBodyCapped = fetchRemoteImage
export const showOpenDialogWithMemory = async () => ({ canceled: true, filePaths: [] as string[] })
// Exports to a path the host never granted (CSV) are not offered; the page explains instead. Save As does not come here: entry.ts exports a copy through the host.
export async function showSaveDialogWithMemory() {
  ;(globalThis as { __lexoraSheetsHost?: { notify?: (text: string, alert?: boolean) => void } }).__lexoraSheetsHost?.notify?.('SHEETS_EXPORT_UNAVAILABLE', true)
  return { canceled: true }
}
