import type { DatabaseSync } from 'node:sqlite'
import type { ExtensionCapabilityDescriptor } from '../../../../shared/extensions/extensionCapabilities'
import type { McpServerConfig } from '../../connectors/mcp/mcpSchemas'
import type { McpServerRecord } from '../../storage/connectorRepository'
import type { CapabilityLedger } from '../ExtensionCapabilitySync'
import { afterEach, describe, expect, it } from 'vitest'
import { BUILTIN_BUDDY_ID } from '../../../../shared/buddies/buddyApi'
import { buddySettingsSchema } from '../../../../shared/buddies/buddySettings'
import { BUILTIN_SUBAGENT_IDS, extensionCapabilityDescriptorSchema, extensionSubagentId } from '../../../../shared/extensions/extensionCapabilities'
import { BuddiesService } from '../../buddies/BuddiesService'
import { createBuddyRepository } from '../../storage/buddyRepository'
import { openBuddyDatabase } from '../../storage/database'
import { ExtensionCapabilitySync } from '../ExtensionCapabilitySync'

const extensionId = 'tests.legal'

let database: DatabaseSync
let buddies: BuddiesService
let records: McpServerRecord[]
let ledger: CapabilityLedger
let descriptors: ExtensionCapabilityDescriptor[]
let events: string[]
let failure: Error | null

function descriptor(patch: Partial<ExtensionCapabilityDescriptor> = {}): ExtensionCapabilityDescriptor {
  return extensionCapabilityDescriptorSchema.parse({
    extensionId,
    extensionName: 'Legal pack',
    revision: 'a',
    enabled: true,
    mcpConnectors: [{ id: 'legal-search', name: 'Legal search', transport: 'streamable-http', url: 'https://legal.example.com/mcp', credential: 'bearer' }],
    subagents: [{ id: 'law-finder', kind: 'npc', name: 'Law finder', description: 'Finds statutes', instructions: 'Search statutes first.', tools: { mode: 'selected', ids: [JSON.stringify(['mcp', 'legal-search', 'legal__search'])] }, fileAccess: 'read_only' }],
    ...patch,
  })
}

function setup() {
  database = openBuddyDatabase({ databasePath: ':memory:' })
  buddies = new BuddiesService(createBuddyRepository(database))
  records = []
  ledger = { version: 1, entries: [] }
  descriptors = []
  events = []
  failure = null
  const connectors = {
    list: () => records,
    async upsert(config: McpServerConfig) {
      const existing = records.find(record => record.id === config.id)
      const record: McpServerRecord = { id: config.id, name: config.name, toolNamespace: config.id, toolExposure: config.toolExposure ?? 'deferred', transport: 'streamable-http', command: null, args: null, cwd: null, url: 'url' in config ? config.url : null, credentialRef: config.credentialRef, executionConfirmedAt: null, enabled: config.enabled, createdAt: existing?.createdAt ?? 'now', updatedAt: 'now' }
      records = [...records.filter(item => item.id !== config.id), record]
      return record
    },
    async setEnabled(id: string, enabled: boolean) {
      const record = { ...records.find(record => record.id === id)!, enabled }
      records = records.map(item => item.id === id ? record : item)
      return record
    },
    async remove(id: string) {
      const before = records.length
      records = records.filter(record => record.id !== id)
      return records.length !== before
    },
  }
  return new ExtensionCapabilitySync({
    buddies,
    connectors,
    ledger: { read: async () => structuredClone(ledger), write: async (value) => { ledger = structuredClone(value) } },
    descriptors: async () => {
      if (failure)
        throw failure
      return structuredClone(descriptors)
    },
    report: event => events.push(event.event),
  })
}

const rowId = extensionSubagentId(extensionId, 'law-finder')
const npcIds = () => buddies.get(BUILTIN_BUDDY_ID).settings.npcIds

afterEach(() => {
  buddies?.dispose()
  database?.close()
})

describe('installing extension capabilities', () => {
  it('adds a disabled connector record and a prefixed sub-agent the default companion can delegate to', async () => {
    const sync = setup()
    descriptors = [descriptor()]
    await sync.reconcile()
    expect(records).toMatchObject([{ id: 'legal-search', name: 'Legal search', url: 'https://legal.example.com/mcp', enabled: false, credentialRef: null, toolExposure: 'deferred' }])
    expect(buddies.get(rowId)).toMatchObject({ kind: 'npc', enabled: true, name: 'Law finder', description: 'Finds statutes', settings: { instructions: 'Search statutes first.', limits: { fileAccess: 'read_only' }, tools: { mode: 'selected' } } })
    expect(rowId.startsWith('ext.')).toBe(true)
    expect(npcIds()).toContain(rowId)
    expect(ledger.entries.map(entry => entry.kind).sort()).toEqual(['agent', 'mcp'])
  })

  it('does nothing more on a second pass and respects the user removing the sub-agent from the delegation list or deleting it', async () => {
    const sync = setup()
    descriptors = [descriptor()]
    await sync.reconcile()
    const actor = buddies.get(BUILTIN_BUDDY_ID)
    await buddies.update({ buddyId: actor.id, expectedRevision: actor.revision, settings: buddySettingsSchema.parse({ ...actor.settings, npcIds: actor.settings.npcIds.filter(id => id !== rowId) }) })
    const row = buddies.get(rowId)
    await sync.reconcile()
    expect(buddies.get(rowId)).toEqual(row)
    expect(npcIds()).not.toContain(rowId)
    buddies.delete({ buddyId: rowId, expectedRevision: row.revision })
    records = []
    await sync.reconcile()
    expect(buddies.get(rowId).deletedAt).not.toBeNull()
    expect(records).toEqual([])
  })

  it('leaves a connector or sub-agent that already uses the id alone', async () => {
    const sync = setup()
    records = [{ id: 'legal-search', name: 'Mine', toolNamespace: 'mine', toolExposure: 'direct', transport: 'streamable-http', command: null, args: null, cwd: null, url: 'https://mine.example.com/mcp', credentialRef: 'legal-search', executionConfirmedAt: null, enabled: true, createdAt: 'then', updatedAt: 'then' }]
    buddies.installManagedNpc({ id: rowId, name: 'Mine', description: '', settings: buddySettingsSchema.parse(buddies.get('npc-explorer').settings) })
    descriptors = [descriptor()]
    await sync.reconcile()
    expect(records).toMatchObject([{ name: 'Mine', url: 'https://mine.example.com/mcp', enabled: true }])
    expect(buddies.get(rowId).name).toBe('Mine')
    expect(ledger.entries).toEqual([])
    expect(events.filter(event => event === 'extensions.capabilities.conflict')).toHaveLength(2)
  })

  it('never recreates the built-in sub-agents', async () => {
    const sync = setup()
    const builtin = descriptor()
    builtin.subagents[0]!.id = 'npc-explorer'
    descriptors = [builtin]
    await sync.reconcile()
    expect(() => buddies.get(extensionSubagentId(extensionId, 'npc-explorer'))).toThrow()
    expect(ledger.entries).toEqual([])
  })

  it('keeps the built-in registry in step with what ships in the application', () => {
    setup()
    const shipped = buddies.list().buddies.filter(buddy => buddy.kind === 'npc').map(buddy => buddy.id).sort()
    expect([...BUILTIN_SUBAGENT_IDS].sort()).toEqual(shipped)
  })
})

describe('keeping packages and records in step', () => {
  it('removes untouched records and the delegation entry on uninstall, and brings the sub-agent back on reinstall', async () => {
    const sync = setup()
    descriptors = [descriptor()]
    await sync.reconcile()
    descriptors = []
    await sync.reconcile()
    expect(records).toEqual([])
    expect(buddies.get(rowId).deletedAt).not.toBeNull()
    expect(npcIds()).not.toContain(rowId)
    expect(ledger.entries).toEqual([])
    descriptors = [descriptor()]
    await sync.reconcile()
    expect(buddies.get(rowId)).toMatchObject({ deletedAt: null, enabled: true })
    expect(npcIds()).toContain(rowId)
    expect(records).toHaveLength(1)
  })

  it('keeps what the user changed and reports it before the uninstall', async () => {
    const sync = setup()
    descriptors = [descriptor()]
    await sync.reconcile()
    const row = buddies.get(rowId)
    await buddies.update({ buddyId: rowId, expectedRevision: row.revision, settings: buddySettingsSchema.parse({ ...row.settings, instructions: 'My own rules.' }) })
    records = records.map(record => ({ ...record, credentialRef: 'legal-search', enabled: true }))
    expect((await sync.impact(extensionId)).modified).toEqual([{ kind: 'mcp', name: 'Legal search' }, { kind: 'agent', name: 'Law finder' }])
    descriptors = []
    await sync.reconcile()
    expect(records).toHaveLength(1)
    expect(buddies.get(rowId)).toMatchObject({ deletedAt: null, settings: { instructions: 'My own rules.' } })
    expect(ledger.entries).toEqual([])
    expect((await sync.impact(extensionId)).modified).toEqual([])
  })

  it('applies a package update to untouched records only', async () => {
    const sync = setup()
    descriptors = [descriptor()]
    await sync.reconcile()
    const updated = descriptor({ revision: 'b' })
    updated.mcpConnectors[0]!.url = 'https://legal.example.com/v2/mcp'
    updated.subagents[0]!.instructions = 'Search statutes, then cases.'
    descriptors = [updated]
    await sync.reconcile()
    expect(records[0]).toMatchObject({ url: 'https://legal.example.com/v2/mcp', enabled: false })
    expect(buddies.get(rowId).settings.instructions).toBe('Search statutes, then cases.')
    const edited = buddies.get(rowId)
    await buddies.update({ buddyId: rowId, expectedRevision: edited.revision, name: 'Renamed' })
    const third = descriptor({ revision: 'c' })
    third.subagents[0]!.instructions = 'Third version.'
    descriptors = [third]
    await sync.reconcile()
    expect(buddies.get(rowId)).toMatchObject({ name: 'Renamed' })
    expect(buddies.get(rowId).settings.instructions).toBe('Search statutes, then cases.')
  })

  it('switches records off while the package is disabled and does not switch them on again by itself', async () => {
    const sync = setup()
    descriptors = [descriptor()]
    await sync.reconcile()
    await sync.reconcile()
    records = records.map(record => ({ ...record, enabled: true }))
    descriptors = [descriptor({ enabled: false })]
    await sync.reconcile()
    expect(records[0]!.enabled).toBe(false)
    expect(buddies.get(rowId).enabled).toBe(false)
    descriptors = [descriptor({ enabled: true })]
    await sync.reconcile()
    expect(buddies.get(rowId).enabled).toBe(true)
    expect(records[0]!.enabled).toBe(false)
  })

  it('removes nothing when the package list cannot be read', async () => {
    const sync = setup()
    descriptors = [descriptor()]
    await sync.reconcile()
    failure = new Error('EXTENSION_SERVICE_UNAVAILABLE')
    await expect(sync.reconcile()).rejects.toThrow('EXTENSION_SERVICE_UNAVAILABLE')
    await sync.schedule()
    expect(records).toHaveLength(1)
    expect(buddies.get(rowId).deletedAt).toBeNull()
    expect(ledger.entries).toHaveLength(2)
    expect(events).toContain('extensions.capabilities.reconcile_failed')
  })
})
