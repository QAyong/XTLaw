import type { BuddyTextQuote } from '@buddy-shared/conversation/buddyUserContent'
import type * as Monaco from 'monaco-editor/editor/editor.api.js'

export function revealMonacoQuote(editor: Monaco.editor.IStandaloneCodeEditor, quote: BuddyTextQuote): boolean {
  const model = editor.getModel()
  if (!model)
    return false
  let range = quote.range
  if (!range || model.getValueInRange(range) !== quote.text) {
    const matches = model.findMatches(quote.text, false, false, true, null, false, 2)
    if (matches.length !== 1)
      return false
    range = matches[0]!.range
  }
  editor.setSelection(range)
  editor.revealRangeInCenter(range)
  return true
}
