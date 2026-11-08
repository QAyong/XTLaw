import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeCueIndex, findHits, formatTime, groupCues, normalizeCues } from '../src/transcript.ts'

const cues = [
  { start: 1, end: 3, text: '第一句，讨论方案。' },
  { start: 3.5, end: 5, text: '第二句，继续讨论方案。' },
  { start: 7, end: 9, text: '第三句。' },
]

test('normalize rejects invalid intervals and empty text, sorts and collapses whitespace', () => {
  assert.deepEqual(normalizeCues([
    { start: 4, end: 6, text: ' hello\n world ' },
    { start: 1, end: 3, text: '先开始' },
    { start: -1, end: 2, text: 'invalid' },
    { start: 8, end: 8, text: 'invalid' },
    { start: Infinity, end: Infinity, text: 'invalid' },
    { start: 10, end: 11, text: '  ' },
  ]), [{ start: 1, end: 3, text: '先开始' }, { start: 4, end: 6, text: 'hello world' }])
})

test('paragraphs merge nearby cues and break at 1.5 second pauses', () => {
  assert.deepEqual(groupCues(cues), [{ start: 1, indexes: [0, 1] }, { start: 7, indexes: [2] }])
  assert.equal(groupCues([{ start: 0, end: 1, text: 'a' }, { start: 2.5, end: 3, text: 'b' }]).length, 2)
  assert.deepEqual(groupCues([]), [])
})

test('paragraphs stay readable during continuous speech', () => {
  assert.equal(groupCues([{ start: 0, end: 2, text: '字'.repeat(350) }, { start: 2, end: 3, text: '字'.repeat(20) }]).length, 2)
})

test('active cue handles starts, exclusive ends, gaps and pause-time queries', () => {
  assert.equal(activeCueIndex(cues, 0), -1)
  assert.equal(activeCueIndex(cues, 1), 0)
  assert.equal(activeCueIndex(cues, 3), -1)
  assert.equal(activeCueIndex(cues, 3.5), 1)
  assert.equal(activeCueIndex(cues, 6), -1)
  assert.equal(activeCueIndex(cues, 9), -1)
  assert.equal(activeCueIndex([], 1), -1)
  assert.equal(activeCueIndex(cues, 4), 1)
})

test('overlapping cues prefer the latest active start, then fall back to a still-active cue', () => {
  const overlapping = [{ start: 0, end: 10, text: 'a' }, { start: 2, end: 3, text: 'b' }]
  assert.equal(activeCueIndex(overlapping, 2.5), 1)
  assert.equal(activeCueIndex(overlapping, 4), 0)
})

test('search counts literal occurrences, not just matching cues', () => {
  assert.deepEqual(findHits(cues, '方案'), [
    { cueIndex: 0, start: 6, end: 8 }, { cueIndex: 1, start: 8, end: 10 },
  ])
  const text = [{ start: 0, end: 1, text: 'A.b [a] a.b' }]
  assert.deepEqual(findHits(text, ' a.b '), [{ cueIndex: 0, start: 0, end: 3 }, { cueIndex: 0, start: 8, end: 11 }])
  assert.equal(findHits(text, '[a]').length, 1)
  assert.equal(findHits(text, '.*').length, 0)
  assert.deepEqual(findHits(text, ' '), [])
})

test('search keeps UTF-16 offsets valid with non-ASCII text and surrogate pairs', () => {
  assert.deepEqual(findHits([{ start: 0, end: 1, text: '😀方案😀方案' }], '方案'), [
    { cueIndex: 0, start: 2, end: 4 }, { cueIndex: 0, start: 6, end: 8 },
  ])
})

test('timestamps support hours and invalid media duration', () => {
  assert.equal(formatTime(0), '00:00')
  assert.equal(formatTime(65.9), '01:05')
  assert.equal(formatTime(3605), '1:00:05')
  assert.equal(formatTime(NaN), '00:00')
})
