// A tool id is the JSON of `[source, group, name]`. For an MCP tool the group is its connector. Naming `*` in place of the tool
// selects every tool of that connector, so a role does not have to list names the server may add to or take away later.
const ANY_TOOL = '*'

function parseToolId(id: string): [string, string, string] | null {
  try {
    const identity: unknown = JSON.parse(id)
    return Array.isArray(identity) && identity.length === 3 && identity.every(part => typeof part === 'string') ? identity as [string, string, string] : null
  }
  catch {
    return null
  }
}

/** The id that selects all tools of one MCP connector. */
export function connectorToolsId(connectorId: string): string {
  return JSON.stringify(['mcp', connectorId, ANY_TOOL])
}

/** The connector an id selects as a whole, or null for an id that names a single tool. */
export function connectorOfToolsId(id: string): string | null {
  const identity = parseToolId(id)
  return identity && identity[0] === 'mcp' && identity[2] === ANY_TOOL ? identity[1] : null
}

export interface ToolSelectionMatcher {
  /** Whether a catalog tool id is covered by the selection, by name or through its connector. */
  has: (toolId: string) => boolean
  /** Selected ids that name one tool the catalog no longer has. A connector-wide id never counts: with the connector off, it simply covers nothing. */
  missing: (available: Iterable<string>) => string[]
}

export function toolSelectionMatcher(ids: readonly string[]): ToolSelectionMatcher {
  const named = new Set(ids)
  const connectors = new Set(ids.flatMap((id) => {
    const connector = connectorOfToolsId(id)
    return connector === null ? [] : [connector]
  }))
  return {
    has(toolId) {
      if (named.has(toolId))
        return true
      if (!connectors.size)
        return false
      const identity = parseToolId(toolId)
      return identity !== null && identity[0] === 'mcp' && connectors.has(identity[1])
    },
    missing(available) {
      const present = new Set(available)
      return ids.filter(id => connectorOfToolsId(id) === null && !present.has(id))
    },
  }
}
