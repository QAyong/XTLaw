// @vitest-environment jsdom
import { NMessageProvider } from 'naive-ui'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { DESKTOP_ROUTE_NAMES } from '@/shared/navigation/desktopRoutes'
import { extensionLabels } from '../../extensionLabels'
import DesktopExtensionManager from '../DesktopExtensionManager.vue'

const context = vi.hoisted(() => ({ read: () => ({}) as Record<string, unknown> }))
vi.mock('../../extensionContext', () => ({ useExtensionContext: () => context.read() }))
// Naive UI's popover needs real pointer events; render the options inline like the other menu specs do.
vi.mock('naive-ui', async (importOriginal) => {
  const { defineComponent, h } = await import('vue')
  interface Option { key: string, label: string, children?: Option[], props?: Record<string, string> }
  return {
    ...await importOriginal<typeof import('naive-ui')>(),
    NDropdown: defineComponent({
      props: { options: { type: Array, default: () => [] } },
      emits: ['select', 'update:show'],
      setup(props, { slots, emit }) {
        const render = (options: Option[]): ReturnType<typeof h>[] => options.flatMap(option => option.children
          ? [h('span', option.label), ...render(option.children)]
          : [h('button', { 'data-testid': option.props?.['data-testid'], 'onClick': () => emit('select', option.key) }, option.label)])
        return () => h('div', [slots.default?.(), ...render(props.options as Option[])])
      },
    }),
  }
})
vi.mock('../DesktopExtensionCatalog.vue', async () => {
  const { h } = await import('vue')
  return { default: { render: () => h('div', { 'data-testid': 'catalog' }) } }
})
vi.mock('../../layouts/DesktopExtensionWorkbench.vue', () => ({
  default: { setup: (_: unknown, { slots }: { slots: Record<string, () => unknown> }) => () => [slots.actions?.(), slots.default?.()] },
}))

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const action of cleanup.splice(0).reverse()) action()
  document.body.innerHTML = ''
})

async function mountManager() {
  const startCreation = vi.fn(async () => {})
  const startSkillCreation = vi.fn(async () => {})
  context.read = () => ({
    state: { installed: shallowRef([]), unavailable: shallowRef([]), installations: shallowRef([]), error: shallowRef(null), refresh: vi.fn(async () => {}), api: { selectPackage: vi.fn(async () => null) } },
    language: shallowRef('zh-CN'),
    authoring: { author: shallowRef(''), save: vi.fn() },
    settingsLocation: () => null,
    startCreation,
    startSkillCreation,
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
  await nextTick()
  return { element, router, startCreation, startSkillCreation }
}

async function choose(element: HTMLElement, key: string) {
  element.querySelector<HTMLElement>(`[data-testid="extension-add-${key}"]`)!.click()
  await nextTick()
}

it('opens on the market, not on the installed list', async () => {
  const { element } = await mountManager()
  expect(element.querySelector('[data-testid="catalog"]')).not.toBeNull()
})

it('groups every way to add something under one Add menu', async () => {
  const { element } = await mountManager()
  const labels = extensionLabels('zh-CN')
  expect(element.querySelector('[data-testid="extension-create"]')).toBeNull()
  expect(element.querySelector('[data-testid="extension-add"]')).not.toBeNull()
  const text = element.textContent ?? ''
  for (const label of [labels.addGenerate, labels.addManual, labels.addImport, labels.create, labels.generateSkill, labels.addMcp, labels.createSubagent, labels.install, labels.development, labels.importSkill, labels.importMcp])
    expect(text).toContain(label)
})

it('starts the plugin and skill creators from the menu', async () => {
  const { element, startCreation, startSkillCreation } = await mountManager()
  const labels = extensionLabels('zh-CN')
  await choose(element, 'generate-plugin')
  expect(startCreation).toHaveBeenCalledWith(labels.creationPrompt)
  await vi.waitFor(() => expect(element.querySelector<HTMLButtonElement>('[data-testid="extension-add"]')!.disabled).toBe(false))
  await choose(element, 'generate-skill')
  expect(startSkillCreation).toHaveBeenCalledWith(labels.skillCreationPrompt)
})

it.each([
  ['mcp', DESKTOP_ROUTE_NAMES.settingsMcp, { action: 'add' }],
  ['mcp-import', DESKTOP_ROUTE_NAMES.settingsMcp, { action: 'import' }],
  ['skill-import', DESKTOP_ROUTE_NAMES.settingsSkills, { action: 'import' }],
  ['subagent', DESKTOP_ROUTE_NAMES.buddies, { action: 'create-npc' }],
])('hands %s over to the page that owns it', async (key, name, query) => {
  const { element, router } = await mountManager()
  await choose(element, key)
  await vi.waitFor(() => expect(router.currentRoute.value).toMatchObject({ name, query }))
})
