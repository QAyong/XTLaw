import type { BuddyFileQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { ReferenceLocator } from '@buddy-shared/conversation/referenceMaterial'

// What a document plugin gets to find a saved file quote again: the position it reported when the quote was made, as it was
// stored. The host does not interpret it; the plugin checks it against the document and falls back to the quote text.
export function documentLocator(source: BuddyFileQuote['source']): ReferenceLocator | null {
  const { format } = source
  if (format === 'docx' || format === 'pptx') {
    const location = source[format]
    return location ? { version: 1, data: { format, hash: location.hash, indexes: [...location.indexes], from: location.from, to: location.to } } : null
  }
  if (format === 'xlsx') {
    const location = source.xlsx
    return location ? { version: 1, data: { format, hash: location.hash, sheetIndex: location.sheetIndex, sheet: location.sheet, range: location.range } } : null
  }
  if (format === 'extension') {
    const extension = source.extension
    return extension ? { version: 1, data: { format, kind: extension.kind, hash: extension.hash, location: extension.location } } : null
  }
  return null
}
