import type { DatabaseSync } from 'node:sqlite'
import { buddySettingsSchema, DEFAULT_BUDDY_SETTINGS } from '../../../../shared/buddies/buddySettings'
import { createManagedCapabilityRepository } from '../../storage/managedCapabilityRepository'

export function managedBuddyFixture(database: DatabaseSync) {
  const sources = createManagedCapabilityRepository(database)
  const definition = { id: 'research', name: 'Plugin researcher', description: 'Research role', instructions: 'Report evidence', fileAccess: 'read_only' as const, tools: [{ source: 'builtin' as const, name: 'read' as const }], skills: ['research'], requiredSkills: ['research'] }
  const source = sources.upsertSource({ extensionId: 'fixture-plugin', extensionName: 'Fixture plugin', contributionId: definition.id, revision: 'revision-1', kind: 'subagent', definition, state: 'enabled' })
  const settings = buddySettingsSchema.parse({ ...DEFAULT_BUDDY_SETTINGS, instructions: definition.instructions, tools: { mode: 'selected', ids: ['["builtin","core","read"]'] }, skills: { mode: 'selected', ids: ['fixture-plugin:research'] }, requiredSkills: ['fixture-plugin:research'], limits: { fileAccess: 'read_only' } })
  return { sources, source, input: { id: source.id, name: definition.name, description: definition.description, settings } }
}
