import type { LocalConnector } from '@buddy-shared/connectors/connectorApi'

export function connectorUserEnabled(connector: LocalConnector): boolean {
  return connector.managed?.userEnabled ?? connector.enabled
}

export function connectorCanEnable(connector: LocalConnector): boolean {
  return !connector.managed || (connector.managed.state === 'enabled' && !connector.managed.unavailableReason)
}

export function connectorCanLogin(connector: LocalConnector): boolean {
  if (connector.runtime.authorization !== 'oauth' || (connector.managed && connector.managed.state !== 'enabled'))
    return false
  return (!!connector.managed && (!connector.credentialConfigured || !!connector.managed.unavailableReason))
    || ['MCP_AUTHENTICATION_REQUIRED', 'MCP_AUTHENTICATION_FAILED', 'MCP_AUTHENTICATION_CANCELLED', 'MCP_ACCESS_DENIED'].includes(connector.runtime.errorCode ?? '')
}
