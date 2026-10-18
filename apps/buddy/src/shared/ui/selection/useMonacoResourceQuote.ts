import type { BuddyTextQuote } from '@buddy-shared/conversation/buddyUserContent'
import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import type { PrepareResourceQuote } from './useResourceSelectionQuote'
import { watch } from 'vue'

export function registerMonacoResourceQuote(editor: Monaco.editor.IStandaloneCodeEditor, options: {
  label: () => string
  source: () => BuddyTextQuote['source']
  prepare: PrepareResourceQuote
}): Monaco.IDisposable {
  let disposed = false
  let action: Monaco.IDisposable | undefined
  const run = () => {
    if (disposed)
      return
    const range = editor.getSelection()
    const model = editor.getModel()
    const text = range && model?.getValueInRange(range)
    if (!range || !text?.trim())
      return
    const bounds = editor.getDomNode()?.getBoundingClientRect()
    const position = editor.getScrolledVisiblePosition(range.getEndPosition())
    if (!bounds || !position)
      return
    const execute = options.prepare({
      id: crypto.randomUUID(),
      text,
      source: options.source(),
      range: {
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn,
      },
    }, bounds.left + position.left, bounds.top + position.top + position.height, 'quote')
    execute?.()
  }
  const stop = watch(options.label, (label) => {
    action?.dispose()
    action = editor.addAction({
      id: 'lexora.quoteSelection',
      label,
      precondition: 'editorHasSelection',
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 4,
      run,
    })
  }, { immediate: true, flush: 'sync' })
  const lifetime = editor.onDidDispose(dispose)
  function dispose() {
    if (disposed)
      return
    disposed = true
    stop()
    action?.dispose()
    lifetime.dispose()
  }
  return { dispose }
}
