import { computed } from 'vue'
import { desktopThemeSnapshot } from './desktopThemeState'

export type DesktopAppearance = 'light' | 'dark'

// Icon themes can ship separate light variants, so icon resolution follows the appearance of the applied theme.
// Derived from the theme snapshot rather than stored separately, so it cannot drift from `data-buddy-theme`.
export const desktopAppearance = computed<DesktopAppearance>(() => desktopThemeSnapshot.value.active.descriptor.appearance)
