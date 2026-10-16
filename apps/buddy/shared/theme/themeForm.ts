import { z } from 'zod'

// Non-color theme tokens: corner radii, layout dimensions and motion timing.
// Every field is optional and range-limited, so a theme can only tune the existing
// --buddy-* variables and cannot inject arbitrary CSS or break the layout.
interface FormField { variable: string, min: number, max: number, unit: 'px' | 'ms' }

export const themeRadiusFields = {
  'micro': { variable: '--buddy-radius-micro', min: 0, max: 24, unit: 'px' },
  'icon': { variable: '--buddy-icon-button-radius', min: 0, max: 24, unit: 'px' },
  'control': { variable: '--buddy-composer-control-radius', min: 0, max: 24, unit: 'px' },
  'menu': { variable: '--buddy-menu-radius', min: 0, max: 24, unit: 'px' },
  'menu-item': { variable: '--buddy-menu-item-radius', min: 0, max: 24, unit: 'px' },
  'card': { variable: '--buddy-radius-card', min: 0, max: 24, unit: 'px' },
  'popover': { variable: '--buddy-radius-popover', min: 0, max: 24, unit: 'px' },
} as const satisfies Record<string, FormField>

export const themeLayoutFields = {
  'app-sidebar-width': { variable: '--buddy-app-sidebar-width', min: 120, max: 360, unit: 'px' },
  'workspace-sidebar-width': { variable: '--buddy-workspace-sidebar-width', min: 200, max: 420, unit: 'px' },
  'titlebar-height': { variable: '--buddy-titlebar-height', min: 24, max: 56, unit: 'px' },
  'region-header-height': { variable: '--buddy-region-header-height', min: 32, max: 72, unit: 'px' },
  'menu-row-height': { variable: '--buddy-menu-row-height', min: 24, max: 48, unit: 'px' },
  'composer-control-height': { variable: '--buddy-composer-control-height', min: 24, max: 48, unit: 'px' },
  'reading-width': { variable: '--buddy-chat-reading-width', min: 560, max: 1200, unit: 'px' },
  'sidebar-item-font-size': { variable: '--buddy-sidebar-item-font-size', min: 11, max: 18, unit: 'px' },
  'sidebar-section-font-size': { variable: '--buddy-sidebar-section-font-size', min: 10, max: 16, unit: 'px' },
} as const satisfies Record<string, FormField>

// Written to a theme-owned variable so the prefers-reduced-motion rule in index.scss still wins.
export const themeMotionFields = {
  'state-duration': { variable: '--buddy-theme-motion-duration', min: 0, max: 400, unit: 'ms' },
} as const satisfies Record<string, FormField>

function fieldsSchema(fields: Record<string, FormField>) {
  return z.object(Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, z.number().min(field.min).max(field.max).optional()]))).strict()
}

export const themeShapeSchema = z.object({ radius: fieldsSchema(themeRadiusFields).default({}) }).strict()
export const themeLayoutSchema = fieldsSchema(themeLayoutFields)
export const themeMotionSchema = fieldsSchema(themeMotionFields)

export interface ThemeFormInput {
  shape: { radius: Record<string, number | undefined> }
  layout: Record<string, number | undefined>
  motion: Record<string, number | undefined>
}

export function themeFormVariables(document: ThemeFormInput): Record<string, string> {
  const variables: Record<string, string> = {}
  const emit = (values: Record<string, number | undefined>, fields: Record<string, FormField>) => {
    for (const [name, value] of Object.entries(values)) {
      const field = fields[name]
      if (field && value !== undefined)
        variables[field.variable] = `${value}${field.unit}`
    }
  }
  emit(document.shape.radius, themeRadiusFields)
  emit(document.layout, themeLayoutFields)
  emit(document.motion, themeMotionFields)
  return variables
}
