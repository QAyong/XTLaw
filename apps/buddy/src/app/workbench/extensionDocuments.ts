// Office documents are opened by extension views, not by the built-in file copy.
export const extensionDocumentPattern = /\.(?:docx|pptx)$/i

export function isExtensionDocument(path: string): boolean {
  return extensionDocumentPattern.test(path)
}
