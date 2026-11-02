// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { BRAND_ASSET_URLS } from '@/shared/branding/brandAssets'
import DesktopStartupScreen from '../DesktopStartupScreen.vue'

describe('startup wordmark', () => {
  it.each([false, true])('uses both theme wordmarks and preserves startup state (failed: %s)', (failed) => {
    const root = document.createElement('div')
    const app = createApp({ render: () => h(DesktopStartupScreen, { failed, language: 'zh-CN', stages: [] }) })
    app.mount(root)
    try {
      expect(root.querySelector('.startup-art__wordmark-light')?.getAttribute('src')).toBe(BRAND_ASSET_URLS.chatWelcomeWordmark.light)
      expect(root.querySelector('.startup-art__wordmark-dark')?.getAttribute('src')).toBe(BRAND_ASSET_URLS.chatWelcomeWordmark.dark)
      expect(root.querySelector('.startup-art__portrait, .startup-art__orbit, .startup-art__aura, .startup-art__star, .startup-art__constellations')).toBeNull()
      expect(root.querySelector('h1')?.textContent).toBe('XTLaw')
      expect(root.querySelector('.desktop-startup')?.getAttribute('aria-busy')).toBe(String(!failed))
      expect(root.querySelectorAll('.desktop-startup__loading-line')).toHaveLength(failed ? 0 : 1)
      if (!failed) {
        expect(root.querySelector('.desktop-startup__loading-line')?.getAttribute('role')).toBe('progressbar')
        expect(root.querySelector('.desktop-startup__loading-line')?.hasAttribute('aria-valuenow')).toBe(false)
      }
      expect(root.querySelectorAll('button')).toHaveLength(failed ? 3 : 0)
    }
    finally {
      app.unmount()
    }
  })

  it('shows the running stage and its real progress, and reports failure from a failed stage', () => {
    const root = document.createElement('div')
    const stages = [{ stage: 'runtime.event_replay', status: 'running' as const, progress: { completed: 3, total: 4 } }]
    const app = createApp({ render: () => h(DesktopStartupScreen, { failed: false, language: 'zh-CN', stages }) })
    app.mount(root)
    try {
      const bar = root.querySelector('.desktop-startup__loading-line')!
      expect(bar.getAttribute('aria-valuenow')).toBe('75')
      expect(bar.querySelector('span')?.getAttribute('style')).toContain('scaleX(0.75)')
      expect(root.querySelector('.desktop-startup p')?.textContent?.trim()).toBe('准备历史记录…')
    }
    finally {
      app.unmount()
    }
    const failedRoot = document.createElement('div')
    const failedApp = createApp({ render: () => h(DesktopStartupScreen, { failed: false, language: 'zh-CN', stages: [{ stage: 'runtime.database', status: 'failed' as const }] }) })
    failedApp.mount(failedRoot)
    try {
      expect(failedRoot.querySelector('.desktop-startup')?.getAttribute('role')).toBe('alert')
      expect(failedRoot.querySelectorAll('.desktop-startup__loading-line')).toHaveLength(0)
    }
    finally {
      failedApp.unmount()
    }
  })
})
