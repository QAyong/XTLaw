// @vitest-environment jsdom
import type { DesktopNavigationEntry } from '@/shared/navigation/desktopPages'
import { VehicleShip20Regular } from '@vicons/fluent'
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import DesktopSidebarNavigation from '../DesktopSidebarNavigation.vue'

function createNavigation(activeId = 'lexora.tasks'): DesktopNavigationEntry[] {
  const entry = (id: string, title: string): DesktopNavigationEntry => ({
    active: activeId === id,
    id,
    icon: { kind: 'component', component: VehicleShip20Regular },
    location: { name: id },
    title,
  })
  return [
    entry('lexora.buddies', '助手'),
    entry('lexora.tasks', '任务'),
    entry('lexora.automations', '自动化'),
    entry('lexora.settings', '设置'),
    entry('lexora.extensions', '市场'),
  ]
}

function mountNavigation(activeId?: string) {
  const onNavigate = vi.fn()
  const root = document.createElement('div')
  const app = createApp({
    render() {
      return h(DesktopSidebarNavigation, { navigation: createNavigation(activeId), onNavigate })
    },
  })
  app.mount(root)
  return { app, onNavigate, root }
}

describe('desktopSidebarNavigation', () => {
  it('lists extensions, automations and buddies in that order', async () => {
    const { app, root } = mountNavigation()
    await nextTick()

    const entries = [...root.querySelectorAll('.desktop-sidebar-navigation__entry')]
    expect(entries.map(entry => entry.textContent?.trim())).toEqual(['市场', '自动化', '助手'])

    app.unmount()
  })

  it('draws each entry with a 16px icon', async () => {
    const { app, root } = mountNavigation()
    await nextTick()

    expect(root.querySelectorAll('.desktop-sidebar-navigation__entry svg')).toHaveLength(3)

    app.unmount()
  })

  it('marks the entry of the current page as active', async () => {
    const { app, root } = mountNavigation('lexora.buddies')
    await nextTick()

    const entries = [...root.querySelectorAll('.desktop-sidebar-navigation__entry')]
    expect(entries.map(entry => entry.classList.contains('is-active'))).toEqual([false, false, true])
    expect(entries[2]!.getAttribute('aria-current')).toBe('page')

    app.unmount()
  })

  it('navigates to the module page when an entry is clicked', async () => {
    const { app, onNavigate, root } = mountNavigation()
    await nextTick()

    root.querySelectorAll<HTMLElement>('.desktop-sidebar-navigation__entry')[1]!.click()
    await nextTick()

    expect(onNavigate).toHaveBeenCalledWith('lexora.automations')

    app.unmount()
  })
})
