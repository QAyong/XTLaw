// Office documents are opened by extension views, not by the built-in file copy.
export const extensionDocumentPattern = /\.(?:docx|pptx|xlsx)$/i

// Only these documents support quoting selections into chat.
export const quotableDocumentPattern = /\.(?:docx|pptx)$/i

export function isExtensionDocument(path: string): boolean {
  return extensionDocumentPattern.test(path)
}

export function isQuotableExtensionDocument(path: string): boolean {
  return quotableDocumentPattern.test(path)
}
