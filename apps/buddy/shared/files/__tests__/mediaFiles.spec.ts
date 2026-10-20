import { describe, expect, it } from 'vitest'
import { createMediaUrl, mediaKindOf, mediaMimeType, parseMediaRange, parseMediaUrl } from '../mediaFiles'

const target = { spaceId: 'space-1', directoryId: 'directory-1', revision: 3, path: '媒体/演示 视频.mp4' }

describe('media files', () => {
  it('tells audio and video apart by extension, ignoring case and hidden names', () => {
    expect(mediaKindOf('a/b/clip.MP4')).toBe('video')
    expect(mediaKindOf('song.flac')).toBe('audio')
    expect(mediaMimeType('clip.mov')).toBe('video/quicktime')
    expect(mediaKindOf('notes.md')).toBeNull()
    expect(mediaKindOf('.mp3')).toBeNull()
    expect(mediaKindOf('constructor')).toBeNull()
    expect(mediaMimeType('toString')).toBeNull()
  })

  it('round-trips a file target through the media URL, including non-ASCII paths', () => {
    expect(parseMediaUrl(createMediaUrl(target))).toEqual(target)
    expect(parseMediaUrl(createMediaUrl(target, 2))).toEqual(target)
  })

  it('rejects URLs of another scheme, host, shape or payload', () => {
    const url = createMediaUrl(target)
    expect(parseMediaUrl(url.replace('lexora-media:', 'lexora-app:'))).toBeNull()
    expect(parseMediaUrl(url.replace('//file/', '//other/'))).toBeNull()
    expect(parseMediaUrl(`${url}/extra`)).toBeNull()
    expect(parseMediaUrl('lexora-media://file/not-json')).toBeNull()
    expect(parseMediaUrl(`lexora-media://file/${btoa(JSON.stringify({ ...target, path: 'a.mp4', extra: true })).replaceAll('=', '')}`)).toBeNull()
  })

  it('parses single byte ranges and refuses everything else', () => {
    expect(parseMediaRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseMediaRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseMediaRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseMediaRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseMediaRange('bytes=500-5000', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseMediaRange('bytes=1000-', 1000)).toBe('unsatisfiable')
    expect(parseMediaRange('bytes=10-5', 1000)).toBe('unsatisfiable')
    expect(parseMediaRange('bytes=0-1,5-9', 1000)).toBe('unsatisfiable')
    expect(parseMediaRange('bytes=-', 1000)).toBe('unsatisfiable')
    expect(parseMediaRange('bytes=0-0', 0)).toBe('unsatisfiable')
  })
})
