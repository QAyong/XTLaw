import { z } from 'zod'

// These stacks mirror the defaults declared in `src/theme/index.scss`; keep them in sync.
export const DEFAULT_UI_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif'
export const DEFAULT_MONO_FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'

export const BODY_SIZE_MIN = 12
export const BODY_SIZE_MAX = 20
// The reading line height that shipped before this setting existed (1.64 at 14 px).
const BODY_LINE_HEIGHT_RATIO = 1.64

export const typographyFontSchema = z.string().trim().max(100).refine(value => !/\p{Cc}/u.test(value))
export const typographyPreferencesSchema = z.object({
  uiFont: typographyFontSchema,
  bodyFont: typographyFontSchema,
  codeFont: typographyFontSchema,
  bodySize: z.number().int().min(BODY_SIZE_MIN).max(BODY_SIZE_MAX),
}).strict()

export type TypographyPreferences = z.infer<typeof typographyPreferencesSchema>

export const DEFAULT_TYPOGRAPHY: Readonly<TypographyPreferences> = {
  uiFont: '',
  bodyFont: '',
  codeFont: '',
  bodySize: 14,
}

export function resolveTypography(preferences: Readonly<TypographyPreferences>) {
  const font = (family: string, fallback: string) => family
    ? `"${family.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}", ${fallback}`
    : fallback
  return {
    ui: font(preferences.uiFont, DEFAULT_UI_FONT_STACK),
    body: font(preferences.bodyFont, DEFAULT_UI_FONT_STACK),
    mono: font(preferences.codeFont, DEFAULT_MONO_FONT_STACK),
    bodySize: `${preferences.bodySize}px`,
    bodyLineHeight: `${Math.round(preferences.bodySize * BODY_LINE_HEIGHT_RATIO)}px`,
  }
}
