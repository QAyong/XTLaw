import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../resolveTheme'
import { themeDocumentSchema } from '../themeDocument'

const descriptor = { id: 'tests.form', label: 'Form', appearance: 'light', source: 'plugin', extensionId: null, packageName: 'tests', swatch: '#000000' } as const

describe('theme form tokens', () => {
  it('keeps documents without form tokens unchanged and emits no form variables', () => {
    const document = themeDocumentSchema.parse({ schemaVersion: 1 })
    expect(document.shape).toEqual({ radius: {} })
    const { variables } = resolveTheme(descriptor, { schemaVersion: 1 })
    for (const name of ['--buddy-radius-micro', '--buddy-radius-lg', '--buddy-workspace-sidebar-width', '--buddy-theme-motion-duration'])
      expect(variables[name]).toBeUndefined()
  })

  it('maps radius, layout and motion tokens to the existing variables', () => {
    const { variables } = resolveTheme(descriptor, {
      schemaVersion: 1,
      shape: { radius: { 'micro': 4, 'menu-item': 3, 'lg': 8 } },
      layout: { 'workspace-sidebar-width': 240, 'reading-width': 768, 'sidebar-item-font-size': 14 },
      motion: { 'state-duration': 150 },
    })
    expect(variables).toMatchObject({
      '--buddy-radius-micro': '4px',
      '--buddy-menu-item-radius': '3px',
      '--buddy-radius-lg': '8px',
      '--buddy-workspace-sidebar-width': '240px',
      '--buddy-chat-reading-width': '768px',
      '--buddy-sidebar-item-font-size': '14px',
      '--buddy-theme-motion-duration': '150ms',
    })
  })

  it.each([
    ['radius above range', { shape: { radius: { micro: 40 } } }],
    ['radius below range', { shape: { radius: { micro: -1 } } }],
    ['sidebar too wide', { layout: { 'workspace-sidebar-width': 900 } }],
    ['sidebar too narrow', { layout: { 'workspace-sidebar-width': 20 } }],
    ['motion too slow', { motion: { 'state-duration': 5000 } }],
    ['unknown radius token', { shape: { radius: { huge: 8 } } }],
    ['unknown layout token', { layout: { 'sidebar-color': 8 } }],
    ['css string value', { layout: { 'reading-width': '768px; background: red' } }],
  ])('rejects %s', (_name, patch) => {
    expect(themeDocumentSchema.safeParse({ schemaVersion: 1, ...patch }).success).toBe(false)
  })
})
