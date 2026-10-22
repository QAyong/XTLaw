// Stand-in for pdfjs-dist. Only "Export as images" used it (to rasterize its own PDF); the plugin has no PDF export,
// so the menu entries that reach this code are removed at build time and this keeps pdf.js out of the bundle.
export const GlobalWorkerOptions: { workerSrc?: string } = {}
export function getDocument(): never {
  throw new Error('OFFICE_FEATURE_UNAVAILABLE')
}
export default ''
