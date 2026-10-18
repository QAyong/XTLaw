/**
 * Browser replacement for the main-process font stack. Layout metrics come from the
 * same canvas the renderer draws with, so measured widths match what is shown.
 * The upstream version scans system font files and shapes with harfbuzz; neither is
 * available in a sandboxed extension (no WebAssembly, no file access).
 */
import type { FontMetrics, FontMetricsProvider, RunStyle } from '@genoffice/pptx-render'
// The renderer turns the resolved family name into its CSS stack when drawing; measure with that same stack.
import { displayFontFamily } from '../../apps/slides/src/renderer/konva-adapter'

const ALIASES: Record<string, string> = {
  'calibri': 'Carlito',
  'cambria': 'Caladea',
  'arial': 'Liberation Sans',
  'helvetica': 'Liberation Sans',
  'times new roman': 'Liberation Serif',
  'courier new': 'Liberation Mono',
}

/** Metric-compatible family the engine lays out with (what the renderer receives as run.fontFamily). */
function resolvedFamily(family: string): string {
  const name = family.replaceAll('"', '').trim()
  return ALIASES[name.toLowerCase()] ?? name
}
const cssFamily = (family: string) => displayFontFamily(resolvedFamily(family))
function fontOf(style: RunStyle, size: number) {
  return `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${size}px ${cssFamily(style.fontFamily)}`
}

let context: CanvasRenderingContext2D | null = null
function canvas(): CanvasRenderingContext2D {
  context ??= document.createElement('canvas').getContext('2d')!
  return context
}
const lineCache = new Map<string, FontMetrics>()

export function createSystemFontMetrics(): FontMetricsProvider {
  return {
    metrics(style) {
      const key = `${style.fontFamily}|${style.bold}|${style.italic}|${style.fontSizePx}`
      let result = lineCache.get(key)
      if (!result) {
        const ctx = canvas()
        ctx.font = fontOf(style, style.fontSizePx)
        const measured = ctx.measureText('Hg国')
        const ascent = measured.fontBoundingBoxAscent ?? style.fontSizePx * 0.9
        const descent = measured.fontBoundingBoxDescent ?? style.fontSizePx * 0.25
        result = { ascent, descent, lineHeight: ascent + descent }
        lineCache.set(key, result)
      }
      return result
    },
    measure(text, style) {
      const ctx = canvas()
      ctx.font = fontOf(style, style.fontSizePx)
      return ctx.measureText(text).width
    },
    displayFamily: style => resolvedFamily(style.fontFamily),
    substituted: () => false,
  }
}
export function resetFontRegistry(): void {
  lineCache.clear()
}
export function registerEmbeddedFonts(): boolean {
  return false
}
export const listPrivateFontFaces = () => [] as Array<{ id: string, family: string, bold: boolean, italic: boolean }>
export const getPrivateFontData = (): ArrayBuffer | null => null
export const familyAvailable = () => true
export const fontFileFamilies = () => [] as string[]
export function setUserFontDir() {}
export const getUserFontDir = () => null
