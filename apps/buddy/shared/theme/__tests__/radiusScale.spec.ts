import { describe, expect, it } from 'vitest'
import { radiusStep, radiusToken, tokenizeRadiusCss, tokenizeRadiusValue } from '../radiusScale'

describe('radius scale', () => {
  it.each([
    ['1px', null],
    ['2px', null],
    ['3px', 'xs'],
    ['4px', 'xs'],
    ['0.25rem', 'xs'],
    ['5px', 'xs'],
    ['6px', 'sm'],
    ['0.375rem', 'sm'],
    ['0.45rem', 'sm'],
    ['8px', 'md'],
    ['0.5rem', 'md'],
    ['0.55rem', 'md'],
    ['10px', 'lg'],
    ['0.65rem', 'lg'],
    ['12px', 'lg'],
    ['0.85rem', 'xl'],
    ['1rem', 'xl'],
    ['24px', null],
    ['999px', null],
    ['9999px', null],
    ['50%', null],
    ['0', null],
    ['inherit', null],
  ])('puts %s in step %s', (value, step) => {
    expect(radiusStep(value)).toBe(step)
  })

  it('keeps the original radius as the fallback', () => {
    expect(radiusToken('0.65rem')).toBe('var(--buddy-radius-lg, 0.65rem)')
    expect(radiusToken('50%')).toBe('50%')
  })

  it('rewrites each value of a shorthand and keeps circles, zeros and functions', () => {
    expect(tokenizeRadiusValue('8px 8px 0 0')).toBe('var(--buddy-radius-md, 8px) var(--buddy-radius-md, 8px) 0 0')
    expect(tokenizeRadiusValue('6px / 12px')).toBe('var(--buddy-radius-sm, 6px) / var(--buddy-radius-lg, 12px)')
    expect(tokenizeRadiusValue('6px !important')).toBe('var(--buddy-radius-sm, 6px) !important')
    expect(tokenizeRadiusValue('999px')).toBe('999px')
    expect(tokenizeRadiusValue('50%')).toBe('50%')
    expect(tokenizeRadiusValue('var(--buddy-radius-micro)')).toBe('var(--buddy-radius-micro)')
    expect(tokenizeRadiusValue('calc(var(--r) + 2px)')).toBe('calc(var(--r) + 2px)')
  })

  it('rewrites radius declarations in a stylesheet and nothing else', () => {
    const css = '.a { border-radius: 0.65rem; border: 1px solid red; margin: 6px }\n.b{border-top-left-radius:4px}\n.c { border-radius: 50%; width: 8px }'
    expect(tokenizeRadiusCss(css)).toBe('.a { border-radius: var(--buddy-radius-lg, 0.65rem); border: 1px solid red; margin: 6px }\n.b{border-top-left-radius:var(--buddy-radius-xs, 4px)}\n.c { border-radius: 50%; width: 8px }')
  })

  it('leaves SCSS variables and interpolation untouched', () => {
    expect(tokenizeRadiusCss('.a { border-radius: $radius; border-radius: #{$r}px }')).toBe('.a { border-radius: $radius; border-radius: #{$r}px }')
  })
})
