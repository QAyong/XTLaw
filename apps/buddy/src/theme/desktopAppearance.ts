import { shallowReadonly, shallowRef } from 'vue'

export type DesktopAppearance = 'light' | 'dark'

const current = shallowRef<DesktopAppearance>('light')

// Icon themes can ship separate light variants, so icon resolution reads the colour scheme the shell applied.
export const desktopAppearance = shallowReadonly(current)

export function setDesktopAppearance(appearance: DesktopAppearance): void {
  current.value = appearance
}
