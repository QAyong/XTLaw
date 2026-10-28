import type { ExtensionMcpConnectorContribution } from '../extensions/extensionMcpConnectors'

export function managedMcpCredentialTarget(definition: ExtensionMcpConnectorContribution): string {
  return JSON.stringify([definition.transport, new URL(definition.url).href, definition.authentication])
}
