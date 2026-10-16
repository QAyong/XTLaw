import type { Plugin } from 'vite'
import { tokenizeRadiusCss } from '../shared/theme/radiusScale.ts'

// Rewrites hard-coded border-radius values in the app's own styles (Vue style blocks and
// stylesheets under src/) so themes can restyle them. Source files are not modified.
export function radiusTokensPlugin(): Plugin {
  return {
    name: 'xtlaw-radius-tokens',
    enforce: 'pre',
    transform(code, id) {
      const path = id.replaceAll('\\', '/')
      if (path.includes('/node_modules/') || !path.includes('/src/'))
        return null
      if (!path.includes('type=style') && !/\.s?css(?:\?|$)/.test(path))
        return null
      const next = tokenizeRadiusCss(code)
      return next === code ? null : { code: next, map: null }
    },
  }
}
