import type { LocalMessage } from '@buddy-shared/conversation/conversationApi'
import type { MaybeRefOrGetter } from 'vue'
// @vitest-environment jsdom

import { DEFAULT_DESKTOP_CHAT_PREFERENCES } from '@buddy-electron/shared/desktopApi'
import { taskFileMediaUrl } from '@buddy-shared/files/mediaPreview'
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, createSSRApp, h, nextTick, shallowRef, toValue } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { useProvideDesktopUi } from '@/shared/ui/desktopUiContext'
import BuddyChatMessageContent from '../BuddyChatMessageContent.vue'
import { provideChatBuddyIdentity } from '../chatBuddyIdentity'
import { useProvideChatContent } from '../chatContentContext'

vi.mock('@/modules/buddies', () => ({
  useBuddyIdentity: (id: MaybeRefOrGetter<string>) => computed(() => toValue(id) === 'actor-1' ? { id: 'actor-1', name: '审查员' } : null),
}))

describe('buddyChatMessageContent', () => {
  it('renders user messages as literal plain text', async () => {
    const text = '升级 @earendil-works/pi-ai@0.84.1，参考 **说明** 和 [版本](https://example.com)'
    const html = await renderMessage('user', text)

    expect(html).toContain('@earendil-works/pi-ai@0.84.1')
    expect(html).toContain('**说明**')
    expect(html).toContain('[版本](https://example.com)')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('<strong>')
    expect(parseHtml(html).querySelector('.buddy-chat-user-bubble__body')?.textContent?.trim()).toBe(text)
  })

  it('renders assistant Markdown links while leaving raw HTML inert', async () => {
    const html = await renderMessage('assistant', '参考 **说明** 和 [版本](https://example.com)，不要加载 <img src="https://example.com/pixel.png" alt="像素">')
    const document = parseHtml(html)
    const link = document.querySelector('a')

    expect(document.querySelector('strong')?.textContent).toBe('说明')
    expect(link?.textContent).toBe('版本')
    expect(link?.getAttribute('href')).toBe('https://example.com')
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('.buddy-chat-user-bubble')).toBeNull()
    expect(document.body.textContent).toContain('<img src="https://example.com/pixel.png" alt="像素">')
  })

  it.each([false, true])('propagates the application dark mode to nested Markdown: %s', async (isDark) => {
    const html = await renderMessage('assistant', '- 外层列表\n\n  > 嵌套引用与 `code`', isDark)
    const roots = [...parseHtml(html).querySelectorAll('.markstream-vue')]
    expect(roots.length).toBeGreaterThan(1)
    for (const root of roots)
      expect(root.classList.contains('dark')).toBe(isDark)
  })

  it('renders a retired directive as plain text and keeps live directives highlighted', async () => {
    const document = parseHtml(await renderDirectiveMessage())
    const body = document.querySelector('.buddy-chat-message-content__structured-body')
    const retired = body?.querySelector('span')
    const directives = [...(body?.querySelectorAll('.buddy-chat-message-content__directive') ?? [])]

    expect(body?.textContent).toBe('/plan 与 /review')
    expect(retired?.getAttribute('class')).toBeNull()
    expect(retired?.textContent).toBe('/plan')
    expect(directives.map(element => element.textContent)).toEqual(['/review'])
  })

  it.each([
    ['assistant', 'run-1', { buddyId: 'actor-1', name: '审查员' }],
    ['assistant', 'unknown-run', undefined],
    ['user', 'run-1', undefined],
  ] as const)('attributes quote sources to the original author for %s / %s', async (role, runId, author) => {
    const document = parseHtml(await renderMessage(role, 'Quoted text', false, runId))
    const source = JSON.parse(document.querySelector('[data-quote-source]')!.getAttribute('data-quote-source')!)
    expect(source).toEqual({ conversationId: 'conversation-1', branchId: 'branch-1', messageId: `${role}-message`, role, runId, ...(author ? { author } : {}) })
  })

  it.each([false, true])('renders inline-only snapshots once above the body and keeps named references readable (independent attachment: %s)', async (panel) => {
    const html = await renderStructuredUserMessage(panel)
    const document = parseHtml(html)
    const body = document.querySelector('.buddy-chat-message-content__structured-body')
    const reference = document.querySelector('[data-resource-id="resource-1"]')

    expect(body?.textContent).toContain('先看@reference.png后@reference.png')
    expect(reference?.textContent).toBe('@reference.png')
    expect(document.querySelectorAll('[data-material-key]')).toHaveLength(1)
    expect(body?.querySelector('.buddy-chat-user-bubble__body')).not.toBeNull()
    expect(body?.querySelector('[data-material-key]')).toBeNull()
    expect(document.querySelectorAll('.buddy-chat-resource-reference')).toHaveLength(2)
    expect(document.querySelector(reference!.getAttribute('href')!)).not.toBeNull()
    expect(document.querySelector('[data-material-key] img')?.getAttribute('src')).toBe('lexora-attachment://preview/attachment-1')
  })

  it('previews file links and routes HTTP/HTTPS links to the host', async () => {
    const openWebLink = vi.fn()
    const previewFile = vi.fn()
    const canPreviewFile = vi.fn((path: string) => path.includes('hello1.md'))
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    const container = document.createElement('div')
    document.body.appendChild(container)

    const app = createApp({
      setup() {
        useProvideDesktopUi({
          language: shallowRef('zh-CN'),
          isDark: shallowRef(false),
          sidebarCollapsed: shallowRef(false),
          userName: shallowRef(''),
          chat: shallowRef({ ...DEFAULT_DESKTOP_CHAT_PREFERENCES, permissionMode: 'policy_approval' }),
        })
        useProvideChatContent({
          openWebLink,
          canPreviewFile,
          previewFile,
          writeClipboardText: async () => {},
        })
        return () => h(BuddyChatMessageContent, {
          language: 'zh-CN',
          message: {
            attachments: [],
            branchId: 'branch-1',
            content: '已将文件重命名为 [hello1.md](sandbox:/workspace/hello1.md)，请查看 [外部官网](https://example.com) 或 [本机预览](http://127.0.0.1:4173/)',
            conversationId: 'conversation-1',
            createdAt: '2026-08-28T00:00:00.000Z',
            id: 'assistant-message',
            role: 'assistant',
            runId: null,
          } as LocalMessage,
          writeClipboardText: async () => {},
        })
      },
    })
    app.mount(container)
    await nextTick()

    const links = container.querySelectorAll('a')
    expect(links.length).toBeGreaterThanOrEqual(2)

    const fileLink = [...links].find(a => a.textContent === 'hello1.md')
    expect(fileLink).toBeDefined()
    fileLink!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(previewFile).toHaveBeenCalledWith('sandbox:/workspace/hello1.md', undefined)
    expect(openSpy).not.toHaveBeenCalled()

    const externalLink = [...links].find(a => a.textContent === '外部官网')
    expect(externalLink).toBeDefined()
    externalLink!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(openWebLink).toHaveBeenCalledWith('https://example.com')
    const localLink = [...links].find(a => a.textContent === '本机预览')!
    localLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(openWebLink).toHaveBeenCalledWith('http://127.0.0.1:4173/')
    expect(openSpy).not.toHaveBeenCalled()

    app.unmount()
    container.remove()
    openSpy.mockRestore()
  })

  it('shows an authorized thumbnail for a workspace image and leaves ordinary file references without one', async () => {
    const document = parseHtml(await renderContent(workspaceReferenceMessage()))
    const photo = document.querySelector('[data-resource-card="photo"] img')
    const previewUrl = taskFileMediaUrl({ conversationId: 'task', path: '/photos/summer #1.jpg' })

    expect(photo?.getAttribute('src')).toBe(previewUrl)
    expect(previewUrl.startsWith('lexora-file://task-media/')).toBe(true)
    expect(document.querySelector('[data-resource-card="notes"] img:not(.buddy-file-icon)')).toBeNull()
    expect(document.querySelector('[data-resource-card="notes"] img.buddy-file-icon')).not.toBeNull()
    expect(document.querySelector('[data-resource-card="notes"]')?.textContent).toContain('notes.txt')
    expect(document.querySelector('[data-resource-card="upload"] img:not(.buddy-file-icon)')?.getAttribute('src')).toBe('lexora-attachment://preview/upload-1')
    expect(document.querySelector('.buddy-chat-user-bubble')).toBeNull()
  })

  it('keeps a legacy attachment message on its attachment preview', async () => {
    const html = await renderContent({
      attachments: [{
        attachmentId: 'old-image',
        kind: 'image',
        mimeType: 'image/png',
        name: 'old.png',
        previewUrl: 'lexora-attachment://preview/old-image',
        sizeBytes: 10,
      }],
      branchId: 'branch-1',
      content: 'see the picture',
      conversationId: 'conversation-1',
      createdAt: '2026-08-28T00:00:00.000Z',
      id: 'legacy-message',
      role: 'user',
      runId: null,
    } as LocalMessage)

    expect(html).toContain('lexora-attachment://preview/old-image')
    expect(html).not.toContain('lexora-file://task-media/')
  })

  it('opens a workspace image through the existing preview and drops a missing image back to its file card', async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: false,
      media,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    }))
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp({
      setup() {
        provideChatBuddyIdentity(() => [])
        useProvideDesktopUi({
          language: shallowRef('zh-CN'),
          isDark: shallowRef(false),
          sidebarCollapsed: shallowRef(false),
          userName: shallowRef(''),
          chat: shallowRef({ ...DEFAULT_DESKTOP_CHAT_PREFERENCES, permissionMode: 'policy_approval' }),
        })
        return () => h(BuddyChatMessageContent, {
          language: 'zh-CN',
          message: workspaceReferenceMessage(),
          writeClipboardText: async () => {},
        })
      },
    })
    app.mount(container)
    await nextTick()

    const previewUrl = taskFileMediaUrl({ conversationId: 'task', path: '/photos/summer #1.jpg' })
    const photoCard = container.querySelector<HTMLElement>('[data-resource-card="photo"]')!
    photoCard.querySelector('button')!.click()
    await vi.waitFor(() => expect(document.querySelector('.buddy-image-viewer__stage img')?.getAttribute('src')).toBe(previewUrl))
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('图片查看')
    document.querySelector<HTMLButtonElement>('button[aria-label="关闭大图"]')!.click()
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())

    container.querySelector<HTMLElement>('[data-resource-card="notes"] button')!.click()
    await nextTick()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[data-resource-card="notes"] img:not(.buddy-file-icon)')).toBeNull()

    const missing = container.querySelector<HTMLImageElement>('[data-resource-card="gone"] img:not(.buddy-file-icon)')!
    expect(missing.getAttribute('src')).toBe(taskFileMediaUrl({ conversationId: 'task', path: '/photos/gone.png' }))
    missing.dispatchEvent(new Event('error'))
    await nextTick()
    expect(container.querySelector('[data-resource-card="gone"] img:not(.buddy-file-icon)')).toBeNull()
    expect(container.querySelector('[data-resource-card="gone"] img.buddy-file-icon')).not.toBeNull()
    expect(container.querySelector('[data-resource-card="gone"]')?.textContent).toContain('gone.png')
    container.querySelector<HTMLElement>('[data-resource-card="gone"] button')!.click()
    await nextTick()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).not.toContain('重试')

    container.querySelector<HTMLElement>('[data-resource-card="upload"] button')!.click()
    await vi.waitFor(() => expect(document.querySelector('.buddy-image-viewer__stage img')?.getAttribute('src')).toBe('lexora-attachment://preview/upload-1'))

    app.unmount()
    container.remove()
    vi.unstubAllGlobals()
  })
})

function workspaceReferenceMessage(): LocalMessage {
  const photo = { kind: 'file' as const, mimeType: 'image/jpeg', name: 'summer #1.jpg', path: '/photos/summer #1.jpg', sizeBytes: 2000 }
  const notes = { kind: 'file' as const, mimeType: 'text/plain', name: 'notes.txt', path: '/photos/notes.txt', sizeBytes: 20 }
  const missing = { kind: 'file' as const, mimeType: 'image/png', name: 'gone.png', path: '/photos/gone.png', sizeBytes: 10 }
  return {
    attachments: [{
      attachmentId: 'upload-1',
      kind: 'image',
      mimeType: 'image/png',
      name: 'scan.png',
      previewUrl: null,
      sizeBytes: 100,
    }],
    branchId: 'branch',
    content: {
      resourceSnapshots: [
        { resourceId: 'photo', localReference: photo },
        { resourceId: 'notes', localReference: notes },
        { resourceId: 'gone', localReference: missing },
        { resourceId: 'upload', attachmentId: 'upload-1' },
      ],
      userContent: {
        body: [{ content: [], type: 'paragraph' }],
        panelResourceIds: ['photo', 'notes', 'gone', 'upload'],
        version: 1,
      },
    },
    conversationId: 'task',
    createdAt: '2026-08-28T00:00:00.000Z',
    id: 'input',
    role: 'user',
    runId: null,
  } as LocalMessage
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

async function renderMessage(role: LocalMessage['role'], text: string, isDark = false, runId: string | null = null): Promise<string> {
  const message = {
    attachments: [],
    branchId: 'branch-1',
    content: text,
    conversationId: 'conversation-1',
    createdAt: '2026-08-28T00:00:00.000Z',
    id: `${role}-message`,
    role,
    runId,
  } as LocalMessage

  return renderContent(message, isDark)
}

async function renderStructuredUserMessage(panel: boolean): Promise<string> {
  const message = {
    attachments: [{
      attachmentId: 'attachment-1',
      kind: 'image',
      mimeType: 'image/png',
      name: 'reference.png',
      previewUrl: null,
      sizeBytes: 2048,
    }],
    branchId: 'branch-1',
    content: {
      resourceSnapshots: [{ attachmentId: 'attachment-1', resourceId: 'resource-1' }],
      userContent: {
        body: [{
          content: [
            { text: '先看', type: 'text' },
            { resourceId: 'resource-1', type: 'resource_ref' },
            { text: '后', type: 'text' },
            { resourceId: 'resource-1', type: 'resource_ref' },
          ],
          type: 'paragraph',
        }],
        panelResourceIds: panel ? ['resource-1'] : [],
        version: 1,
      },
    },
    conversationId: 'conversation-1',
    createdAt: '2026-08-28T00:00:00.000Z',
    id: 'user-structured-message',
    role: 'user',
    runId: null,
  } as LocalMessage

  return renderContent(message)
}

async function renderDirectiveMessage(): Promise<string> {
  const message = {
    attachments: [],
    branchId: 'branch-1',
    content: {
      resourceSnapshots: [],
      userContent: {
        body: [{
          content: [
            { commandMode: 'prompt', directive: 'slash_command', type: 'prompt_directive', value: '/plan' },
            { text: ' 与 ', type: 'text' },
            { commandMode: 'prompt', directive: 'slash_command', type: 'prompt_directive', value: '/review' },
          ],
          type: 'paragraph',
        }],
        panelResourceIds: [],
        version: 1,
      },
    },
    conversationId: 'conversation-1',
    createdAt: '2026-08-28T00:00:00.000Z',
    id: 'user-directive-message',
    role: 'user',
    runId: null,
  } as LocalMessage

  return renderContent(message)
}

function renderContent(message: LocalMessage, isDark = false) {
  return renderToString(createSSRApp({
    setup() {
      provideChatBuddyIdentity(() => [{ id: 'run-1', buddyId: 'actor-1' }])
      useProvideDesktopUi({
        language: shallowRef('zh-CN'),
        isDark: shallowRef(isDark),
        sidebarCollapsed: shallowRef(false),
        userName: shallowRef(''),
        chat: shallowRef({ ...DEFAULT_DESKTOP_CHAT_PREFERENCES, permissionMode: 'policy_approval' }),
      })
      return () => h(BuddyChatMessageContent, {
        language: 'zh-CN',
        message,
        writeClipboardText: async () => {},
      })
    },
  }))
}
