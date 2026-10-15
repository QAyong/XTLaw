import { describe, expect, it } from 'vitest'
import { normalizeBearerToken } from '../../../../../shared/connectors/bearerToken'
import { createMcpTransport } from '../createMcpTransport'

function authorizationOf(bearerToken: string) {
  const transport = createMcpTransport(
    { credentialRef: null, enabled: true, id: 'fixture', name: 'Fixture', transport: 'streamable-http', url: 'https://example.test/mcp' },
    { type: 'http', bearerToken },
  ) as unknown as { _requestInit?: { headers?: Headers } }
  return transport._requestInit?.headers?.get('authorization') ?? null
}

describe('normalizeBearerToken', () => {
  it('leaves a plain token alone', () => {
    expect(normalizeBearerToken('b355fc0f-5571-3507-8ec7-bc1fcb74a37f')).toBe('b355fc0f-5571-3507-8ec7-bc1fcb74a37f')
  })

  it('removes a pasted scheme, case-insensitively and repeatedly, and trims whitespace', () => {
    expect(normalizeBearerToken('Bearer abc')).toBe('abc')
    expect(normalizeBearerToken('  bearer   abc  ')).toBe('abc')
    expect(normalizeBearerToken('Bearer Bearer abc')).toBe('abc')
  })

  it('does not strip a token that merely starts with the letters', () => {
    expect(normalizeBearerToken('bearerabc')).toBe('bearerabc')
  })

  it('returns an empty string when only the scheme was given', () => {
    expect(normalizeBearerToken('Bearer ')).toBe('')
  })
})

describe('http transport authorization header', () => {
  it('sends a single Bearer prefix even when the stored token already has one', () => {
    expect(authorizationOf('abc')).toBe('Bearer abc')
    expect(authorizationOf('Bearer abc')).toBe('Bearer abc')
    expect(authorizationOf('Bearer Bearer abc')).toBe('Bearer abc')
  })

  it('sends no authorization header for a scheme-only token', () => {
    expect(authorizationOf('Bearer ')).toBeNull()
  })
})
