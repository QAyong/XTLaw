// @vitest-environment jsdom
import { NMessageProvider } from 'naive-ui'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import DesktopExtensionManager from '../DesktopExtensionManager.vue'

const context = vi.hoisted(() => ({ read: () => ({}) as Record<string, unknown> }))
const entries = vi.hoisted(() => ['tests.a', 'tests.b', 'tests.c'].map(id => ({ manifest: { id, version: '1.0.0' } })))
vi.mock('../../extensionContext', () => ({ useExtensionContext: () => context.read() }))
vi.mock('../DesktopExtensionCatalog.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({ emits: ['installPack'], setup: (_, { emit }) => () => h('button', { 'data-testid': 'start-pack', 'onClick': () => emit('installPack', entries) }) }) }
})
// The review is the part a user confirms; the real one is covered by its own spec.
vi.mock('../DesktopExtensionInstallReview.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { review: { type: Object, required: true } },
      emits: ['cancel', 'install'],
      setup: (props, { emit }) => () => h('div', { 'data-testid': 'review', 'data-id': (props.review as { manifest: { id: string } }).manifest.id }, [
        h('button', { 'data-testid': 'confirm', 'onClick': () => emit('install', true, []) }),
        h('button', { 'data-testid': 'cancel', 'onClick': () => emit('cancel') }),
      ]),
    }),
  }
})
vi.mock('../../layouts/DesktopExtensionWorkbench.vue', () => ({
  default: { setup: (_: unknown, { slots }: { slots: Record<string, () => unknown> }) => () => [slots.actions?.(), slots.default?.()] },
}))

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const action of cleanup.splice(0).reverse()) action()
  document.body.innerHTML = ''
})

async function mountManager(reviewCatalog = vi.fn(async (id: string) => ({ token: `token-${id}`, manifest: { id, name: id }, currentVersion: null, addedPermissions: [] }))) {
  const install = vi.fn(async () => {})
  const cancelInstall = vi.fn(async () => {})
  context.read = () => ({
    state: { installed: shallowRef([]), unavailable: shallowRef([]), installations: shallowRef([]), error: shallowRef(null), refresh: vi.fn(async () => {}), install, api: { reviewCatalog, cancelInstall } },
    language: shallowRef('zh-CN'),
    authoring: { author: shallowRef(''), save: vi.fn() },
    settingsLocation: () => null,
    startCreation: vi.fn(),
    startSkillCreation: vi.fn(),
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
  await router.push('/')
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(NMessageProvider, null, { default: () => h(DesktopExtensionManager) }) })
  app.use(router)
  cleanup.push(() => {
    app.unmount()
    element.remove()
  })
  app.mount(element)
  await nextTick()
  const click = (testId: string) => (document.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click()
  const reviewing = () => document.querySelector('[data-testid="review"]')?.getAttribute('data-id') ?? null
  return { install, reviewCatalog, click, reviewing }
}

it('opens each missing member\'s review in turn and installs them in the pack\'s order', async () => {
  const { install, reviewCatalog, click, reviewing } = await mountManager()
  click('start-pack')
  await vi.waitFor(() => expect(reviewing()).toBe('tests.a'))
  click('confirm')
  await vi.waitFor(() => expect(reviewing()).toBe('tests.b'))
  click('confirm')
  await vi.waitFor(() => expect(reviewing()).toBe('tests.c'))
  click('confirm')
  await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(3))
  await vi.waitFor(() => expect(reviewing()).toBeNull())
  expect(reviewCatalog.mock.calls.map(call => call[0])).toEqual(['tests.a', 'tests.b', 'tests.c'])
  expect(install.mock.calls.map(call => (call as unknown as [{ manifest: { id: string } }])[0].manifest.id)).toEqual(['tests.a', 'tests.b', 'tests.c'])
})

it('stops at the member the user cancels and keeps what was installed', async () => {
  const { install, reviewCatalog, click, reviewing } = await mountManager()
  click('start-pack')
  await vi.waitFor(() => expect(reviewing()).toBe('tests.a'))
  click('confirm')
  await vi.waitFor(() => expect(reviewing()).toBe('tests.b'))
  click('cancel')
  await vi.waitFor(() => expect(reviewing()).toBeNull())
  await nextTick()
  expect(install).toHaveBeenCalledTimes(1)
  expect(reviewCatalog).toHaveBeenCalledTimes(2)
})

it('does not open the rest of the pack when a review cannot be prepared', async () => {
  const reviewCatalog = vi.fn(async (id: string) => {
    if (id === 'tests.b')
      throw new Error('EXTENSION_DOWNLOAD_FAILED')
    return { token: `token-${id}`, manifest: { id, name: id }, currentVersion: null, addedPermissions: [] }
  })
  const { install, click, reviewing } = await mountManager(reviewCatalog)
  click('start-pack')
  await vi.waitFor(() => expect(reviewing()).toBe('tests.a'))
  click('confirm')
  await vi.waitFor(() => expect(reviewCatalog).toHaveBeenCalledTimes(2))
  await vi.waitFor(() => expect(reviewing()).toBeNull())
  await nextTick()
  expect(reviewCatalog).toHaveBeenCalledTimes(2)
  expect(install).toHaveBeenCalledTimes(1)
})
