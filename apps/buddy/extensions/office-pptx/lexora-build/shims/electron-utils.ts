export { safeExternalUrl } from '@genoffice/electron-utils/safe-external-url'
export const MAX_REMOTE_IMAGE_BYTES = 0
function none() {}
export const appMenuLabels = () => ({})
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
  throw new Error('SLIDES_FEATURE_UNAVAILABLE')
}
export const readBodyCapped = fetchRemoteImage
export const showOpenDialogWithMemory = async () => ({ canceled: true, filePaths: [] as string[] })
export const showSaveDialogWithMemory = async () => ({ canceled: true })
