import { expect, it } from 'vitest'
import { isExtensionDocument } from '../extensionDocuments'

it('routes DOCX and PPTX to extension views regardless of case, and leaves other files alone', () => {
  expect(['a/合同.docx', 'deck.PPTX', 'x.y/z.pptx'].every(isExtensionDocument)).toBe(true)
  expect(['a.xlsx', 'deck.pptx.bak', 'pptx', 'notes.md'].some(isExtensionDocument)).toBe(false)
})
