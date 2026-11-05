// @vitest-environment jsdom
import type { FileIconThemeSnapshot } from '@buddy-shared/icons/fileIconTheme'
import type { ThemeSnapshot } from '@buddy-shared/theme/themeApi'
import { fileIconThemeDocumentSchema, normalizeFileIconTheme } from '@buddy-shared/icons/fileIconTheme'
import { fallbackTheme } from '@buddy-shared/theme/resolveTheme'
import { DEFAULT_THEME_PREFERENCE } from '@buddy-shared/theme/themePreferences'
import { expect, it, vi } from 'vitest'
import { desktopAppearance } from '@/theme/desktopAppearance'
import { initializeDesktopFileIcons } from '@/theme/desktopFileIconState'
import { initializeDesktopTheme } from '@/theme/desktopThemeState'
import { resolveResourceIcon } from '../fileIcon'

const listeners: { theme?: (snapshot: ThemeSnapshot) => void } = {}
const { desktopApi } = vi.hoisted(() => ({ desktopApi: { themes: {} as Record<string, unknown>, fileIcons: {} as Record<string, unknown> } }))
vi.mock('@/platform/desktop/desktopApi', () => ({ requireDesktopApi: () => desktopApi }))

let revision = 0
function themeSnapshot(appearance: 'light' | 'dark', rev = ++revision): ThemeSnapshot {
  return { revision: rev, preference: DEFAULT_THEME_PREFERENCE, active: fallbackTheme(appearance), themes: [], unavailable: null, preview: false }
}

// The base mapping is the dark appearance; `light` overrides it, as in VS Code file icon themes.
const iconTheme: FileIconThemeSnapshot = {
  revision: 1,
  preference: { id: 'tests.icons' },
  themes: [],
  unavailable: null,
  active: {
    descriptor: { id: 'tests.icons', label: 'Tests', extensionId: null, packageName: 'tests' },
    document: normalizeFileIconTheme(fileIconThemeDocumentSchema.parse({
      iconDefinitions: { 'file': { iconPath: 'file.svg' }, 'ts-dark': { iconPath: 'ts-dark.svg' }, 'ts-light': { iconPath: 'ts-light.svg' } },
      file: 'file',
      fileExtensions: { ts: 'ts-dark' },
      light: { fileExtensions: { ts: 'ts-light' } },
    })),
    urls: { 'file': 'icon://file', 'ts-dark': 'icon://ts-dark', 'ts-light': 'icon://ts-light' },
  },
}

it('resolves file icons from the appearance of the applied theme', () => {
  desktopApi.themes = {
    initial: themeSnapshot('light'),
    onDidChange: (listener: (snapshot: ThemeSnapshot) => void) => {
      listeners.theme = listener
      return () => {}
    },
    request: () => new Promise(() => {}),
  }
  desktopApi.fileIcons = { initial: iconTheme, onDidChange: () => () => {}, request: () => new Promise(() => {}) }
  initializeDesktopTheme()
  initializeDesktopFileIcons()
  const icon = () => resolveResourceIcon({ path: 'src/main.ts', kind: 'file' }).id

  expect(desktopAppearance.value).toBe('light')
  expect(icon()).toBe('ts-light')

  const dark = themeSnapshot('dark')
  listeners.theme!(dark)
  expect(document.documentElement.dataset.buddyTheme).toBe('dark')
  expect(desktopAppearance.value).toBe('dark')
  expect(icon()).toBe('ts-dark')

  listeners.theme!(themeSnapshot('light', dark.revision - 1))
  expect(desktopAppearance.value).toBe('dark')
  expect(icon()).toBe('ts-dark')

  listeners.theme!(themeSnapshot('light'))
  expect(desktopAppearance.value).toBe('light')
  expect(icon()).toBe('ts-light')
})
