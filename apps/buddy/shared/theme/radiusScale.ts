// Groups hard-coded corner radii into a five-step scale so a theme can restyle them together.
// Each literal is rewritten to var(--buddy-radius-<step>, <original>): with no theme value the
// original radius applies unchanged, and a theme that sets the step changes every radius in it.
export const RADIUS_STEPS = ['xs', 'sm', 'md', 'lg', 'xl'] as const
export type RadiusStep = typeof RADIUS_STEPS[number]

const REM_PIXELS = 16

function pixels(token: string): number | null {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(px|rem)$/.exec(token)
  return match ? Number(match[1]) * (match[2] === 'rem' ? REM_PIXELS : 1) : null
}

// Radii up to 2px (hairlines) and above 20px (pills, circles) are left alone.
export function radiusStep(token: string): RadiusStep | null {
  const value = pixels(token)
  if (value === null || value <= 2 || value > 20)
    return null
  if (value <= 5.5)
    return 'xs'
  if (value <= 7.5)
    return 'sm'
  if (value <= 9.5)
    return 'md'
  if (value <= 13)
    return 'lg'
  return 'xl'
}

export function radiusToken(token: string): string {
  const step = radiusStep(token)
  return step ? `var(--buddy-radius-${step}, ${token})` : token
}

// Rewrites the value of one border-radius declaration. Values using functions (var, calc) are kept.
export function tokenizeRadiusValue(value: string): string {
  if (value.includes('('))
    return value
  const important = /\s*!important\s*$/.exec(value)
  const body = important ? value.slice(0, important.index) : value
  const tokens = body.split(/(\s+|\/)/).map(part => (part.trim() && part !== '/') ? radiusToken(part) : part)
  return `${tokens.join('')}${important ? important[0] : ''}`
}

const RADIUS_DECLARATION = /((?:^|[;{\s])border(?:-(?:top-left|top-right|bottom-left|bottom-right|start-start|start-end|end-start|end-end))?-radius\s*:\s*)([^;{}\n]*)/g

export function tokenizeRadiusCss(css: string): string {
  return css.replace(RADIUS_DECLARATION, (_match, head: string, value: string) => `${head}${tokenizeRadiusValue(value)}`)
}
