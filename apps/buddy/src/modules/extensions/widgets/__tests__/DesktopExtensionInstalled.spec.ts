// @vitest-environment jsdom
import type { ExtensionStatus } from '@buddy-shared/extensions/extensionApi'
import { extensionManifestSchema } from '@buddy-shared/extensions/extensionManifest'
import { NMessageProvider } from 'naive-ui'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { DESKTOP_ROUTE_NAMES } from '@/shared/navigation/desktopRoutes'
import DesktopExtensionManager from '../DesktopExtensionManager.vue'

const context = vi.hoisted(() => ({ read: () => ({}) as Record<string, unknown> }))
vi.mock('../../extensionContext', () => ({ useExtensionContext: () => context.read() }))
vi.mock('../DesktopExtensionCatalog.vue', () => ({ default: { render: () => null } }))
vi.mock('../../layouts/DesktopExtensionWorkbench.vue', async () => {
  const { defineComponent, onMounted } = await import('vue')
  return {
    default: defineComponent({
      emits: ['update:section'],
      setup(_, { slots, emit }) {
        onMounted(() => emit('update:section', 'installed'))
        return () => [slots.actions?.(), slots.default?.()]
      },
    }),
  }
})

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const action of cleanup.splice(0).reverse()) action()
  document.body.innerHTML = ''
})

const tool = JSON.stringify(['mcp', 'legal-search', 'legal__search'])
function status(id: string, contributes: Record<string, unknown>, patch: Record<string, unknown> = {}): ExtensionStatus {
  return {
    manifest: extensionManifestSchema.parse({ schemaVersion: 1, id, name: id, version: '1.0.0', apiVersion: 4, engines: { lexora: '*' }, contributes, ...patch }),
    revision: id,
    enabled: true,
    development: false,
    compatible: true,
    pending: null,
    state: 'inactive',
    generation: null,
    error: null,
    activationMs: null,
    logs: [],
  }
}
const legal = status('tests.legal', {
  skills: [{ id: 'tests.legal.law', path: 'skills/law/SKILL.md' }],
  mcpConnectors: [{ id: 'legal-search', name: 'Legal search', transport: 'streamable-http', url: 'https://legal.example.com/mcp', credential: 'bearer' }],
  subagents: [{ id: 'law-finder', kind: 'npc', name: 'Law finder', instructions: 'Search first.', tools: { mode: 'selected', ids: [tool] } }],
})
const plain = status('tests.plain', {}, { entry: 'extension.js' })
const skillOnly = status('tests.skills', { skills: [{ id: 'tests.skills.law', path: 'skills/law/SKILL.md' }] })

const connector = (patch: Record<string, unknown> = {}) => ({ id: 'legal-search', credentialConfigured: false, enabled: false, ...patch })

async function mountInstalled(options: { connectors?: unknown[], buddies?: unknown[] } = {}) {
  const connectors = shallowRef(options.connectors ?? [])
  const buddies = shallowRef(options.buddies ?? [])
  const loadConnectors = vi.fn()
  context.read = () => ({
    state: { installed: shallowRef([legal, plain, skillOnly]), unavailable: shallowRef([]), installations: shallowRef([]), error: shallowRef(null), refresh: vi.fn(async () => {}), api: { capabilityImpact: vi.fn(async () => ({ modified: [] })) } },
    language: shallowRef('zh-CN'),
    authoring: { author: shallowRef(''), save: vi.fn() },
    settingsLocation: () => null,
    capabilityStatus: { connectors, buddies, defaultBuddyId: shallowRef('default'), loadConnectors },
  })
  const page = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: page },
      { path: '/mcp', name: DESKTOP_ROUTE_NAMES.settingsMcp, component: page },
      { path: '/skills', name: DESKTOP_ROUTE_NAMES.settingsSkills, component: page },
      { path: '/buddies/:buddyId?', name: DESKTOP_ROUTE_NAMES.buddies, component: page },
    ],
  })
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
  await vi.waitFor(() => expect(element.querySelector('[data-extension-id]')).not.toBeNull())
  return { element, router, connectors, buddies, loadConnectors }
}
const card = (element: HTMLElement, id: string) => element.querySelector<HTMLElement>(`[data-extension-id="${id}"]`)!
const kinds = (element: HTMLElement, id: string) => [...card(element, id).querySelectorAll('[data-kind]')].map(tag => tag.getAttribute('data-kind'))

it('labels each installed package with the kinds it contributes and offers a type filter', async () => {
  const { element } = await mountInstalled()
  expect(kinds(element, 'tests.legal')).toEqual(['skill', 'mcp', 'agent'])
  expect(kinds(element, 'tests.plain')).toEqual(['plugin'])
  expect(kinds(element, 'tests.skills')).toEqual(['skill'])
  expect(element.querySelector('[data-testid="installed-kind-filter"]')).not.toBeNull()
})

it('says which connections still need a token and sends the user to settings', async () => {
  const { element, router, loadConnectors } = await mountInstalled({ connectors: [connector()] })
  expect(loadConnectors).toHaveBeenCalled()
  const row = card(element, 'tests.legal').querySelector('[data-connector-id="legal-search"]')!
  expect(row.querySelector('[data-testid="extension-connector-state"]')?.textContent?.trim()).toBe('待配置')
  row.querySelector<HTMLElement>('[data-testid="extension-connector-configure"]')!.click()
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe(DESKTOP_ROUTE_NAMES.settingsMcp))
  expect(router.currentRoute.value.query).toEqual({})
})

it.each([
  [{ credentialConfigured: true, enabled: true }, '已启用'],
  [{ credentialConfigured: true, enabled: false }, '未启用'],
])('shows a configured connection as %j', async (patch, label) => {
  const { element, connectors } = await mountInstalled({ connectors: [connector(patch)] })
  const row = () => card(element, 'tests.legal').querySelector('[data-connector-id="legal-search"]')!
  expect(row().querySelector('[data-testid="extension-connector-state"]')?.textContent?.trim()).toBe(label)
  expect(row().querySelector('[data-testid="extension-connector-configure"]')?.textContent?.trim()).toBe('管理')
  connectors.value = []
  await nextTick()
  expect(row().querySelector('[data-testid="extension-connector-state"]')?.textContent?.trim()).toBe('已移除')
  expect(row().querySelector('[data-testid="extension-connector-configure"]')).toBeNull()
})

it('shows whether a sub-agent is still in the default companion delegation list', async () => {
  const rowId = 'ext.tests.legal.law-finder'
  const actor = (npcIds: string[]) => ({ id: 'default', settings: { npcIds } })
  const { element, buddies, router } = await mountInstalled({ buddies: [actor([rowId]), { id: rowId, settings: { npcIds: [] } }] })
  const row = () => card(element, 'tests.legal').querySelector(`[data-subagent-id="${rowId}"]`)!
  const state = () => row().querySelector('[data-testid="extension-subagent-state"]')?.textContent?.trim()
  expect(state()).toBe('已加入晓晓')
  buddies.value = [actor([]), { id: rowId, settings: { npcIds: [] } }]
  await nextTick()
  expect(state()).toBe('未加入晓晓')
  buddies.value = [actor([])]
  await nextTick()
  expect(state()).toBe('已移除')
  buddies.value = [actor([rowId]), { id: rowId, settings: { npcIds: [] } }]
  await nextTick()
  row().querySelector<HTMLElement>('button')!.click()
  await vi.waitFor(() => expect(router.currentRoute.value).toMatchObject({ name: DESKTOP_ROUTE_NAMES.buddies, params: { buddyId: rowId } }))
})

it('lists packaged skills with a way to the skills page and leaves plain plugins without a capability list', async () => {
  const { element, router } = await mountInstalled()
  const skills = card(element, 'tests.skills').querySelector('[data-testid="extension-capabilities-skills"]')!
  expect(skills.textContent).toContain('law')
  skills.querySelector<HTMLElement>('button')!.click()
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe(DESKTOP_ROUTE_NAMES.settingsSkills))
  expect(card(element, 'tests.plain').querySelector('[data-testid="extension-capabilities"]')).toBeNull()
})
