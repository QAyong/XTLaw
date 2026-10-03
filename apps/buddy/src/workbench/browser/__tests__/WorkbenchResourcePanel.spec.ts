// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import WorkbenchResourcePanel from '../WorkbenchResourcePanel.vue'

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

it('adds maximize and restore without changing the add-tab placement', async () => {
  Element.prototype.scrollIntoView = () => {}
  const maximized = shallowRef(false)
  const active = shallowRef<string | null>('files')
  const element = document.createElement('div')
  const app = createApp({ render: () => h(WorkbenchResourcePanel, {
    activeTabId: active.value,
    tabs: active.value ? [{ id: 'files', title: 'Files' }] : [],
    actions: [],
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
    expect(add.nextElementSibling).toBe(button)
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
