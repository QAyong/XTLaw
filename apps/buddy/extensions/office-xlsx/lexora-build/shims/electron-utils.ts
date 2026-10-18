export { safeExternalUrl } from '@genoffice/electron-utils/safe-external-url'
export const MAX_REMOTE_IMAGE_BYTES = 0
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
export const showSaveDialogWithMemory = async () => ({ canceled: true })
