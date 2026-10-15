import type { BuddyResourceQuote, BuddyTextQuote } from '@buddy-shared/conversation/buddyUserContent'
import type * as Monaco from 'monaco-editor/editor/editor.api.js'

export function registerMonacoResourceQuote(editor: Monaco.editor.IStandaloneCodeEditor, options: {
  label: string
  source: () => BuddyTextQuote['source']
  prepare: (quote: BuddyResourceQuote, x: number, y: number) => (() => void) | null
}): Monaco.IDisposable {
  return editor.addAction({
    id: 'lexora.quoteSelection',
    label: options.label,
    precondition: 'editorHasSelection',
    contextMenuGroupId: '9_cutcopypaste',
    contextMenuOrder: 4,
    run: () => {
      const range = editor.getSelection()
      const model = editor.getModel()
      const text = range && model?.getValueInRange(range)
      if (!range || !text?.trim())
        return
      const bounds = editor.getDomNode()?.getBoundingClientRect()
      const position = editor.getScrolledVisiblePosition(range.getEndPosition())
      if (!bounds || !position)
        return
      const show = options.prepare({ id: crypto.randomUUID(), text, source: options.source(), range: {
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn,
      } }, bounds.left + position.left, bounds.top + position.top + position.height)
      show?.()
    },
  })
}
