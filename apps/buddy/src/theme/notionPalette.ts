import { computed } from 'vue'
import { desktopThemeSnapshot } from './desktopThemeState'

export type NotionHue = 'gray' | 'blue' | 'green' | 'orange' | 'purple' | 'pink'

// Notion's tag text colors, which are saturated enough to stay distinct next to each other.
// Fills for meters and charts use these directly; tinted blends of one accent turn muddy once several categories sit side by side.
const notionHues = {
  light: { gray: '#9b9a97', blue: '#337ea9', green: '#448361', orange: '#d9730d', purple: '#9065b0', pink: '#c14c8a' },
  dark: { gray: '#9b9b9b', blue: '#529cca', green: '#4dab9a', orange: '#ffa344', purple: '#9a6dd7', pink: '#e255a1' },
} as const satisfies Record<'light' | 'dark', Record<NotionHue, string>>

export const notionPalette = computed<Record<NotionHue, string>>(() => notionHues[desktopThemeSnapshot.value.active.descriptor.appearance])
