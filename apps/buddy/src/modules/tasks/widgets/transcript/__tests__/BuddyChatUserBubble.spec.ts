// @vitest-environment jsdom
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowReactive } from 'vue'
import BuddyChatUserBubble from '../BuddyChatUserBubble.vue'

const COLLAPSED_HEIGHT = 5 * 24
let naturalHeight = COLLAPSED_HEIGHT
const observers: TestResizeObserver[] = []
const cleanups: (() => void)[] = []

class TestResizeObserver implements ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(readonly callback: ResizeObserverCallback) {
    observers.push(this)
  }
}

beforeEach(() => {
  naturalHeight = COLLAPSED_HEIGHT
  observers.length = 0
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
    if (!this.classList.contains('buddy-chat-user-bubble__body'))
      return 0
    return this.classList.contains('is-collapsed') || this.classList.contains('is-measuring')
      ? Math.min(COLLAPSED_HEIGHT, naturalHeight)
      : naturalHeight
  })
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('buddy-chat-user-bubble__body') ? naturalHeight : 0
  })
})
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('user message bubble', () => {
  it.each([24, 48, 72, 96, 120])('does not add a toggle for a message that fits (%s px)', async (height) => {
    naturalHeight = height
    const { root } = await mountBubble()
    expect(root.querySelector('.buddy-chat-user-bubble__toggle')).toBeNull()
    expect(root.querySelector('.buddy-chat-user-bubble__body')?.classList.contains('has-toggle')).toBe(false)
    expect(root.textContent).toContain('Complete original message')
  })

  it('clamps long messages by default and expands/collapses without replacing the original text', async () => {
    naturalHeight = 144
    const { root } = await mountBubble()
    const body = root.querySelector('.buddy-chat-user-bubble__body')!
    const button = root.querySelector<HTMLButtonElement>('.buddy-chat-user-bubble__toggle')!
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBe(body.id)
    expect(button.getAttribute('aria-label')).toBe('展开全文')
    expect(button.getAttribute('title')).toBe('展开全文')
    expect(body.classList.contains('is-collapsed')).toBe(true)
    expect(body.textContent).toBe('Complete original message')
    expect(body.classList.contains('has-toggle')).toBe(false)
    expect(root.querySelector('.buddy-chat-user-bubble__footer')?.contains(button)).toBe(true)
    expect(root.querySelector('.buddy-chat-user-bubble__toggle-slot')).toBeNull()

    button.click()
    await nextTick()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('收起')
    expect(body.classList.contains('is-collapsed')).toBe(false)
    expect(body.classList.contains('is-measuring')).toBe(false)
    expect(body.textContent).toBe('Complete original message')

    button.click()
    await nextTick()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(body.classList.contains('is-collapsed')).toBe(true)
    expect(root.querySelector('[data-quote-exclude]')?.contains(button)).toBe(true)
  })

  it('remeasures on resize, retaining expansion while overflowing and removing the toggle when it fits', async () => {
    naturalHeight = 144
    const { root } = await mountBubble()
    root.querySelector<HTMLButtonElement>('.buddy-chat-user-bubble__toggle')!.click()
    await nextTick()
    naturalHeight = 168
    notifyResize()
    await nextTick()
    expect(root.querySelector('button')?.getAttribute('aria-expanded')).toBe('true')

    naturalHeight = COLLAPSED_HEIGHT
    notifyResize()
    await nextTick()
    expect(root.querySelector('.buddy-chat-user-bubble__toggle')).toBeNull()
    expect(root.querySelector('.buddy-chat-user-bubble__body')?.classList.contains('is-collapsed')).toBe(true)
    expect(root.querySelector('.buddy-chat-user-bubble__body')?.classList.contains('has-toggle')).toBe(false)
  })

  it('remeasures after slot edits and updates accessible labels when the locale changes', async () => {
    const { root, state } = await mountBubble()
    expect(root.querySelector('button')).toBeNull()
    naturalHeight = 144
    state.text = 'A replacement long message'
    await nextTick()
    await nextTick()
    expect(root.querySelector('button')?.getAttribute('aria-label')).toBe('展开全文')
    state.language = 'en-US'
    await nextTick()
    expect(root.querySelector('button')?.getAttribute('aria-label')).toBe('Show full message')
    root.querySelector<HTMLButtonElement>('button')!.click()
    await nextTick()
    expect(root.querySelector('button')?.getAttribute('aria-label')).toBe('Collapse message')
    expect(root.querySelector('.buddy-chat-user-bubble__body')?.textContent).toBe(state.text)
  })

  it('reveals inline references when they receive keyboard focus', async () => {
    naturalHeight = 144
    const { root } = await mountBubble(true)
    root.querySelector<HTMLButtonElement>('.inline-reference')!.focus()
    await nextTick()
    expect(root.querySelector('.buddy-chat-user-bubble__toggle')?.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(root.querySelector('.inline-reference'))
  })

  it('brings a long message back into view when collapsing from below its top', async () => {
    naturalHeight = 400
    const { root } = await mountBubble()
    root.classList.add('buddy-chat-transcript-viewport__scrollport')
    root.scrollTop = 500
    const bubble = root.querySelector<HTMLElement>('.buddy-chat-user-bubble')!
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect)
    vi.spyOn(bubble, 'getBoundingClientRect').mockReturnValue({ top: -100 } as DOMRect)
    const button = root.querySelector<HTMLButtonElement>('.buddy-chat-user-bubble__toggle')!
    button.click()
    await nextTick()
    expect(root.scrollTop).toBe(500)
    button.click()
    await nextTick()
    expect(root.scrollTop).toBe(292)
  })

  it('disconnects its resize observer when unmounted', async () => {
    const { app, root } = await mountBubble()
    const active = observers.filter(observer => observer.observe.mock.calls.length > 0)
    expect(active.length).toBeGreaterThan(0)
    app.unmount()
    root.remove()
    expect(active.every(observer => observer.disconnect.mock.calls.length > 0)).toBe(true)
  })
})

function notifyResize() {
  for (const observer of observers)
    observer.callback([], observer)
}

async function mountBubble(withReference = false) {
  const state = shallowReactive({ language: 'zh-CN' as BuddyLocale, text: 'Complete original message' })
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({
    setup: () => () => h(BuddyChatUserBubble, { language: state.language }, {
      default: () => withReference
        ? [state.text, h('button', { class: 'inline-reference' }, '@reference')]
        : state.text,
    }),
  })
  app.mount(root)
  cleanups.push(() => {
    if (root.isConnected) {
      app.unmount()
      root.remove()
    }
  })
  await nextTick()
  return { root, state, app }
}
