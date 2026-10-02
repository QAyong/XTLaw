// @vitest-environment jsdom
import type { ExtensionViewInput } from '@buddy-shared/extensions/extensionApi'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowReactive, shallowRef } from 'vue'
import { extensionLabels } from '../../extensionLabels'
import DesktopExtensionWorkbench from '../../layouts/DesktopExtensionWorkbench.vue'
import DesktopExtensionSurface from '../DesktopExtensionSurface.vue'

const context = {
  language: shallowRef('zh-CN'),
  state: { api: { restart: vi.fn(async () => {}) } },
  views: { surfaces: shallowReactive(new Map<string, { error: string, session: null, eligible: boolean }>()), show: vi.fn(), hide: vi.fn() },
}
vi.mock('../../extensionContext', () => ({ useExtensionContext: () => context }))
vi.mock('@/shared/ui/navigation/DesktopBackToTasksButton.vue', () => ({ default: { render: () => null } }))

const disposables: (() => void)[] = []
afterEach(() => {
  disposables.splice(0).forEach(dispose => dispose())
  context.views.surfaces.clear()
  vi.clearAllMocks()
})

function mount(render: () => ReturnType<typeof h>) {
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render })
  app.mount(element)
  disposables.push(() => {
    app.unmount()
    element.remove()
  })
  return element
}

it.each(['zh-CN', 'en-US'])('labels the plugin management selector consistently in %s', (language) => {
  const element = mount(() => h(DesktopExtensionWorkbench, { language, section: 'installed' }))
  const labels = extensionLabels(language)
  expect(element.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe(labels.title)
  expect(element.textContent).toContain(labels.installed)
})

it.each(['zh-CN', 'en-US'])('shows plugin loading and failure copy and restarts the plugin in %s', async (language) => {
  context.language.value = language
  const input: ExtensionViewInput = { extensionId: 'tests.reader', viewId: 'reader-view', viewType: 'tests.reader.view', resource: null, state: {}, stateVersion: 1 }
  const labels = extensionLabels(language)
  const element = mount(() => h(DesktopExtensionSurface, { input, visible: true }))
  await nextTick()
  expect(element.querySelector('[role="status"]')?.textContent).toContain(labels.loading)

  context.views.surfaces.set(input.viewId, { error: 'EXTENSION_VIEW_FAILED', session: null, eligible: true })
  await nextTick()
  expect(element.querySelector('[role="status"]')?.textContent).toContain(labels.failed)
  expect(element.textContent).not.toContain(labels.loading)
  const button = element.querySelector('button')!
  expect(button.textContent).toContain(labels.restart)
  button.click()
  expect(context.state.api.restart).toHaveBeenCalledExactlyOnceWith(input.extensionId)
})
