import { describe, expect, it } from 'vitest'
import { serverErrorMessage } from '../createMcpTools'
import { McpClientError } from '../McpClientSession'

function protocolError(message: string) {
  const error = new Error(message)
  error.name = 'ProtocolError'
  return error
}

describe('serverErrorMessage', () => {
  it('returns the server text from a wrapped protocol error', () => {
    const wrapped = new McpClientError('MCP_TOOL_FAILED', { cause: protocolError('quota insufficient,\n please configure') })
    expect(serverErrorMessage(wrapped)).toBe('quota insufficient, please configure')
  })

  it('truncates long messages', () => {
    const wrapped = new McpClientError('MCP_TOOL_FAILED', { cause: protocolError('x'.repeat(1000)) })
    expect(serverErrorMessage(wrapped)).toHaveLength(300)
  })

  it('never exposes local or transport failures', () => {
    expect(serverErrorMessage(new McpClientError('MCP_TOOL_FAILED', { cause: new Error('ECONNRESET 10.0.0.1') }))).toBeNull()
    expect(serverErrorMessage(new McpClientError('MCP_TOOL_FAILED'))).toBeNull()
    expect(serverErrorMessage('plain string')).toBeNull()
  })
})
