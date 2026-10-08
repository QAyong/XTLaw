import type { DesktopBrowserProfileMode } from '@buddy-electron/shared/desktopApi'
import type { BrowserToolbarBusyAction } from '../browserToolbarMenu'
import { describe, expect, it } from 'vitest'
import { getBrowserToolbarMenuActions } from '../browserToolbarMenu'

interface MenuContext {
  busyAction: BrowserToolbarBusyAction | null
  controller: 'agent' | 'human'
  profileMode: DesktopBrowserProfileMode
  responsive?: boolean
  responsiveBusy?: boolean
  url: string
}

const page: MenuContext = {
  busyAction: null,
  controller: 'human',
  profileMode: 'default',
  url: 'https://example.com/',
}

function action(key: string, overrides: Partial<MenuContext> = {}) {
  return getBrowserToolbarMenuActions({ ...page, ...overrides }).find(candidate => candidate.key === key)
}

describe('browser toolbar menu', () => {
  it('offers page developer tools for a human-controlled page', () => {
    expect(action('open-devtools')).toMatchObject({
      disabled: false,
      labelKey: 'desktop.context.browserOpenDevTools',
    })
  })

  it.each<[Partial<MenuContext>, string]>([
    [{ url: 'about:blank' }, 'an empty tab'],
    [{ controller: 'agent' }, 'a page the agent controls'],
    [{ busyAction: 'screenshot' }, 'a busy toolbar'],
  ])('disables page developer tools for %s', (overrides) => {
    expect(action('open-devtools', overrides)?.disabled).toBe(true)
  })

  it('offers responsive preview in More and labels the active mode as Exit', () => {
    expect(action('responsive-viewport')).toMatchObject({ disabled: false, labelKey: 'desktop.context.browserResponsive' })
    expect(action('responsive-viewport', { responsive: true })).toMatchObject({ disabled: false, labelKey: 'desktop.context.browserViewportExit' })
  })

  it('allows exiting an active preview on a blank page but preserves busy and agent guards', () => {
    expect(action('responsive-viewport', { responsive: true, url: 'about:blank' })?.disabled).toBe(false)
    expect(action('responsive-viewport', { responsive: true, responsiveBusy: true })?.disabled).toBe(true)
    expect(action('responsive-viewport', { responsive: true, controller: 'agent' })?.disabled).toBe(true)
  })

  it('keeps developer tools available in private browsing', () => {
    expect(action('open-devtools', { profileMode: 'incognito' })?.disabled).toBe(false)
  })
})
