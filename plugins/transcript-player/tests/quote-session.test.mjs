import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderedTargets, QuoteSession } from '../src/quote-session.ts'

const input = { kind: 'content', title: '字幕片段', text: '选中的原文' }
const capture = (id = 'capture-1') => ({ id, targets: [{ id: 'chat-1', label: '聊天一' }, { id: 'chat-2', label: '聊天二' }], defaultId: 'chat-2', clipboard: true })
const deferred = () => Promise.withResolvers()
function fixture(overrides = {}) {
  const commits = []
  const releases = []
  const api = {
    capture: async () => capture(),
    commit: async (id, choice) => { commits.push({ id, choice }); return true },
    release: async id => { releases.push(id); return true },
    ...overrides,
  }
  return { session: new QuoteSession(api), commits, releases }
}

test('menu commit uses the captured chat target, not a later focused chat or an extra dialog', async () => {
  const f = fixture()
  await f.session.capture(input)
  assert.equal(await f.session.commit('chat-1'), true)
  assert.deepEqual(f.commits, [{ id: 'capture-1', choice: { kind: 'view', id: 'chat-1' } }])
  f.session.close()
  assert.deepEqual(f.releases, []) // A consumed capture is not released twice.
})

test('unknown targets cannot be submitted', async () => {
  const f = fixture()
  await f.session.capture(input)
  assert.equal(await f.session.commit('not-advertised'), false)
  assert.deepEqual(f.commits, [])
  f.session.close()
  assert.deepEqual(f.releases, ['capture-1'])
})

test('closing or replacing the menu releases only its own frozen capture', async () => {
  let index = 0
  const f = fixture({ capture: async () => capture(`capture-${++index}`) })
  await f.session.capture(input)
  await f.session.capture(input)
  assert.deepEqual(f.releases, ['capture-1'])
  f.session.close()
  f.session.close()
  assert.deepEqual(f.releases, ['capture-1', 'capture-2'])
})

test('a capture response received after dismissal is discarded and released', async () => {
  const pending = deferred()
  const f = fixture({ capture: () => pending.promise })
  const result = f.session.capture(input)
  f.session.close()
  pending.resolve(capture('late'))
  assert.equal(await result, null)
  assert.deepEqual(f.releases, ['late'])
  assert.equal(await f.session.commit('chat-1'), false)
})

test('out-of-order capture responses cannot replace the newest menu', async () => {
  const first = deferred()
  const second = deferred()
  let index = 0
  const f = fixture({ capture: () => ++index === 1 ? first.promise : second.promise })
  const old = f.session.capture(input)
  const current = f.session.capture(input)
  second.resolve(capture('new'))
  assert.equal((await current).id, 'new')
  first.resolve(capture('old'))
  assert.equal(await old, null)
  assert.deepEqual(f.releases, ['old'])
  assert.equal(await f.session.commit('chat-2'), true)
  assert.equal(f.commits[0].id, 'new')
})

test('double clicks submit once and a closed in-flight success is not released', async () => {
  const pending = deferred()
  const calls = []
  const f = fixture({ commit: (id, choice) => { calls.push({ id, choice }); return pending.promise } })
  await f.session.capture(input)
  const first = f.session.commit('chat-1')
  assert.equal(await f.session.commit('chat-2'), false)
  assert.equal(await f.session.capture(input), null)
  f.session.close()
  assert.deepEqual(f.releases, [])
  pending.resolve(true)
  assert.equal(await first, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(f.releases, [])
})

test('failed or rejected commits release the captured material', async () => {
  const refused = fixture({ commit: async () => false })
  await refused.session.capture(input)
  assert.equal(await refused.session.commit('chat-1'), false)
  refused.session.close()
  assert.deepEqual(refused.releases, ['capture-1'])
  const failed = fixture({ commit: async () => { throw new Error('expired') } })
  await failed.session.capture(input)
  await assert.rejects(failed.session.commit('chat-1'), /expired/)
  failed.session.close()
  assert.deepEqual(failed.releases, ['capture-1'])
})

test('cleanup tolerates an already disposed view without leaking a throwing callback', async () => {
  const f = fixture({ release: () => { throw new Error('view disposed') } })
  await f.session.capture(input)
  assert.doesNotThrow(() => f.session.close())
})

test('the preferred chat is ordered first without dropping other targets', () => {
  assert.deepEqual(orderedTargets(capture()).map(target => target.id), ['chat-2', 'chat-1'])
  assert.deepEqual(orderedTargets({ ...capture(), defaultId: 'missing' }).map(target => target.id), ['chat-1', 'chat-2'])
  assert.deepEqual(orderedTargets({ ...capture(), targets: [] }), [])
})
