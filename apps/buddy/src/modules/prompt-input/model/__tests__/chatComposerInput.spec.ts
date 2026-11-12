import { describe, expect, it } from 'vitest'
import { findChatComposerTrigger } from '../chatComposerInput'

describe('findChatComposerTrigger', () => {
  it('defaults Chinese input aliases on, while disabling them leaves ASCII triggers available', () => {
    expect(findChatComposerTrigger('、review')).toEqual({ kind: 'slash', query: 'review' })
    expect(findChatComposerTrigger('￥contract')).toEqual({ kind: 'skill', query: 'contract' })
    expect(findChatComposerTrigger('/review', false)).toEqual({ kind: 'slash', query: 'review' })
    expect(findChatComposerTrigger('$contract', false)).toEqual({ kind: 'skill', query: 'contract' })
    expect(findChatComposerTrigger('@文件', false)).toEqual({ kind: 'mention', query: '文件' })
    expect(findChatComposerTrigger('、review', false)).toBeNull()
    expect(findChatComposerTrigger('￥contract', false)).toBeNull()
  })

  it('recognizes the fullwidth yuan sign mid-text after whitespace when enabled', () => {
    expect(findChatComposerTrigger('帮我用 ￥contract', true)).toEqual({ kind: 'skill', query: 'contract' })
  })

  it.each(['“', '”', '‘', '’', '（', '【'])('accepts Chinese punctuation %s as a boundary with either setting', (boundary) => {
    expect(findChatComposerTrigger(`${boundary}$contract`)).toEqual({ kind: 'skill', query: 'contract' })
    expect(findChatComposerTrigger(`${boundary}@文件`)).toEqual({ kind: 'mention', query: '文件' })
    expect(findChatComposerTrigger(`${boundary}￥contract`, true)).toEqual({ kind: 'skill', query: 'contract' })
  })

  it('keeps the ideographic comma slash alias limited to a slash command at message start', () => {
    expect(findChatComposerTrigger('、rev', true)).toEqual({ kind: 'slash', query: 'rev' })
    expect(findChatComposerTrigger('正文 、rev', true)).toBeNull()
    expect(findChatComposerTrigger('/rev')).toEqual({ kind: 'slash', query: 'rev' })
  })

  it('does not trigger when preceded by a word character', () => {
    expect(findChatComposerTrigger('abc￥contract', true)).toBeNull()
    expect(findChatComposerTrigger('abc$contract')).toBeNull()
  })

  it('does not trigger when the query contains whitespace', () => {
    expect(findChatComposerTrigger('￥con tract', true)).toBeNull()
    expect(findChatComposerTrigger('$con tract')).toBeNull()
  })
})
