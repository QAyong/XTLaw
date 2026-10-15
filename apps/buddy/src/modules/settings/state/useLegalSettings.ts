import type { McpSettingsCapability } from './useMcpSettingsCapability'
import { normalizeBearerToken } from '@buddy-shared/connectors/bearerToken'
import { PKULAW_CONNECTOR_ID } from '@buddy-shared/connectors/builtinConnectors'
import { computed } from 'vue'

type LegalMcpCapability = Pick<McpSettingsCapability, 'busyId' | 'clearCredential' | 'connectors' | 'setCredential' | 'setEnabled'>

/**
 * The legal-research source is the built-in PKULaw connector, configured like a service key:
 * saving a token turns it on and clearing the token turns it off.
 */
export function useLegalSettings(mcp: LegalMcpCapability) {
  const connector = computed(() => mcp.connectors.value.find(item => item.id === PKULAW_CONNECTOR_ID) ?? null)
  const busy = computed(() => mcp.busyId.value !== null)

  async function saveToken(token: string | null): Promise<boolean> {
    const current = connector.value
    if (!current)
      return false
    if (token === null) {
      if (current.enabled && await mcp.setEnabled(current.id, false) === null)
        return false
      return await mcp.clearCredential(current.id) !== null
    }
    const bearerToken = normalizeBearerToken(token)
    if (!bearerToken)
      return false
    if (await mcp.setCredential(current.id, { type: 'http', bearerToken }) === null)
      return false
    return await mcp.setEnabled(current.id, true) !== null
  }

  return { busy, connector, saveToken }
}
