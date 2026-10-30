import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
const databases: DatabaseSync[] = []
const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
  for (const database of databases.splice(0)) database.close()
})

async function fixture() {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'lexora-granted-files-')))
  cleanup.push(() => rm(home, { force: true, recursive: true }))
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  const paths = new BuddyDataPaths(join(home, 'data'))
  const workspace = paths.conversationWorkspace(conversationId)
  await mkdir(workspace, { recursive: true })
  const external = join(home, 'external')
  await mkdir(external)
  const conversations = createConversationRepository(database)
  conversations.create({ id: conversationId, branchId: 'branch-1', spaceId: null, title: 'Task', approvalPolicy: 'policy', executionProfile: 'workspace_write', createdAt })
  const conversationGrants = createConversationDirectoryGrantRepository(database)
  const spaces = createSpaceRepository(database)
  const engine = new NativeFileEngine(join(home, 'operations'))
  await engine.ready()
  const roots = new ConversationFileRoots({ conversations, conversationGrants, spaces, paths })
  const files = new SpaceFileService(spaces, engine, undefined, roots)
  cleanup.push(async () => {
    await files.dispose()
    await engine.dispose()
  })
  const grant = (id: string, root: string) => conversationGrants.grant({ id, conversationId, root, canonicalRoot: root, createdAt })
  const target = (root: string, path = '') => ({ conversationId, root, path })
  return { home, workspace, external, conversations, conversationGrants, files, grant, target }
}

describe('granted directory file targets', () => {
  it('browses, previews, edits and saves a task workspace that no space owns', async () => {
    const f = await fixture()
    await writeFile(join(f.workspace, 'report.md'), '# Report')
    await mkdir(join(f.workspace, 'notes'))
    const page = await f.files.list(f.target(f.workspace))
    expect(page.entries.map(entry => entry.path).sort()).toEqual(['notes', 'report.md'])
    expect(await f.files.read(f.target(f.workspace, 'report.md'))).toMatchObject({ kind: 'text', text: '# Report' })
    expect(await f.files.locate(f.target(f.workspace, 'report.md'))).toEqual({ path: join(f.workspace, 'report.md'), kind: 'file' })
    const document = await f.files.readDocument(f.target(f.workspace, 'report.md'))
    const saved = await f.files.saveDocument({ ...f.target(f.workspace, 'report.md'), text: '# Report\n\nMore', etag: document.etag, operationId: randomUUID() })
    expect(saved.status).toBe('saved')
    expect(await readFile(join(f.workspace, 'report.md'), 'utf8')).toBe('# Report\n\nMore')
    const stale = await f.files.saveDocument({ ...f.target(f.workspace, 'report.md'), text: 'stale', etag: document.etag, operationId: randomUUID() })
    expect(stale.status).toBe('conflict')
  })

  it('serves a media URL that names the granted root instead of a space directory', async () => {
    const f = await fixture()
    f.grant('grant-1', f.external)
    await writeFile(join(f.external, 'pixel.png'), Uint8Array.of(137, 80, 78, 71))
    const preview = await f.files.read(f.target(f.external, 'pixel.png'))
    const url = new URL(preview.imageUrl!)
    expect(url.hostname).toBe('grant-media')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ conversationId, root: f.external, path: 'pixel.png' })
    expect(await f.files.resolveMedia(f.target(f.external, 'pixel.png'))).toMatchObject({ path: join(f.external, 'pixel.png'), mimeType: 'image/png' })
  })

  it('creates, renames, copies and moves inside one granted root', async () => {
    const f = await fixture()
    f.grant('grant-1', f.external)
    const mutate = (path: string, action: Parameters<SpaceFileService['mutate']>[0]['action']) => f.files.mutate({ ...f.target(f.external, path), operationId: randomUUID(), action })
    await mutate('a.txt', { kind: 'createFile' })
    await mutate('folder', { kind: 'createDirectory' })
    await writeFile(join(f.external, 'a.txt'), 'hello')
    await mutate('a.txt', { kind: 'rename', destination: 'b.txt' })
    await mutate('b.txt', { kind: 'copy', destination: f.target(f.external, 'folder/c.txt') })
    await mutate('b.txt', { kind: 'move', destination: f.target(f.external, 'folder/d.txt') })
    expect(await readFile(join(f.external, 'folder/c.txt'), 'utf8')).toBe('hello')
    expect(await readFile(join(f.external, 'folder/d.txt'), 'utf8')).toBe('hello')
    await expect(readFile(join(f.external, 'b.txt'))).rejects.toThrow()
  })

  it('refuses to copy or move to another root, another conversation or a space directory', async () => {
    const f = await fixture()
    f.grant('grant-1', f.external)
    await writeFile(join(f.workspace, 'a.txt'), 'x')
    const mutate = (action: Parameters<SpaceFileService['mutate']>[0]['action']) => f.files.mutate({ ...f.target(f.workspace, 'a.txt'), operationId: randomUUID(), action })
    for (const kind of ['copy', 'move'] as const) {
      await expect(mutate({ kind, destination: f.target(f.external, 'a.txt') })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
      await expect(mutate({ kind, destination: { conversationId: 'other', root: f.workspace, path: 'a.txt' } })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
      await expect(mutate({ kind, destination: { spaceId: 'space-1', directoryId: 'directory-1', revision: 1, path: 'a.txt' } })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    }
    await expect(readFile(join(f.external, 'a.txt'))).rejects.toThrow()
    expect(await readFile(join(f.workspace, 'a.txt'), 'utf8')).toBe('x')
  })

  it('rejects a root the conversation was never granted, including a parent of a granted root', async () => {
    const f = await fixture()
    const granted = join(f.external, 'granted')
    await mkdir(granted)
    f.grant('grant-1', granted)
    await writeFile(join(f.external, 'secret.txt'), 'secret')
    await expect(f.files.list(f.target(f.external))).rejects.toMatchObject({ code: 'DIRECTORY_NOT_AUTHORIZED' })
    await expect(f.files.read(f.target(f.external, 'secret.txt'))).rejects.toMatchObject({ code: 'DIRECTORY_NOT_AUTHORIZED' })
    await expect(f.files.read({ conversationId: 'missing', root: granted, path: '' })).rejects.toMatchObject({ code: 'DIRECTORY_NOT_AUTHORIZED' })
  })

  it('rejects escape paths and protected folders inside a granted root', async () => {
    const f = await fixture()
    f.grant('grant-1', f.external)
    await writeFile(join(f.home, 'outside.txt'), 'outside')
    const secret = join(f.external, 'secret')
    await mkdir(secret)
    await writeFile(join(secret, 'credentials'), 'private')
    vi.stubEnv('LEXORA_BUDDY_STORAGE_PROTECTION', JSON.stringify([secret]))
    await symlink(join(f.home, 'outside.txt'), join(f.external, 'link.txt'))
    for (const path of ['../outside.txt', join(f.home, 'outside.txt'), 'a\\b'])
      await expect(f.files.read(f.target(f.external, path))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(f.files.read(f.target(f.external, 'secret/credentials'))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(f.files.read(f.target(f.external, 'link.txt'))).rejects.toBeTruthy()
    expect((await f.files.list(f.target(f.external))).entries.map(entry => entry.path)).not.toContain('secret')
  })

  it('denies a root once its grant is revoked or the conversation is deleted', async () => {
    const f = await fixture()
    f.grant('grant-1', f.external)
    await writeFile(join(f.external, 'a.txt'), 'x')
    expect(await f.files.read(f.target(f.external, 'a.txt'))).toMatchObject({ kind: 'text' })
    f.conversationGrants.revokeAll(conversationId, createdAt)
    await expect(f.files.read(f.target(f.external, 'a.txt'))).rejects.toMatchObject({ code: 'DIRECTORY_NOT_AUTHORIZED' })
    await expect(f.files.mutate({ ...f.target(f.external, 'a.txt'), operationId: randomUUID(), action: { kind: 'createFile' } })).rejects.toMatchObject({ code: 'DIRECTORY_NOT_AUTHORIZED' })
    expect(await f.files.read(f.target(f.workspace, '')).catch(() => 'directory')).toBeDefined()
  })

  it('does not follow a granted folder that was replaced by a link elsewhere', async () => {
    const f = await fixture()
    const elsewhere = join(f.home, 'elsewhere')
    await mkdir(elsewhere)
    await writeFile(join(elsewhere, 'private.txt'), 'private')
    f.grant('grant-1', f.external)
    await rm(f.external, { recursive: true })
    await symlink(elsewhere, f.external)
    await expect(f.files.read(f.target(f.external, 'private.txt'))).rejects.toMatchObject({ code: 'DIRECTORY_NOT_AUTHORIZED' })
  })

  it('reports changes with the conversation and root instead of a space directory', async () => {
    const f = await fixture()
    f.grant('grant-1', f.external)
    await writeFile(join(f.external, 'a.txt'), 'x')
    const events: unknown[] = []
    f.files.onDidChange(event => events.push(event))
    const document = await f.files.readDocument(f.target(f.external, 'a.txt'))
    await f.files.saveDocument({ ...f.target(f.external, 'a.txt'), text: 'y', etag: document.etag, operationId: randomUUID() })
    expect(events).toContainEqual(expect.objectContaining({ kind: 'saved', conversationId, root: f.external }))
    expect(events.every(event => !('spaceId' in (event as object)))).toBe(true)
  })

  it('rejects granted targets when the service has no grant lookup', async () => {
    const home = await realpath(await mkdtemp(join(tmpdir(), 'lexora-granted-none-')))
    cleanup.push(() => rm(home, { force: true, recursive: true }))
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const engine = new NativeFileEngine(join(home, 'operations'))
    await engine.ready()
    const files = new SpaceFileService(createSpaceRepository(database), engine)
    cleanup.push(async () => {
      await files.dispose()
      await engine.dispose()
    })
    await expect(files.list({ conversationId, root: home, path: '' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})
