// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, shallowRef } from 'vue'
import { useProvideDesktopUi } from '@/shared/ui/desktopUiContext'
import DesktopMarkdownContent from '@/shared/ui/markdown/DesktopMarkdownContent.vue'
import BuddyChatNarrationBody from '../BuddyChatNarrationBody.vue'
import { useProvideChatContent } from '../chatContentContext'

describe('Markdown link destinations', () => {
  it.each(['system', 'host', 'narration'] as const)('routes nested anchor clicks in %s mode', (mode) => {
    const openWebLink = vi.fn()
    const previewFile = vi.fn()
    const openLink = vi.fn()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp({
      setup() {
        useProvideDesktopUi({
          language: shallowRef('zh-CN'), isDark: shallowRef(false), sidebarCollapsed: shallowRef(false),
          chat: shallowRef({ outlinePosition: 'top-right', permissionMode: 'policy_approval', welcome: 'random' }),
          agentIdentity: shallowRef({ avatar: '', avatarColor: null, initials: null, name: '' }),
        })
        useProvideChatContent({ openWebLink, previewFile, canPreviewFile: () => true, writeClipboardText: async () => {} })
        return () => mode === 'narration'
          ? h(BuddyChatNarrationBody, { text: '', language: 'zh-CN' })
          : h(DesktopMarkdownContent, {
              content: '', language: 'zh-CN', writeClipboardText: async () => {},
              ...(mode === 'host' ? { externalLinkMode: 'host' as const } : {}), onOpenLink: openLink,
            })
      },
    })
    try {
      app.mount(container)
      const host = container.querySelector('.buddy-chat-markdown-host')!
      for (const href of ['https://example.com', 'http://localhost:4173/', 'sandbox:/workspace/test.md']) {
        const anchor = document.createElement('a')
        anchor.setAttribute('href', href)
        anchor.innerHTML = '<strong>link</strong>'
        host.appendChild(anchor)
        anchor.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        if (href.startsWith('sandbox:'))
          expect(mode === 'narration' ? previewFile : openLink).toHaveBeenCalledWith(href)
        else if (mode === 'system')
          expect(openSpy).toHaveBeenCalledWith(href, '_blank', 'noopener,noreferrer')
        else
          expect(mode === 'narration' ? openWebLink : openLink).toHaveBeenCalledWith(href)
      }
      if (mode !== 'system')
        expect(openSpy).not.toHaveBeenCalled()
    }
    finally {
      app.unmount()
      container.remove()
      openSpy.mockRestore()
    }
  })
})
