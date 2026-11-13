import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { syncMarketPlugins } from './sync.mjs'

async function market(t) {
  const root = await mkdtemp(join(tmpdir(), 'xtlaw-market-sync-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'plugins', 'transcript-player'), { recursive: true })
  await writeFile(join(root, 'plugins', 'transcript-player', 'keep.txt'), 'independently published content')
  return root
}

test('syncing one source plugin preserves an independently maintained market plugin', async (t) => {
  const root = await market(t)
  const result = await syncMarketPlugins({ marketRoot: root, plugin: 'legal-research' })
  assert.deepEqual(result, { names: ['legal-research'], changed: ['legal-research'] })
  const manifest = JSON.parse(await readFile(join(root, 'plugins', 'legal-research', 'extension.json'), 'utf8'))
  assert.equal(manifest.id, 'xtlaw.legal-research')
  assert.equal(await readFile(join(root, 'plugins', 'transcript-player', 'keep.txt'), 'utf8'), 'independently published content')
  assert.deepEqual(await syncMarketPlugins({ marketRoot: root, plugin: 'legal-research', check: true }), { names: ['legal-research'], changed: [] })
})

test('check mode does not create a selected plugin or touch other plugins', async (t) => {
  const root = await market(t)
  const result = await syncMarketPlugins({ marketRoot: root, plugin: 'legal-research', check: true })
  assert.deepEqual(result, { names: ['legal-research'], changed: ['legal-research'] })
  assert.deepEqual(await readdir(join(root, 'plugins')), ['transcript-player'])
})

test('invalid selections fail before copying any plugin instead of falling back to a full sync', async (t) => {
  const root = await market(t)
  for (const plugin of ['', 'missing-plugin', '../legal-research'])
    await assert.rejects(syncMarketPlugins({ marketRoot: root, plugin }), /Unknown source plugin/)
  assert.deepEqual(await readdir(join(root, 'plugins')), ['transcript-player'])
})

test('omitting the filter preserves the existing full check behavior without writes', async (t) => {
  const root = await market(t)
  const result = await syncMarketPlugins({ marketRoot: root, check: true })
  assert.ok(result.names.includes('legal-research'))
  assert.ok(result.names.includes('transcript-player'))
  assert.deepEqual(await readdir(join(root, 'plugins')), ['transcript-player'])
})
