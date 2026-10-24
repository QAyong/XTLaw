import type { ThemeSnapshot } from '@buddy-shared/theme/themeApi'
import { describe, expect, it } from 'vitest'
import { themeAppearanceMode, themeIdForAppearance } from '../themeAppearanceSwitch'

function snapshot(preferenceId: string, themes: Array<[string, 'light' | 'dark']>, active: 'light' | 'dark' = 'light') {
  return {
    active: { descriptor: { appearance: active } },
    preference: { id: preferenceId },
    themes: themes.map(([id, appearance]) => ({ id, appearance })),
  } as unknown as ThemeSnapshot
}

const themes: Array<[string, 'light' | 'dark']> = [
  ['xtlaw.themes.paper-light', 'light'],
  ['xtlaw.themes.paper-dark', 'dark'],
  ['xtlaw.themes.violet-light', 'light'],
  ['xtlaw.themes.violet-dark', 'dark'],
]

describe('themeAppearanceSwitch', () => {
  it('reports system for the system preference and the theme appearance otherwise', () => {
    expect(themeAppearanceMode(snapshot('system', themes, 'dark'))).toBe('system')
    expect(themeAppearanceMode(snapshot('xtlaw.themes.violet-dark', themes))).toBe('dark')
  })

  it('falls back to the active appearance when the saved theme is unavailable', () => {
    expect(themeAppearanceMode(snapshot('missing.theme', themes, 'dark'))).toBe('dark')
  })

  it('stays in the current theme family when switching appearance', () => {
    expect(themeIdForAppearance(snapshot('xtlaw.themes.violet-dark', themes), 'light')).toBe('xtlaw.themes.violet-light')
    expect(themeIdForAppearance(snapshot('xtlaw.themes.violet-dark', themes), 'dark')).toBe('xtlaw.themes.violet-dark')
  })

  it('uses the default theme when there is no sibling or the preference is system', () => {
    expect(themeIdForAppearance(snapshot('system', themes), 'dark')).toBe('xtlaw.themes.paper-dark')
    expect(themeIdForAppearance(snapshot('custom.solo-dark', [['custom.solo-dark', 'dark']]), 'light')).toBe('xtlaw.themes.paper-light')
    expect(themeIdForAppearance(snapshot('xtlaw.themes.violet-dark', themes), 'system')).toBe('system')
  })
})
