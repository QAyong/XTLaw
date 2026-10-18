// @vitest-environment jsdom
import type { BuddyResourceQuote, BuddyTextQuote } from '@buddy-shared/conversation/buddyUserContent'
import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import { registerMonacoResourceQuote } from '../useMonacoResourceQuote'

function fixture() {
  const submissions: { quote: BuddyResourceQuote, x: number, y: number, intent: string }[] = []
  const label = shallowRef('Quote')
  let text = '  selected code\n'
  let source: BuddyTextQuote['source'] = { kind: 'file', title: 'test.ts', format: 'source', file: { spaceId: 's', directoryId: 'd', revision: 1, path: 'test.ts' } }
  let action!: Monaco.editor.IActionDescriptor
  let editorDisposed = () => {}
  const editor = {
    getModel: () => ({ getValueInRange: () => text }),
    getSelection: () => ({ startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 8, getEndPosition: () => ({ lineNumber: 3, column: 8 }) }),
    getDomNode: () => ({ getBoundingClientRect: () => ({ left: 100, top: 200 }) }),
    getScrolledVisiblePosition: () => ({ left: 30, top: 40, height: 20 }),
    addAction: (value: Monaco.editor.IActionDescriptor) => {
      action = value
      return { dispose() {} }
    },
    onDidDispose: (callback: () => void) => {
      editorDisposed = callback
      return { dispose() {} }
    },
  } as unknown as Monaco.editor.IStandaloneCodeEditor
  const registration = registerMonacoResourceQuote(editor, {
    label: () => label.value,
    source: () => source,
    prepare: (quote, x, y, intent) => () => submissions.push({ quote, x, y, intent }),
  })
  return {
    submissions,
    run: () => action.run(editor),
    get action() { return action },
    label,
    registration,
    disposeEditor: () => editorDisposed(),
    update: (value: string, next = source) => {
      text = value
      source = next
    },
  }
}

describe('monaco resource quote action', () => {
  it('captures the exact selection and viewport anchor only when the explicit action runs', () => {
    const f = fixture()
    try {
      expect(f.submissions).toEqual([])
      expect(f.action.precondition).toBe('editorHasSelection')
      expect(f.action.contextMenuGroupId).toBe('9_cutcopypaste')
      f.run()
      expect(f.submissions).toEqual([{
        quote: {
          id: expect.any(String),
          text: '  selected code\n',
          source: { kind: 'file', title: 'test.ts', format: 'source', file: { spaceId: 's', directoryId: 'd', revision: 1, path: 'test.ts' } },
          range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 8 },
        },
        x: 130,
        y: 260,
        intent: 'quote',
      }])
    }
    finally { f.registration.dispose() }
  })

  it('reads fresh content and source for each invocation without changing an earlier snapshot', () => {
    const f = fixture()
    try {
      f.run()
      f.update('next selection', { kind: 'file', title: 'renamed.ts', format: 'source', file: { spaceId: 's', directoryId: 'd', revision: 2, path: 'renamed.ts' } })
      f.run()
      expect(f.submissions.map(item => [item.quote.text, item.quote.source.title])).toEqual([
        ['  selected code\n', 'test.ts'],
        ['next selection', 'renamed.ts'],
      ])
      expect(f.submissions[0]!.quote.id).not.toBe(f.submissions[1]!.quote.id)
    }
    finally { f.registration.dispose() }
  })

  it('updates the localized label without rebinding quote targets or invalidating an open action', () => {
    const f = fixture()
    try {
      const opened = f.action
      f.label.value = '引用'
      expect(f.action.label).toBe('引用')
      expect(f.action.id).toBe(opened.id)
      opened.run({} as Monaco.editor.IStandaloneCodeEditor)
      expect(f.submissions[0]!.quote.text).toBe('  selected code\n')
    }
    finally { f.registration.dispose() }
  })

  it('ignores whitespace and stale invocations after either lifetime ends', () => {
    for (const dispose of ['editor', 'registration']) {
      const f = fixture()
      f.update(' \n ')
      f.run()
      expect(f.submissions).toEqual([])
      f.update('selected')
      if (dispose === 'editor')
        f.disposeEditor()
      else
        f.registration.dispose()
      f.run()
      f.registration.dispose()
      expect(f.submissions).toEqual([])
    }
  })
})
