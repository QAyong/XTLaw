import { describe, expect, it } from 'vitest'

const { activeAt, decodeSubtitle, formatTime, parseSubtitles, positionAt } = await import('../../../plugins/course-player/subtitles.js')

describe('course player subtitles: parsing', () => {
  it('reads SRT with CRLF line endings, a byte order mark, multi-line text and markup', () => {
    const srt = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Hello</i>\r\nworld &amp; all\r\n\r\n2\r\n00:01:02,250 --> 00:01:04,000\r\n{\\an8}Second\r\n'
    expect(parseSubtitles(srt)).toEqual([
      { start: 1, end: 3.5, text: 'Hello\nworld & all' },
      { start: 62.25, end: 64, text: 'Second' },
    ])
  })

  it('reads WebVTT: header, notes, styles, identifiers, cue settings, tags and short timestamps', () => {
    const vtt = [
      'WEBVTT - lecture',
      '',
      'NOTE this is not a cue',
      '',
      'STYLE',
      '::cue { color: red }',
      '',
      'intro',
      '00:01.000 --> 00:02.500 align:start position:10%',
      '<v Teacher>Welcome <c.yellow>back</c></v>',
      '',
      '01:00:00.000 --> 01:00:01.000',
      'An <00:00:01.000>hour in',
    ].join('\n')
    expect(parseSubtitles(vtt)).toEqual([
      { start: 1, end: 2.5, text: 'Welcome back' },
      { start: 3600, end: 3601, text: 'An hour in' },
    ])
  })

  it('accepts a cue that follows the WEBVTT line without a blank line in between', () => {
    expect(parseSubtitles('WEBVTT\n00:00.000 --> 00:01.000\nHi')).toEqual([{ start: 0, end: 1, text: 'Hi' }])
  })

  it('skips cues without text or with a negative span, keeps a lone "<" in prose, and sorts by start', () => {
    const srt = '1\n00:00:05,000 --> 00:00:06,000\nif x < 5 and y > 3\n\n2\n00:00:01,000 --> 00:00:02,000\n<i> </i>\n\n3\n00:00:09,000 --> 00:00:08,000\nbackwards\n\n4\n00:00:02,000 --> 00:00:03,000\nfirst\n\n5\nnot a timing line\ntext\n'
    expect(parseSubtitles(srt)).toEqual([
      { start: 2, end: 3, text: 'first' },
      { start: 5, end: 6, text: 'if x < 5 and y > 3' },
    ])
  })

  it('decodes entities once and leaves unknown ones alone', () => {
    expect(parseSubtitles('1\n00:00:00,000 --> 00:00:01,000\n&amp;lt; &#65;&#x42; &unknown; &nbsp;x\n')[0]?.text).toBe('&lt; AB &unknown;  x')
  })

  it('returns no cues for text that is not a subtitle file', () => {
    expect(parseSubtitles('')).toEqual([])
    expect(parseSubtitles('just some prose\n\nwith paragraphs')).toEqual([])
  })
})

describe('course player subtitles: decoding', () => {
  it('reads UTF-8 with and without a byte order mark', () => {
    const encoder = new TextEncoder()
    expect(decodeSubtitle(encoder.encode('你好'))).toBe('你好')
    expect(decodeSubtitle(new Uint8Array([0xEF, 0xBB, 0xBF, ...encoder.encode('你好')]))).toBe('你好')
  })

  it('reads UTF-16 with a byte order mark', () => {
    expect(decodeSubtitle(new Uint8Array([0xFF, 0xFE, 0x60, 0x4F, 0x7D, 0x59]))).toBe('你好')
    expect(decodeSubtitle(new Uint8Array([0xFE, 0xFF, 0x4F, 0x60, 0x59, 0x7D]))).toBe('你好')
  })

  it('falls back to GB18030 when the bytes are not valid UTF-8', () => {
    expect(decodeSubtitle(new Uint8Array([0xC4, 0xE3, 0xBA, 0xC3]))).toBe('你好')
  })
})

describe('course player subtitles: look-ups', () => {
  const cues = [
    { start: 1, end: 2, text: 'a' },
    { start: 4, end: 6, text: 'b' },
    { start: 6, end: 7, text: 'c' },
  ]

  it('finds the last cue that has started, including exactly at its start time', () => {
    expect([0, 1, 3.9, 4, 5.99, 6, 100].map(time => positionAt(cues, time))).toEqual([-1, 0, 0, 1, 1, 2, 2])
    expect(positionAt([], 3)).toBe(-1)
  })

  it('reports a gap between cues as no active cue', () => {
    expect([0.5, 1, 1.99, 2, 3, 4, 6, 7, 8].map(time => activeAt(cues, time))).toEqual([-1, 0, 0, -1, -1, 1, 2, -1, -1])
  })

  it('formats times as m:ss or h:mm:ss', () => {
    expect([0, 5.9, 65, 3599, 3600, 3725, -3, Number.NaN].map(formatTime)).toEqual(['0:00', '0:05', '1:05', '59:59', '1:00:00', '1:02:05', '0:00', '0:00'])
  })
})
