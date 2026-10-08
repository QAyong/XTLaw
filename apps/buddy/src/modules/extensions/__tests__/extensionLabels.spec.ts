import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import enSettings from '@/i18n/locales/en-US/settings'
import zhSettings from '@/i18n/locales/zh-CN/settings'
import { extensionLabels } from '../extensionLabels'
import { extensionsPage } from '../routes'

const cases = [
  { language: 'zh-CN', settings: zhSettings, labels: { title: '插件', empty: '尚未安装插件', restart: '重启插件', removeTitle: '卸载插件？', loading: '正在加载插件…', failed: '插件视图暂时不可用', retry: '重启插件' } },
  { language: 'en-US', settings: enSettings, labels: { title: 'Plugins', empty: 'No plugins installed', restart: 'Restart plugin', removeTitle: 'Uninstall plugin?', loading: 'Loading plugin…', failed: 'This plugin view is unavailable', retry: 'Restart plugin' } },
] as const

describe('user-facing plugin terminology', () => {
  it.each(cases)('uses consistent labels across navigation, settings and management in $language', ({ language, settings, labels }) => {
    const actual = extensionLabels(language)
    expect(actual).toMatchObject(labels)
    expect(extensionsPage.title(language)).toBe(actual.title)
    expect(settings['desktop.settings.category.extensions']).toBe(actual.title)
    expect(settings['desktop.settings.categoryDescription.extensions']).toMatch(/插件|plugins/)
    for (const text of Object.values(actual))
      expect(text).not.toMatch(/扩展|\bextensions?\b/i)
  })

  it('preserves language fallback and bilingual label coverage', () => {
    expect(extensionLabels('unknown')).toEqual(extensionLabels('zh-CN'))
    expect(Object.keys(extensionLabels('en-US'))).toEqual(Object.keys(extensionLabels('zh-CN')))
  })

  it('uses plugin terminology in the isolated view failure fallback', () => {
    const source = readFileSync(new URL('../../../../electron/main/extensions/runtime/view.js', import.meta.url), 'utf8')
    expect(source).toContain('\'This plugin view could not be loaded.\'')
    expect(source).not.toContain('This extension view')
    expect(source).toContain('channel: \'lexora-extension\'')
    expect(source).toContain('\'EXTENSION_VIEW_FAILED\'')
  })
})
