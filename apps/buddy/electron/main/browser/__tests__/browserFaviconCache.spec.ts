import { describe, expect, it } from 'vitest'
import { BrowserFaviconCache, browserFaviconOrigin } from '../browserFaviconCache'

const icon = 'data:image/png;base64,AAAA'

describe('browser favicon cache', () => {
  it('remembers a validated icon by partition and page origin', () => {
    const cache = new BrowserFaviconCache()
    expect(browserFaviconOrigin('https://example.com/a?secret=1')).toBe('https://example.com')
    expect(browserFaviconOrigin('file:///tmp/a.html')).toBeNull()
    cache.remember('persist:default', 'https://example.com', icon)
    expect(cache.recall('persist:default', 'https://example.com')).toBe(icon)
    expect(cache.recall('buddy-browser-incognito:1', 'https://example.com')).toBeNull()
    expect(cache.recall('persist:default', 'https://other.example')).toBeNull()
  })

  it('does not store a remote URL or an empty origin', () => {
    const cache = new BrowserFaviconCache()
    cache.remember('persist:default', 'https://example.com', 'https://example.com/icon.png')
    cache.remember('persist:default', '', icon)
    expect(cache.recall('persist:default', 'https://example.com')).toBeNull()
    expect(cache.recall('persist:default', '')).toBeNull()
  })
})
