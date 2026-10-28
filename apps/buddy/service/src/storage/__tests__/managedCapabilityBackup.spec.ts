import type { DatabaseSync } from 'node:sqlite'
import type { BackupScope } from '../../../../shared/storage/backupScope'
import { afterEach, expect, it } from 'vitest'
import { mergeBackupDatabase, selectBackupDatabase } from '../backupDatabase'
import { createConversationRepository } from '../conversationRepository'
import { openBuddyDatabase } from '../database'
import { sanitizeRestoredDatabase } from '../restorePolicy'

const databases: DatabaseSync[] = []
const now = '2026-10-27T00:00:00.000Z'
afterEach(() => {
  for (const database of databases.splice(0))
    database.close()
})

function database() {
  const db = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(db)
  return db
}

function seed(db: DatabaseSync, suffix = '') {
  db.prepare('INSERT INTO buddies (id, kind, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(`npc${suffix}`, 'npc', 'Managed NPC', now, now)
  db.prepare('INSERT INTO mcp_servers (id, name, transport, url, credential_ref, trusted_at, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)')
    .run(`mcp${suffix}`, 'Managed MCP', 'streamable-http', 'https://example.invalid/mcp', `credential${suffix}`, now, now, now)
  const insert = db.prepare('INSERT INTO extension_capabilities (id, extension_id, extension_name, kind, contribution_id, revision, definition_json, state, user_enabled, credential_target) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  insert.run(`npc${suffix}`, 'test.plugin', 'Plugin', 'subagent', `npc${suffix}`, 'revision-1', JSON.stringify({ id: `npc${suffix}`, name: 'NPC', instructions: 'Review', fileAccess: 'read_only' }), 'enabled', 1, null)
  insert.run(`mcp${suffix}`, 'test.plugin', 'Plugin', 'mcp', `mcp${suffix}`, 'revision-1', JSON.stringify({ id: `mcp${suffix}`, name: 'MCP', transport: 'streamable-http', url: 'https://example.invalid/mcp', authentication: 'bearer' }), 'enabled', 1, 'https://example.invalid/mcp')
}

function sourceRows(db: DatabaseSync) {
  return db.prepare('SELECT * FROM extension_capabilities ORDER BY id').all()
}

it.each<{ scopes: BackupScope[], ids: string[] }>([
  { scopes: ['buddies'], ids: ['npc'] },
  { scopes: ['connections'], ids: ['mcp'] },
  { scopes: ['plugins'], ids: [] },
  { scopes: ['buddies', 'connections'], ids: ['mcp', 'npc'] },
])('backs up only sources belonging to the selected owners: $scopes', ({ scopes, ids }) => {
  const db = database()
  seed(db)
  const before = sourceRows(db)
  selectBackupDatabase(db, scopes)
  expect(sourceRows(db)).toEqual(before.filter(row => ids.includes(String(row.id))))
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it.each([false, true])('retains task buddy source closure without taking over an existing unselected buddy (existing=%s)', (existing) => {
  const source = database()
  seed(source)
  source.prepare('UPDATE buddies SET settings_json = json_set(settings_json, \'$.npcIds\', json(\'["npc"]\')) WHERE id = \'default\'').run()
  createConversationRepository(source).create({ id: 'task', branchId: 'branch', title: 'Task', spaceId: null, approvalPolicy: 'policy', executionProfile: 'workspace_write', createdAt: now })
  sanitizeRestoredDatabase(source)
  selectBackupDatabase(source, ['tasks'])
  expect(sourceRows(source)).toMatchObject([{ id: 'npc', state: 'unavailable' }])
  expect(source.prepare('SELECT * FROM mcp_servers').all()).toEqual([])

  const target = database()
  if (existing)
    target.prepare('INSERT INTO buddies (id, kind, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('npc', 'npc', 'Current user NPC', now, now)
  mergeBackupDatabase(target, source, ['tasks'])
  if (existing) {
    expect(target.prepare('SELECT name FROM buddies WHERE id = ?').get('npc')).toEqual({ name: 'Current user NPC' })
    expect(sourceRows(target)).toEqual([])
  }
  else {
    expect(target.prepare('SELECT name FROM buddies WHERE id = ?').get('npc')).toEqual({ name: 'Managed NPC' })
    expect(sourceRows(target)).toEqual(sourceRows(source))
  }
})

it.each(['buddies', 'connections'] as const)('imports managed owners and sources together into another profile: %s', (scope) => {
  const source = database()
  seed(source)
  sanitizeRestoredDatabase(source)
  selectBackupDatabase(source, [scope])
  const target = database()
  const id = scope === 'buddies' ? 'npc' : 'mcp'
  const table = scope === 'buddies' ? 'buddies' : 'mcp_servers'
  for (let attempt = 0; attempt < 2; attempt++) {
    mergeBackupDatabase(target, source, [scope])
    expect(target.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)).toEqual(source.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id))
    expect(sourceRows(target)).toEqual(sourceRows(source))
  }
})

it.each(['buddies', 'connections'] as const)('restores stable source identities and disabled runtime state without altering unselected records: %s', (scope) => {
  const source = database()
  seed(source)
  const original = sourceRows(source)
  sanitizeRestoredDatabase(source)
  selectBackupDatabase(source, [scope])
  const target = database()
  seed(target)
  seed(target, '-unselected')
  target.prepare('UPDATE extension_capabilities SET revision = \'current-revision\'').run()
  const before = sourceRows(target)
  const id = scope === 'buddies' ? 'npc' : 'mcp'
  const expected = original.find(row => row.id === id)!
  for (let attempt = 0; attempt < 2; attempt++) {
    mergeBackupDatabase(target, source, [scope])
    expect(target.prepare('SELECT * FROM extension_capabilities WHERE id = ?').get(id)).toEqual({ ...expected, state: 'unavailable', unavailable_reason: scope === 'connections' ? null : 'dependency_unavailable', user_enabled: scope === 'connections' ? 0 : expected.user_enabled })
    expect(sourceRows(target).filter(row => row.id !== id)).toEqual(before.filter(row => row.id !== id))
    expect(target.prepare('SELECT enabled, trusted_at, credential_ref FROM mcp_servers WHERE id = ?').get('mcp')).toEqual(scope === 'connections'
      ? { enabled: 0, trusted_at: null, credential_ref: null }
      : { enabled: 1, trusted_at: now, credential_ref: 'credential' })
    expect(target.prepare('SELECT enabled, trusted_at, credential_ref FROM mcp_servers WHERE id = ?').get('mcp-unselected')).toEqual({ enabled: 1, trusted_at: now, credential_ref: 'credential-unselected' })
  }
})

it.each([false, true])('preserves connector credentials only through the existing optional credential policy (preserve=%s)', (preserve) => {
  const db = database()
  seed(db)
  sanitizeRestoredDatabase(db, preserve)
  expect(db.prepare('SELECT enabled, trusted_at, credential_ref FROM mcp_servers').get()).toEqual({ enabled: 0, trusted_at: null, credential_ref: preserve ? 'credential' : null })
  expect(sourceRows(db)).toMatchObject([
    { id: 'mcp', state: 'unavailable', user_enabled: 0, unavailable_reason: null, credential_target: 'https://example.invalid/mcp' },
    { id: 'npc', state: 'unavailable', user_enabled: 1, unavailable_reason: 'dependency_unavailable' },
  ])
})

it.each(['incoming-user', 'current-user', 'different-source', 'different-id'] as const)('rejects source ownership conflicts atomically: %s', (conflict) => {
  const source = database()
  const target = database()
  seed(source)
  seed(target)
  if (conflict === 'incoming-user')
    source.prepare('DELETE FROM extension_capabilities WHERE id = \'npc\'').run()
  if (conflict === 'current-user')
    target.prepare('DELETE FROM extension_capabilities WHERE id = \'npc\'').run()
  if (conflict === 'different-source')
    target.prepare('UPDATE extension_capabilities SET extension_id = \'other.plugin\' WHERE id = \'npc\'').run()
  if (conflict === 'different-id') {
    target.prepare('UPDATE buddies SET id = \'other-npc\' WHERE id = \'npc\'').run()
    target.prepare('UPDATE extension_capabilities SET id = \'other-npc\' WHERE id = \'npc\'').run()
  }
  source.prepare('UPDATE buddies SET name = \'Incoming change\' WHERE id = \'default\'').run()
  sanitizeRestoredDatabase(source)
  selectBackupDatabase(source, ['buddies'])
  const sourcesBefore = sourceRows(target)
  const buddiesBefore = target.prepare('SELECT * FROM buddies ORDER BY id').all()
  expect(() => mergeBackupDatabase(target, source, ['buddies'])).toThrow('SNAPSHOT_DEPENDENCY_CONFLICT')
  expect(sourceRows(target)).toEqual(sourcesBefore)
  expect(target.prepare('SELECT * FROM buddies ORDER BY id').all()).toEqual(buddiesBefore)
  expect(target.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
