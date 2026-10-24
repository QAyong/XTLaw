// @vitest-environment jsdom
import type { SettingsContext } from '@/modules/settings/settingsContext'
import type { DesktopUpdates } from '@/modules/updates/contracts'
import { NMessageProvider } from 'naive-ui'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { useProvideSettingsContext } from '@/modules/settings'
import { useProvideDesktopUpdates } from '@/modules/updates'
import DesktopSidebarAccount from '../DesktopSidebarAccount.vue'

function mountAccount(profile: { avatar: string, deviceName: string, userName: string }) {
  const onOpenSettings = vi.fn()
  const check = vi.fn(async () => {})
  const themeRequest = vi.fn(async () => ({}))
  vi.stubGlobal('lexoraDesktop', { themes: { request: themeRequest } })
  const root = document.createElement('div')
  document.body.append(root)
  const Host = defineComponent({
    setup() {
      useProvideSettingsContext({
        appInfo: ref({ version: '0.3.2' }),
        profile: { config: ref(profile), update: async () => true },
      } as unknown as SettingsContext)
      useProvideDesktopUpdates({ state: ref(null), check } as unknown as DesktopUpdates)
      return () => h(NMessageProvider, null, { default: () => h(DesktopSidebarAccount, { language: 'zh-CN', onOpenSettings }) })
    },
  })
  const app = createApp(Host)
  app.mount(root)
  return { app, check, onOpenSettings, root, themeRequest }
}

async function settle() {
  for (let i = 0; i < 4; i++)
    await nextTick()
}

function menuOption(label: string) {
  return [...document.body.querySelectorAll<HTMLElement>('.n-dropdown-option-body')].find(option => option.textContent?.includes(label))
}

function segmentTab(label: string) {
  return [...document.body.querySelectorAll<HTMLElement>('.desktop-segmented-control .n-tabs-tab')].find(tab => tab.getAttribute('aria-label') === label)
}

describe('desktopSidebarAccount', () => {
  it('shows the profile name and initials on a menu trigger', async () => {
    const { app, root } = mountAccount({ avatar: '', deviceName: '', userName: '周晓晓' })
    await nextTick()

    const button = root.querySelector<HTMLButtonElement>('.desktop-sidebar-account')
    expect(button?.textContent).toContain('周晓晓')
    expect(button?.getAttribute('aria-haspopup')).toBe('menu')
    expect(root.querySelector('.desktop-account-avatar__initials')?.textContent?.trim()).toBe('周')

    app.unmount()
    root.remove()
  })

  it('renders the custom avatar image when one is set', async () => {
    const { app, root } = mountAccount({ avatar: 'data:image/png;base64,sample', deviceName: '', userName: '周晓晓' })
    await nextTick()

    expect(root.querySelector('.desktop-account-avatar__image')?.getAttribute('src')).toBe('data:image/png;base64,sample')

    app.unmount()
    root.remove()
  })

  it('offers settings, appearance and update entries in the menu', async () => {
    const { app, onOpenSettings, root } = mountAccount({ avatar: '', deviceName: '', userName: '周晓晓' })
    await nextTick()

    root.querySelector<HTMLButtonElement>('.desktop-sidebar-account')?.click()
    await settle()
    expect(menuOption('设置')).toBeDefined()
    expect(menuOption('检查更新')?.textContent).toContain('0.3.2')
    expect(document.body.querySelector('.desktop-sidebar-account-menu__device')?.textContent).toBe('Desktop')
    expect(segmentTab('跟随系统')).toBeDefined()

    menuOption('设置')?.click()
    await settle()
    expect(onOpenSettings).toHaveBeenCalledOnce()

    app.unmount()
    root.remove()
  })

  it('switches the theme appearance from the menu without closing it', async () => {
    const { app, root, themeRequest } = mountAccount({ avatar: '', deviceName: '', userName: '周晓晓' })
    await nextTick()

    root.querySelector<HTMLButtonElement>('.desktop-sidebar-account')?.click()
    await settle()
    segmentTab('深色')?.click()
    await settle()
    expect(themeRequest).toHaveBeenCalledWith({ action: 'preference', preference: { id: 'xtlaw.themes.paper-dark' } })
    expect(root.querySelector('.desktop-sidebar-account')?.getAttribute('aria-expanded')).toBe('true')

    app.unmount()
    root.remove()
  })

  it('checks for updates from the menu', async () => {
    const { app, check, root } = mountAccount({ avatar: '', deviceName: '', userName: '周晓晓' })
    await nextTick()

    root.querySelector<HTMLButtonElement>('.desktop-sidebar-account')?.click()
    await settle()
    menuOption('检查更新')?.click()
    await settle()
    expect(check).toHaveBeenCalledOnce()

    app.unmount()
    root.remove()
  })

  it('opens the menu on the first click and closes it on the second', async () => {
    const { app, root } = mountAccount({ avatar: '', deviceName: '', userName: '周晓晓' })
    await nextTick()

    const button = root.querySelector<HTMLButtonElement>('.desktop-sidebar-account')
    button?.click()
    await settle()
    expect(button?.getAttribute('aria-expanded')).toBe('true')

    button?.click()
    await settle()
    expect(button?.getAttribute('aria-expanded')).toBe('false')

    button?.click()
    await settle()
    expect(button?.getAttribute('aria-expanded')).toBe('true')

    app.unmount()
    root.remove()
  })

  it('opens the profile dialog from the menu', async () => {
    const { app, root } = mountAccount({ avatar: '', deviceName: '', userName: '周晓晓' })
    await nextTick()

    root.querySelector<HTMLButtonElement>('.desktop-sidebar-account')?.click()
    await settle()
    document.body.querySelector<HTMLButtonElement>('.desktop-sidebar-account-menu__header')?.click()
    await settle()
    expect(document.body.textContent).toContain('个人资料')

    app.unmount()
    root.remove()
  })
})
