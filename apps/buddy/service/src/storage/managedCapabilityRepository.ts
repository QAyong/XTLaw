import type { DatabaseSync } from 'node:sqlite'
import type { ExtensionMcpConnectorContribution } from '../../../shared/extensions/extensionMcpConnectors'
import type { ExtensionSubagentContribution } from '../../../shared/extensions/extensionSubagents'
import type { ManagedCapabilitySource, ManagedCapabilityState, ManagedCapabilityUnavailableReason } from '../../../shared/extensions/managedCapability'
import { randomUUID } from 'node:crypto'
import { extensionMcpConnectorContributionSchema } from '../../../shared/extensions/extensionMcpConnectors'
import { extensionSubagentContributionSchema } from '../../../shared/extensions/extensionSubagents'
import { managedCapabilitySourceSchema } from '../../../shared/extensions/managedCapability'

export type ManagedCapabilityRecord = ManagedCapabilitySource & {
  id: string
  credentialTarget: string | null
} & ({ kind: 'mcp', definition: ExtensionMcpConnectorContribution } | { kind: 'subagent', definition: ExtensionSubagentContribution })
export type ManagedCapabilityInput = Pick<ManagedCapabilityRecord, 'extensionId' | 'extensionName' | 'contributionId' | 'revision' | 'state' | 'kind' | 'definition'>

export function toManagedCapabilitySource(record: ManagedCapabilityRecord): ManagedCapabilitySource {
  return { extensionId: record.extensionId, extensionName: record.extensionName, contributionId: record.contributionId, revision: record.revision, state: record.state, userEnabled: record.userEnabled, unavailableReason: record.unavailableReason }
}

export function createManagedCapabilityRepository(database: DatabaseSync) {
  const get = (id: string): ManagedCapabilityRecord | null => parse(database.prepare('SELECT * FROM extension_capabilities WHERE id = ?').get(id))
  return {
    get,
    find(extensionId: string, kind: ManagedCapabilityRecord['kind'], contributionId: string): ManagedCapabilityRecord | null {
      return parse(database.prepare('SELECT * FROM extension_capabilities WHERE extension_id = ? AND kind = ? AND contribution_id = ?').get(extensionId, kind, contributionId))
    },
    list(extensionId?: string): ManagedCapabilityRecord[] {
      const rows = extensionId === undefined
        ? database.prepare('SELECT * FROM extension_capabilities ORDER BY extension_id, kind, contribution_id').all()
        : database.prepare('SELECT * FROM extension_capabilities WHERE extension_id = ? ORDER BY kind, contribution_id').all(extensionId)
      return rows.map(row => parse(row)!)
    },
    listKind(kind: ManagedCapabilityRecord['kind']): ManagedCapabilityRecord[] {
      return database.prepare('SELECT * FROM extension_capabilities WHERE kind = ? ORDER BY extension_id, contribution_id').all(kind).map(row => parse(row)!)
    },
    upsertSource(input: ManagedCapabilityInput): ManagedCapabilityRecord {
      const existing = database.prepare('SELECT id FROM extension_capabilities WHERE extension_id = ? AND kind = ? AND contribution_id = ?').get(input.extensionId, input.kind, input.contributionId) as { id: string } | undefined
      let id = existing?.id ?? randomUUID()
      if (!existing) {
        while (database.prepare('SELECT 1 FROM buddies WHERE id = ? UNION ALL SELECT 1 FROM mcp_servers WHERE id = ? UNION ALL SELECT 1 FROM extension_capabilities WHERE id = ? LIMIT 1').get(id, id, id))
          id = randomUUID()
      }
      const definition = input.kind === 'mcp' ? extensionMcpConnectorContributionSchema.parse(input.definition) : extensionSubagentContributionSchema.parse(input.definition)
      database.prepare(`INSERT INTO extension_capabilities (id, extension_id, extension_name, kind, contribution_id, revision, definition_json, state, user_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET extension_name = excluded.extension_name, revision = excluded.revision, definition_json = excluded.definition_json, state = excluded.state`)
        .run(id, input.extensionId, input.extensionName, input.kind, input.contributionId, input.revision, JSON.stringify(definition), input.state, Number(input.kind === 'subagent'))
      return get(id)!
    },
    setState(id: string, state: ManagedCapabilityState): void {
      database.prepare('UPDATE extension_capabilities SET state = ? WHERE id = ?').run(state, id)
    },
    setUserEnabled(id: string, enabled: boolean): void {
      database.prepare('UPDATE extension_capabilities SET user_enabled = ? WHERE id = ?').run(Number(enabled), id)
    },
    setUnavailableReason(id: string, reason: ManagedCapabilityUnavailableReason | null): void {
      database.prepare('UPDATE extension_capabilities SET unavailable_reason = ? WHERE id = ?').run(reason, id)
    },
    setCredentialTarget(id: string, target: string | null): void {
      database.prepare('UPDATE extension_capabilities SET credential_target = ? WHERE id = ?').run(target, id)
    },
    clearConfiguration(id: string): void {
      database.prepare('UPDATE extension_capabilities SET user_enabled = 0, credential_target = NULL, unavailable_reason = NULL WHERE id = ?').run(id)
    },
    suspendAll(): void {
      database.prepare('UPDATE extension_capabilities SET state = \'unavailable\' WHERE state IN (\'enabled\', \'disabled\')').run()
    },
  }
}

export type ManagedCapabilityRepository = ReturnType<typeof createManagedCapabilityRepository>

function parse(value: unknown): ManagedCapabilityRecord | null {
  if (!value)
    return null
  const row = value as { id: string, extension_id: string, extension_name: string, kind: ManagedCapabilityRecord['kind'], contribution_id: string, revision: string, definition_json: string, state: ManagedCapabilityState, user_enabled: number, credential_target: string | null, unavailable_reason: ManagedCapabilityUnavailableReason | null }
  const definition: unknown = JSON.parse(row.definition_json)
  return {
    ...managedCapabilitySourceSchema.parse({ extensionId: row.extension_id, extensionName: row.extension_name, contributionId: row.contribution_id, revision: row.revision, state: row.state, userEnabled: row.user_enabled === 1, unavailableReason: row.unavailable_reason }),
    id: row.id,
    credentialTarget: row.credential_target,
    ...(row.kind === 'mcp'
      ? { kind: 'mcp', definition: extensionMcpConnectorContributionSchema.parse(definition) }
      : { kind: 'subagent', definition: extensionSubagentContributionSchema.parse(definition) }),
  }
}
