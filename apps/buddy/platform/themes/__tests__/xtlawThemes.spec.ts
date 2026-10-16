import { Buffer } from 'node:buffer'
import { join } from 'node:path'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../../../shared/theme/resolveTheme'
import { themeDocumentSchema } from '../../../shared/theme/themeDocument'
import { ExtensionPackageStore } from '../../extensions/ExtensionPackageStore'
import { seedXtlawThemes, xtlawThemeFiles } from '../xtlawThemes'

describe('xTLaw bundled themes', () => {
  it('seeds once and keeps the package after the user removes it', async () => {
    const home = await createTemporaryDirectory('xtlaw-themes-')
    const store = new ExtensionPackageStore(join(home, 'extensions'), '0.1.1')
    await seedXtlawThemes(store)
    expect(store.installed['xtlaw.themes']).toMatchObject({ enabled: true, current: { manifest: { version: '1.0.2' } } })
    expect(store.installed['xtlaw.themes']!.current.manifest.contributes.themes.map(theme => theme.id)).toEqual(['xtlaw.themes.paper-light', 'xtlaw.themes.paper-dark'])
    await store.uninstall('xtlaw.themes')
    await seedXtlawThemes(store)
    expect(store.installed['xtlaw.themes']).toBeUndefined()
  })

  it.each(['paper-light', 'paper-dark'] as const)('resolves %s with every declared color accepted', (name) => {
    const document = JSON.parse(Buffer.from(xtlawThemeFiles().get(`themes/${name}.json`)!).toString('utf8'))
    expect(() => themeDocumentSchema.parse(document)).not.toThrow()
    const appearance = name.endsWith('dark') ? 'dark' : 'light'
    const resolved = resolveTheme({ id: `xtlaw.themes.${name}`, label: name, appearance, source: 'plugin', extensionId: 'xtlaw.themes', packageName: 'xtlaw.themes', swatch: document.colors.accent }, document)
    expect(resolved.colors.canvas).toBe(document.colors.canvas)
    expect(resolved.variables['--buddy-shadow-overlay']).toContain('0px 4px 6px -1px')
  })
})
