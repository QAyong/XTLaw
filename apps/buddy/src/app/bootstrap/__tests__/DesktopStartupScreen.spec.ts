// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { BRAND_ASSET_URLS } from '@/shared/branding/brandAssets'
import DesktopStartupScreen from '../DesktopStartupScreen.vue'

describe('startup wordmark', () => {
  it.each([false, true])('uses both theme wordmarks and preserves startup state (failed: %s)', (failed) => {
    const root = document.createElement('div')
    const app = createApp({ render: () => h(DesktopStartupScreen, { failed, language: 'zh-CN' }) })
    app.mount(root)
    try {
      expect(root.querySelector('.startup-art__wordmark-light')?.getAttribute('src')).toBe(BRAND_ASSET_URLS.chatWelcomeWordmark.light)
      expect(root.querySelector('.startup-art__wordmark-dark')?.getAttribute('src')).toBe(BRAND_ASSET_URLS.chatWelcomeWordmark.dark)
      expect(root.querySelector('.startup-art__portrait, .startup-art__orbit, .startup-art__aura, .startup-art__star, .startup-art__constellations')).toBeNull()
      expect(root.querySelector('h1')?.textContent).toBe('XTLaw')
      expect(root.querySelector('.desktop-startup')?.getAttribute('aria-busy')).toBe(String(!failed))
      expect(root.querySelectorAll('.desktop-startup__loading-line')).toHaveLength(failed ? 0 : 1)
      if (!failed)
        expect(root.querySelector('.desktop-startup__loading-line')?.getAttribute('aria-hidden')).toBe('true')
      expect(root.querySelectorAll('button')).toHaveLength(failed ? 2 : 0)
    }
    finally {
      app.unmount()
    }
  })
})
