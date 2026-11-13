import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const pluginDir = path.join(repoRoot, 'plugins/legacy-task-cleanup')
const buddyRequire = createRequire(path.join(repoRoot, 'apps/buddy/package.json'))
const ts = buddyRequire('typescript')
const { parseHTML } = buddyRequire('linkedom')
const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  verbatimModuleSyntax: true,
}
const transpile = source => ts.transpileModule(source, { compilerOptions }).outputText
const asDataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`

const stateSource = await readFile(path.join(pluginDir, 'state.ts'), 'utf8')
const stateUrl = asDataModule(transpile(stateSource))
const mainSource = (await readFile(path.join(pluginDir, 'main.ts'), 'utf8'))
  .replaceAll("from './state'", `from '${stateUrl}'`)
const originalViewSource = await readFile(path.join(pluginDir, 'view.ts'), 'utf8')
const viewSource = originalViewSource
  .replaceAll("from './state'", `from '${stateUrl}'`)
  .replace("stylesheet.href = new URL('./style.css', import.meta.url).href", "stylesheet.href = 'style.css'")
assert.ok(mainSource.includes(stateUrl), 'main.ts must resolve its real state.ts import')
assert.ok(viewSource.includes(stateUrl), 'view.ts must resolve its real state.ts import')
assert.notEqual(viewSource, originalViewSource, 'view harness must replace the package-relative stylesheet URL')

const [{ activate }, { initialState, readState }, { render }] = await Promise.all([
  import(asDataModule(transpile(mainSource))),
  import(stateUrl),
  import(asDataModule(transpile(viewSource))),
])
const pluginId = 'p95e8d9a8d120433d9ba2058e1c844ed0.legacy-task-cleanup'
const preview = { total: 3, skipped: 2 }
const progress = (phase, fields = {}) => ({
  phase,
  total: 3,
  processed: 0,
  deleted: 0,
  pending: 0,
  failed: 0,
  skipped: 2,
  errorCode: null,
  ...fields,
})
const tick = () => new Promise(resolve => setImmediate(resolve))

async function until(predicate, label) {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return
    await tick()
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function createMainHarness(run) {
  const lifecycle = new AbortController()
  const handlers = new Map()
  const states = []
  const placementCalls = []
  const context = {
    extension: { id: pluginId },
    signal: lifecycle.signal,
    views: {
      broadcast: async message => {
        if (message?.type === 'cleanup-state') states.push(message.state)
      },
    },
    commands: {
      register: (id, handler) => {
        handlers.set(id, handler)
        return { dispose() {} }
      },
    },
    subscriptions: { add: value => value },
    placements: {
      show: async id => {
        placementCalls.push(['show', id])
        return id
      },
      hide: async id => {
        placementCalls.push(['hide', id])
        return id
      },
    },
  }
  activate(context)
  const taskCleanup = { run }
  const cleanup = () => handlers.get(`${pluginId}.cleanup`)({
    resource: null,
    arguments: null,
    invocation: { target: 'extension.actions', instanceId: null },
    taskCleanup,
  })
  const respond = (state, confirmed) => handlers.get(`${pluginId}.respond-confirmation`)({
    resource: null,
    arguments: { requestId: state.requestId, confirmed },
    invocation: { target: 'view', instanceId: null },
  })
  return { handlers, states, placementCalls, lifecycle, cleanup, respond }
}

function createViewHarness() {
  const dom = parseHTML('<html><body></body></html>')
  globalThis.document = dom.document
  const lifecycle = new AbortController()
  const commands = []
  let messageListener
  let visibilityListener
  const container = dom.document.createElement('div')
  const context = {
    visible: true,
    signal: lifecycle.signal,
    mount: { width: 640, height: 560 },
    commands: {
      execute: async (name, args) => {
        commands.push({ name, args })
        return name.endsWith('.get-status') ? initialState() : true
      },
    },
    onMessage: listener => {
      messageListener = listener
      return { dispose() {} }
    },
    onMountChange: () => ({ dispose() {} }),
    onVisibilityChange: listener => {
      visibilityListener = listener
      return { dispose() {} }
    },
    onBeforeClose: () => ({ dispose() {} }),
    setPresentation: async () => {},
  }
  render(context, container)
  return {
    dom,
    container,
    commands,
    lifecycle,
    send: message => messageListener(message),
    setVisibility: value => visibilityListener(value),
  }
}

function confirmingState(revision = 1) {
  return {
    ...initialState(),
    revision,
    requestId: 'request-current',
    phase: 'confirming',
    total: 3,
    skipped: 1,
    countsKnown: true,
  }
}

const respondCommand = `${pluginId}.respond-confirmation`
const hideCommand = `${pluginId}.hide-progress`

test('cancel responds false to the active request; repeated cleanup and show-progress do not submit another run', async () => {
  let runCalls = 0
  let observedConfirmation
  const harness = createMainHarness(async options => {
    runCalls++
    observedConfirmation = await options.confirm(preview, new AbortController().signal)
    const summary = progress('cancelled')
    options.onProgress(summary)
    return { status: 'cancelled', results: [], summary }
  })

  const firstRun = harness.cleanup()
  await until(() => harness.states.some(state => state.phase === 'confirming'), 'confirmation preview')
  const confirming = harness.states.at(-1)
  assert.equal(confirming.total, 3)
  assert.equal(confirming.skipped, 2)
  await harness.cleanup()
  await harness.handlers.get(`${pluginId}.show-progress`)()
  assert.equal(runCalls, 1)
  assert.equal(harness.placementCalls.filter(([kind]) => kind === 'show').length, 3)
  assert.equal(harness.respond(confirming, false), true)
  await firstRun

  assert.equal(observedConfirmation, false)
  assert.equal(harness.states.at(-1).phase, 'cancelled')
  assert.equal(harness.states.at(-1).deleted, 0)
  assert.equal(harness.states.at(-1).skipped, 2)
})

test('true confirmation is request-bound and the final summary supplies distinct result counts', async () => {
  let runCalls = 0
  const harness = createMainHarness(async options => {
    runCalls++
    assert.equal(await options.confirm(preview, new AbortController().signal), true)
    options.onProgress(progress('running', { processed: 1, deleted: 1, skipped: 1 }))
    const summary = progress('completed', { processed: 3, deleted: 1, pending: 1, failed: 1, skipped: 2 })
    options.onProgress(summary)
    return {
      status: 'completed',
      results: [
        { conversationId: 'a', expectedRevision: 1, status: 'deleted' },
        { conversationId: 'b', expectedRevision: 2, status: 'pending' },
        { conversationId: 'c', expectedRevision: 3, status: 'failed', errorCode: 'STALE' },
      ],
      summary,
    }
  })

  const run = harness.cleanup()
  await until(() => harness.states.some(state => state.phase === 'confirming'), 'successful confirmation')
  assert.equal(harness.respond(harness.states.at(-1), true), true)
  await run
  const final = harness.states.at(-1)
  assert.equal(runCalls, 1)
  assert.deepEqual(
    [final.phase, final.processed, final.deleted, final.pending, final.failed, final.skipped],
    ['completed', 3, 1, 1, 1, 2],
  )
  assert.equal(final.requestId, null)
})

test('the original taskCleanup call signal cancels an unresolved confirmation', async () => {
  const hostCall = new AbortController()
  let observedConfirmation
  const harness = createMainHarness(async options => {
    observedConfirmation = await options.confirm(preview, hostCall.signal)
    const summary = progress('cancelled')
    options.onProgress(summary)
    return { status: 'cancelled', results: [], summary }
  })

  const run = harness.cleanup()
  await until(() => harness.states.some(state => state.phase === 'confirming'), 'signal-bound confirmation')
  hostCall.abort()
  await run
  assert.equal(observedConfirmation, false)
  assert.equal(harness.states.at(-1).phase, 'cancelled')
  assert.equal(harness.states.at(-1).deleted, 0)
})

test('extension deactivation cancels an unresolved confirmation', async () => {
  let observedConfirmation
  const harness = createMainHarness(async options => {
    observedConfirmation = await options.confirm(preview, new AbortController().signal)
    const summary = progress('cancelled')
    options.onProgress(summary)
    return { status: 'cancelled', results: [], summary }
  })

  const run = harness.cleanup()
  await until(() => harness.states.some(state => state.phase === 'confirming'), 'deactivation-bound confirmation')
  harness.lifecycle.abort()
  await run
  assert.equal(observedConfirmation, false)
  assert.equal(harness.states.at(-1).deleted, 0)
})

test('an unknown post-confirmation failure preserves last real counts without retrying', async () => {
  let runCalls = 0
  const harness = createMainHarness(async options => {
    runCalls++
    assert.equal(await options.confirm(preview, new AbortController().signal), true)
    options.onProgress(progress('running', { processed: 2, deleted: 1, pending: 1, failed: 0, skipped: 2 }))
    throw new Error('lost result')
  })

  const run = harness.cleanup()
  await until(() => harness.states.some(state => state.phase === 'confirming'), 'unknown-result confirmation')
  assert.equal(harness.respond(harness.states.at(-1), true), true)
  await run
  const final = harness.states.at(-1)
  assert.deepEqual(
    [final.phase, final.processed, final.deleted, final.pending, final.failed, final.skipped],
    ['interrupted', 2, 1, 1, 0, 2],
  )
  assert.equal(runCalls, 1)
  assert.match(final.errorMessage, /保留最后确认的计数/)
})

test('state validation accepts a valid final snapshot and rejects invalid counters', () => {
  assert.ok(readState({
    revision: 4,
    requestId: null,
    phase: 'completed',
    total: 3,
    processed: 3,
    deleted: 1,
    pending: 1,
    failed: 1,
    skipped: 2,
    countsKnown: true,
    errorMessage: null,
  }))
  assert.equal(readState({
    revision: -1,
    requestId: null,
    phase: 'completed',
    total: 3,
    processed: 3,
    deleted: 1,
    pending: 1,
    failed: 1,
    skipped: 2,
    countsKnown: true,
    errorMessage: null,
  }), null)
})

test('hiding the view cancels its current confirmation request', async () => {
  const harness = createViewHarness()
  await tick()
  harness.send({ type: 'cleanup-state', state: confirmingState() })
  harness.setVisibility(false)

  assert.ok(harness.commands.some(call => call.name === respondCommand
    && call.args.requestId === 'request-current'
    && call.args.confirmed === false))
})

test('closing the panel cancels confirmation and requests placement hide', async () => {
  const harness = createViewHarness()
  await tick()
  harness.send({ type: 'cleanup-state', state: confirmingState() })
  harness.container.querySelector('.close-button').dispatchEvent(new harness.dom.Event('click'))
  await tick()

  assert.ok(harness.commands.some(call => call.name === respondCommand
    && call.args.requestId === 'request-current'
    && call.args.confirmed === false))
  assert.ok(harness.commands.some(call => call.name === hideCommand
    && call.args.requestId === 'request-current'))
})

test('destroying the view cancels the pending confirmation', async () => {
  const harness = createViewHarness()
  await tick()
  harness.send({ type: 'cleanup-state', state: confirmingState() })
  harness.lifecycle.abort()

  assert.ok(harness.commands.some(call => call.name === respondCommand
    && call.args.requestId === 'request-current'
    && call.args.confirmed === false))
})

test('the result view renders deleted, pending, failed and skipped separately', async () => {
  const harness = createViewHarness()
  await tick()
  harness.send({
    type: 'cleanup-state',
    state: {
      ...initialState(),
      revision: 1,
      phase: 'completed',
      total: 3,
      processed: 3,
      deleted: 1,
      pending: 1,
      failed: 1,
      skipped: 2,
      countsKnown: true,
    },
  })

  assert.deepEqual(
    ['deleted', 'pending', 'failed', 'skipped'].map(key => harness.container.querySelector(`[data-count="${key}"]`).textContent),
    ['1', '1', '1', '2'],
  )
})
