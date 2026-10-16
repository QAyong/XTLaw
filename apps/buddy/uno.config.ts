import { defineConfig, presetUno, transformerVariantGroup } from 'unocss'
import { tokenizeRadiusValue } from './shared/theme/radiusScale'

const alphaLevels = [10, 20, 30, 40, 50, 60, 70, 80] as const

const semanticColorTokens = {
  'primary': '--buddy-accent-primary',
  'success': '--buddy-accent-success',
  'warning': '--buddy-accent-warning',
  'danger': '--buddy-accent-danger',
  'main': '--buddy-text-primary',
  'regular': '--buddy-text-regular',
  'secondary': '--buddy-text-secondary',
  'placeholder': '--buddy-text-placeholder',
  'border': '--buddy-border-base',
  'border-light': '--buddy-border-light',
  'fill': '--buddy-fill-base',
  'fill-light': '--buddy-fill-light',
  'body': '--buddy-bg-body',
  'surface': '--buddy-bg-surface',
  'surface-raised': '--buddy-bg-surface-raised',
  'fg': '--buddy-text-primary',
  'strong': '--buddy-text-strong',
  'muted': '--buddy-text-secondary',
  'disabled': '--buddy-text-disabled',
  'raised': '--buddy-surface-raised',
  'subtle': '--buddy-surface-subtle',
  'workspace-sidebar': '--buddy-surface-workspace-sidebar',
  'hover': '--buddy-state-hover',
  'hover-fg': '--buddy-text-strong',
  'pressed': '--buddy-state-pressed',
  'pressed-fg': '--buddy-text-strong',
  'selected': '--buddy-state-selected',
  'selected-fg': '--buddy-text-strong',
  'selected-hover': '--buddy-state-hover',
  'accent': '--buddy-accent-solid',
  'accent-text': '--buddy-accent-text',
  'accent-surface': '--buddy-accent-surface',
  'accent-border': '--buddy-accent-border',
  'accent-border-hover': '--buddy-accent-border',
  'on-accent': '--buddy-text-on-accent',
  'border-strong': '--buddy-border-strong',
  'nav-hover': '--buddy-nav-hover',
  'nav-selected': '--buddy-nav-selected',
  'nav-selected-hover': '--buddy-nav-pressed',
  'nav-pressed': '--buddy-nav-pressed',
  'nav-foreground': '--buddy-nav-foreground',
  'focus': '--buddy-focus-ring',
} as const

const themeColors = {
  ...Object.fromEntries(
    Object.entries(semanticColorTokens).map(([name, token]) => [name, `var(${token})`]),
  ),
  ...Object.fromEntries(
    Object.entries(semanticColorTokens).flatMap(([name, token]) =>
      alphaLevels.map(level => [
        `${name}-a${level}`,
        `color-mix(in srgb, var(${token}) ${level}%, transparent)`,
      ]),
    ),
  ),
  surface: 'var(--buddy-surface-base, #fafaf8)',
  border: 'var(--buddy-border-subtle, rgb(32 37 34 / 10%))',
  warning: 'var(--buddy-status-warning-text, #a36a12)',
  danger: 'var(--buddy-status-danger-text, #b25252)',
}

export default defineConfig({
  presets: [presetUno()],
  transformers: [transformerVariantGroup()],
  postprocess: (util) => {
    for (const entry of util.entries) {
      if (entry[0].endsWith('radius') && typeof entry[1] === 'string')
        entry[1] = tokenizeRadiusValue(entry[1])
    }
  },
  shortcuts: {
    'transition-state-colors': 'transition-[background-color,color] duration-[var(--buddy-motion-state-duration)] ease-[var(--buddy-motion-state-easing)]',
    'ui-focus-ring': 'focus-visible:(outline-solid outline-2 outline-focus outline-offset-[-2px])',
    'ui-menu-state': 'enabled:hover:(bg-hover text-hover-fg) enabled:active:(bg-pressed text-pressed-fg) focus-visible:(bg-hover text-hover-fg outline-0) aria-checked:(bg-selected text-selected-fg) aria-pressed:(bg-selected text-selected-fg) disabled:(cursor-not-allowed opacity-50)',
    'ui-menu-option': 'flex min-w-0 items-center justify-between border-0 rounded-menu-item bg-transparent text-strong cursor-pointer text-left ui-menu-state',
    'ui-menu-item': 'grid min-w-0 min-h-menu-row grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-0 rounded-menu-item bg-transparent text-strong cursor-pointer px-2 py-[0.3rem] text-left ui-menu-state',
  },
  theme: {
    colors: themeColors,
    borderRadius: { 'micro': 'var(--buddy-radius-micro, 6px)', 'menu-item': 'var(--buddy-menu-item-radius, 3px)' },
    width: { 'workspace-sidebar': 'var(--buddy-workspace-sidebar-width, 15.5rem)' },
    height: { 'region-header': 'var(--buddy-region-header-height, 2.75rem)' },
    minHeight: { 'menu-row': 'var(--buddy-menu-row-height, 32px)' },
    fontSize: {
      'sidebar-section': ['var(--buddy-sidebar-section-font-size, 12px)', {}],
      'sidebar-item': ['var(--buddy-sidebar-item-font-size, 14px)', {}],
    },
    fontFamily: {
      sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    },
  },
})
