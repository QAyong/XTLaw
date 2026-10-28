import type { DatabaseSync } from 'node:sqlite'
import type { BuddyCatalog, BuddyCreate, BuddyDefaultUpdate, BuddyMutation, BuddyUpdate, LocalBuddy } from '../../../shared/buddies/buddyApi'
import type { BuddySettings } from '../../../shared/buddies/buddySettings'
import { randomUUID } from 'node:crypto'
import { buddySchema, BUILTIN_BUDDY_ID } from '../../../shared/buddies/buddyApi'
import { isBuddyNpcBindable } from '../../../shared/buddies/buddyAvailability'
import { buddySettingsSchema, DEFAULT_BUDDY_SETTINGS } from '../../../shared/buddies/buddySettings'
import { isManagedCapabilityEnabled } from '../../../shared/extensions/managedCapability'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { withTransaction } from './database'
import { createManagedCapabilityRepository, toManagedCapabilitySource } from './managedCapabilityRepository'

export function createBuddyRepository(database: DatabaseSync) {
  const managedCapabilities = createManagedCapabilityRepository(database)
  const select = 'SELECT id, kind, enabled, name, avatar, custom_avatars_json, description, settings_json, deleted_at AS deletedAt, revision, created_at AS createdAt, updated_at AS updatedAt FROM buddies'

  function project(row: Record<string, unknown>): LocalBuddy {
    const buddy = toBuddy(row)
    const source = managedCapabilities.get(buddy.id)
    if (!source)
      return buddy
    const managed = toManagedCapabilitySource(source)
    return { ...buddy, managed, enabled: source.kind === 'subagent' && isManagedCapabilityEnabled(managed) }
  }

  function get(id: string): LocalBuddy {
    const row = database.prepare(`${select} WHERE id = ?`).get(id)
    if (!row)
      throw new BuddyServiceError('BUDDY_NOT_FOUND')
    return project(row)
  }

  function state() {
    return database.prepare('SELECT default_buddy_id AS defaultBuddyId, revision FROM buddy_catalog WHERE id = 1').get() as { defaultBuddyId: string, revision: number }
  }

  function list(): BuddyCatalog {
    return { ...state(), buddies: database.prepare(`${select} WHERE deleted_at IS NULL ORDER BY created_at, id`).all().map(project) }
  }

  function active(id: string) {
    const buddy = get(id)
    if (buddy.deletedAt)
      throw new BuddyServiceError('BUDDY_DELETED')
    return buddy
  }

  function writable(input: BuddyMutation) {
    const buddy = active(input.buddyId)
    if (buddy.revision !== input.expectedRevision)
      throw new BuddyServiceError('BUDDY_CONFLICT')
    return buddy
  }

  function changed() {
    database.prepare('UPDATE buddy_catalog SET revision = revision + 1 WHERE id = 1').run()
  }

  function updateProfile(input: BuddyUpdate): LocalBuddy {
    const current = writable(input)
    const parsedSettings = buddySettingsSchema.parse(input.settings ?? current.settings)
    if (current.managed && ((input.name !== undefined && input.name !== current.name)
      || (input.description !== undefined && input.description !== current.description)
      || JSON.stringify({ ...parsedSettings, model: null }) !== JSON.stringify({ ...current.settings, model: null }))) {
      throw new BuddyServiceError('BUDDY_MANAGED_PROTECTED')
    }
    const name = input.name ?? current.name
    const avatar = input.avatar === undefined ? current.avatar : input.avatar
    const customAvatars = avatarGallery(input.customAvatars ?? current.customAvatars, avatar)
    const description = input.description ?? current.description
    const previousEnabled = current.managed?.userEnabled ?? current.enabled
    const enabled = input.enabled ?? previousEnabled
    if (!enabled && state().defaultBuddyId === current.id)
      throw new BuddyServiceError('BUDDY_DEFAULT_PROTECTED')
    const npcIds = [...new Set(parsedSettings.npcIds)]
    if (current.kind === 'npc' && npcIds.length)
      throw new BuddyServiceError('BUDDY_INVALID_NPC_BINDING')
    if (input.settings) {
      for (const id of npcIds.filter(id => !current.settings.npcIds.includes(id))) {
        const npc = get(id)
        if (id === current.id || !isBuddyNpcBindable(npc))
          throw new BuddyServiceError('BUDDY_INVALID_NPC_BINDING')
      }
    }
    const settings = JSON.stringify({ ...parsedSettings, npcIds })
    if (enabled === previousEnabled && name === current.name && avatar === current.avatar && customAvatars === JSON.stringify(current.customAvatars) && description === current.description && settings === JSON.stringify(current.settings))
      return current
    if (current.managed && enabled !== previousEnabled)
      managedCapabilities.setUserEnabled(current.id, enabled)
    database.prepare('UPDATE buddies SET name = ?, avatar = ?, custom_avatars_json = ?, description = ?, settings_json = ?, enabled = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
      .run(name, avatar, customAvatars, description, settings, Number(enabled), new Date().toISOString(), current.id)
    changed()
    return get(current.id)
  }

  return {
    get,
    state,
    list,
    create(input: BuddyCreate): LocalBuddy {
      return withTransaction(database, () => {
        const id = randomUUID()
        const now = new Date().toISOString()
        const kind = input.kind ?? 'actor'
        const settings = { ...DEFAULT_BUDDY_SETTINGS, tools: { mode: kind === 'npc' ? 'none' : 'all' } }
        database.prepare('INSERT INTO buddies (id, kind, name, avatar, custom_avatars_json, description, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, kind, input.name, input.avatar ?? null, avatarGallery(input.customAvatars ?? [], input.avatar), input.description ?? '', JSON.stringify(settings), now, now)
        changed()
        return get(id)
      })
    },
    update: (input: BuddyUpdate) => withTransaction(database, () => updateProfile(input)),
    upsertManagedNpc(input: { id: string, name: string, description: string, settings: BuddySettings }): LocalBuddy {
      return withTransaction(database, () => {
        const source = managedCapabilities.get(input.id)
        if (!source || source.kind !== 'subagent')
          throw new BuddyServiceError('BUDDY_INVALID_NPC_BINDING')
        const incoming = buddySettingsSchema.parse(input.settings)
        if (incoming.npcIds.length)
          throw new BuddyServiceError('BUDDY_INVALID_NPC_BINDING')
        const now = new Date().toISOString()
        const row = database.prepare(`${select} WHERE id = ?`).get(input.id)
        const current = row ? toBuddy(row) : null
        const settings = JSON.stringify(current
          ? { ...current.settings, instructions: incoming.instructions, tools: incoming.tools, skills: incoming.skills, requiredSkills: incoming.requiredSkills, limits: incoming.limits }
          : incoming)
        if (!current) {
          database.prepare('INSERT INTO buddies (id, kind, name, description, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(input.id, 'npc', input.name, input.description, settings, now, now)
        }
        else if (current.kind !== 'npc') {
          throw new BuddyServiceError('BUDDY_INVALID_NPC_BINDING')
        }
        else {
          if (current.name === input.name && current.description === input.description && JSON.stringify(current.settings) === settings)
            return get(input.id)
          database.prepare('UPDATE buddies SET name = ?, description = ?, settings_json = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
            .run(input.name, input.description, settings, now, input.id)
        }
        changed()
        return get(input.id)
      })
    },
    refreshManaged(id: string): LocalBuddy {
      return withTransaction(database, () => {
        const buddy = get(id)
        if (!buddy.managed)
          throw new BuddyServiceError('BUDDY_INVALID_NPC_BINDING')
        database.prepare('UPDATE buddies SET revision = revision + 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id)
        changed()
        return get(id)
      })
    },
    clearManagedConfiguration(id: string): LocalBuddy {
      return withTransaction(database, () => {
        const buddy = get(id)
        if (!buddy.managed)
          throw new BuddyServiceError('BUDDY_INVALID_NPC_BINDING')
        const settings = { ...buddy.settings, model: null, npcTeamEnabled: DEFAULT_BUDDY_SETTINGS.npcTeamEnabled, npcConcurrency: DEFAULT_BUDDY_SETTINGS.npcConcurrency }
        managedCapabilities.setUserEnabled(id, false)
        database.prepare('UPDATE buddies SET settings_json = ?, enabled = 0, avatar = NULL, custom_avatars_json = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(settings), '[]', new Date().toISOString(), id)
        changed()
        return get(id)
      })
    },
    duplicate(input: BuddyMutation): LocalBuddy {
      return withTransaction(database, () => {
        const current = writable(input)
        if (current.kind !== 'npc')
          throw new BuddyServiceError('BUDDY_INVALID_NPC_BINDING')
        const id = randomUUID()
        const now = new Date().toISOString()
        database.prepare('INSERT INTO buddies (id, kind, name, avatar, custom_avatars_json, description, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, 'npc', current.name, current.avatar, JSON.stringify(current.customAvatars), current.description, JSON.stringify(current.settings), now, now)
        changed()
        return get(id)
      })
    },
    resetProfile(input: BuddyMutation): LocalBuddy {
      return withTransaction(database, () => {
        writable(input)
        if (input.buddyId !== BUILTIN_BUDDY_ID)
          throw new BuddyServiceError('BUDDY_RESET_UNAVAILABLE')
        return updateProfile({ ...input, name: 'Lexora', avatar: null, description: '' })
      })
    },
    delete(input: BuddyMutation): LocalBuddy {
      return withTransaction(database, () => {
        const current = writable(input)
        if (current.managed)
          throw new BuddyServiceError('BUDDY_MANAGED_PROTECTED')
        if (current.id === BUILTIN_BUDDY_ID)
          throw new BuddyServiceError('BUDDY_BUILTIN_PROTECTED')
        if (state().defaultBuddyId === current.id)
          throw new BuddyServiceError('BUDDY_DEFAULT_PROTECTED')
        const now = new Date().toISOString()
        database.prepare('UPDATE buddies SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?').run(now, now, current.id)
        changed()
        return get(current.id)
      })
    },
    setDefault(input: BuddyDefaultUpdate): BuddyCatalog {
      return withTransaction(database, () => {
        const buddy = active(input.buddyId)
        if (buddy.kind !== 'actor')
          throw new BuddyServiceError('BUDDY_NOT_ACTOR')
        if (!buddy.enabled)
          throw new BuddyServiceError('BUDDY_DISABLED')
        const current = state()
        if (input.expectedCatalogRevision !== current.revision)
          throw new BuddyServiceError('BUDDY_CONFLICT')
        if (current.defaultBuddyId !== input.buddyId) {
          database.prepare('UPDATE buddy_catalog SET default_buddy_id = ?, revision = revision + 1 WHERE id = 1').run(input.buddyId)
        }
        return list()
      })
    },
  }
}

export type BuddyRepository = ReturnType<typeof createBuddyRepository>

function avatarGallery(avatars: readonly string[], avatar: string | null | undefined) {
  const gallery = new Set(avatars)
  if (avatar?.startsWith('data:image/'))
    gallery.add(avatar)
  return JSON.stringify([...gallery])
}

function toBuddy(row: Record<string, unknown>): LocalBuddy {
  const { settings_json: settings, custom_avatars_json: customAvatars, enabled, ...value } = row
  return buddySchema.parse({
    ...value,
    createdAt: normalizeStoredUtcTimestamp(value.createdAt),
    updatedAt: normalizeStoredUtcTimestamp(value.updatedAt),
    deletedAt: normalizeStoredUtcTimestamp(value.deletedAt),
    enabled: enabled === 1,
    customAvatars: JSON.parse(customAvatars as string),
    settings: JSON.parse(settings as string),
  })
}

function normalizeStoredUtcTimestamp(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/\+00:00$/, 'Z') : value
}
