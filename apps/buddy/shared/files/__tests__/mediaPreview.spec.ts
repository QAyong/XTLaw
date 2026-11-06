import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fileMediaUrl, spaceFileMediaUrl, taskFileMediaUrl } from '../mediaPreview'

const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8')

function rendererDirective(name: string): string[] {
  const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1]
  const directive = policy?.split(';').map(part => part.trim().split(/\s+/)).find(([key]) => key === name)
  return directive?.slice(1) ?? []
}

// A CSP host source matches the exact host, and a bare `scheme:` source matches every host of that scheme.
function allows(sources: string[], raw: string): boolean {
  const url = new URL(raw)
  return sources.some((source) => {
    if (source.endsWith(':'))
      return url.protocol === source
    const allowed = new URL(source)
    return url.protocol === allowed.protocol && url.hostname === allowed.hostname
  })
}

// The renderer plays audio and video through <audio>/<video>, which only `media-src` governs (images use `img-src`).
describe('renderer media-src policy', () => {
  const sources = rendererDirective('media-src')

  it('is declared in the renderer page', () => {
    expect(sources.length).toBeGreaterThan(0)
  })

  it.each([
    ['space directory file', spaceFileMediaUrl({ spaceId: 'space', directoryId: 'directory', revision: 1, path: 'clip.mp3' })],
    ['file manager target in a space', fileMediaUrl({ spaceId: 'space', directoryId: 'directory', revision: 1, path: 'clip.mp4' })],
    ['granted directory file in the file manager', fileMediaUrl({ conversationId: 'task', root: '/granted', path: 'clip.mp3' })],
    ['task file opened from a message link', taskFileMediaUrl({ conversationId: 'task', path: '/granted/clip.mp4' })],
  ])('allows the media URL of a %s', (_name, url) => {
    expect(allows(sources, url)).toBe(true)
  })

  it('does not allow hosts that never serve media', () => {
    expect(allows(sources, 'lexora-file://skill-preview/?id=skill&path=clip.mp3')).toBe(false)
    expect(allows(sources, 'lexora-attachment://preview/attachment')).toBe(false)
    expect(allows(sources, 'https://example.com/clip.mp3')).toBe(false)
  })
})
