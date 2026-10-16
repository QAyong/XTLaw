import { describe, expect, it } from 'vitest'
import { defaultThemeId } from '../defaultTheme'
import { DEFAULT_THEME_PREFERENCE, migrateThemePreference } from '../themePreferences'

describe('default theme', () => {
  it('names the paper themes of the XTLaw package', () => {
    expect(defaultThemeId('light')).toBe('xtlaw.themes.paper-light')
    expect(defaultThemeId('dark')).toBe('xtlaw.themes.paper-dark')
  })

  it('maps legacy light and dark choices with the default accent to the paper themes and keeps other accents', () => {
    expect(migrateThemePreference('light', 'default')).toEqual({ id: 'xtlaw.themes.paper-light' })
    expect(migrateThemePreference('dark', 'default')).toEqual({ id: 'xtlaw.themes.paper-dark' })
    expect(migrateThemePreference('dark', 'violet')).toEqual({ id: 'lexora.themes.violet-dark' })
    expect(migrateThemePreference('system', 'default')).toEqual(DEFAULT_THEME_PREFERENCE)
    expect(migrateThemePreference({ id: 'lexora.themes.classic-dark' }, 'default')).toEqual({ id: 'lexora.themes.classic-dark' })
  })
})
