import type { NativeFileOperation } from '../../files/NativeFileEngine'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { NativeFileEngine } from '../../files/NativeFileEngine'
import { BuddyDataPaths } from '../../storage/BuddyDataPaths'
import { createConversationDirectoryGrantRepository } from '../../storage/conversationDirectoryGrantRepository'
import { createConversationRepository } from '../../storage/conversationRepository'
import { openBuddyDatabase } from '../../storage/database'
import { createSpaceRepository } from '../../storage/spaceRepository'
import { ConversationFileRoots } from '../ConversationFileRoots'
import { SpaceFileService } from '../SpaceFileService'

const conversationId = 'conversation-1'
const createdAt = '2026-10-30T00:00:00.000Z'
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse())
    await dispose()
})

// An interrupted copy inside a granted directory: the journal still says "executing" when the app starts again.
async function fixture() {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'granted-file-recovery-')))
  cleanup.push(() => rm(home, { recursive: true, force: true }))
  const external = join(home, 'external')
  const journal = join(home, 'journal')
  await mkdir(external)
  await writeFile(join(external, 'note.txt'), 'original')
  // The service registers a granted root under this key; recovery finds the record again through it after a restart.
  const key = JSON.stringify([`grant:${conversationId}:grant-1`, 1])
  const original = new NativeFileEngine(journal)
  let record: NativeFileOperation
  try {
    await original.ready()
    await original.register(key, external)
    record = await original.mutate({ operationId: randomUUID(), root: key, path: 'note.txt', action: { kind: 'copy', destinationRoot: key, destination: 'copied.txt' } })
  }
  finally {
    await original.dispose()
  }
  const journalDb = new DatabaseSync(join(journal, 'operations.sqlite'))
  record.status = 'executing'
  journalDb.prepare('UPDATE operations SET record=?,status=? WHERE id=?').run(JSON.stringify(record), JSON.stringify(record.status), record.operationId)
  journalDb.close()
  const engine = new NativeFileEngine(journal)
  cleanup.push(() => engine.dispose())
  await engine.ready()
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  cleanup.push(async () => database.close())
  const conversations = createConversationRepository(database)
  conversations.create({ id: conversationId, branchId: 'branch-1', spaceId: null, title: 'Task', approvalPolicy: 'policy', executionProfile: 'workspace_write', createdAt })
  const conversationGrants = createConversationDirectoryGrantRepository(database)
  conversationGrants.grant({ id: 'grant-1', conversationId, root: external, canonicalRoot: external, createdAt })
  const spaces = createSpaceRepository(database)
  const roots = new ConversationFileRoots({ conversations, conversationGrants, spaces, paths: new BuddyDataPaths(join(home, 'data')) })
  const files = new SpaceFileService(spaces, engine, undefined, roots)
  cleanup.push(() => files.dispose())
  const input = { conversationId, root: external, path: '', operationId: record.operationId }
  return { external, record, engine, files, input, conversationGrants }
}

describe('granted directory operations after a restart', () => {
  it('lists an interrupted operation for recovery and acknowledges it', async () => {
    const f = await fixture()
    expect(await f.files.history(f.input)).toContainEqual(expect.objectContaining({ operationId: f.record.operationId, status: 'needs-recovery', path: 'note.txt', destination: 'copied.txt' }))
    const acknowledged = await f.files.acknowledge(f.input)
    expect(acknowledged.operationId).toBe(f.record.operationId)
    expect((await f.engine.query(f.record.operationId))?.status).toBe('acknowledged')
  })

  it('keeps the interrupted operation hidden and unchanged once the grant is revoked', async () => {
    const f = await fixture()
    f.conversationGrants.revokeAll(conversationId, createdAt)
    await expect(f.files.history(f.input)).rejects.toMatchObject({ code: 'DIRECTORY_NOT_AUTHORIZED' })
    await expect(f.files.acknowledge(f.input)).rejects.toMatchObject({ code: 'DIRECTORY_NOT_AUTHORIZED' })
    expect((await f.engine.query(f.record.operationId))?.status).toBe('needs-recovery')
  })
})
