import assert from 'node:assert/strict'
import test from 'node:test'
import { readSubtitle } from '../src/subtitle-loader.ts'
import { activeCueIndexes, formatTime, groupCues, MAX_SUBTITLE_BYTES, normalizeCue, normalizeCues, subtitleType } from '../src/transcript.ts'

test('recognizes only the three subtitle extensions', () => {
  assert.equal(subtitleType('meeting.SRT'), 'srt')
  assert.equal(subtitleType('notes.vtt'), 'vtt')
  assert.equal(subtitleType('captions.ass'), 'ass')
  assert.equal(subtitleType('video.mp4'), null)
  assert.equal(subtitleType('srt'), null)
})

test('keeps subtitle text literal and only removes known markup', () => {
  const cue = normalizeCue({ startTime: 1, endTime: 2, text: '<v Alice>Hello &amp; <b>there</b> <script>' })
  assert.deepEqual(cue, { start: 1, end: 2, text: 'Hello & there <script>', speaker: 'Alice' })
  assert.equal(normalizeCue({ startTime: 2, endTime: 2, text: 'zero' }), null)
  assert.equal(normalizeCue({ startTime: 1, endTime: 2, text: '   ' }), null)
  assert.equal(normalizeCue({ startTime: Number.NaN, endTime: 2, text: 'bad' }), null)
})

test('sorts cues and rejects an oversized transcript', () => {
  assert.deepEqual(normalizeCues([
    { startTime: 3, endTime: 4, text: 'later' },
    { startTime: 1, endTime: 2, text: '<00:00:01.000>first' },
  ]).map(cue => cue.text), ['first', 'later'])
  assert.throws(() => normalizeCues(Array.from({ length: 20001 }, (_, i) => ({ startTime: i, endTime: i + 0.5, text: 'x' }))), /20,000/)
})

test('treats cue end as exclusive and keeps overlapping speakers', () => {
  const cues = normalizeCues([
    { startTime: 0, endTime: 2, text: 'a' },
    { startTime: 1, endTime: 3, text: 'b' },
  ])
  assert.deepEqual(activeCueIndexes(cues, 1), [0, 1])
  assert.deepEqual(activeCueIndexes(cues, 2), [1])
  assert.deepEqual(activeCueIndexes(cues, 3), [])
})

test('groups only the same speaker across a gap under 1.5 seconds', () => {
  const cues = normalizeCues([
    { startTime: 0, endTime: 1, text: '<v A>one' },
    { startTime: 2.4, endTime: 3, text: '<v A>two' },
    { startTime: 4.6, endTime: 5, text: '<v A>three' },
    { startTime: 5.2, endTime: 6, text: '<v B>other' },
  ])
  assert.deepEqual(groupCues(cues), [[0, 1], [2], [3]])
})

test('formats playback time without inventing hours', () => {
  assert.equal(formatTime(0), '00:00')
  assert.equal(formatTime(61.9), '01:01')
  assert.equal(formatTime(3661), '1:01:01')
  assert.equal(formatTime(Number.NaN), '00:00')
})

test('rejects empty, oversized, and wrongly encoded subtitles', async () => {
  const signal = AbortSignal.timeout(5000)
  await assert.rejects(readSubtitle(new Response('   '), 'utf-8', signal), /为空/)
  await assert.rejects(readSubtitle(new Response(Uint8Array.from([0xff, 0xfe])), 'utf-8', signal), /编码不匹配/)
  const oversized = new Uint8Array(MAX_SUBTITLE_BYTES + 1)
  oversized.fill(0x61)
  await assert.rejects(readSubtitle(new Response(oversized), 'utf-8', signal), /8 MiB/)
  assert.equal(await readSubtitle(new Response('1\n00:00:00,000 --> 00:00:01,000\n你好'), 'utf-8', signal), '1\n00:00:00,000 --> 00:00:01,000\n你好')
})
