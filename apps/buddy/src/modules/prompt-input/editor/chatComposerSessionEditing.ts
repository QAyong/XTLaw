import type { BuddySessionReference } from '@buddy-shared/conversation/buddyUserContent'
import type { Editor } from '@tiptap/core'
import { buddySessionReferenceSchema } from '@buddy-shared/conversation/buddyUserContent'
import { Node } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { CHAT_SESSION_REFERENCE_NODE_NAME } from '../model/chatComposerDocument'
import { dispatchComposerEdit } from './chatComposerResourceEditing'

export const ChatComposerSessionReference = Node.create({
  name: CHAT_SESSION_REFERENCE_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ sessionId: { default: null, rendered: false }, title: { default: '', rendered: false } }),
  renderHTML: ({ node }) => ['span', { 'class': 'chat-prompt-token-node', 'data-type': 'chat-session-reference', 'contenteditable': 'false', 'title': node.attrs.title }, `@${node.attrs.title}`],
  renderText: ({ node }) => `@${node.attrs.title}`,
  addProseMirrorPlugins() {
    const name = this.name
    return [new Plugin({
      appendTransaction(transactions, _old, state) {
        if (!transactions.some(transaction => transaction.docChanged))
          return null
        const references = new Map<string, BuddySessionReference>()
        const invalid: { from: number, to: number }[] = []
        state.doc.descendants((node, position) => {
          if (node.type.name !== name)
            return
          const parsed = buddySessionReferenceSchema.safeParse({ id: node.attrs.sessionId, title: node.attrs.title })
          if (!parsed.success || (references.size >= 16 && !references.has(parsed.data.id))) {
            invalid.push({ from: position, to: position + node.nodeSize })
            return
          }
          references.set(parsed.data.id, parsed.data)
        })
        const next = [...references.values()]
        const transaction = state.tr
        for (const range of invalid.toReversed())
          transaction.delete(range.from, range.to)
        if (JSON.stringify(state.doc.attrs.sessionReferences ?? []) !== JSON.stringify(next))
          transaction.setDocAttribute('sessionReferences', next.length ? next : null)
        return transaction.docChanged ? transaction.setMeta('addToHistory', false) : null
      },
    })]
  },
})

export function insertChatComposerSessionReferences(editor: Editor, references: readonly BuddySessionReference[], range?: { from: number, to: number }): boolean {
  if (!references.length || editor.isDestroyed || !editor.isEditable)
    return false
  const existing = new Set((editor.state.doc.attrs.sessionReferences as BuddySessionReference[] | null)?.map(reference => reference.id))
  const nodes = references.flatMap((value) => {
    const reference = buddySessionReferenceSchema.parse(value)
    if (existing.size >= 16 && !existing.has(reference.id))
      return []
    existing.add(reference.id)
    return [editor.schema.nodes[CHAT_SESSION_REFERENCE_NODE_NAME]!.create({ sessionId: reference.id, title: reference.title })]
  })
  if (!nodes.length)
    return false
  const slice = new Slice(Fragment.fromArray(nodes), 0, 0)
  const transaction = range ? editor.state.tr.replaceRange(range.from, range.to, slice) : editor.state.tr.replaceSelection(slice)
  return dispatchComposerEdit(editor, transaction)
}

export function removeChatComposerSessionReference(editor: Editor, sessionId: string): boolean {
  if (editor.isDestroyed || !editor.isEditable)
    return false
  const ranges: { from: number, to: number }[] = []
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === CHAT_SESSION_REFERENCE_NODE_NAME && node.attrs.sessionId === sessionId)
      ranges.push({ from: position, to: position + node.nodeSize })
  })
  const transaction = editor.state.tr
  for (const range of ranges.toReversed())
    transaction.delete(range.from, range.to)
  return dispatchComposerEdit(editor, transaction)
}
