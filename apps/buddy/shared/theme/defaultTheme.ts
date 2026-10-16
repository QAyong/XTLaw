// The theme used when the preference is "system" (or an old light/dark setting with the default accent).
// It belongs to the XTLaw-owned bundled package, not the upstream-synced lexora.themes package.
export const DEFAULT_THEME_PACKAGE = 'xtlaw.themes'

export function defaultThemeId(appearance: 'light' | 'dark'): string {
  return `${DEFAULT_THEME_PACKAGE}.paper-${appearance}`
}
