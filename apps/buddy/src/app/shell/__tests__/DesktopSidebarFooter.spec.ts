// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import DesktopSidebarFooter from '../DesktopSidebarFooter.vue'

function mountFooter(options: { notificationUnseenCount?: number, withAccount?: boolean } = {}) {
  const onRefreshNotifications = vi.fn()
  const root = document.createElement('div')
  const app = createApp({
    render() {
      return h(DesktopSidebarFooter, {
        language: 'zh-CN',
        notificationItems: [],
        notificationLoading: false,
        notificationUnseenCount: options.notificationUnseenCount ?? 0,
        onRefreshNotifications,
      }, options.withAccount ? { account: () => h('button', { class: 'test-account' }, '账号') } : undefined)
    },
  })
  app.mount(root)
  return { app, onRefreshNotifications, root }
}

describe('desktopSidebarFooter', () => {
  it('renders the account slot first and the notification entry last', async () => {
    const { app, root } = mountFooter({ withAccount: true })
    await nextTick()

    const footer = root.querySelector('.desktop-sidebar-footer')
    expect(footer?.firstElementChild?.classList.contains('test-account')).toBe(true)
    const trailing = footer?.lastElementChild
    expect(trailing?.classList.contains('desktop-sidebar-footer__notification')).toBe(true)
    expect(trailing?.querySelector('.desktop-sidebar-footer__entry')?.getAttribute('aria-label')).toBe('打开通知')
    expect(root.querySelectorAll('.desktop-sidebar-footer__entry')).toHaveLength(1)

    app.unmount()
  })

  it('shows the unseen notification count on the notification entry', async () => {
    const { app, root } = mountFooter({ notificationUnseenCount: 7 })
    await nextTick()

    expect(root.querySelector('.n-badge')?.textContent?.trim()).toContain('7')

    app.unmount()
  })

  it('hides the notification badge when nothing is unseen', async () => {
    const { app, root } = mountFooter({ notificationUnseenCount: 0 })
    await nextTick()

    expect(root.querySelector('.n-badge-sup')).toBeNull()

    app.unmount()
  })
})
