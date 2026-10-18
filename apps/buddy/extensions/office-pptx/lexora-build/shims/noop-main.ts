// Main-process modules the plugin does not provide: AI, presenter windows, attachments, PDF/print export.
async function unavailable() {
  throw new Error('SLIDES_FEATURE_UNAVAILABLE')
}
export function registerAiIpc() {}
export function registerSlidesOnlyAiIpc() {}
export function registerPresenterIpc() {}
export function registerAttachmentIpc() {}
export const exportSlidesPdf = unavailable
export const printSlidesHtml = unavailable
export async function cleanupExpiredGeneratedPages() {}
// font-store
export function initFontStore() {}
export const listFontCatalog = async () => []
export const missingCatalogFonts = async () => []
export const downloadFontFamily = async () => ({ ok: false, error: 'SLIDES_FEATURE_UNAVAILABLE' })
export const installLocalFontFiles = async () => ({ ok: false, error: 'SLIDES_FEATURE_UNAVAILABLE' })
// shaped-metrics
export const shapedMetricsReady = () => Promise.resolve()
export const refineComplexWidths = async () => false
