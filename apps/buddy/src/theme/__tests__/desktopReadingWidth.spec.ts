// @vitest-environment jsdom
import type { DesktopChatReadingWidth } from '@buddy-electron/shared/desktopApi'
import type { ThemeSnapshot } from '@buddy-shared/theme/themeApi'
import { fallbackTheme, resolveTheme } from '@buddy-shared/theme/resolveTheme'
import { DEFAULT_THEME_PREFERENCE } from '@buddy-shared/theme/themePreferences'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { useDesktopReadingWidth } from '../desktopReadingWidth'
import { initializeDesktopTheme } from '../desktopThemeState'

const desktop = vi.hoisted(() => ({
  initial: null as ThemeSnapshot | null,
  listener: null as ((snapshot: ThemeSnapshot) => void) | null,
}))
vi.mock('@/platform/desktop/desktopApi', () => ({
  requireDesktopApi: () => ({
    themes: {
      get initial() { return desktop.initial },
      onDidChange: (listener: (snapshot: ThemeSnapshot) => void) => {
        desktop.listener = listener
        return () => { desktop.listener = null }
      },
      request: async () => desktop.initial,
    },
  }),
}))

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  document.documentElement.removeAttribute('style')
})

describe('desktop reading width', () => {
  it('defaults to standard and reacts to every preset without a theme dependency', async () => {
    const preference = shallowRef<DesktopChatReadingWidth>()
    const scope = effectScope()
    scope.run(() => useDesktopReadingWidth(() => preference.value))
    cleanups.push(() => scope.stop())
    const width = () => document.documentElement.style.getPropertyValue('--buddy-chat-reading-width')
    expect(width()).toBe('50rem')
    for (const [preset, expected] of [['narrow', '42rem'], ['standard', '50rem'], ['wide', '64rem']] as const) {
      preference.value = preset
      await nextTick()
      expect(width()).toBe(expected)
    }
    preference.value = undefined
    await nextTick()
    expect(width()).toBe('50rem')
  })

  it('keeps the selected width through theme activation, switching and removal of legacy layout values', async () => {
    const snapshot = (revision: number, legacyWidth?: number): ThemeSnapshot => ({
      revision,
      preference: DEFAULT_THEME_PREFERENCE,
      active: legacyWidth === undefined ? fallbackTheme('light') : resolveTheme({
        ...fallbackTheme('light').descriptor,
        id: 'tests.reading-width',
      }, { schemaVersion: 1, layout: { 'reading-width': legacyWidth, 'workspace-sidebar-width': 240 } }),
      themes: [],
      unavailable: null,
      preview: false,
    })
    desktop.initial = snapshot(100, 768)
    const scope = effectScope()
    scope.run(() => useDesktopReadingWidth(() => 'wide'))
    cleanups.push(() => scope.stop())
    cleanups.push(initializeDesktopTheme())
    await Promise.resolve()
    const width = () => document.documentElement.style.getPropertyValue('--buddy-chat-reading-width')
    expect(width()).toBe('64rem')
    expect(document.documentElement.style.getPropertyValue('--buddy-workspace-sidebar-width')).toBe('240px')
    desktop.listener!(snapshot(101, 1000))
    expect(width()).toBe('64rem')
    desktop.listener!(snapshot(102))
    expect(width()).toBe('64rem')
  })
})
