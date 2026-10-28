import type { BuddyCatalog, LocalBuddy } from '../../../shared/buddies/buddyApi'
import type { BuddySettings } from '../../../shared/buddies/buddySettings'
import type { ConnectorToolSummary } from '../../../shared/connectors/connectorState'
import type { ExtensionCapabilityDescriptor, ExtensionCapabilityImpact } from '../../../shared/extensions/extensionCapabilities'
import type { ExtensionSubagentContribution } from '../../../shared/extensions/extensionSubagents'
import type { McpServerRecord } from '../storage/connectorRepository'
import type { ManagedCapabilityRecord, ManagedCapabilityRepository } from '../storage/managedCapabilityRepository'
import { DEFAULT_BUDDY_SETTINGS } from '../../../shared/buddies/buddySettings'
import { extensionCapabilityDescriptorSchema } from '../../../shared/extensions/extensionCapabilities'
import { skillIdentity } from '../skills/skillFiles'

export interface CapabilityBuddies {
  list: () => BuddyCatalog
  get: (id: string) => LocalBuddy
  installManagedNpc: (input: { id: string, name: string, description: string, settings: BuddySettings }) => LocalBuddy
  refreshManaged: (id: string) => void
  clearManagedConfiguration: (id: string) => void
}
export interface CapabilityConnectors {
  list: () => readonly McpServerRecord[]
  tools: (id: string) => ConnectorToolSummary[]
  applyManaged: (source: ManagedCapabilityRecord) => Promise<void>
  refreshManaged: (id: string) => Promise<void>
  clearManagedConfiguration: (id: string) => Promise<void>
}
export interface ExtensionCapabilitySyncOptions {
  buddies: CapabilityBuddies
  connectors: CapabilityConnectors
  sources: ManagedCapabilityRepository
  descriptors: () => Promise<ExtensionCapabilityDescriptor[]>
  report?: (event: { event: string, level: 'warn', errorCode: string, extensionId?: string, kind?: ManagedCapabilityRecord['kind'], contributionId?: string }) => void
}

export class ExtensionCapabilitySync {
  readonly #options: ExtensionCapabilitySyncOptions
  #queue: Promise<void> = Promise.resolve()
  #epoch = 0
  #disposed = false

  constructor(options: ExtensionCapabilitySyncOptions) {
    this.#options = options
  }

  async schedule(): Promise<void> {
    const epoch = this.#epoch
    try {
      const descriptors = await this.#options.descriptors()
      if (this.#disposed || epoch !== this.#epoch)
        return
      await this.#enqueue(async () => {
        if (epoch === this.#epoch)
          await this.#apply(descriptors)
      })
    }
    catch (error) {
      if (!(error instanceof CapabilityApplicationError) && !this.#disposed && epoch === this.#epoch)
        await this.#enqueue(() => this.#suspend()).catch(() => {})
      this.#options.report?.({ event: 'extensions.capabilities.reconcile_failed', level: 'warn', errorCode: errorCode(error) })
    }
  }

  apply(descriptors: ExtensionCapabilityDescriptor[], clearExtensionId?: string, signal?: AbortSignal): Promise<void> {
    this.#epoch++
    return this.#enqueue(async () => {
      signal?.throwIfAborted()
      try {
        await this.#apply(descriptors, clearExtensionId)
      }
      catch (error) {
        if (!(error instanceof CapabilityApplicationError))
          await this.#suspend().catch(() => {})
        throw error
      }
    })
  }

  refreshAvailability(): Promise<void> {
    return this.#enqueue(async () => {
      const failures: unknown[] = []
      this.#refreshAvailability(failures)
      if (failures.length)
        throw new CapabilityApplicationError(failures)
    })
  }

  async impact(extensionId: string): Promise<ExtensionCapabilityImpact> {
    await this.#queue
    const sources = this.#options.sources.list(extensionId)
    const connectorIds = new Set(sources.filter(source => source.kind === 'mcp').map(source => source.id))
    const skillIds = new Set(sources.filter(source => source.kind === 'subagent').flatMap(source => (source.definition as ExtensionSubagentContribution).skills.map(id => skillIdentity(`plugin:${id}`))))
    const dependents = this.#options.buddies.list().buddies.filter((buddy) => {
      if (buddy.managed || buddy.deletedAt || buddy.kind !== 'npc')
        return false
      const tools = buddy.settings.tools
      return (tools.mode === 'selected' && tools.ids.some((id) => {
        const [kind, connector] = JSON.parse(id) as string[]
        return kind === 'mcp' && connectorIds.has(connector!)
      })) || (buddy.settings.skills.mode === 'selected' && buddy.settings.skills.ids.some(id => skillIds.has(id))) || buddy.settings.requiredSkills.some(id => skillIds.has(id))
    }).map(({ id, name }) => ({ id, name }))
    return { retained: sources.map(source => ({ kind: source.kind, name: source.definition.name })), dependents }
  }

  async dispose(): Promise<void> {
    this.#disposed = true
    this.#epoch++
    await this.#queue
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    if (this.#disposed)
      return Promise.reject(new Error('EXTENSION_SERVICE_UNAVAILABLE'))
    const pending = this.#queue.then(operation)
    this.#queue = pending.catch(() => {})
    return pending
  }

  async #apply(input: ExtensionCapabilityDescriptor[], clearExtensionId?: string): Promise<void> {
    const descriptors = extensionCapabilityDescriptorSchema.array().parse(input)
    validateDescriptors(descriptors)
    if (clearExtensionId && descriptors.some(descriptor => descriptor.extensionId === clearExtensionId && descriptor.enabled))
      throw new CapabilityApplicationError([new Error('EXTENSION_STILL_ENABLED')])
    const { sources, buddies, connectors } = this.#options
    const failures: unknown[] = []
    const failed = new Set<string>()
    const previous = new Map(sources.list().map(source => [identity(source), source]))
    const current = new Map<string, { source: ManagedCapabilityRecord, descriptor: ExtensionCapabilityDescriptor, changed: boolean }>()
    for (const descriptor of descriptors) {
      for (const [kind, definitions] of [['mcp', descriptor.mcpConnectors], ['subagent', descriptor.subagents]] as const) {
        for (const definition of definitions) {
          const key = identity({ extensionId: descriptor.extensionId, kind, contributionId: definition.id })
          const before = previous.get(key)
          const state = descriptor.enabled ? 'enabled' : 'disabled'
          const definitionChanged = !before || before.revision !== descriptor.revision || JSON.stringify(before.definition) !== JSON.stringify(definition)
          const changed = definitionChanged || before?.state !== state || before.extensionName !== descriptor.extensionName
          const source = sources.upsertSource({ extensionId: descriptor.extensionId, extensionName: descriptor.extensionName, revision: descriptor.revision, contributionId: definition.id, kind, definition, state: changed ? 'unavailable' : state })
          if (before?.state === 'removed' && kind === 'mcp')
            sources.setUserEnabled(source.id, false)
          current.set(key, { source, descriptor, changed })
        }
      }
    }
    const removed = [...previous].filter(([key]) => !current.has(key)).map(([, source]) => source)
    for (const source of removed) {
      sources.setState(source.id, 'removed')
      if (source.kind === 'mcp')
        sources.setUserEnabled(source.id, false)
    }
    this.#refreshAvailability(failures, failed)
    const attempt = async (source: ManagedCapabilityRecord, operation: () => void | Promise<void>) => {
      try {
        await operation()
      }
      catch (error) {
        failed.add(source.id)
        this.#sourceFailed(source, error, failures)
        try {
          await this.#refresh(source)
        }
        catch (refreshError) {
          failures.push(refreshError)
        }
      }
    }
    for (const source of removed)
      await attempt(source, () => this.#refresh(source))
    for (const { source } of current.values()) {
      if (source.kind === 'mcp') {
        await attempt(source, () => connectors.applyManaged(sources.get(source.id)!))
      }
      else {
        await attempt(source, () => {
          const definition = source.definition as ExtensionSubagentContribution
          buddies.installManagedNpc({ id: source.id, name: definition.name, description: definition.description, settings: compileSettings(source.extensionId, definition, sources) })
        })
      }
    }
    if (clearExtensionId) {
      for (const source of sources.list(clearExtensionId)) {
        if (!failed.has(source.id))
          await attempt(source, () => source.kind === 'mcp' ? connectors.clearManagedConfiguration(source.id) : buddies.clearManagedConfiguration(source.id))
      }
    }
    for (const { source, descriptor, changed } of current.values()) {
      if (failed.has(source.id))
        continue
      await attempt(source, async () => {
        sources.setState(source.id, descriptor.enabled ? 'enabled' : 'disabled')
        if (changed)
          await this.#refresh(source)
      })
    }
    this.#refreshAvailability(failures, failed)
    if (failures.length)
      throw new CapabilityApplicationError(failures)
  }

  async #refresh(source: ManagedCapabilityRecord): Promise<void> {
    if (source.kind === 'mcp')
      await this.#options.connectors.refreshManaged(source.id)
    else if (this.#buddy(source.id))
      this.#options.buddies.refreshManaged(source.id)
  }

  #sourceFailed(source: ManagedCapabilityRecord, error: unknown, failures: unknown[]): void {
    failures.push(error)
    const { sources, report } = this.#options
    if (sources.get(source.id)?.state !== 'removed')
      sources.setState(source.id, 'unavailable')
    report?.({ event: 'extensions.capabilities.source_failed', level: 'warn', errorCode: errorCode(error), extensionId: source.extensionId, kind: source.kind, contributionId: source.contributionId })
  }

  async #suspend(): Promise<void> {
    const { sources } = this.#options
    const affected = sources.list().filter(source => source.state !== 'removed')
    sources.suspendAll()
    const results = await Promise.allSettled(affected.map(source => this.#refresh(source)))
    const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    if (failures.length)
      throw new CapabilityApplicationError(failures)
  }

  #refreshAvailability(failures: unknown[], failed?: Set<string>): void {
    const { sources, buddies, connectors } = this.#options
    const connections = new Map(connectors.list().map(record => [record.id, record]))
    for (const source of sources.list()) {
      if (source.kind !== 'subagent')
        continue
      try {
        const definition = source.definition as ExtensionSubagentContribution
        const missing = definition.tools.some((tool) => {
          if (tool.source !== 'mcp')
            return false
          const connection = sources.find(source.extensionId, 'mcp', tool.connector)
          if (!connection || !connections.get(connection.id)?.enabled)
            return true
          return !connectors.tools(connection.id).some(candidate => candidate.name === tool.name)
        })
        const reason = missing ? 'dependency_unavailable' : null
        if (source.unavailableReason !== reason) {
          sources.setUnavailableReason(source.id, reason)
          if (this.#buddy(source.id))
            buddies.refreshManaged(source.id)
        }
      }
      catch (error) {
        failed?.add(source.id)
        this.#sourceFailed(source, error, failures)
      }
    }
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
}

class CapabilityApplicationError extends AggregateError {
  readonly code = 'EXTENSION_CAPABILITY_FAILED'

  constructor(errors: unknown[]) { super(errors, 'EXTENSION_CAPABILITY_FAILED') }
}

function compileSettings(extensionId: string, definition: ExtensionSubagentContribution, sources: ManagedCapabilityRepository): BuddySettings {
  const ids = definition.tools.map(tool => tool.source === 'builtin'
    ? JSON.stringify(['builtin', 'core', tool.name])
    : JSON.stringify(['mcp', sources.find(extensionId, 'mcp', tool.connector)!.id, tool.name]))
  return {
    ...structuredClone(DEFAULT_BUDDY_SETTINGS),
    instructions: definition.instructions,
    tools: ids.length ? { mode: 'selected', ids } : { mode: 'none' },
    skills: definition.skills.length ? { mode: 'selected', ids: definition.skills.map(id => skillIdentity(`plugin:${id}`)) } : { mode: 'none' },
    requiredSkills: definition.requiredSkills.map(id => skillIdentity(`plugin:${id}`)),
    limits: { fileAccess: definition.fileAccess },
  }
}

function validateDescriptors(descriptors: ExtensionCapabilityDescriptor[]): void {
  if (new Set(descriptors.map(descriptor => descriptor.extensionId)).size !== descriptors.length)
    throw new Error('EXTENSION_CAPABILITY_INVALID')
  for (const descriptor of descriptors) {
    const connections = new Set(descriptor.mcpConnectors.map(item => item.id))
    const subagents = new Set(descriptor.subagents.map(item => item.id))
    if (connections.size !== descriptor.mcpConnectors.length || subagents.size !== descriptor.subagents.length
      || descriptor.subagents.some(agent => agent.tools.some(tool => tool.source === 'mcp' && !connections.has(tool.connector)) || agent.skills.some(id => !descriptor.skills.includes(id)))) {
      throw new Error('EXTENSION_CAPABILITY_INVALID')
    }
  }
}

function identity(source: Pick<ManagedCapabilityRecord, 'extensionId' | 'kind' | 'contributionId'>): string {
  return JSON.stringify([source.extensionId, source.kind, source.contributionId])
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error && typeof error.code === 'string' ? error.code : 'EXTENSION_CAPABILITY_FAILED'
}
