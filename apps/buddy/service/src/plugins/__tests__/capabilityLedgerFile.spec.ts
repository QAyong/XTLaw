import type { CapabilityLedger } from '../ExtensionCapabilitySync'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createCapabilityLedgerFile } from '../capabilityLedgerFile'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it('round-trips the ledger and treats a missing or damaged file as empty', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lexora-capability-ledger-'))
  directories.push(directory)
  const path = join(directory, 'extension-capabilities.json')
  const store = createCapabilityLedgerFile(path)
  expect(await store.read()).toEqual({ version: 1, entries: [] })
  const value: CapabilityLedger = { version: 1, entries: [{ extensionId: 'tests.legal', kind: 'agent', id: 'ext.tests.legal.law-finder', digest: 'a'.repeat(64) }] }
  await store.write(value)
  expect(await store.read()).toEqual(value)
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(value)
  await expect(store.write({ version: 1, entries: [{ ...value.entries[0]!, digest: 'short' }] })).rejects.toThrow()
  expect(await store.read()).toEqual(value)
  await rm(path)
  expect(await store.read()).toEqual({ version: 1, entries: [] })
})
