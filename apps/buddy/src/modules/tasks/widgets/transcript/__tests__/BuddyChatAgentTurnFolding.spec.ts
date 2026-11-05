// @vitest-environment jsdom
import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { ChatAgentTurn } from '../../../model/transcript/chatAgentTurn'
import { DEFAULT_DESKTOP_CHAT_PREFERENCES } from '@buddy-electron/shared/desktopApi'
import { NMessageProvider } from 'naive-ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import { useProvideBuddiesContext } from '@/modules/buddies'
import { useProvideDesktopUi } from '@/shared/ui/desktopUiContext'
import BuddyChatAgentTurn from '../BuddyChatAgentTurn.vue'
import { useProvideChatContent } from '../chatContentContext'
import { provideChatTranscriptPresentation, provideChatTranscriptRowState } from '../chatTranscriptPresentation'

vi.mock('../BuddyChatActionToolbar.vue', () => ({ default: { render: () => null } }))
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

const Row = defineComponent({
  props: { rowKey: { type: String, required: true } },
  setup(props, { slots }) {
    provideChatTranscriptRowState(() => props.rowKey)
    return () => h('section', { 'data-row': props.rowKey }, slots.default?.())
  },
})

function mountTurn(status: ChatAgentTurn['status'], provided = true) {
  const turn = shallowRef<ChatAgentTurn>({
    branchId: 'branch',
    runId: 'run',
    completedAt: status === 'completed' ? '2026-09-09T00:01:00Z' : null,
    finalMessageId: null,
    nodes: [{ id: 'panel:first', kind: 'panel', actor: 'user', action: 'open', status: 'completed' }],
    processMessageIds: [],
    progress: null,
    reasoningLevel: null,
    startedAt: '2026-09-09T00:00:00Z',
    status,
    triggeringMessageId: 'question',
    usage: null,
  })
  const visible = shallowRef(true)
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({
    setup: () => {
      useProvideBuddiesContext({ api: { onChanged: () => () => {} } as unknown as LocalChatApi['buddies'], ready: shallowRef(false) })
      useProvideDesktopUi({
        language: shallowRef('zh-CN'),
        isDark: shallowRef(false),
        sidebarCollapsed: shallowRef(false),
        userName: shallowRef(''),
        chat: shallowRef({ ...DEFAULT_DESKTOP_CHAT_PREFERENCES, permissionMode: 'policy_approval' }),
      })
      useProvideChatContent({ openWebLink: () => {}, canPreviewFile: () => false, previewFile: () => {}, writeClipboardText: async () => {} })
      if (provided)
        provideChatTranscriptPresentation(() => 'conversation:branch', () => ['run'])
      return () => h(NMessageProvider, null, {
        default: () => visible.value
          ? h(Row, { rowKey: 'run' }, () => h(BuddyChatAgentTurn, { language: 'zh-CN', showIdentity: false, turn: turn.value }))
          : null,
      })
    },
  })
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  const toggle = () => root.querySelector<HTMLButtonElement>('button.buddy-chat-agent-turn__process-toggle')!
  const expanded = () => toggle().getAttribute('aria-expanded')
  async function remount() {
    visible.value = false
    await nextTick()
    expect(root.querySelector('.buddy-chat-agent-turn')).toBeNull()
    visible.value = true
    await nextTick()
  }
  async function setStatus(next: ChatAgentTurn['status']) {
    turn.value = { ...turn.value, status: next }
    await nextTick()
  }
  return { expanded, remount, setStatus, toggle }
}

describe('process folding across virtual row remounting', () => {
  it('keeps a manually expanded completed turn expanded and treats it as a manual choice afterwards', async () => {
    const view = mountTurn('completed')
    expect(view.expanded()).toBe('false')
    view.toggle().click()
    await nextTick()
    expect(view.expanded()).toBe('true')
    await view.remount()
    expect(view.expanded()).toBe('true')
    // The automatic fold/unfold on status changes must stay off for a turn the reader already decided on.
    await view.setStatus('running')
    await view.setStatus('completed')
    expect(view.expanded()).toBe('true')
  })

  it('keeps a manual collapse of a running turn', async () => {
    const view = mountTurn('running')
    expect(view.expanded()).toBe('true')
    view.toggle().click()
    await nextTick()
    expect(view.expanded()).toBe('false')
    await view.remount()
    expect(view.expanded()).toBe('false')
  })

  it('still folds an untouched turn automatically after remounting', async () => {
    const view = mountTurn('running')
    await view.remount()
    expect(view.expanded()).toBe('true')
    await view.setStatus('completed')
    expect(view.expanded()).toBe('false')
  })

  it('folds on its own without a transcript provider', async () => {
    const view = mountTurn('completed', false)
    expect(view.expanded()).toBe('false')
    view.toggle().click()
    await nextTick()
    expect(view.expanded()).toBe('true')
  })
})
