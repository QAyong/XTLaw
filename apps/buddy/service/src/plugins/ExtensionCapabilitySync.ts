import type { BuddyMutation, BuddyUpdate, LocalBuddy } from '../../../shared/buddies/buddyApi'
import type { BuddySettings } from '../../../shared/buddies/buddySettings'
import type { ExtensionCapabilityDescriptor, ExtensionCapabilityImpact, ExtensionMcpConnectorContribution, ExtensionSubagentContribution } from '../../../shared/extensions/extensionCapabilities'
import type { McpServerConfig } from '../connectors/mcp/mcpSchemas'
import type { McpServerRecord } from '../storage/connectorRepository'
import { createHash } from 'node:crypto'
import { BUILTIN_BUDDY_ID } from '../../../shared/buddies/buddyApi'
import { buddySettingsSchema, DEFAULT_BUDDY_SETTINGS } from '../../../shared/buddies/buddySettings'
import { BUILTIN_SUBAGENT_IDS, connectorToolExposure, extensionSubagentId } from '../../../shared/extensions/extensionCapabilities'

/** What the sync remembers about a record it created, so it can tell the user's edits from its own definition. */
export interface CapabilityLedgerEntry {
  extensionId: string
  kind: 'mcp' | 'agent'
  /** Connector id, or the sub-agent row id. */
  id: string
  /** Digest of the definition as installed. A record whose current digest differs was edited by the user. */
  digest: string
  /** The package is disabled and the sync switched the record off; enabling the package lifts this. */
  suspended?: boolean
}
export interface CapabilityLedger { version: 1, entries: CapabilityLedgerEntry[] }

export interface CapabilityLedgerStore {
  read: () => Promise<CapabilityLedger>
  write: (ledger: CapabilityLedger) => Promise<void>
}
export interface CapabilityBuddies {
  get: (buddyId: string) => LocalBuddy
  update: (input: BuddyUpdate) => Promise<LocalBuddy>
  delete: (input: BuddyMutation) => LocalBuddy
  installManagedNpc: (input: { id: string, name: string, description: string, settings: BuddySettings }) => LocalBuddy
}
export interface CapabilityConnectors {
  list: () => readonly McpServerRecord[]
  upsert: (config: McpServerConfig) => Promise<McpServerRecord>
  setEnabled: (id: string, enabled: boolean) => Promise<McpServerRecord>
  remove: (id: string) => Promise<boolean>
}
export interface ExtensionCapabilitySyncOptions {
  buddies: CapabilityBuddies
  connectors: CapabilityConnectors
  ledger: CapabilityLedgerStore
  descriptors: () => Promise<ExtensionCapabilityDescriptor[]>
  report?: (event: { event: string, level: 'info' | 'warn', errorCode?: string, extensionId?: string, count?: number }) => void
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const connectorDigest = (connector: Pick<ExtensionMcpConnectorContribution, 'name' | 'url' | 'deferred'>) => digest(['mcp', connector.name, connector.url, connectorToolExposure(connector)])
export const subagentDigest = (agent: { name: string, description: string, instructions: string, tools: unknown, fileAccess: string }) => digest(['agent', agent.name, agent.description, agent.instructions, agent.tools, agent.fileAccess])
const connectorRecordDigest = (record: McpServerRecord) => digest(['mcp', record.name, record.url, record.toolExposure === 'direct' ? 'direct' : 'deferred'])
const buddyDigest = (buddy: LocalBuddy) => subagentDigest({ name: buddy.name, description: buddy.description, instructions: buddy.settings.instructions, tools: buddy.settings.tools, fileAccess: buddy.settings.limits.fileAccess })

/**
 * Turns the MCP connectors and sub-agents that installed packages declare into records in the service's own stores,
 * and takes them out again when the package goes. Nothing is downloaded or executed: a connector is a disabled record
 * without credentials, a sub-agent is a row bound to the default companion's delegation list.
 */
export class ExtensionCapabilitySync {
  readonly #options: ExtensionCapabilitySyncOptions
  #running: Promise<void> | undefined
  #again = false
  #disposed = false

  constructor(options: ExtensionCapabilitySyncOptions) {
    this.#options = options
  }

  /** Coalesces requests: a change that arrives while a pass is running triggers one more pass afterwards. */
  schedule(): Promise<void> {
    if (this.#disposed)
      return Promise.resolve()
    if (this.#running) {
      this.#again = true
      return this.#running
    }
    const run = (async () => {
      try {
        do {
          this.#again = false
          await this.reconcile().catch(error => this.#options.report?.({ event: 'extensions.capabilities.reconcile_failed', level: 'warn', errorCode: errorCode(error) }))
        } while (this.#again && !this.#disposed)
      }
      finally {
        this.#running = undefined
      }
    })()
    this.#running = run
    return run
  }

  async dispose(): Promise<void> {
    this.#disposed = true
    await this.#running
  }

  /** Items the user changed since they were installed; uninstalling their package keeps these. */
  async impact(extensionId: string): Promise<ExtensionCapabilityImpact> {
    const { entries } = await this.#options.ledger.read()
    const modified: ExtensionCapabilityImpact['modified'] = []
    for (const entry of entries.filter(entry => entry.extensionId === extensionId)) {
      const current = this.#current(entry)
      if (current && current.modified)
        modified.push({ kind: entry.kind, name: current.name })
    }
    return { modified }
  }

  async reconcile(): Promise<void> {
    // A failed read must leave everything alone: an empty answer would mean "everything was uninstalled".
    const descriptors = await this.#options.descriptors()
    const ledger = await this.#options.ledger.read()
    const kept = new Map(ledger.entries.map(entry => [key(entry), entry]))
    const wanted = new Set<string>()
    for (const descriptor of descriptors) {
      for (const connector of descriptor.mcpConnectors) {
        wanted.add(key({ kind: 'mcp', id: connector.id }))
        await this.#guard(descriptor, () => this.#connector(descriptor, connector, kept))
      }
      for (const subagent of descriptor.subagents) {
        wanted.add(key({ kind: 'agent', id: extensionSubagentId(descriptor.extensionId, subagent.id) }))
        await this.#guard(descriptor, () => this.#subagent(descriptor, subagent, kept))
      }
    }
    for (const [entryKey, entry] of [...kept]) {
      if (wanted.has(entryKey))
        continue
      try {
        await this.#remove(entry)
        kept.delete(entryKey)
      }
      catch (error) {
        this.#options.report?.({ event: 'extensions.capabilities.remove_failed', level: 'warn', extensionId: entry.extensionId, errorCode: errorCode(error) })
      }
    }
    await this.#options.ledger.write({ version: 1, entries: [...kept.values()] })
  }

  async #guard(descriptor: ExtensionCapabilityDescriptor, operation: () => Promise<void>): Promise<void> {
    try {
      await operation()
    }
    catch (error) {
      this.#options.report?.({ event: 'extensions.capabilities.install_failed', level: 'warn', extensionId: descriptor.extensionId, errorCode: errorCode(error) })
    }
  }

  async #connector(descriptor: ExtensionCapabilityDescriptor, connector: ExtensionMcpConnectorContribution, kept: Map<string, CapabilityLedgerEntry>) {
    const entryKey = key({ kind: 'mcp', id: connector.id })
    const entry = kept.get(entryKey)
    if (entry && entry.extensionId !== descriptor.extensionId) {
      this.#options.report?.({ event: 'extensions.capabilities.conflict', level: 'warn', extensionId: descriptor.extensionId })
      return
    }
    const existing = this.#options.connectors.list().find(record => record.id === connector.id)
    const config = (enabled: boolean, credentialRef: string | null): McpServerConfig => ({ id: connector.id, name: connector.name, transport: 'streamable-http', url: connector.url, toolExposure: connectorToolExposure(connector), enabled, credentialRef })
    if (!entry) {
      // An unknown connector with the same id is the user's; never take it over.
      if (existing) {
        this.#options.report?.({ event: 'extensions.capabilities.conflict', level: 'warn', extensionId: descriptor.extensionId })
        return
      }
      await this.#options.connectors.upsert(config(false, null))
      kept.set(entryKey, { extensionId: descriptor.extensionId, kind: 'mcp', id: connector.id, digest: connectorDigest(connector) })
      return
    }
    // The user removed it after installing: leave it removed until the package itself is reinstalled.
    if (!existing)
      return
    const next = connectorDigest(connector)
    if (entry.digest !== next && connectorRecordDigest(existing) === entry.digest && (!existing.credentialRef || existing.url === connector.url)) {
      await this.#options.connectors.upsert(config(existing.enabled, existing.credentialRef))
      entry.digest = next
    }
    if (!descriptor.enabled && existing.enabled) {
      await this.#options.connectors.setEnabled(existing.id, false)
      entry.suspended = true
    }
    else if (descriptor.enabled && entry.suspended) {
      delete entry.suspended
    }
  }

  async #subagent(descriptor: ExtensionCapabilityDescriptor, subagent: ExtensionSubagentContribution, kept: Map<string, CapabilityLedgerEntry>) {
    const id = extensionSubagentId(descriptor.extensionId, subagent.id)
    if ((BUILTIN_SUBAGENT_IDS as readonly string[]).includes(subagent.id))
      return
    const entryKey = key({ kind: 'agent', id })
    const entry = kept.get(entryKey)
    const existing = this.#buddy(id)
    const definition = { id, name: subagent.name, description: subagent.description, settings: subagentSettings(subagent) }
    if (!entry) {
      if (existing && !existing.deletedAt) {
        this.#options.report?.({ event: 'extensions.capabilities.conflict', level: 'warn', extensionId: descriptor.extensionId })
        return
      }
      this.#options.buddies.installManagedNpc(definition)
      await this.#delegate(id, true)
      kept.set(entryKey, { extensionId: descriptor.extensionId, kind: 'agent', id, digest: subagentDigest(subagent) })
      return
    }
    // Removed by the user after installing: leave it removed until the package itself is reinstalled.
    if (!existing || existing.deletedAt)
      return
    const next = subagentDigest(subagent)
    if (entry.digest !== next && buddyDigest(existing) === entry.digest) {
      this.#options.buddies.installManagedNpc(definition)
      entry.digest = next
    }
    const current = this.#buddy(id)
    if (current && !descriptor.enabled && current.enabled) {
      await this.#options.buddies.update({ buddyId: id, expectedRevision: current.revision, enabled: false })
      entry.suspended = true
    }
    else if (current && descriptor.enabled && entry.suspended) {
      if (!current.enabled)
        await this.#options.buddies.update({ buddyId: id, expectedRevision: current.revision, enabled: true })
      delete entry.suspended
    }
  }

  async #remove(entry: CapabilityLedgerEntry): Promise<void> {
    const current = this.#current(entry)
    // Already gone, or edited by the user: keep it as the user's own instead of deleting their work.
    if (!current || current.modified)
      return
    if (entry.kind === 'mcp') {
      await this.#options.connectors.remove(entry.id)
      return
    }
    await this.#delegate(entry.id, false)
    const buddy = this.#buddy(entry.id)
    if (buddy && !buddy.deletedAt)
      this.#options.buddies.delete({ buddyId: buddy.id, expectedRevision: buddy.revision })
  }

  #current(entry: CapabilityLedgerEntry): { name: string, modified: boolean } | null {
    if (entry.kind === 'mcp') {
      const record = this.#options.connectors.list().find(record => record.id === entry.id)
      return record ? { name: record.name, modified: !!record.credentialRef || connectorRecordDigest(record) !== entry.digest } : null
    }
    const buddy = this.#buddy(entry.id)
    return buddy && !buddy.deletedAt ? { name: buddy.name, modified: buddyDigest(buddy) !== entry.digest } : null
  }

  #buddy(id: string): LocalBuddy | null {
    try {
      return this.#options.buddies.get(id)
    }
    catch (error) {
      if (errorCode(error) === 'BUDDY_NOT_FOUND')
        return null
      throw error
    }
  }

  /** Puts a sub-agent into, or takes it out of, the default companion's delegation list. */
  async #delegate(npcId: string, bound: boolean): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const actor = this.#options.buddies.get(BUILTIN_BUDDY_ID)
      const present = actor.settings.npcIds.includes(npcId)
      if (present === bound)
        return
      const npcIds = bound ? [...actor.settings.npcIds, npcId] : actor.settings.npcIds.filter(id => id !== npcId)
      try {
        await this.#options.buddies.update({ buddyId: actor.id, expectedRevision: actor.revision, settings: buddySettingsSchema.parse({ ...actor.settings, npcIds }) })
        return
      }
      catch (error) {
        if (errorCode(error) !== 'BUDDY_CONFLICT' || attempt === 2)
          throw error
      }
    }
  }
}

function subagentSettings(subagent: ExtensionSubagentContribution): BuddySettings {
  return { ...structuredClone(DEFAULT_BUDDY_SETTINGS), instructions: subagent.instructions, tools: structuredClone(subagent.tools), limits: { fileAccess: subagent.fileAccess } }
}

function key(entry: Pick<CapabilityLedgerEntry, 'kind' | 'id'>): string {
  return `${entry.kind}:${entry.id}`
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error && typeof error.code === 'string' ? error.code : 'EXTENSION_CAPABILITY_FAILED'
}
