import type { McpConnectorService } from './McpConnectorService'
import type { McpServerConfig } from './mcpSchemas'
import { PKULAW_CONNECTOR_ID } from '../../../../shared/connectors/builtinConnectors'

/**
 * Connectors shipped with the application. They are created disabled and without credentials;
 * the user enables one by saving a token in settings.
 */
export const BUILTIN_CONNECTOR_PRESETS: readonly McpServerConfig[] = [
  {
    credentialRef: null,
    enabled: false,
    id: PKULAW_CONNECTOR_ID,
    name: '北大法宝',
    toolExposure: 'deferred',
    toolNamespace: 'pkulaw',
    transport: 'streamable-http',
    url: 'https://apim-gateway.pkulaw.com/mcp-law-agg/1.0.0/mcp',
  },
]

/** True only when id, transport and address all match a shipped preset, so a look-alike connector is not trusted. */
export function isBuiltinPreset(record: { id: string, transport: string, url?: string | null }): boolean {
  return BUILTIN_CONNECTOR_PRESETS.some(preset => preset.id === record.id && preset.transport === record.transport && preset.transport === 'streamable-http' && preset.url === record.url)
}

/**
 * Creates the missing presets. Existing records are never modified, so the user's switch,
 * credential and any other edit survive restarts.
 */
export async function ensureBuiltinConnectors(service: Pick<McpConnectorService, 'list' | 'upsert'>): Promise<void> {
  const existing = new Set(service.list().map(record => record.id))
  for (const preset of BUILTIN_CONNECTOR_PRESETS) {
    if (!existing.has(preset.id))
      await service.upsert({ ...preset })
  }
}
