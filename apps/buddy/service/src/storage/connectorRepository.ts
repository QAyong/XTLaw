import type { DatabaseSync } from 'node:sqlite'
import type { McpToolExposure } from '../../../shared/connectors/mcpToolExposure'
import type { ManagedCapabilitySource } from '../../../shared/extensions/managedCapability'
import type { ManagedCapabilityRecord } from './managedCapabilityRepository'
import { createHash } from 'node:crypto'
import { managedMcpCredentialTarget } from '../../../shared/connectors/managedMcp'
import { mcpNamespaceBase } from '../../../shared/connectors/mcpToolExposure'
import { isManagedCapabilityEnabled } from '../../../shared/extensions/managedCapability'
import { createManagedCapabilityRepository, toManagedCapabilitySource } from './managedCapabilityRepository'

export type McpTransport = 'stdio' | 'streamable-http'

export interface McpServerRecord {
  managed?: ManagedCapabilitySource
  id: string
  name: string
  toolNamespace: string
  toolExposure: McpToolExposure
  transport: McpTransport
  command: string | null
  args: string[] | null
  cwd: string | null
  url: string | null
  credentialRef: string | null
  executionConfirmedAt: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ConnectorRepository {
  configureManaged: (record: McpServerWrite, configuration: Pick<ManagedCapabilityRecord, 'credentialTarget' | 'userEnabled' | 'unavailableReason'>) => McpServerRecord
  readCatalog: (id: string) => { toolsJson: string, updatedAt: string } | null
  saveCatalog: (id: string, toolsJson: string, updatedAt: string) => void
  clearCatalog: (id: string) => void
  findById: (id: string) => McpServerRecord | null
  findStoredById: (id: string) => McpServerRecord | null
  list: () => McpServerRecord[]
  remove: (id: string) => boolean
  upsert: (record: McpServerWrite) => McpServerRecord
}

export type McpServerWrite = Omit<McpServerRecord, 'toolNamespace' | 'toolExposure'> & Partial<Pick<McpServerRecord, 'toolNamespace' | 'toolExposure'>>

interface McpServerRow {
  id: string
  name: string
  tool_namespace: string
  tool_exposure: McpToolExposure
  transport: McpTransport
  command: string | null
  args_json: string | null
  cwd: string | null
  url: string | null
  credential_ref: string | null
  trusted_at: string | null
  enabled: number
  created_at: string
  updated_at: string
}

export function createConnectorRepository(database: DatabaseSync): ConnectorRepository {
  const managed = createManagedCapabilityRepository(database)
  function project(record: McpServerRecord): McpServerRecord {
    const source = managed.get(record.id)
    if (!source || source.kind !== 'mcp' || !('authentication' in source.definition))
      return record
    const definition = source.definition
    const metadata = toManagedCapabilitySource(source)
    if (((source.credentialTarget !== null || record.credentialRef !== null) && source.credentialTarget !== managedMcpCredentialTarget(definition)) || record.url !== definition.url)
      metadata.unavailableReason = 'target_changed'
    else if (!metadata.unavailableReason && definition.authentication !== 'none' && !record.credentialRef)
      metadata.unavailableReason = 'authentication_required'
    return { ...record, name: definition.name, transport: definition.transport, url: definition.url, command: null, args: null, cwd: null, managed: metadata, enabled: isManagedCapabilityEnabled(metadata) }
  }
  const namespaceOwner = database.prepare('SELECT id FROM mcp_servers WHERE tool_namespace = ?')
  function allocateNamespace(name: string, id: string): string {
    const base = mcpNamespaceBase(name) || 'server'
    if (!namespaceOwner.get(base))
      return base
    for (let attempt = 0; ; attempt++) {
      const suffix = createHash('sha256').update(`${id}:${attempt}`).digest('hex').slice(0, 12)
      const candidate = `${base.slice(0, 19)}_${suffix}`
      if (!namespaceOwner.get(candidate))
        return candidate
    }
  }
  const missing = database.prepare('SELECT id, name FROM mcp_servers WHERE tool_namespace IS NULL ORDER BY id').all() as { id: string, name: string }[]
  const assignNamespace = database.prepare('UPDATE mcp_servers SET tool_namespace = ? WHERE id = ? AND tool_namespace IS NULL')
  for (const record of missing)
    assignNamespace.run(allocateNamespace(record.name, record.id), record.id)
  const readCatalog = database.prepare('SELECT tools_json, updated_at FROM connector_tool_catalogs WHERE connector_id = ?')
  const saveCatalog = database.prepare(`
    INSERT INTO connector_tool_catalogs (connector_id, tools_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (connector_id) DO UPDATE SET tools_json = excluded.tools_json, updated_at = excluded.updated_at
  `)
  const clearCatalog = database.prepare('DELETE FROM connector_tool_catalogs WHERE connector_id = ?')
  const find = database.prepare('SELECT * FROM mcp_servers WHERE id = ?')
  const list = database.prepare('SELECT * FROM mcp_servers ORDER BY name, id')
  const remove = database.prepare('DELETE FROM mcp_servers WHERE id = ?')
  const upsert = database.prepare(`
    INSERT INTO mcp_servers (
      id, name, transport, command, args_json, cwd, url,
      credential_ref, trusted_at, enabled, created_at, updated_at, tool_namespace, tool_exposure
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name,
      tool_exposure = excluded.tool_exposure,
      transport = excluded.transport,
      command = excluded.command,
      args_json = excluded.args_json,
      cwd = excluded.cwd,
      url = excluded.url,
      credential_ref = excluded.credential_ref,
      trusted_at = excluded.trusted_at,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `)
  const repository: ConnectorRepository = {
    configureManaged(record, configuration) {
      const source = managed.get(record.id)
      if (!source || source.kind !== 'mcp')
        throw new Error('MCP_MANAGED_SOURCE_REQUIRED')
      database.exec('SAVEPOINT mcp_configuration')
      try {
        repository.upsert(record)
        managed.setCredentialTarget(record.id, configuration.credentialTarget)
        managed.setUnavailableReason(record.id, configuration.unavailableReason)
        managed.setUserEnabled(record.id, configuration.userEnabled)
        const saved = repository.findById(record.id)!
        database.exec('RELEASE mcp_configuration')
        return saved
      }
      catch (error) {
        database.exec('ROLLBACK TO mcp_configuration; RELEASE mcp_configuration')
        throw error
      }
    },
    readCatalog(id) {
      const row = readCatalog.get(id) as { tools_json: string, updated_at: string } | undefined
      return row ? { toolsJson: row.tools_json, updatedAt: row.updated_at } : null
    },
    saveCatalog(id, toolsJson, updatedAt) {
      saveCatalog.run(id, toolsJson, updatedAt)
    },
    clearCatalog(id) {
      clearCatalog.run(id)
    },
    findStoredById(id) {
      const row = find.get(id) as McpServerRow | undefined
      return row ? toMcpServer(row) : null
    },
    findById(id) {
      const row = find.get(id) as McpServerRow | undefined
      return row ? project(toMcpServer(row)) : null
    },
    list() {
      return (list.all() as unknown as McpServerRow[]).map(row => project(toMcpServer(row)))
    },
    remove(id) {
      return Number(remove.run(id).changes) === 1
    },
    upsert(record) {
      const existing = find.get(record.id) as McpServerRow | undefined
      const toolNamespace = existing?.tool_namespace ?? record.toolNamespace ?? allocateNamespace(record.name, record.id)
      const owner = namespaceOwner.get(toolNamespace) as { id: string } | undefined
      if (owner && owner.id !== record.id)
        throw Object.assign(new Error('MCP namespace already exists'), { code: 'MCP_NAMESPACE_CONFLICT' })
      upsert.run(
        record.id,
        record.name,
        record.transport,
        record.command,
        record.args ? JSON.stringify(record.args) : null,
        record.cwd,
        record.url,
        record.credentialRef,
        record.executionConfirmedAt,
        Number(record.enabled),
        record.createdAt,
        record.updatedAt,
        toolNamespace,
        record.toolExposure ?? existing?.tool_exposure ?? 'deferred',
      )
      return project(requireMcpServer(find.get(record.id), record.id))
    },
  }
  return repository
}

function requireMcpServer(value: unknown, id: string): McpServerRecord {
  const row = value as McpServerRow | undefined
  if (!row)
    throw new Error(`Lexora Buddy MCP server was not persisted: ${id}`)
  return toMcpServer(row)
}

function toMcpServer(row: McpServerRow): McpServerRecord {
  return {
    id: row.id,
    name: row.name,
    toolNamespace: row.tool_namespace,
    toolExposure: row.tool_exposure,
    transport: row.transport,
    command: row.command,
    args: parseStringArray(row.args_json, row.id),
    cwd: row.cwd,
    url: row.url,
    credentialRef: row.credential_ref,
    executionConfirmedAt: row.trusted_at,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseStringArray(value: string | null, id: string): string[] | null {
  if (value === null)
    return null
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every(item => typeof item === 'string'))
    throw new Error(`Lexora Buddy MCP args are invalid: ${id}`)
  return parsed
}
