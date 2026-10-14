// @vitest-environment jsdom
import type { LocalBuddy } from '@buddy-shared/buddies/buddyApi'
import type { MaybeRefOrGetter } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, shallowRef, toValue } from 'vue'
import { BRAND_ASSET_URLS } from '@/shared/branding/brandAssets'
import BuddyChatAgentIdentity from '../BuddyChatAgentIdentity.vue'
import { provideChatBuddyIdentity } from '../chatBuddyIdentity'

const profiles = shallowRef(new Map<string, Pick<LocalBuddy, 'name' | 'avatar'>>())
vi.mock('@/modules/buddies', async original => ({
  ...await original<typeof import('@/modules/buddies')>(),
  useBuddyIdentity: (id: MaybeRefOrGetter<string>) => computed(() => profiles.value.get(toValue(id)) ?? null),
}))

function render(buddyId = 'default') {
  const root = document.createElement('div')
  const app = createApp({
    setup() {
      provideChatBuddyIdentity(() => [{ id: 'run', buddyId }])
      return () => h(BuddyChatAgentIdentity, { language: 'zh-CN', runId: 'run' })
    },
  })
  app.mount(root)
  return { app, root }
}

describe('buddyChatAgentIdentity', () => {
  it('falls back to the Xiaoxiao avatar and default name while loading', async () => {
    profiles.value = new Map()
    const { app, root } = render()
    await nextTick()
    expect(root.querySelector('img')?.getAttribute('src')).toBe(BRAND_ASSET_URLS.chatAvatar)
    expect(root.querySelector('.buddy-chat-agent-identity__name')?.textContent.trim()).toBe('晓晓')
    app.unmount()
  })

  it('uses the responding buddy and follows profile changes', async () => {
    profiles.value = new Map([['reviewer', { name: '审阅伙伴', avatar: 'data:image/png;base64,abc' }]])
    const { app, root } = render('reviewer')
    await nextTick()
    expect(root.querySelector('[data-buddy-id]')?.getAttribute('data-buddy-id')).toBe('reviewer')
    expect(root.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,abc')
    expect(root.querySelector('.buddy-chat-agent-identity__name')?.textContent.trim()).toBe('审阅伙伴')
    profiles.value = new Map([['reviewer', { name: '新名字', avatar: null }]])
    await nextTick()
    expect(root.querySelector('.buddy-chat-agent-identity__name')?.textContent.trim()).toBe('新名字')
    expect(root.querySelector('img')?.getAttribute('src')).not.toBe('data:image/png;base64,abc')
    app.unmount()
  })
})
