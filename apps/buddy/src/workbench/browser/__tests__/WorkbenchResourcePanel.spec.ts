// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import { ContributionRegistry } from '../../services/ContributionRegistry'
import { WorkbenchController } from '../../services/WorkbenchController'
import { useWorkbenchLaunchers } from '../useWorkbenchLaunchers'
import WorkbenchResourcePanel from '../WorkbenchResourcePanel.vue'

it('reveals the selected resource tab after the panel is resized', async () => {
  let notify: ResizeObserverCallback | undefined
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { notify = callback }
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  Element.prototype.scrollIntoView = () => {}
  const reveal = vi.spyOn(Element.prototype, 'scrollIntoView')
  const element = document.createElement('div')
  const app = createApp({ render: () => h(WorkbenchResourcePanel, { activeTabId: 'files', tabs: [{ id: 'files', title: 'Files' }], actions: [], language: 'en-US' }) })
  app.mount(element)
  try {
    await nextTick()
    reveal.mockClear()
    expect(notify).toBeDefined()
    notify!([], {} as ResizeObserver)
    await nextTick()
    expect(reveal).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  }
  finally {
    app.unmount()
  }
})

it('uses the same registered launcher list for the empty state and add menu, including withdrawal and disabled dispatch', async () => {
  Element.prototype.scrollIntoView = () => {}
  const registry = new ContributionRegistry()
  const controller = new WorkbenchController(registry)
  const selected: string[] = []
  registry.register('base', (scope) => {
    scope.command({ id: 'browser.open', label: 'Browser', execute() {} })
    scope.command({ id: 'disabled.open', label: 'Unavailable', enabled: () => false, execute() {} })
    scope.launcher({ id: 'browser', command: 'browser.open', label: 'Browser', icon: 'browser', order: -1 })
    scope.launcher({ id: 'disabled', command: 'disabled.open', label: 'Unavailable' })
  })
  const remove = registry.register('plugin', (scope) => {
    scope.command({ id: 'plugin.player.open', label: 'Player', execute() {} })
    scope.launcher({ id: 'plugin.player', command: 'plugin.player.open', label: 'Player', icon: { url: 'data:image/png;base64,a' } })
  })
  const active = shallowRef<string | null>(null)
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({
    setup() {
      const { actions } = useWorkbenchLaunchers(controller)
      return () => h(WorkbenchResourcePanel, { activeTabId: active.value, tabs: active.value ? [{ id: 'open', title: 'Open' }] : [], actions: actions.value, language: 'en-US', onAdd: id => selected.push(id) })
    },
  })
  app.mount(element)
  try {
    const empty = [...element.querySelectorAll<HTMLButtonElement>('[data-testid^="task-context-open-"]')]
    expect(empty.map(button => button.textContent)).toEqual(['Browser', 'Unavailable', 'Player'])
    empty[1]!.click()
    empty[2]!.click()
    expect(selected).toEqual(['plugin.player'])
    active.value = 'open'
    await nextTick()
    element.querySelector<HTMLButtonElement>('[data-testid="context-add-tab"]')!.click()
    await vi.waitFor(() => expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(3))
    const menu = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(menu.map(button => button.textContent)).toEqual(empty.map(button => button.textContent))
    expect(menu[1]!.disabled).toBe(true)
    menu[1]!.click()
    expect(selected).toEqual(['plugin.player'])
    remove()
    await nextTick()
    expect([...document.querySelectorAll('[role="menuitem"]')].map(button => button.textContent)).toEqual(['Browser', 'Unavailable'])
    active.value = null
    await nextTick()
    expect([...element.querySelectorAll('[data-testid^="task-context-open-"]')].map(button => button.textContent)).toEqual(['Browser', 'Unavailable'])
  }
  finally {
    app.unmount()
    element.remove()
  }
})

it('retains a resource surface while switching through an empty task scope', async () => {
  Element.prototype.scrollIntoView = () => {}
  const Surface = defineComponent({
    setup() {
      const expanded = shallowRef(false)
      return () => h('button', { 'data-directory-toggle': '', 'onClick': () => expanded.value = !expanded.value }, expanded.value ? 'Expanded directory' : 'Collapsed directory')
    },
  })
  const active = shallowRef<string | null>('files')
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(WorkbenchResourcePanel, { activeTabId: active.value, tabs: active.value ? [{ id: 'files', title: 'Files' }] : [], actions: [], language: 'en-US' }, { default: () => h(Surface) }) })
  app.mount(element)
  try {
    element.querySelector<HTMLButtonElement>('[data-directory-toggle]')!.click()
    active.value = null
    await nextTick()
    expect(element.querySelector<HTMLElement>('[role="tabpanel"]')!.style.display).toBe('none')
    active.value = 'files'
    await nextTick()
    expect(element.querySelector<HTMLElement>('[role="tabpanel"]')!.style.display).not.toBe('none')
    expect(element.querySelector('[data-directory-toggle]')!.textContent).toBe('Expanded directory')
    expect(element.querySelector('[data-testid="context-panel-maximize"]')).toBeNull()
  }
  finally {
    app.unmount()
    element.remove()
  }
})

it('places optional header actions to the right of maximize without moving the add-tab button', () => {
  const element = document.createElement('div')
  const app = createApp({ render: () => h(WorkbenchResourcePanel, { activeTabId: 'files', tabs: [{ id: 'files', title: 'Files' }], actions: [{ id: 'files', label: 'Files', disabled: false }], language: 'en-US', maximized: false }, { headerActions: () => h('button', { 'data-test-open': '' }, 'Open') }) })
  app.mount(element)
  try {
    const add = element.querySelector('[data-testid="context-add-tab"]')!
    expect(add.parentElement).toBe(element.querySelector('header'))
    expect(add.previousElementSibling?.classList.contains('desktop-task-context-panel__tabs-scroll')).toBe(true)
    const maximize = element.querySelector('[data-testid="context-panel-maximize"]')!
    expect(maximize.nextElementSibling).toBe(element.querySelector('[data-test-open]'))
  }
  finally {
    app.unmount()
  }
})

it('adds maximize and restore without changing the add-tab placement', async () => {
  Element.prototype.scrollIntoView = () => {}
  const maximized = shallowRef(false)
  const active = shallowRef<string | null>('files')
  const element = document.createElement('div')
  const app = createApp({ render: () => h(WorkbenchResourcePanel, {
    activeTabId: active.value,
    tabs: active.value ? [{ id: 'files', title: 'Files' }] : [],
    actions: [{ id: 'files', label: 'Files', disabled: false }],
    language: 'en-US',
    maximized: maximized.value,
    onToggleMaximize: () => maximized.value = !maximized.value,
  }) })
  app.mount(element)
  try {
    const add = element.querySelector('[data-testid="context-add-tab"]')!
    const button = element.querySelector<HTMLButtonElement>('[data-testid="context-panel-maximize"]')!
    expect(add.parentElement).toBe(element.querySelector('header'))
    expect(add.previousElementSibling?.classList.contains('desktop-task-context-panel__tabs-scroll')).toBe(true)
    expect(add.nextElementSibling).toBe(button.parentElement)
    expect(button.parentElement?.classList.contains('desktop-task-context-panel__header-actions')).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('false')
    button.click()
    await nextTick()
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Restore resource panel')
    button.click()
    await nextTick()
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe('Maximize resource panel')
    active.value = null
    await nextTick()
    expect(element.querySelector('[data-testid="context-add-tab"]')).toBeNull()
    expect(element.querySelector('[data-testid="context-panel-maximize"]')).not.toBeNull()
  }
  finally {
    app.unmount()
  }
})
