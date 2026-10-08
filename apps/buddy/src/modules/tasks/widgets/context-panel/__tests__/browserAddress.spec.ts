import { describe, expect, it } from 'vitest'
import { normalizeBrowserAddress } from '../browserAddress'

describe('browser address normalization', () => {
  it.each([
    ['localhost:5173', 'http://localhost:5173/'],
    ['127.0.0.1:3000/app', 'http://127.0.0.1:3000/app'],
    ['[::1]:8080', 'http://[::1]:8080/'],
    ['192.168.1.10', 'http://192.168.1.10/'],
    ['10.0.0.4:8000', 'http://10.0.0.4:8000/'],
    ['printer.local', 'http://printer.local/'],
    ['example.com', 'https://example.com/'],
    ['example.com/docs?q=1', 'https://example.com/docs?q=1'],
    ['https://example.com/secure', 'https://example.com/secure'],
  ])('resolves %s to %s', (input, expected) => {
    expect(normalizeBrowserAddress(input)).toBe(expected)
  })

  it.each([
    [''],
    ['   '],
    ['ftp://example.com/file'],
    ['javascript:alert(1)'],
    ['hello world'],
    ['not a url at all / spaces'],
  ])('rejects %j instead of guessing a search request', (input) => {
    expect(normalizeBrowserAddress(input)).toBeNull()
  })
})
