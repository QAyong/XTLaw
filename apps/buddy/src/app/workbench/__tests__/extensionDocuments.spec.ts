import { expect, it } from 'vitest'
import { isExtensionDocument, isQuotableExtensionDocument } from '../extensionDocuments'

it('routes DOCX, PPTX and XLSX to extension views regardless of case, and leaves other files alone', () => {
  expect(['a/合同.docx', 'deck.PPTX', 'x.y/z.pptx', 'book.XLSX', 'a/报表.xlsx'].every(isExtensionDocument)).toBe(true)
  expect(['a.xls', 'deck.pptx.bak', 'pptx', 'notes.md', 'book.xlsx.bak'].some(isExtensionDocument)).toBe(false)
})

it('allows chat quoting from documents whose plugins capture selections', () => {
  expect(['a.docx', 'deck.pptx', 'book.XLSX'].every(isQuotableExtensionDocument)).toBe(true)
  expect(['book.xls', 'book.xlsx.bak'].some(isQuotableExtensionDocument)).toBe(false)
})
