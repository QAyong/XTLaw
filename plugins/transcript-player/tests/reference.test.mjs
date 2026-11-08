import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTranscriptReference, locateTranscriptSelection, readTranscriptReference, selectionFromBounds } from '../src/reference.ts'

const cues = [
  { start: 10, end: 12, text: '第一句话，讨论方案。' },
  { start: 12.2, end: 16, text: '第二句话，继续讨论。' },
  { start: 18, end: 20, text: '第三句话，确认结论。' },
]
const subtitle = { id: '12345678-1234-1234-1234-123456789abc', name: '会议.srt', type: 'srt', encoding: 'utf-8', show: false }
const media = { name: '会议.mp4' }
const pick = () => selectionFromBounds(cues, 0, 1, 3, 5)
const reference = () => createTranscriptReference(pick(), subtitle, media)

test('partial sentence selection stays exact rather than expanding to its paragraph', () => {
  const selected = selectionFromBounds(cues, 0, 0, 2, 6)
  assert.equal(selected.text, cues[0].text.slice(2, 6))
  assert.equal(selected.start, 10)
  assert.equal(selected.end, 12)
})

test('cross-cue selection preserves the partial first/last sentences and sentence-level times', () => {
  assert.deepEqual(pick(), {
    fromCue: 0, toCue: 1, fromOffset: 3, toOffset: 5, start: 10, end: 16,
    text: `${cues[0].text.slice(3)} ${cues[1].text.slice(0, 5)}`,
  })
})

test('invalid, reversed, empty and out-of-bounds selections are refused', () => {
  for (const bounds of [[-1, 0, 0, 1], [0, 9, 0, 1], [2, 0, 0, 1], [0, 0, 3, 1], [0, 0, 2, 2], [0, 0, 0, 999], [0.5, 1, 0, 1]]) {
    assert.equal(selectionFromBounds(cues, ...bounds), null)
  }
})

test('UTF-16 bounds cannot split an emoji surrogate pair', () => {
  const emoji = [{ start: 0, end: 1, text: '😀方案' }]
  assert.equal(selectionFromBounds(emoji, 0, 0, 1, 4), null)
  assert.equal(selectionFromBounds(emoji, 0, 0, 0, 1), null)
  assert.equal(selectionFromBounds(emoji, 0, 0, 0, 2).text, '😀')
})

test('reference shows unavailable paths honestly and does not invent paths from names or IDs', () => {
  const quote = reference()
  assert.match(quote.text, /^文件路径：路径不可用（文件名：会议.srt）\n选中内容：\n/u)
  assert.match(quote.text, /字幕源媒体路径：路径不可用（文件名：会议.mp4）/u)
  assert.match(quote.text, /时间范围：00:10–00:16/u)
  assert.equal(quote.text.includes(subtitle.id), false)
  assert.equal(quote.kind, 'content')
  assert.equal('resource' in quote, false)
})

test('only genuine relativePath metadata is displayed, explicitly labelled as relative', () => {
  const quote = createTranscriptReference(pick(), { ...subtitle, relativePath: '字幕/会议.srt' }, { ...media, relativePath: '录像/会议.mp4' })
  assert.match(quote.text, /文件路径：字幕\/会议.srt（接口提供的相对路径）/u)
  assert.match(quote.text, /字幕源媒体路径：录像\/会议.mp4（接口提供的相对路径）/u)
})

test('the saved snapshot can be decoded exactly even when the selection contains metadata-like text', () => {
  const selected = { ...pick(), text: '正文\n\n字幕源媒体路径：不是路径\n选中内容：\n仍然是正文' }
  const quote = createTranscriptReference(selected, subtitle, media)
  assert.equal(readTranscriptReference(quote.locator, quote.text).text, selected.text)
  const normal = reference()
  assert.deepEqual(readTranscriptReference(normal.locator, normal.text).data.subtitle, subtitle)
})

test('unknown locator versions, wrong kinds, changed snapshots and invalid resources are refused', () => {
  const quote = reference()
  assert.equal(readTranscriptReference({ ...quote.locator, version: 2 }, quote.text), null)
  assert.equal(readTranscriptReference({ version: 1, data: { ...quote.locator.data, kind: 'other' } }, quote.text), null)
  assert.equal(readTranscriptReference(quote.locator, quote.text + 'changed'), null)
  assert.equal(readTranscriptReference({ version: 1, data: { ...quote.locator.data, subtitle: { ...subtitle, id: 'not-a-resource' } } }, quote.text), null)
  assert.equal(readTranscriptReference(null, quote.text), null)
})

test('non-finite times, negative offsets and forged snapshot lengths are refused', () => {
  const quote = reference()
  for (const patch of [{ start: NaN }, { end: Infinity }, { end: 9 }, { fromOffset: -1 }, { prefixLength: 1 }, { selectionLength: 0 }, { selectionLength: 100000 }]) {
    assert.equal(readTranscriptReference({ version: 1, data: { ...quote.locator.data, ...patch } }, quote.text), null)
  }
})

test('locating unchanged subtitles uses both text and the saved start time', () => {
  assert.deepEqual(locateTranscriptSelection(cues, pick()), pick())
})

test('revised subtitles may relocate a unique quote without blindly trusting old indexes', () => {
  const revised = [{ start: 0, end: 1, text: '新增一句。' }, ...cues.map(cue => ({ ...cue, start: cue.start + 1, end: cue.end + 1 }))]
  const located = locateTranscriptSelection(revised, pick())
  assert.equal(located.fromCue, 1)
  assert.equal(located.toCue, 2)
  assert.equal(located.start, 11)
  assert.equal(located.text, pick().text)
})

test('missing text or ambiguous repeated text returns failure, not a guessed first result', () => {
  assert.equal(locateTranscriptSelection(cues, { ...pick(), text: '根本不存在的句子' }), null)
  const repeated = [{ start: 1, end: 2, text: '重复文字' }, { start: 3, end: 4, text: '重复文字' }]
  assert.equal(locateTranscriptSelection(repeated, { fromCue: 9, toCue: 9, fromOffset: 0, toOffset: 4, start: 100, text: '重复文字' }), null)
  assert.equal(locateTranscriptSelection(repeated, { fromCue: 1, toCue: 1, fromOffset: 0, toOffset: 4, start: 3, text: '重复文字' }).start, 3)
})

test('whitespace differences can relocate a unique partial quote without losing character offsets', () => {
  const original = [{ start: 1, end: 2, text: '前文 hello world 后文' }]
  const selected = selectionFromBounds(original, 0, 0, 3, 14)
  const revised = [{ start: 2, end: 3, text: '前文 hello  world 后文' }]
  const located = locateTranscriptSelection(revised, selected)
  assert.equal(located.text, 'hello  world')
  assert.equal(located.fromOffset, 3)
  assert.equal(located.toOffset, 15)
})

test('overlapping cue intervals keep the full time coverage', () => {
  const selected = selectionFromBounds([{ start: 0, end: 10, text: '甲' }, { start: 2, end: 3, text: '乙' }], 0, 1, 0, 1)
  assert.equal(selected.end, 10)
})

test('selection and locator budgets fail explicitly rather than silently truncating', () => {
  assert.throws(() => createTranscriptReference({ ...pick(), text: '字'.repeat(32769) }, subtitle, media), /缩小选区/u)
  assert.throws(() => createTranscriptReference(pick(), { ...subtitle, relativePath: '字'.repeat(20000) }, media), /来源信息过长/u)
})
