import type { z } from 'zod'
import type { BuddyFileQuote } from '../../shared/conversation/buddyUserContent'
import type { extensionQuoteInputSchema } from '../../shared/extensions/extensionApi'
import { fileExtensionOf } from '../../shared/extensions/extensionFileHandlers'

type LegacyQuoteInput = Exclude<z.infer<typeof extensionQuoteInputSchema>, { kind: string }>

// DOCX and PPTX plugins report text positions and XLSX plugins report cells. Those shapes predate the generic
// extension quote and are stored under their own formats, so saved quotes keep reading and reopening as before.
// The location must fit the file type; anything else is refused.
export function legacyOfficeQuoteLocation(name: string, hash: string, input: LegacyQuoteInput): Pick<BuddyFileQuote['source'], 'format' | 'docx' | 'pptx' | 'xlsx'> {
  const extension = fileExtensionOf(name)
  if ('cells' in input && extension === 'xlsx')
    return { format: 'xlsx', xlsx: { hash, ...input.cells } }
  if ('indexes' in input && extension === 'pptx')
    return { format: 'pptx', pptx: { hash, indexes: input.indexes, from: input.from, to: input.to } }
  if ('indexes' in input && extension === 'docx')
    return { format: 'docx', docx: { hash, indexes: input.indexes, from: input.from, to: input.to } }
  throw new Error('EXTENSION_REFERENCE_DENIED')
}
