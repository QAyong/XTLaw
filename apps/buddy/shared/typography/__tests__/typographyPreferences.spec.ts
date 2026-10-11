import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MONO_FONT_STACK,
  DEFAULT_TYPOGRAPHY,
  DEFAULT_UI_FONT_STACK,
  resolveTypography,
  typographyPreferencesSchema,
} from '../typographyPreferences'

describe('typography preferences', () => {
  it('resolves the shipped defaults without changing the reading rhythm', () => {
    expect(resolveTypography(DEFAULT_TYPOGRAPHY)).toEqual({
      ui: DEFAULT_UI_FONT_STACK,
      body: DEFAULT_UI_FONT_STACK,
      mono: DEFAULT_MONO_FONT_STACK,
      bodySize: '14px',
      bodyLineHeight: '23px',
    })
  })

  it('keeps the TypeScript default stacks in sync with the stylesheet defaults', () => {
    const stylesheet = readFileSync(new URL('../../../src/theme/index.scss', import.meta.url), 'utf8')
    expect(stylesheet).toContain(`--buddy-font-ui: ${DEFAULT_UI_FONT_STACK};`)
    expect(stylesheet).toContain(`--buddy-font-mono: ${DEFAULT_MONO_FONT_STACK};`)
  })

  it('quotes custom families, escapes them, and keeps the system stack as fallback', () => {
    const resolved = resolveTypography({ uiFont: 'Noto Sans SC', bodyFont: 'Weird "Name"\\Face', codeFont: 'Cascadia Code', bodySize: 16 })
    expect(resolved.ui).toBe(`"Noto Sans SC", ${DEFAULT_UI_FONT_STACK}`)
    expect(resolved.body).toBe(`"Weird \\"Name\\"\\\\Face", ${DEFAULT_UI_FONT_STACK}`)
    expect(resolved.mono).toBe(`"Cascadia Code", ${DEFAULT_MONO_FONT_STACK}`)
    expect(resolved.bodySize).toBe('16px')
    expect(resolved.bodyLineHeight).toBe('26px')
  })

  it('rejects out-of-range sizes, control characters and unknown fields', () => {
    const valid = { ...DEFAULT_TYPOGRAPHY }
    expect(typographyPreferencesSchema.safeParse(valid).success).toBe(true)
    expect(typographyPreferencesSchema.safeParse({ ...valid, bodySize: 11 }).success).toBe(false)
    expect(typographyPreferencesSchema.safeParse({ ...valid, bodySize: 21 }).success).toBe(false)
    expect(typographyPreferencesSchema.safeParse({ ...valid, bodySize: 14.5 }).success).toBe(false)
    expect(typographyPreferencesSchema.safeParse({ ...valid, uiFont: 'Bad\u0000Font' }).success).toBe(false)
    expect(typographyPreferencesSchema.safeParse({ ...valid, uiFont: 'x'.repeat(101) }).success).toBe(false)
    expect(typographyPreferencesSchema.safeParse({ ...valid, extra: true }).success).toBe(false)
  })
})
