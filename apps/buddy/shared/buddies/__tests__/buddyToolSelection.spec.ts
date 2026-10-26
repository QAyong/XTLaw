import { describe, expect, it } from 'vitest'
import { buddySettingsSchema } from '../buddySettings'
import { connectorOfToolsId, connectorToolsId, toolSelectionMatcher } from '../buddyToolSelection'

const tool = (source: string, group: string, name: string) => JSON.stringify([source, group, name])

describe('connector-wide tool selection', () => {
  it('names a connector with a star in the tool position, which the settings schema already accepts', () => {
    expect(connectorToolsId('pkulaw')).toBe('["mcp","pkulaw","*"]')
    expect(connectorOfToolsId('["mcp","pkulaw","*"]')).toBe('pkulaw')
    expect(connectorOfToolsId(tool('mcp', 'pkulaw', 'search_case'))).toBeNull()
    expect(connectorOfToolsId(tool('builtin', 'web', '*'))).toBeNull()
    expect(connectorOfToolsId('not json')).toBeNull()
    expect(buddySettingsSchema.shape.tools.safeParse({ mode: 'selected', ids: [connectorToolsId('pkulaw')] }).success).toBe(true)
  })

  it('covers every tool of that connector and nothing else', () => {
    const matcher = toolSelectionMatcher([tool('builtin', 'core', 'read'), connectorToolsId('pkulaw')])
    expect(matcher.has(tool('builtin', 'core', 'read'))).toBe(true)
    expect(matcher.has(tool('mcp', 'pkulaw', 'search_case'))).toBe(true)
    expect(matcher.has(tool('mcp', 'pkulaw', 'get_points_balance'))).toBe(true)
    expect(matcher.has(tool('mcp', 'other', 'search_case'))).toBe(false)
    expect(matcher.has(tool('builtin', 'core', 'write'))).toBe(false)
    expect(matcher.has(tool('builtin', 'pkulaw', 'search_case'))).toBe(false)
  })

  it('reports only named tools as missing, so a switched-off connector does not make the role unusable', () => {
    const matcher = toolSelectionMatcher([tool('builtin', 'core', 'read'), tool('mcp', 'gone', 'x'), connectorToolsId('pkulaw')])
    expect(matcher.missing([tool('builtin', 'core', 'read')])).toEqual([tool('mcp', 'gone', 'x')])
    expect(toolSelectionMatcher([connectorToolsId('pkulaw')]).missing([])).toEqual([])
  })
})
