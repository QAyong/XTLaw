import type { ThemeSnapshot } from '@buddy-shared/theme/themeApi'
import { defaultThemeId } from '@buddy-shared/theme/defaultTheme'
import { DEFAULT_THEME_PREFERENCE } from '@buddy-shared/theme/themePreferences'

export type ThemeAppearanceMode = 'system' | 'light' | 'dark'

type ThemeChoiceSnapshot = Pick<ThemeSnapshot, 'active' | 'preference' | 'themes'>

export function themeAppearanceMode(snapshot: ThemeChoiceSnapshot): ThemeAppearanceMode {
  const { id } = snapshot.preference
  if (id === DEFAULT_THEME_PREFERENCE.id)
    return 'system'
  return snapshot.themes.find(theme => theme.id === id)?.appearance ?? snapshot.active.descriptor.appearance
}

/** Picks the theme id for a light/dark/system choice, staying in the current theme family when it has a sibling (e.g. `violet-dark` → `violet-light`). */
export function themeIdForAppearance(snapshot: ThemeChoiceSnapshot, mode: ThemeAppearanceMode): string {
  if (mode === 'system')
    return DEFAULT_THEME_PREFERENCE.id
  const current = snapshot.themes.find(theme => theme.id === snapshot.preference.id)
  if (current?.appearance === mode)
    return current.id
  const sibling = snapshot.preference.id.replace(/-(?:light|dark)$/, `-${mode}`)
  if (sibling !== snapshot.preference.id && snapshot.themes.some(theme => theme.id === sibling && theme.appearance === mode))
    return sibling
  return defaultThemeId(mode)
}
